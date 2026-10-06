"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { limitAction } from "@/lib/security";
import { normalizePhone } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const sameName = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Pisahkan akun: satu akun peserta dipakai beberapa anak (mis. kakak-adik memakai email orang tua di Google Form).
 * Pendaftaran ini dipindah ke akun baru atas nama pesertanya (password sama dengan akun lama),
 * beserta data kelasnya (absensi, worksheet, nilai manual, rapor/sertifikat) bila tidak ambigu.
 */
export async function splitAccountAction(registrationId: number, newEmail: string): Promise<ActionResult> {
  const me = await requireUser(["ROOT", "ADMIN", "SMARTCHAMPION"]);
  const limited = await limitAction("split-account", me.userId, 30, 10 * 60_000);
  if (limited) return { error: limited };
  const email = String(newEmail ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 160) return { fieldErrors: { email: ["Format email tidak valid."] } };

  const reg = await prisma.registration.findUnique({ where: { id: Number(registrationId) || 0 }, include: { user: true } });
  if (!reg) return { error: "Pendaftaran tidak ditemukan." };
  const old = reg.user;
  if (old.role !== "PESERTA") return { error: "Hanya akun peserta yang bisa dipisahkan." };
  const others = await prisma.registration.findMany({ where: { userId: old.id, id: { not: reg.id } }, select: { fullName: true, productId: true } });
  if (!others.some((o) => !sameName(o.fullName, reg.fullName))) return { error: "Akun ini hanya dipakai peserta ini — tidak perlu dipisahkan." };
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return { fieldErrors: { email: ["Email ini sudah dipakai akun lain."] } };

  // data kelas ikut pindah hanya bila tidak ada pendaftaran lain akun lama di kelas yang sama (kalau ada → tidak bisa dibedakan milik siapa)
  const moveClassData = !!reg.productId && !others.some((o) => o.productId === reg.productId);
  const sessionIds = moveClassData ? (await prisma.classSession.findMany({ where: { productId: reg.productId! }, select: { id: true } })).map((s) => s.id) : [];

  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: reg.fullName.slice(0, 120),
        email,
        password: old.password, // password sama dengan akun keluarga
        role: "PESERTA",
        phone: normalizePhone(reg.phone) ?? old.phone,
        school: reg.school && reg.school !== "-" ? reg.school : old.school,
        jenjang: old.jenjang,
      },
    });
    await tx.registration.update({ where: { id: reg.id }, data: { userId: u.id, email } });
    if (moveClassData && sessionIds.length) {
      await tx.worksheetAttempt.updateMany({ where: { userId: old.id, sessionId: { in: sessionIds } }, data: { userId: u.id } });
      await tx.attendance.updateMany({ where: { userId: old.id, sessionId: { in: sessionIds } }, data: { userId: u.id } });
      await tx.meetingScore.updateMany({ where: { userId: old.id, sessionId: { in: sessionIds } }, data: { userId: u.id } });
    }
    if (moveClassData) await tx.classResult.updateMany({ where: { userId: old.id, productId: reg.productId! }, data: { userId: u.id } });
    // lead pendaftaran ini ikut memakai email baru (agar tertaut ke akun yang benar di Master Lead)
    if (reg.sourceLeadId) await tx.lead.updateMany({ where: { id: reg.sourceLeadId, email: old.email }, data: { email } });
    return u;
  });
  console.info(`[akun] ${me.name} memisahkan ${reg.code} (${reg.fullName}) dari akun #${old.id} ${old.email} → akun baru #${user.id} ${email}`);
  revalidatePath("/admin/pendaftar");
  revalidatePath("/admin/leads");
  if (reg.productId) revalidatePath(`/admin/produk/${reg.productId}`, "layout");
  return {
    ok: `Akun ${reg.fullName} dipisahkan: login ${email} (password sama dengan akun ${old.email}).${moveClassData ? "" : " Data kelas tidak dipindah karena akun lama punya pendaftaran lain di kelas yang sama."}`,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { limitAction } from "@/lib/security";
import type { ActionResult } from "@/lib/action-result";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Ganti email login akun PESERTA (mis. peserta minta ganti email) — Root, Admin Pelatihan & Admin SmartChampion.
 * Email lama di Master Lead & pendaftaran peserta ikut diganti agar tautan lead ↔ akun (berdasarkan email) tidak putus.
 * Password tidak berubah. Superadmin = lihat saja (ditolak requireUser).
 */
export async function changeAccountEmailAction(userId: number, newEmail: string): Promise<ActionResult> {
  const me = await requireUser(["ROOT", "ADMIN", "SMARTCHAMPION"]);
  const limited = await limitAction("account-email", me.userId, 30, 10 * 60_000);
  if (limited) return { error: limited };
  const email = String(newEmail ?? "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 160) return { fieldErrors: { email: ["Format email tidak valid."] } };

  const user = await prisma.user.findUnique({ where: { id: Number(userId) || 0 }, select: { id: true, name: true, email: true, role: true } });
  if (!user) return { error: "Akun tidak ditemukan." };
  if (user.role !== "PESERTA") return { error: "Hanya email akun peserta yang bisa diubah dari sini." };
  const oldEmail = user.email.toLowerCase();
  if (oldEmail === email) return { error: "Email baru sama dengan email sekarang." };
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return { fieldErrors: { email: ["Email ini sudah dipakai akun lain."] } };

  const [, leads, regs] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { email } }),
    prisma.lead.updateMany({ where: { email: oldEmail }, data: { email } }),
    prisma.registration.updateMany({ where: { userId: user.id }, data: { email } }),
  ]);
  console.info(`[akun] ${me.name} (#${me.userId}) mengganti email akun #${user.id} ${oldEmail} → ${email}`);
  revalidatePath("/admin/leads");
  revalidatePath("/admin/pendaftar");
  revalidatePath("/admin/users");
  const extra = [leads.count && `${leads.count} lead`, regs.count && `${regs.count} pendaftaran`].filter(Boolean).join(" & ");
  return { ok: `Email login ${user.name} diganti ke ${email}${extra ? ` (${extra} ikut diperbarui)` : ""}. Password tidak berubah.` };
}

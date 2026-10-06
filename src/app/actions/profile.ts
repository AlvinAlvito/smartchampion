"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createSession, requireUser } from "@/lib/session";
import { normalizePhone, str } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { parseStudentFields } from "@/lib/student-profile";
import { limitAction } from "@/lib/security";

export async function updateProfileAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const session = await requireUser();
  const limited = await limitAction("profile", session.userId, 20, 10 * 60_000);
  if (limited) return { error: limited };
  const name = str(form, "name").slice(0, 120);
  const phone = normalizePhone(str(form, "phone"));
  const school = str(form, "school").slice(0, 160);
  const student = await parseStudentFields(form);
  const fe: Record<string, string[]> = { ...student.fieldErrors };
  if (name.length < 3) fe.name = ["Nama minimal 3 karakter"];
  if (!phone || phone.length < 10) fe.phone = ["Nomor WhatsApp tidak valid"];
  if (Object.keys(fe).length || !student.data) return { fieldErrors: fe };

  const user = await prisma.user.update({
    where: { id: session.userId },
    data: { name, phone, school: school || null, ...student.data },
  });
  // pertahankan penanda "masuk sebagai" (bila superadmin sedang memakai akun ini)
  await createSession({
    userId: user.id,
    role: user.role,
    name: user.name,
    impersonatorId: session.impersonatorId,
    impersonatorName: session.impersonatorName,
  });
  revalidatePath("/dashboard", "layout");
  return { ok: "Profil berhasil diperbarui." };
}

export async function changePasswordAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  // ganti password akun sendiri tetap boleh untuk Superadmin (mode lihat saja)
  const session = await requireUser(undefined, { allowReadOnly: true });
  const limited = await limitAction("change-password", session.userId, 6, 15 * 60_000);
  if (limited) return { error: limited };
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (next.length < 8) return { fieldErrors: { next: ["Password baru minimal 8 karakter"] } };
  if (next.length > 100) return { fieldErrors: { next: ["Password maksimal 100 karakter"] } };
  if (next !== confirm) return { fieldErrors: { confirm: ["Konfirmasi password tidak sama"] } };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  if (!(await bcrypt.compare(current, user.password))) return { fieldErrors: { current: ["Password saat ini salah"] } };
  await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(next, 10) } });
  // sesi di perangkat lain otomatis tidak berlaku; perangkat ini diperbarui agar tetap masuk
  await createSession({
    userId: session.userId,
    role: session.role,
    name: session.name,
    impersonatorId: session.impersonatorId,
    impersonatorName: session.impersonatorName,
  });
  return { ok: "Password berhasil diganti. Sesi di perangkat lain otomatis keluar." };
}

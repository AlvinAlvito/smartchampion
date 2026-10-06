"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSession, requireRoot } from "@/lib/session";
import { normalizePhone, optInt, str } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

const ROLES: Role[] = ["ROOT", "SUPERADMIN", "ADMIN", "SMARTCHAMPION", "PESERTA"];

export async function saveUserAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const session = await requireRoot();
  const id = optInt(form, "id");
  const name = str(form, "name");
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const role = str(form, "role") as Role;
  const fe: Record<string, string[]> = {};
  if (name.length < 2) fe.name = ["Nama wajib diisi"];
  if (!/^\S+@\S+\.\S+$/.test(email)) fe.email = ["Email tidak valid"];
  if ((!id && password.length < 8) || (id && password && password.length < 8)) fe.password = ["Password minimal 8 karakter"];
  if (password.length > 100) fe.password = ["Password maksimal 100 karakter"];
  if (name.length > 120) fe.name = ["Nama maksimal 120 karakter"];
  if (email.length > 160) fe.email = ["Email terlalu panjang"];
  if (!ROLES.includes(role)) fe.role = ["Pilih role"];
  if (Object.keys(fe).length) return { fieldErrors: fe };

  const clash = await prisma.user.findFirst({ where: { email, ...(id ? { NOT: { id } } : {}) } });
  if (clash) return { fieldErrors: { email: ["Email sudah dipakai akun lain"] } };

  const isSelf = id === session.userId;
  const base = { name, email, phone: normalizePhone(str(form, "phone")) };
  if (id) {
    await prisma.user.update({
      where: { id },
      data: {
        ...base,
        // root tidak bisa menurunkan / menonaktifkan dirinya sendiri
        ...(!isSelf ? { role, isActive: form.get("isActive") === "on" } : {}),
        ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
      },
    });
  } else {
    await prisma.user.create({ data: { ...base, role, password: await bcrypt.hash(password, 10) } });
  }
  // ganti password sendiri → perbarui sesi perangkat ini (sesi lain otomatis keluar)
  if (isSelf && password) await createSession({ userId: session.userId, role: session.role, name });
  revalidatePath("/admin/users");
  return { ok: id ? `Akun ${name} diperbarui${password ? " (password diganti)" : ""}.` : `Akun ${name} berhasil dibuat.` };
}

export async function toggleUserActiveAction(id: number): Promise<ActionResult> {
  const session = await requireRoot();
  if (id === session.userId) return { error: "Anda tidak bisa menonaktifkan akun sendiri." };
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return { error: "Akun tidak ditemukan." };
  await prisma.user.update({ where: { id }, data: { isActive: !u.isActive } });
  revalidatePath("/admin/users");
  return { ok: `Akun ${u.name} ${u.isActive ? "dinonaktifkan" : "diaktifkan kembali"}.` };
}

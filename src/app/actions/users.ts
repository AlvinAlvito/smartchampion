"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createSession, requireUser } from "@/lib/session";
import { limitAction } from "@/lib/security";
import { normalizePhone, optInt, str } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

const ROLES: Role[] = ["ROOT", "SUPERADMIN", "ADMIN", "SMARTCHAMPION", "PESERTA"];

/**
 * Kelola akun:
 * - ROOT: semua akun & role.
 * - Admin Pelatihan & Admin SmartChampion: HANYA akun peserta (buat, ubah data/email/password, aktif/nonaktif); role tidak bisa diubah.
 * - Superadmin: lihat saja (ditolak requireUser untuk aksi).
 */
export async function saveUserAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const session = await requireUser(["ROOT", "ADMIN", "SMARTCHAMPION"]);
  const root = session.role === "ROOT";
  if (!root) {
    const limited = await limitAction("user-save", session.userId, 60, 10 * 60_000);
    if (limited) return { error: limited };
  }
  const id = optInt(form, "id");
  const name = str(form, "name");
  const email = str(form, "email").toLowerCase();
  const password = str(form, "password");
  const role = (root ? str(form, "role") : "PESERTA") as Role;
  const fe: Record<string, string[]> = {};
  if (name.length < 2) fe.name = ["Nama wajib diisi"];
  if (!/^\S+@\S+\.\S+$/.test(email)) fe.email = ["Email tidak valid"];
  if ((!id && password.length < 8) || (id && password && password.length < 8)) fe.password = ["Password minimal 8 karakter"];
  if (password.length > 100) fe.password = ["Password maksimal 100 karakter"];
  if (name.length > 120) fe.name = ["Nama maksimal 120 karakter"];
  if (email.length > 160) fe.email = ["Email terlalu panjang"];
  if (!ROLES.includes(role)) fe.role = ["Pilih role"];
  if (Object.keys(fe).length) return { fieldErrors: fe };

  const existing = id ? await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, email: true } }) : null;
  if (id && !existing) return { error: "Akun tidak ditemukan." };
  if (!root && existing && existing.role !== "PESERTA") return { error: "Admin hanya dapat mengelola akun peserta." };

  const clash = await prisma.user.findFirst({ where: { email, ...(id ? { NOT: { id } } : {}) } });
  if (clash) return { fieldErrors: { email: ["Email sudah dipakai akun lain"] } };

  const isSelf = id === session.userId;
  const base = {
    name,
    email,
    phone: normalizePhone(str(form, "phone")),
    ...(form.has("school") ? { school: str(form, "school").slice(0, 160) || null } : {}),
  };
  if (existing) {
    const emailChanged = existing.email.toLowerCase() !== email;
    const update = prisma.user.update({
      where: { id: existing.id },
      data: {
        ...base,
        // root tidak bisa menurunkan / menonaktifkan dirinya sendiri; admin tidak bisa mengubah role
        ...(!isSelf ? { role: root ? role : existing.role, isActive: form.get("isActive") === "on" } : {}),
        ...(password ? { password: await bcrypt.hash(password, 10) } : {}),
      },
    });
    // email peserta berganti → email di Master Lead & pendaftarannya ikut diganti (tautan lead ↔ akun berdasarkan email)
    if (emailChanged && existing.role === "PESERTA") {
      await prisma.$transaction([
        update,
        prisma.lead.updateMany({ where: { email: existing.email.toLowerCase() }, data: { email } }),
        prisma.registration.updateMany({ where: { userId: existing.id }, data: { email } }),
      ]);
      revalidatePath("/admin/leads");
      revalidatePath("/admin/pendaftar");
    } else await update;
    if (!root) console.info(`[akun] ${session.name} (#${session.userId}) mengubah akun peserta #${existing.id}${password ? " (password diganti)" : ""}${emailChanged ? ` (email ${existing.email} → ${email})` : ""}`);
  } else {
    await prisma.user.create({ data: { ...base, role, password: await bcrypt.hash(password, 10) } });
  }
  // ganti password sendiri → perbarui sesi perangkat ini (sesi lain otomatis keluar)
  if (isSelf && password) await createSession({ userId: session.userId, role: session.role, name });
  revalidatePath("/admin/users");
  return { ok: id ? `Akun ${name} diperbarui${password ? " (password diganti)" : ""}.` : `Akun ${name} berhasil dibuat.` };
}

export async function toggleUserActiveAction(id: number): Promise<ActionResult> {
  const session = await requireUser(["ROOT", "ADMIN", "SMARTCHAMPION"]);
  if (id === session.userId) return { error: "Anda tidak bisa menonaktifkan akun sendiri." };
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return { error: "Akun tidak ditemukan." };
  if (session.role !== "ROOT" && u.role !== "PESERTA") return { error: "Admin hanya dapat mengelola akun peserta." };
  await prisma.user.update({ where: { id }, data: { isActive: !u.isActive } });
  revalidatePath("/admin/users");
  return { ok: `Akun ${u.name} ${u.isActive ? "dinonaktifkan" : "diaktifkan kembali"}.` };
}

"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession, getSession, isPanel } from "@/lib/session";
import { stopImpersonationAction } from "@/app/actions/impersonate";
import { normalizePhone } from "@/lib/utils";
import { setFlash } from "@/lib/flash";
import { parseStudentFields } from "@/lib/student-profile";
import { clientIp, rateLimit, resetRate, waitText } from "@/lib/security";

// hash bcrypt tiruan: dipakai saat email tidak terdaftar agar waktu respons sama (cegah menebak email terdaftar)
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.qS3Ot7mTb1rVbiY1bKkmMQfK2d9e";
import type { ActionResult } from "@/lib/action-result";

/** @deprecated gunakan ActionResult */
export type FormState = ActionResult | undefined;

function safeNext(next: FormDataEntryValue | null) {
  const s = typeof next === "string" ? next : "";
  // hanya path internal; tolak "//domain", "/\domain" (dianggap "//" oleh browser) & karakter kontrol
  return s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") && !/[\u0000-\u001f]/.test(s) && s.length < 300 ? s : null;
}

export async function loginAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email dan password wajib diisi." };
  if (email.length > 160 || password.length > 100) return { error: "Email atau password salah." };

  // Anti brute force: per IP (longgar, satu sekolah bisa 1 IP) & per email (ketat) — terkunci 15 menit bila terlampaui
  const ip = await clientIp();
  const byIp = rateLimit(`login-ip:${ip}`, 60, 15 * 60_000, 15 * 60_000);
  const byEmail = rateLimit(`login-email:${email}`, 8, 15 * 60_000, 15 * 60_000);
  if (!byIp.ok || !byEmail.ok) {
    return { error: `Terlalu banyak percobaan masuk. Demi keamanan, coba lagi dalam ${waitText(Math.max(byIp.retryAfter, byEmail.retryAfter))}.` };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
  if (!user || !valid) return { error: "Email atau password salah." };
  resetRate(`login-email:${email}`);
  if (!user.isActive) return { error: "Akun Anda dinonaktifkan. Hubungi admin." };

  const now = new Date();
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now, lastSeenAt: now } }).catch(() => undefined);
  await createSession({ userId: user.id, role: user.role, name: user.name });
  await setFlash("success", `Selamat datang kembali, ${user.name.split(" ")[0]}! 👋`);

  const next = safeNext(formData.get("next"));
  const staff = isPanel(user.role);
  if (next && (staff ? next.startsWith("/admin") : !next.startsWith("/admin"))) redirect(next);
  redirect(staff ? "/admin" : "/dashboard");
}

const RegisterSchema = z
  .object({
    name: z.string().trim().min(3, "Nama minimal 3 karakter").max(120, "Nama maksimal 120 karakter"),
    email: z.string().trim().toLowerCase().max(160, "Email terlalu panjang").email("Format email tidak valid"),
    phone: z.string().trim().min(9, "Nomor WhatsApp tidak valid").max(20, "Nomor WhatsApp tidak valid"),
    school: z.string().trim().min(2, "Asal sekolah wajib diisi").max(160, "Nama sekolah maksimal 160 karakter"),
    password: z.string().min(8, "Password minimal 8 karakter").max(100, "Password maksimal 100 karakter"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Konfirmasi password tidak sama", path: ["confirm"] });

export async function registerAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  // cegah pembuatan akun massal oleh bot (longgar agar satu kelas di jaringan sekolah tetap bisa daftar)
  const lim = rateLimit(`register:${await clientIp()}`, 30, 60 * 60_000);
  if (!lim.ok) return { error: `Terlalu banyak pendaftaran dari jaringan ini. Coba lagi dalam ${waitText(lim.retryAfter)}.` };
  const parsed = RegisterSchema.safeParse(Object.fromEntries(formData));
  const student = await parseStudentFields(formData);
  if (!parsed.success || !student.data) {
    return { fieldErrors: { ...(parsed.success ? {} : parsed.error.flatten().fieldErrors), ...student.fieldErrors } };
  }
  const d = parsed.data;

  if (await prisma.user.findUnique({ where: { email: d.email } })) {
    return { fieldErrors: { email: ["Email sudah terdaftar, silakan masuk."] } };
  }
  const user = await prisma.user.create({
    data: {
      name: d.name,
      email: d.email,
      phone: normalizePhone(d.phone),
      school: d.school,
      ...student.data,
      password: await bcrypt.hash(d.password, 10),
      role: "PESERTA",
      lastLoginAt: new Date(),
      lastSeenAt: new Date(),
    },
  });
  await createSession({ userId: user.id, role: user.role, name: user.name });
  await setFlash("success", `Akun berhasil dibuat. Selamat bergabung, ${user.name.split(" ")[0]}! 🎉`);
  redirect(safeNext(formData.get("next")) ?? "/dashboard");
}

export async function logoutAction() {
  // Sedang "masuk sebagai" akun lain → keluar = kembali ke akun superadmin
  const session = await getSession();
  if (session?.impersonatorId) return stopImpersonationAction();
  await deleteSession();
  await setFlash("info", "Kamu sudah keluar. Sampai jumpa lagi!");
  redirect("/");
}

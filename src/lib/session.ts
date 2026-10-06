import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import crypto from "node:crypto";
import { cache } from "react";
import { prisma } from "./prisma";
import { setFlash } from "./flash";

export const SESSION_COOKIE = "pp_session";
const SEEN_EVERY_MS = 10 * 60_000;
const MAX_AGE = 60 * 60 * 24 * 7; // 7 hari

export type SessionPayload = {
  userId: number;
  role: Role;
  name: string;
  /** Diisi saat root "masuk sebagai" akun lain: id & nama akun root aslinya */
  impersonatorId?: number;
  impersonatorName?: string;
  /** Sidik jari password saat sesi dibuat → ganti password = semua sesi lama tidak berlaku */
  pv?: string;
};

const passwordVersion = (hash: string) => crypto.createHash("sha256").update(hash).digest("hex").slice(0, 16);

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET belum di-set di .env");
  return new TextEncoder().encode(secret);
}

export async function encryptSession(payload: SessionPayload) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${MAX_AGE}s`).sign(secretKey());
}

export async function decryptSession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(payload: SessionPayload) {
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { password: true } });
  const token = await encryptSession({ ...payload, pv: user ? passwordVersion(user.password) : undefined });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function deleteSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Sesi yang masih sah menurut database: akun ada & aktif, role tidak berubah, password tidak diganti,
 * dan (bila sedang "masuk sebagai") superadmin aslinya masih aktif. Di-cache per request.
 */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const store = await cookies();
  const payload = await decryptSession(store.get(SESSION_COOKIE)?.value);
  if (!payload?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { role: true, isActive: true, password: true, name: true, lastSeenAt: true } });
  if (!user || !user.isActive || user.role !== payload.role || payload.pv !== passwordVersion(user.password)) return null;
  // jejak "terakhir aktif" (sesi login berlaku 7 hari, jadi peserta bisa aktif tanpa login ulang); maks. sekali per 10 menit, bukan saat "masuk sebagai"
  if (!payload.impersonatorId && (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > SEEN_EVERY_MS)) {
    void prisma.user.update({ where: { id: payload.userId }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  if (payload.impersonatorId) {
    const imp = await prisma.user.findUnique({ where: { id: payload.impersonatorId }, select: { role: true, isActive: true } });
    if (!imp || !["ROOT", "ADMIN"].includes(imp.role) || !imp.isActive) return null;
  }
  return { ...payload, name: user.name };
});

/** Ada cookie sesi tetapi sudah tidak sah (dinonaktifkan / role atau password berubah)? */
async function hasStaleCookie() {
  const store = await cookies();
  return Boolean(store.get(SESSION_COOKIE)?.value);
}

/** Tim sales/admin pelatihan (akses data lead, blast, performa & keuangan). ROOT & SUPERADMIN ikut melihat. */
export const isStaff = (role?: Role) => role === "ROOT" || role === "SUPERADMIN" || role === "ADMIN";
/** Root: akses tertinggi (dulu fungsi superadmin). */
export const isRoot = (role?: Role) => role === "ROOT";
/** Superadmin kini mode lihat saja: semua menu terlihat, tanpa membuat/mengubah/menghapus/mengunduh. */
export const isReadOnly = (role?: Role) => role === "SUPERADMIN";
export const READ_ONLY_MESSAGE = "Akun Superadmin hanya bisa melihat data — tidak bisa menambah, mengubah, menghapus, atau mengunduh.";

/** Apakah request ini pemanggilan server action (bukan render halaman)? */
async function isServerAction() {
  return Boolean((await headers()).get("next-action"));
}

/** Kembali ke halaman asal (header Referer, hanya path di situs ini). */
async function backPath() {
  const ref = (await headers()).get("referer");
  try {
    const u = new URL(ref ?? "", "http://x");
    return u.pathname.startsWith("/") && !u.pathname.startsWith("//") ? u.pathname + u.search : "/admin";
  } catch {
    return "/admin";
  }
}
/** Semua pengguna panel admin, termasuk Admin SmartChampion (akses terbatas ke menu konten). */
export const isPanel = (role?: Role) => isStaff(role) || role === "SMARTCHAMPION";

/**
 * Wajib login; opsional batasi role. Redirect jika tidak memenuhi.
 * Pengaman mode lihat saja: server action apa pun (tambah/ubah/hapus/impor/terbitkan…) dari akun SUPERADMIN ditolak —
 * pesan peringatan ditampilkan lalu kembali ke halaman asal. Render halaman tetap diizinkan.
 * `allowReadOnly` hanya untuk aksi milik akun sendiri (mis. ganti password).
 */
export async function requireUser(roles?: Role[], opts: { allowReadOnly?: boolean } = {}) {
  const session = await getSession();
  // cookie basi dibersihkan dulu lewat route handler (komponen server tidak boleh mengubah cookie)
  if (!session) redirect((await hasStaleCookie()) ? "/api/auth/signout" : "/login");
  if (roles && !roles.includes(session.role)) redirect(isPanel(session.role) ? "/admin" : "/dashboard");
  if (isReadOnly(session.role) && !opts.allowReadOnly && (await isServerAction())) {
    await setFlash("warning", READ_ONLY_MESSAGE);
    redirect(await backPath());
  }
  return session;
}

/**
 * Batas data statistik: akun ADMIN hanya melihat datanya sendiri (id-nya),
 * SUPERADMIN melihat semua (undefined).
 */
export const statsScope = (session: SessionPayload) => (session.role === "ADMIN" ? session.userId : undefined);

export const requireStaff = () => requireUser(["ROOT", "SUPERADMIN", "ADMIN"]);
/** Menu konten: produk & materi, peserta terdaftar, tutor, games, chatbot — juga Admin SmartChampion. */
export const requirePanel = () => requireUser(["ROOT", "SUPERADMIN", "ADMIN", "SMARTCHAMPION"]);
/** Menu khusus pimpinan (mis. Pengguna): ROOT kelola, SUPERADMIN melihat. */
export const requireSuperadmin = () => requireUser(["ROOT", "SUPERADMIN"]);
export const requireRoot = () => requireUser(["ROOT"]);

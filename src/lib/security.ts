import "server-only";
import crypto from "node:crypto";
import { headers } from "next/headers";

/**
 * Utilitas keamanan: pembatas laju (rate limit) di memori, IP klien, dan perbandingan aman.
 * Aplikasi berjalan sebagai satu proses (pm2), jadi penyimpanan di memori sudah konsisten.
 * Lapisan pertama tetap nginx (limit_req) — ini lapisan kedua per fitur.
 */

type Bucket = { hits: number[]; blockedUntil: number };
const store = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
  if (now - lastSweep < 60_000 && store.size < 50_000) return;
  lastSweep = now;
  for (const [k, b] of store) if (b.blockedUntil < now && (!b.hits.length || now - b.hits[b.hits.length - 1] > 86_400_000)) store.delete(k);
}

export type RateResult = { ok: boolean; retryAfter: number };

/**
 * Jendela geser: maksimal `limit` kejadian per `windowMs` untuk kunci tsb.
 * `blockMs` (opsional) = hukuman tambahan setelah batas terlampaui (mis. brute force login).
 */
export function rateLimit(key: string, limit: number, windowMs: number, blockMs = 0): RateResult {
  const now = Date.now();
  sweep(now);
  const b = store.get(key) ?? { hits: [], blockedUntil: 0 };
  if (b.blockedUntil > now) return { ok: false, retryAfter: Math.ceil((b.blockedUntil - now) / 1000) };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    if (blockMs) b.blockedUntil = now + blockMs;
    store.set(key, b);
    const retry = blockMs || windowMs - (now - b.hits[0]);
    return { ok: false, retryAfter: Math.max(1, Math.ceil(retry / 1000)) };
  }
  b.hits.push(now);
  store.set(key, b);
  return { ok: true, retryAfter: 0 };
}

/** Hapus catatan (mis. setelah login berhasil). */
export function resetRate(key: string) {
  store.delete(key);
}

/** IP klien. Di produksi nginx menimpa X-Real-IP dengan IP asli, jadi tidak bisa dipalsukan pengguna. */
export function ipFrom(h: Headers) {
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "local").trim().slice(0, 64) || "local";
}

export async function clientIp() {
  return ipFrom(await headers());
}

export function waitText(seconds: number) {
  return seconds >= 90 ? `${Math.ceil(seconds / 60)} menit` : `${seconds} detik`;
}

/** Batasi pemanggilan server action per pengguna/IP; kembalikan pesan error bila terlampaui. */
export async function limitAction(name: string, who: string | number | null, limit: number, windowMs: number): Promise<string | null> {
  const key = `${name}:${who ?? `ip:${await clientIp()}`}`;
  const r = rateLimit(key, limit, windowMs);
  return r.ok ? null : `Terlalu banyak permintaan. Coba lagi dalam ${waitText(r.retryAfter)}.`;
}

/** Perbandingan string tahan timing attack. */
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a ?? "");
  const y = Buffer.from(b ?? "");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Tolak body terlalu besar sebelum dibaca (route handler). */
export function bodyTooLarge(request: Request, maxBytes: number) {
  const len = Number(request.headers.get("content-length") ?? 0);
  return len > maxBytes;
}

/** Respons 429 standar untuk route handler. */
export function tooMany(retryAfter: number) {
  return new Response(JSON.stringify({ message: "Terlalu banyak permintaan. Coba lagi sebentar." }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
  });
}

/** Cek batas untuk route handler; kembalikan Response 429 bila terlampaui, null bila aman. */
export function guardRoute(key: string, limit: number, windowMs: number) {
  const r = rateLimit(key, limit, windowMs);
  return r.ok ? null : tooMany(r.retryAfter);
}

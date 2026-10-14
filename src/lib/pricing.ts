/**
 * Harga early bird kelas (COC & Lainnya): selama earlyStart–earlyEnd (WIB, hari terakhir ikut dihitung)
 * harga yang ditagih = earlyPrice, dan harga normal (`price`) ditampilkan dicoret.
 * VIP Privat tidak memakai early bird — harganya mengikuti paket pertemuan.
 */
export type EarlyPriced = {
  price: number;
  type?: string | null;
  earlyPrice?: number | null;
  earlyStart?: Date | null;
  earlyEnd?: Date | null;
};

const DAY_MS = 24 * 3600_000;

/** Status periode early bird; null bila kelas tidak punya early bird */
export function earlyBirdState(p: EarlyPriced, now = new Date()): "upcoming" | "active" | "ended" | null {
  if (p.type === "PRIVATE" || p.earlyPrice == null || p.earlyPrice >= p.price) return null;
  if (p.earlyStart && now < p.earlyStart) return "upcoming";
  // earlyEnd disimpan sebagai pukul 00.00 WIB hari terakhir → berlaku sampai akhir hari itu
  if (p.earlyEnd && now.getTime() >= p.earlyEnd.getTime() + DAY_MS) return "ended";
  return "active";
}

/** Early bird yang sedang berlaku (null bila tidak ada / belum mulai / sudah lewat) */
export function activeEarlyBird(p: EarlyPriced, now = new Date()) {
  if (earlyBirdState(p, now) !== "active") return null;
  const price = p.earlyPrice!;
  return { price, normal: p.price, endAt: p.earlyEnd ?? null, percent: Math.round(((p.price - price) / p.price) * 100) };
}

/** Harga yang berlaku & ditagih saat ini */
export function currentPrice(p: EarlyPriced, now = new Date()) {
  return activeEarlyBird(p, now)?.price ?? p.price;
}

const dayMonth = (d: Date, year = false) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "Asia/Jakarta" }).format(d);

/** "15–20 Okt 2026", "s.d. 20 Okt 2026", atau "" bila tanpa tanggal */
export function earlyRangeLabel(p: Pick<EarlyPriced, "earlyStart" | "earlyEnd">) {
  if (p.earlyStart && p.earlyEnd) return `${dayMonth(p.earlyStart)} – ${dayMonth(p.earlyEnd, true)}`;
  if (p.earlyEnd) return `s.d. ${dayMonth(p.earlyEnd, true)}`;
  if (p.earlyStart) return `mulai ${dayMonth(p.earlyStart, true)}`;
  return "";
}

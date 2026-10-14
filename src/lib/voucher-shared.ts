/** Aturan voucher yang dipakai bersama oleh server & tampilan (tanpa akses database). */

/**
 * Total setelah voucher minimal Rp 10.000: pembayaran di bawah itu tidak bisa diproses Midtrans dengan wajar,
 * dan transaksi < Rp 10.000 dianggap transaksi uji di laporan penjualan (lib/stats.ts TEST_AMOUNT).
 */
export const VOUCHER_MIN_TOTAL = 10_000;

export type VoucherRule = { type: "PERCENT" | "AMOUNT"; value: number; maxDiscount?: number | null };

/** Besar potongan untuk harga `base` (sudah dibatasi agar total tidak di bawah VOUCHER_MIN_TOTAL) */
export function voucherDiscount(v: VoucherRule, base: number) {
  let d = v.type === "PERCENT" ? Math.floor((base * Math.min(100, Math.max(0, v.value))) / 100) : v.value;
  if (v.type === "PERCENT" && v.maxDiscount) d = Math.min(d, v.maxDiscount);
  return Math.max(0, Math.min(d, base - VOUCHER_MIN_TOTAL));
}

/** "20%", "20% (maks Rp 50.000)", "Rp 50.000" */
export function voucherLabel(v: VoucherRule) {
  const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
  if (v.type === "AMOUNT") return rp(v.value);
  return `${v.value}%${v.maxDiscount ? ` (maks ${rp(v.maxDiscount)})` : ""}`;
}

/** Kode voucher selalu huruf besar tanpa spasi */
export const normalizeVoucherCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);

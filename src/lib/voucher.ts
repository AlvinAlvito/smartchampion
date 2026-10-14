import "server-only";
import { prisma } from "./prisma";
import { formatRupiah } from "./utils";
import { normalizeVoucherCode, VOUCHER_MIN_TOTAL, voucherDiscount } from "./voucher-shared";

const DAY_MS = 24 * 3600_000;
/** pendaftaran yang "memakai" kuota voucher; yang kedaluwarsa/batal mengembalikan kuotanya */
const HOLDING = ["PENDING", "PAID"] as const;

export type VoucherCheck =
  | { ok: true; voucherId: number; code: string; discount: number; total: number; label: string }
  | { ok: false; error: string };

/**
 * Cek voucher untuk satu pendaftaran: aktif, masa berlaku, kelas, harga minimal, kuota, dan sekali per peserta.
 * `base` = harga sebelum voucher (harga paket VIP / harga kelas setelah early bird).
 * Dipanggil saat peserta menekan "Pakai" DAN lagi saat pendaftaran disimpan (harga final selalu dihitung di server).
 */
export async function checkVoucher({ code, productId, base, userId }: { code: string; productId: number; base: number; userId: number }): Promise<VoucherCheck> {
  const c = normalizeVoucherCode(code);
  if (!c) return { ok: false, error: "Masukkan kode voucher." };
  const v = await prisma.voucher.findUnique({ where: { code: c }, include: { products: { select: { id: true } } } });
  const invalid = { ok: false as const, error: "Kode voucher tidak ditemukan atau sudah tidak berlaku." };
  if (!v || !v.isActive) return invalid;
  const now = Date.now();
  if (v.validFrom && now < v.validFrom.getTime()) return { ok: false, error: "Voucher ini belum bisa dipakai." };
  if (v.validUntil && now >= v.validUntil.getTime() + DAY_MS) return { ok: false, error: "Masa berlaku voucher ini sudah habis." };
  if (!v.allProducts && !v.products.some((p) => p.id === productId)) return { ok: false, error: "Voucher ini tidak berlaku untuk kelas ini." };
  if (v.minAmount && base < v.minAmount) return { ok: false, error: `Voucher ini berlaku untuk pembelian minimal ${formatRupiah(v.minAmount)}.` };

  const [used, mine] = await Promise.all([
    v.quota ? prisma.registration.count({ where: { voucherId: v.id, status: { in: [...HOLDING] } } }) : 0,
    prisma.registration.count({ where: { voucherId: v.id, userId, status: { in: [...HOLDING] } } }),
  ]);
  if (v.quota && used >= v.quota) return { ok: false, error: "Kuota voucher ini sudah habis." };
  if (mine) return { ok: false, error: "Kamu sudah memakai voucher ini." };

  const discount = voucherDiscount(v, base);
  if (discount <= 0) return { ok: false, error: `Voucher tidak bisa dipakai: total pembayaran minimal ${formatRupiah(VOUCHER_MIN_TOTAL)}.` };
  return { ok: true, voucherId: v.id, code: v.code, discount, total: base - discount, label: v.type === "PERCENT" ? `${v.value}%` : formatRupiah(v.value) };
}

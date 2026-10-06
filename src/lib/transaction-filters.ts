import type { Prisma, ProductType, RegistrationStatus } from "@prisma/client";
import { PRODUCT_TYPE_LABEL, REG_STATUS_LABEL } from "./constants";

/**
 * Transaksi murni = pendaftaran dari checkout web (Midtrans): kode COC-… yang dibuat situs,
 * BUKAN impor Google Form (GF-/GV-) dan BUKAN aktivasi manual dari Master Lead (sumber "Master Lead (aktivasi)").
 */
export const WEB_TRANSACTION: Prisma.RegistrationWhereInput = {
  code: { startsWith: "COC-" },
  NOT: { source: { startsWith: "Master Lead" } },
};

export type TransactionFilters = { q: string; status: string; type: string; method: string; tgl: "daftar" | "lunas"; from: string; to: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const wibDay = (ymd: string, addDays = 0) => new Date(new Date(`${ymd}T00:00:00+07:00`).getTime() + addDays * 86_400_000);

export function readTransactionFilters(get: (k: string) => string | null | undefined): TransactionFilters {
  const v = (k: string) => (get(k) ?? "").trim();
  return {
    q: v("q").slice(0, 100),
    status: v("status") in REG_STATUS_LABEL ? v("status") : "",
    type: v("type") in PRODUCT_TYPE_LABEL ? v("type") : "",
    method: v("method").slice(0, 40),
    tgl: v("tgl") === "lunas" ? "lunas" : "daftar",
    from: YMD.test(v("from")) ? v("from") : "",
    to: YMD.test(v("to")) ? v("to") : "",
  };
}

export function buildTransactionWhere(f: TransactionFilters, opts: { ignoreStatus?: boolean } = {}): Prisma.RegistrationWhereInput {
  const range = f.from || f.to ? { ...(f.from ? { gte: wibDay(f.from) } : {}), ...(f.to ? { lt: wibDay(f.to, 1) } : {}) } : null;
  return {
    AND: [
      WEB_TRANSACTION,
      ...(f.q
        ? [
            {
              OR: [
                { fullName: { contains: f.q } },
                { code: { contains: f.q } },
                { midtransOrderId: { contains: f.q } },
                { phone: { contains: f.q } },
                { email: { contains: f.q } },
              ],
            },
          ]
        : []),
      ...(f.status && !opts.ignoreStatus ? [{ status: f.status as RegistrationStatus }] : []),
      ...(f.type ? [{ product: { type: f.type as ProductType } }] : []),
      ...(f.method === "none" ? [{ paymentType: null }] : f.method ? [{ paymentType: f.method }] : []),
      ...(range ? [f.tgl === "lunas" ? { paidAt: range } : { createdAt: range }] : []),
    ],
  };
}

export function transactionFiltersToQuery(f: TransactionFilters) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && !(k === "tgl" && v === "daftar")) p.set(k, v);
  return p.toString();
}

/** Nama metode bayar Midtrans yang mudah dibaca */
export const PAYMENT_LABEL: Record<string, string> = {
  qris: "QRIS",
  gopay: "GoPay",
  shopeepay: "ShopeePay",
  bank_transfer: "Transfer bank (VA)",
  echannel: "Mandiri Bill",
  credit_card: "Kartu kredit",
  cstore: "Indomaret/Alfamart",
  akulaku: "Akulaku",
  simulasi: "Simulasi (uji)",
};
export const paymentLabel = (t: string | null) => (t ? (PAYMENT_LABEL[t] ?? t) : "Belum memilih");

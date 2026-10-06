import "server-only";
import type { DateRange } from "./date-range";
import { getProductSales, productsOf } from "./stats";

const DAY = 86_400_000;
const WIB = 7 * 3600_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** Sumber penjualan yang dipantau; sumber lain digabung ke "Lainnya" agar total tetap utuh */
export const SALES_SOURCES = [
  { key: "iklan", label: "Iklan Web POSI" },
  { key: "email", label: "Blast Email" },
  { key: "wa", label: "Blast WA (RFM)" },
  { key: "organic", label: "Organic" },
  { key: "lain", label: "Lainnya" },
] as const;
export type SourceKey = (typeof SALES_SOURCES)[number]["key"];

export function sourceKeyOf(sumber: string | null | undefined): SourceKey {
  const s = (sumber ?? "").toLowerCase();
  if (s.includes("iklan")) return "iklan";
  if (s.includes("email")) return "email";
  if (s.includes("blast wa") || (s.includes("wa") && s.includes("rfm"))) return "wa";
  if (s.includes("organic") || s.includes("organik")) return "organic";
  return "lain";
}

type SourceRow = Record<SourceKey, number> & { label: string };
type ProductRow = { label: string; mimpi: number; coc: number; vip: number };

/** Kelompok pemasukan: lead satu produk masuk ke produknya; lead gabungan (mis. "Mimpi.mu & COC") tidak bisa dipecah → "bundling" */
export const REVENUE_GROUPS = [
  { key: "mimpi", label: "Mimpi.mu" },
  { key: "coc", label: "COC" },
  { key: "vip", label: "VIP Privat" },
  { key: "bundling", label: "Bundling (Mimpi.mu & COC)" },
  { key: "lain", label: "Lainnya" },
] as const;
export type RevenueKey = (typeof REVENUE_GROUPS)[number]["key"];
type RevenueRow = Record<RevenueKey, number> & { label: string; total: number };

export function revenueKeyOf(produk: string | null): RevenueKey {
  const prods = productsOf(produk);
  if (prods.length > 1) return "bundling";
  return prods[0] === "Mimpi.mu" ? "mimpi" : prods[0] === "COC" ? "coc" : prods[0] === "VIP Privat" ? "vip" : "lain";
}

/**
 * Tren penjualan (lead Paid menurut tanggal bayar, WIB) per bulan — atau per hari bila rentang ≤ 45 hari.
 * Sumber data & atribusi owner sama persis dengan getProductSales (kartu penjualan Performa).
 */
export async function getSalesTrend(range: Pick<DateRange, "start" | "end">, ownerId?: number) {
  return buildSalesTrend(await getProductSales(range, ownerId), range);
}

/** Sama seperti getSalesTrend, memakai hasil getProductSales yang sudah ada (tanpa query ulang) */
export function buildSalesTrend(sales: Awaited<ReturnType<typeof getProductSales>>, range: Pick<DateRange, "start" | "end">) {
  const sold = sales.soldLeads.filter((l) => l.tanggalBayar);

  const now = new Date();
  const first = sold.reduce<Date | null>((m, l) => (!m || l.tanggalBayar! < m ? l.tanggalBayar! : m), null);
  const start = range.start ?? first ?? now;
  const end = range.end ?? now;
  const daily = range.start != null && (end.getTime() - start.getTime()) / DAY <= 45;

  // kunci & label bucket dalam WIB
  const wib = (d: Date) => new Date(d.getTime() + WIB);
  const keyOf = (d: Date) => {
    const w = wib(d);
    return daily ? w.toISOString().slice(0, 10) : w.toISOString().slice(0, 7);
  };
  const labelOf = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return daily ? `${d} ${MONTHS[m - 1]}` : `${MONTHS[m - 1]} ${String(y).slice(2)}`;
  };

  // semua bucket di rentang (kosong tetap tampil sebagai 0)
  const keys: string[] = [];
  if (daily) {
    for (let t = wib(start).getTime(); t < wib(end).getTime(); t += DAY) keys.push(new Date(t).toISOString().slice(0, 10));
  } else {
    const s = wib(start);
    const e = wib(new Date(end.getTime() - 1));
    for (
      let y = s.getUTCFullYear(), m = s.getUTCMonth();
      y < e.getUTCFullYear() || (y === e.getUTCFullYear() && m <= e.getUTCMonth());
      m === 11 ? (y++, (m = 0)) : m++
    ) {
      keys.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    }
  }
  // bulanan dibatasi 24 bulan terakhir; harian sudah ≤ 45 hari
  const kept = daily ? keys : keys.slice(-24);

  const emptySrc = (label: string): SourceRow => ({ label, iklan: 0, email: 0, wa: 0, organic: 0, lain: 0 });
  const byProduct = new Map<string, ProductRow>(kept.map((k) => [k, { label: labelOf(k), mimpi: 0, coc: 0, vip: 0 }]));
  const mimpiSrc = new Map<string, SourceRow>(kept.map((k) => [k, emptySrc(labelOf(k))]));
  const cocSrc = new Map<string, SourceRow>(kept.map((k) => [k, emptySrc(labelOf(k))]));
  const totals = { mimpi: 0, coc: 0, vip: 0 };
  const emptyRev = (label: string): RevenueRow => ({ label, mimpi: 0, coc: 0, vip: 0, bundling: 0, lain: 0, total: 0 });
  const revenue = new Map<string, RevenueRow>(kept.map((k) => [k, emptyRev(labelOf(k))]));
  const revenueTotals = { ...emptyRev("total"), missingNominal: 0, transactions: 0 };
  const srcTotals = { mimpi: emptySrc("total"), coc: emptySrc("total") };

  for (const l of sold) {
    const k = keyOf(l.tanggalBayar!);
    const row = byProduct.get(k);
    // pemasukan (nominal lead Paid), dikelompokkan per produk
    const rk = revenueKeyOf(l.produk);
    const amount = l.nominal ?? 0;
    revenueTotals[rk] += amount;
    revenueTotals.total += amount;
    revenueTotals.transactions++;
    if (l.nominal == null) revenueTotals.missingNominal++;
    const rr = revenue.get(k);
    if (rr) {
      rr[rk] += amount;
      rr.total += amount;
    }
    const prods = productsOf(l.produk);
    const src = sourceKeyOf(l.sumberLead);
    if (prods.includes("Mimpi.mu")) {
      totals.mimpi++;
      srcTotals.mimpi[src]++;
      if (row) {
        row.mimpi++;
        mimpiSrc.get(k)![src]++;
      }
    }
    if (prods.includes("COC")) {
      totals.coc++;
      srcTotals.coc[src]++;
      if (row) {
        row.coc++;
        cocSrc.get(k)![src]++;
      }
    }
    if (prods.includes("VIP Privat")) {
      totals.vip++;
      if (row) row.vip++;
    }
  }

  return {
    granularity: daily ? ("day" as const) : ("month" as const),
    byProduct: [...byProduct.values()],
    mimpiBySource: [...mimpiSrc.values()],
    cocBySource: [...cocSrc.values()],
    totals,
    sourceTotals: srcTotals,
    /** pemasukan per periode (Rp) & totalnya */
    revenue: [...revenue.values()],
    revenueTotals,
  };
}
export type SalesTrend = ReturnType<typeof buildSalesTrend>;

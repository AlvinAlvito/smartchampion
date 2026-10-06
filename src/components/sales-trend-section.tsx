import { BookOpen, Brain, Crown, Layers, Package, TrendingUp, Wallet } from "lucide-react";
import type { SalesTrend } from "@/lib/sales-trend";
import { REVENUE_GROUPS, SALES_SOURCES } from "@/lib/sales-trend";
import { formatRupiah } from "@/lib/utils";
import { GroupedBarChart, StackedBarChart } from "@/components/charts";

/** Warna tetap per produk & per sumber agar konsisten di semua grafik */
const PRODUCT_SERIES = [
  { key: "mimpi", label: "Mimpi.mu", color: "#14b8a6" },
  { key: "coc", label: "COC", color: "#1a6f9f" },
  { key: "vip", label: "VIP Privat", color: "#f9d014" },
];
const SOURCE_COLOR: Record<string, string> = { iklan: "#1a6f9f", email: "#f9d014", wa: "#22c55e", organic: "#84c3e5", lain: "#93b3cc" };
const SOURCE_SERIES = SALES_SOURCES.map((s) => ({ key: s.key, label: s.label, color: SOURCE_COLOR[s.key] }));

type SourceTotalsRow = SalesTrend["sourceTotals"]["coc"];

const REVENUE_STYLE: Record<string, { color: string; icon: typeof Brain; ring: string }> = {
  mimpi: { color: "#14b8a6", icon: Brain, ring: "bg-teal-50 text-teal-800 ring-teal-100" },
  coc: { color: "#1a6f9f", icon: BookOpen, ring: "bg-brand-50 text-brand-800 ring-brand-100" },
  vip: { color: "#f9d014", icon: Crown, ring: "bg-sun-50 text-sun-900 ring-sun-200" },
  bundling: { color: "#8b5cf6", icon: Layers, ring: "bg-violet-50 text-violet-800 ring-violet-100" },
  lain: { color: "#93b3cc", icon: Package, ring: "bg-navy-50 text-navy-700 ring-navy-100" },
};
const REVENUE_SERIES = REVENUE_GROUPS.map((g) => ({ key: g.key, label: g.label, color: REVENUE_STYLE[g.key].color }));

/** Pemasukan (nominal lead Paid menurut tanggal bayar): total, per produk, grafik & tabel per periode — untuk rekap finance */
function RevenueCard({ trend, sub }: { trend: SalesTrend; sub: string }) {
  const t = trend.revenueTotals;
  // tampilkan kelompok yang ada isinya (Mimpi.mu, COC, VIP selalu tampil)
  const groups = REVENUE_GROUPS.filter((g) => ["mimpi", "coc", "vip"].includes(g.key) || t[g.key] > 0);
  const rows = trend.revenue.filter((r) => r.total > 0);
  return (
    <div className="card animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-bold text-navy-900">
            <Wallet className="h-5 w-5 text-emerald-600" /> Pemasukan (Rp)
          </p>
          <p className="text-xs text-navy-400">{sub} · nominal lead Paid</p>
        </div>
        <div className="rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 px-4 py-2 text-right text-white shadow-lg shadow-emerald-500/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-50">Total pemasukan</p>
          <p className="text-2xl font-black leading-tight">{formatRupiah(t.total)}</p>
          <p className="text-[11px] text-emerald-50">{t.transactions} transaksi</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {groups.map((g) => {
          const st = REVENUE_STYLE[g.key];
          const pct = t.total ? Math.round((t[g.key] / t.total) * 100) : 0;
          return (
            <div key={g.key} className={`rounded-2xl px-3 py-2.5 ring-1 ${st.ring}`}>
              <p className="flex items-center gap-1.5 text-xs font-bold">
                <st.icon className="h-3.5 w-3.5" /> {g.label}
              </p>
              <p className="mt-0.5 text-lg font-black text-navy-900">{formatRupiah(t[g.key])}</p>
              <p className="text-[11px] opacity-80">{pct}% dari total</p>
            </div>
          );
        })}
      </div>
      {t.missingNominal > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          {t.missingNominal} transaksi Paid belum diisi nominalnya di Master Lead (dihitung Rp0) — lengkapi agar total pemasukan akurat.
        </p>
      )}

      <div className="mt-4 h-64">
        <StackedBarChart data={trend.revenue} series={REVENUE_SERIES} currency />
      </div>

      {rows.length > 0 && (
        <details className="group mt-3 rounded-2xl ring-1 ring-navy-100" open={rows.length <= 12}>
          <summary className="cursor-pointer select-none rounded-2xl px-4 py-2.5 text-sm font-bold text-navy-700 hover:bg-navy-50/60">
            Rincian pemasukan {trend.granularity === "day" ? "per hari" : "per bulan"} ({rows.length})
          </summary>
          <div className="overflow-x-auto">
            <table className="table min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th>{trend.granularity === "day" ? "Tanggal" : "Bulan"}</th>
                  {groups.map((g) => (
                    <th key={g.key} className="text-right">
                      {g.label}
                    </th>
                  ))}
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <td className="whitespace-nowrap font-semibold text-navy-800">{r.label}</td>
                    {groups.map((g) => (
                      <td key={g.key} className="whitespace-nowrap text-right tabular-nums text-navy-700">
                        {r[g.key] ? formatRupiah(r[g.key]) : "–"}
                      </td>
                    ))}
                    <td className="whitespace-nowrap text-right font-bold tabular-nums text-navy-900">{formatRupiah(r.total)}</td>
                  </tr>
                ))}
                <tr className="bg-emerald-50/60">
                  <td className="font-black text-navy-900">Total</td>
                  {groups.map((g) => (
                    <td key={g.key} className="whitespace-nowrap text-right font-bold tabular-nums text-navy-900">
                      {formatRupiah(t[g.key])}
                    </td>
                  ))}
                  <td className="whitespace-nowrap text-right font-black tabular-nums text-emerald-700">{formatRupiah(t.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function SourceTotals({ totals }: { totals: SourceTotalsRow }) {
  const sum = SALES_SOURCES.reduce((s, x) => s + (totals[x.key] ?? 0), 0);
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-navy-50 pt-3 text-xs">
      {SALES_SOURCES.map((x) => (
        <span key={x.key} className="inline-flex items-center gap-1.5 rounded-full bg-navy-50/70 px-2.5 py-1 font-semibold text-navy-700">
          <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_COLOR[x.key] }} />
          {x.label}: <b className="text-navy-900">{totals[x.key] ?? 0}</b>
          {sum > 0 && <span className="font-normal text-navy-400">({Math.round(((totals[x.key] ?? 0) / sum) * 100)}%)</span>}
        </span>
      ))}
    </div>
  );
}

function SourceCard({
  title,
  subtitle,
  icon: Icon,
  data,
  totals,
}: {
  title: string;
  subtitle: string;
  icon: typeof Brain;
  data: SalesTrend["cocBySource"];
  totals: SourceTotalsRow;
}) {
  return (
    <div className="card animate-fade-up">
      <p className="flex items-center gap-2 font-bold text-navy-900">
        <Icon className="h-5 w-5 text-brand-600" /> {title}
      </p>
      <p className="text-xs text-navy-400">{subtitle}</p>
      <div className="mt-4 h-64">
        <StackedBarChart data={data} series={SOURCE_SERIES} />
      </div>
      <SourceTotals totals={totals} />
    </div>
  );
}

/**
 * Grafik penjualan (lead Paid dari semua sumber, menurut tanggal bayar):
 * 1) per produk, 2) Mimpi.mu per sumber, 3) COC per sumber.
 */
export function SalesTrendSection({ trend, periodLabel }: { trend: SalesTrend; periodLabel: string }) {
  const unit = trend.granularity === "day" ? "per hari" : "per bulan";
  const sub = `${periodLabel} · ${unit} · dihitung dari tanggal bayar`;
  return (
    <section className="mb-8 space-y-6">
      <div className="card animate-fade-up">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-bold text-navy-900">
              <TrendingUp className="h-5 w-5 text-brand-600" /> Penjualan produk (Paid)
            </p>
            <p className="text-xs text-navy-400">{sub} · semua sumber</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { l: "Mimpi.mu", v: trend.totals.mimpi, icon: Brain, c: "bg-teal-50 text-teal-700 ring-teal-100" },
              { l: "COC", v: trend.totals.coc, icon: BookOpen, c: "bg-brand-50 text-brand-700 ring-brand-100" },
              { l: "VIP Privat", v: trend.totals.vip, icon: Crown, c: "bg-sun-50 text-sun-800 ring-sun-200" },
            ].map((k) => (
              <span key={k.l} className={`inline-flex items-center gap-2 rounded-2xl px-3 py-1.5 text-sm font-semibold ring-1 ${k.c}`}>
                <k.icon className="h-4 w-4" /> {k.l} <b className="text-lg leading-none">{k.v}</b>
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4 h-72">
          <GroupedBarChart data={trend.byProduct} series={PRODUCT_SERIES} xKey="label" />
        </div>
      </div>

      <RevenueCard trend={trend} sub={sub} />

      <div className="grid gap-6 xl:grid-cols-2">
        <SourceCard title="Penjualan Mimpi.mu per sumber" icon={Brain} subtitle={sub} data={trend.mimpiBySource} totals={trend.sourceTotals.mimpi} />
        <SourceCard title="Penjualan COC per sumber" icon={BookOpen} subtitle={sub} data={trend.cocBySource} totals={trend.sourceTotals.coc} />
      </div>
    </section>
  );
}

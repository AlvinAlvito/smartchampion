import { ArrowRight, Brain, Check } from "lucide-react";
import { cn, formatRupiah } from "@/lib/utils";

const MIMPIMU_PLANS = [
  { label: "1 bulan", price: 49000 },
  { label: "3 bulan", price: 99000, best: true },
  { label: "6 bulan", price: 179000 },
];

/** Kartu produk Mimpi.mu (dipakai di landing page & dashboard peserta). */
export function MimpimuCard({ className }: { className?: string }) {
  return (
    <div className={cn("card flex h-full flex-col gap-5 rounded-[32px] p-5 sm:p-8", className)}>
      <div className="flex items-center justify-between">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-brand-100 to-navy-100 text-brand-700">
          <Brain className="h-7 w-7" />
        </span>
        <span className="badge bg-navy-50 text-navy-600 ring-1 ring-navy-100">Belajar mandiri</span>
      </div>
      <div>
        <h3 className="text-2xl font-extrabold text-navy-900">Mimpi.mu</h3>
        <p className="mt-2 text-navy-400">Platform belajar mandiri untuk berlatih, memantau progres, dan memahami bagian yang perlu ditingkatkan.</p>
      </div>
      <ul className="grid gap-2.5 text-sm text-navy-700 sm:grid-cols-2">
        {["Persiapan TKA & UTBK", "Latihan OSN dan KSM", "Analisis performa AI", "Coba gratis dulu"].map((t) => (
          <li key={t} className="flex items-center gap-2">
            <Check className="h-4 w-4 text-brand-600" /> {t}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-2">
        {MIMPIMU_PLANS.map((p) => (
          <div
            key={p.label}
            className={`relative min-w-0 rounded-2xl border px-1.5 py-3 text-center transition hover:-translate-y-0.5 ${p.best ? "border-brand-400 bg-brand-50 shadow-md shadow-brand-200" : "border-navy-100"}`}
          >
            {p.best && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-brand-600 px-2 text-[10px] font-bold text-white">Terlaris</span>}
            <p className="text-xs text-navy-400">{p.label}</p>
            <p className="whitespace-nowrap text-[13px] font-extrabold tracking-tight text-navy-900 sm:text-base">{formatRupiah(p.price)}</p>
          </div>
        ))}
      </div>
      <a href="https://mimpi.mu" target="_blank" rel="noreferrer" className="btn-secondary mt-auto">
        Coba gratis di Mimpi.mu <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}

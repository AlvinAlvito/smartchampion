import Link from "next/link";
import { ArrowRight, Atom, BookOpen, Brain, Calculator, Flame, Globe, Languages, Microscope, Sparkles, Star, Telescope, TrendingUp, type LucideIcon, Crown, CalendarCheck } from "lucide-react";
import { JENJANG_LABEL } from "@/lib/constants";
import { formatRupiah } from "@/lib/utils";
import { quotaHype, quotaVisible } from "@/lib/quota";
import { Badge, QuotaBar } from "./ui";

/** Ikon & warna per bidang agar katalog lebih hidup */
export function subjectVisual(bidang: string): { icon: LucideIcon; gradient: string } {
  const b = bidang.toLowerCase();
  if (b.includes("matematika")) return { icon: Calculator, gradient: "from-brand-500 to-navy-700" };
  if (b.includes("fisika") || b.includes("kimia")) return { icon: Atom, gradient: "from-sky-500 to-navy-700" };
  if (b.includes("biologi") || b.includes("ipa")) return { icon: Microscope, gradient: "from-emerald-500 to-navy-700" };
  if (b.includes("astronomi") || b.includes("kebumian")) return { icon: Telescope, gradient: "from-sky-600 to-navy-800" };
  if (b.includes("inggris") || b.includes("indonesia")) return { icon: Languages, gradient: "from-brand-400 to-brand-700" };
  if (b.includes("ekonomi") || b.includes("ips")) return { icon: TrendingUp, gradient: "from-sky-500 to-brand-700" };
  if (b.includes("geografi")) return { icon: Globe, gradient: "from-cyan-500 to-navy-700" };
  if (b.includes("informatika") || b.includes("komputer") || b.includes("kecerdasan") || b.includes("ai")) return { icon: Brain, gradient: "from-brand-500 to-navy-900" };
  return { icon: BookOpen, gradient: "from-brand-500 to-navy-700" };
}

type Props = {
  product: {
    slug: string;
    name: string;
    bidang: string;
    jenjang: string;
    level: string;
    gradeLabel: string | null;
    shortDesc: string;
    price: number;
    priceUnit: string;
    minQuota: number;
    paidCount: number;
    /** COC / PRIVATE / OTHER */
    type?: string;
    /** jumlah pertemuan produk "Lainnya" */
    sessionCount?: number | null;
    /** AUTO | ALWAYS | HIDDEN — lihat lib/quota.ts */
    quotaDisplay?: string | null;
  };
};

export function ProductCard({ product: p }: Props) {
  const { icon: Icon, gradient } = subjectVisual(p.bidang);
  const vip = p.type === "PRIVATE";
  const other = p.type === "OTHER";
  const showQuota = quotaVisible(p);
  const hype = showQuota ? quotaHype(p) : null;
  const almost = showQuota && p.paidCount < p.minQuota && p.minQuota - p.paidCount <= 5;
  return (
    <Link href={`/kelas/${p.slug}`} className="card card-hover group relative flex flex-col gap-4 overflow-hidden">
      <div className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-linear-to-br ${gradient} opacity-10 blur-xl transition duration-500 group-hover:scale-150 group-hover:opacity-20`} />
      <div className="flex items-start justify-between gap-3">
        <span className={`grid h-12 w-12 place-items-center rounded-2xl bg-linear-to-br ${gradient} text-white shadow-lg transition duration-300 group-hover:rotate-[-6deg] group-hover:scale-110`}>
          <Icon className="h-6 w-6" />
        </span>
        <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
          {almost && (
            <span className="badge animate-pop bg-linear-to-r from-sun-400 to-sun-500 text-[10px] uppercase tracking-wide text-navy-900 shadow">Hampir penuh</span>
          )}
          {vip && (
            <span className="badge bg-linear-to-r from-amber-300 to-amber-500 text-[10px] font-extrabold uppercase tracking-wide text-navy-950 shadow">
              <Crown className="mr-1 h-3 w-3" /> VIP Privat
            </span>
          )}
          <Badge tone="navy">{JENJANG_LABEL[p.jenjang]}</Badge>
          {p.gradeLabel && <Badge tone="brand">{p.gradeLabel}</Badge>}
        </div>
      </div>
      <div>
        <h3 className="wrap-break-word font-bold leading-snug text-navy-900 transition group-hover:text-brand-700">{p.name}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm text-navy-400">{p.shortDesc}</p>
      </div>
      <div className="mt-auto space-y-4">
        {vip ? (
          <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <CalendarCheck className="h-4 w-4 shrink-0" /> 1-on-1 bersama tutor · pilih paket pertemuan · jadwal fleksibel
          </p>
        ) : other ? (
          <p className="flex items-center gap-2 rounded-2xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
            <CalendarCheck className="h-4 w-4 shrink-0" /> {p.sessionCount ?? 1}x pertemuan · sekali bayar
          </p>
        ) : showQuota ? (
          <div className="space-y-2">
            {hype && (
              <p
                className={`flex items-center gap-1.5 text-xs font-bold ${hype.tone === "hot" ? "text-orange-600" : "text-amber-600"}`}
              >
                {hype.tone === "hot" ? <Flame className="h-3.5 w-3.5 shrink-0" /> : <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400" />} {hype.text}
              </p>
            )}
            <QuotaBar filled={p.paidCount} min={p.minQuota} />
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-2xl bg-brand-50/70 px-3 py-2 text-xs font-semibold text-brand-700">
            <Sparkles className="h-4 w-4 shrink-0" /> Pendaftaran dibuka — amankan kursimu sekarang
          </p>
        )}
        <div className="flex items-end justify-between">
          <p className="min-w-0 text-lg font-extrabold text-navy-900">
            {formatRupiah(p.price)} <span className="text-xs font-medium text-navy-400">/ {p.priceUnit}</span>
          </p>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600 transition group-hover:translate-x-1 group-hover:bg-brand-600 group-hover:text-white">
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

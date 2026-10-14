import { Timer } from "lucide-react";
import { activeEarlyBird, earlyBirdState, earlyRangeLabel, type EarlyPriced } from "@/lib/pricing";
import { cn, formatRupiah } from "@/lib/utils";

/**
 * Harga normal dicoret + persentase diskon di sampingnya, lalu label "Early bird · s.d. …".
 * Diskon % = (harga normal − harga early bird) ÷ harga normal, mis. 100.000 → 50.000 = 50%.
 * Hanya tampil selama periode early bird berlaku.
 */
export function EarlyBirdNote({ product, className, dark = false }: { product: EarlyPriced; className?: string; dark?: boolean }) {
  const eb = activeEarlyBird(product);
  if (!eb) return null;
  return (
    <span className={cn("flex flex-col gap-1", className)}>
      <span className="flex flex-wrap items-center gap-2">
        <s className={cn("text-sm font-semibold", dark ? "text-navy-200" : "text-navy-400")}>{formatRupiah(eb.normal)}</s>
        <span className="rounded-md bg-rose-500 px-1.5 py-0.5 text-xs font-extrabold leading-none text-white shadow-sm shadow-rose-500/30" aria-label={`Diskon ${eb.percent} persen`}>
          -{eb.percent}%
        </span>
      </span>
      <span className={cn("flex items-center gap-1 text-[11px] font-bold", dark ? "text-amber-200" : "text-rose-600")}>
        <Timer className="h-3 w-3 shrink-0" /> Early bird{eb.endAt ? ` · ${earlyRangeLabel({ earlyEnd: eb.endAt })}` : ""}
      </span>
    </span>
  );
}

const STATE_LABEL = { active: "sedang berlaku", upcoming: "belum mulai", ended: "sudah berakhir" } as const;

/** Ringkasan early bird untuk panel admin (tampil juga saat belum mulai / sudah berakhir) */
export function EarlyBirdAdminTag({ product, className }: { product: EarlyPriced; className?: string }) {
  const state = earlyBirdState(product);
  if (!state) return null;
  const range = earlyRangeLabel(product);
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-0.5 text-[11px] font-bold leading-snug",
        state === "active" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500",
        className,
      )}
      title={`Early bird ${STATE_LABEL[state]}`}
    >
      <Timer className="h-3 w-3 shrink-0" />
      <span>
        Early bird {formatRupiah(product.earlyPrice!)}
        {range ? ` · ${range}` : ""} · {STATE_LABEL[state]}
      </span>
    </span>
  );
}

import { CircleAlert, CircleCheck, CircleX, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import type { Health } from "@/lib/blast-wa";
import { cn } from "@/lib/utils";

const LEVEL = {
  AMAN: { label: "Aman", icon: ShieldCheck, ring: "text-emerald-500", bg: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  WASPADA: { label: "Waspada", icon: ShieldAlert, ring: "text-amber-500", bg: "bg-amber-50 text-amber-800 ring-amber-100" },
  BERISIKO: { label: "Berisiko", icon: ShieldX, ring: "text-rose-500", bg: "bg-rose-50 text-rose-700 ring-rose-100" },
} as const;

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-semibold text-navy-600">{label}</span>
        <span className="text-navy-400">
          {value}/{max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-navy-50">
        <div className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
    </div>
  );
}

/** Indikator kesehatan nomor blast: skor, tahap warm-up, pemakaian kuota, dan checklist penyebab */
export function HealthCard({ health, compact = false }: { health: Health; compact?: boolean }) {
  const lv = LEVEL[health.level];
  const r = 42;
  const circ = 2 * Math.PI * r;
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-5">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" className="stroke-navy-50" />
            <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className={cn("stroke-current transition-all", lv.ring)} strokeDasharray={circ} strokeDashoffset={circ * (1 - health.score / 100)} />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-3xl font-extrabold leading-none text-navy-900">{health.score}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-navy-400">skor</p>
            </div>
          </div>
        </div>
        <div className="min-w-48 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-400">Kesehatan nomor blast</p>
          <p className={cn("mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-extrabold ring-1", lv.bg)}>
            <lv.icon className="h-4 w-4" /> {lv.label}
          </p>
          <p className="mt-2 text-xs text-navy-500">
            {health.warm.label} · kuota hari ini <b>{health.warm.cap}</b> pesan
            {health.warm.next ? ` (naik ke ${health.warm.next} minggu depan)` : ""}.
          </p>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <Bar label="Terkirim hari ini" value={health.usage.today} max={health.warm.cap} />
          <Bar label="Terkirim 1 jam terakhir" value={health.usage.hour} max={health.hourCap} />
        </div>
      </div>
      {!compact && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { l: "Terkirim 7 hari", v: health.stats.sent },
              { l: "Gagal", v: `${health.stats.failed} (${Math.round(health.stats.failRate * 100)}%)` },
              { l: "Dibalas", v: `${health.stats.replied} (${Math.round(health.stats.replyRate * 100)}%)` },
              { l: "Berhenti langganan", v: health.stats.optOut },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl bg-navy-50/60 p-3">
                <p className="text-lg font-extrabold text-navy-900">{x.v}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">{x.l}</p>
              </div>
            ))}
          </div>
          <ul className="mt-5 space-y-2">
            {health.checks.map((c) => {
              const Icon = c.ok === true ? CircleCheck : c.ok === "warn" ? CircleAlert : CircleX;
              return (
                <li key={c.label} className="flex gap-2.5 text-sm">
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", c.ok === true ? "text-emerald-500" : c.ok === "warn" ? "text-amber-500" : "text-rose-500")} />
                  <span>
                    <span className="font-semibold text-navy-800">{c.label}</span>
                    {c.ok !== true && c.tip && <span className="block text-xs text-navy-400">{c.tip}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

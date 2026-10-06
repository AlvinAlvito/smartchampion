import { Crown } from "lucide-react";

/** Progres pemakaian paket VIP Privat (pertemuan terpakai / dibeli). */
export function SessionProgress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const left = Math.max(0, total - done);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 font-semibold text-amber-700">
          <Crown className="h-3.5 w-3.5" /> {done}/{total} pertemuan terpakai
        </span>
        <span className="font-bold text-navy-500">{left ? `sisa ${left}` : "paket selesai"}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-amber-100">
        <div className="h-full rounded-full bg-linear-to-r from-amber-400 to-amber-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

import { GraduationCap } from "lucide-react";

export function Sk({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ""}`} />;
}

/** Loader bermerek di tengah (dipakai di atas skeleton). */
export function BrandLoader({ label = "Memuat..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-2 text-sm font-semibold text-navy-400" role="status" aria-live="polite">
      <span className="relative grid h-9 w-9 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-brand-400/30" />
        <span className="relative grid h-9 w-9 animate-pulse place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-navy-700 text-white">
          <GraduationCap className="h-4 w-4" />
        </span>
      </span>
      {label}
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card space-y-4">
          <div className="flex justify-between">
            <Sk className="h-12 w-12 rounded-2xl" />
            <Sk className="h-5 w-16 rounded-full" />
          </div>
          <Sk className="h-5 w-3/4" />
          <Sk className="h-4 w-full" />
          <Sk className="h-2.5 w-full rounded-full" />
          <Sk className="h-6 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card flex items-start justify-between">
          <div className="space-y-2">
            <Sk className="h-3 w-20" />
            <Sk className="h-7 w-24" />
          </div>
          <Sk className="h-10 w-10 rounded-2xl" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card space-y-3">
      <Sk className="h-9 w-full rounded-2xl" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Sk className="h-10 w-10 rounded-xl" />
          <Sk className="h-4 flex-1" />
          <Sk className="hidden h-4 w-24 sm:block" />
          <Sk className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

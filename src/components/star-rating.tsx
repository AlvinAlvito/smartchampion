"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { RATING_LABEL } from "@/lib/feedback-shared";
import { cn } from "@/lib/utils";

/** Tampilan rating (mendukung desimal, mis. 4.3) */
export function StarDisplay({ value, size = "h-4 w-4", className }: { value: number | null; size?: string; className?: string }) {
  const v = value ?? 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={value != null ? `${value} dari 5 bintang` : "belum ada rating"}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, v - (i - 1)));
        return (
          <span key={i} className={cn("relative inline-block", size)}>
            <Star className={cn("absolute inset-0 text-navy-200", size)} />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className={cn("fill-amber-400 text-amber-400", size)} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Input rating 1–5 (nilai dikirim lewat input tersembunyi `name`) */
export function StarInput({
  name,
  label,
  hint,
  defaultValue = 0,
  required = false,
  error,
}: {
  name: string;
  label: string;
  hint?: string | null;
  defaultValue?: number;
  required?: boolean;
  error?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className={cn("rounded-2xl border bg-white p-3 sm:p-4", error ? "border-rose-300" : "border-navy-100")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-navy-900">
            {label}
            {required && <span className="text-rose-500"> *</span>}
          </p>
          {hint && <p className="text-xs text-navy-400">{hint}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label={label} className="flex" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={value === i}
                aria-label={`${i} bintang — ${RATING_LABEL[i]}`}
                data-star={i}
                onMouseEnter={() => setHover(i)}
                onClick={() => setValue(i)}
                className="rounded-lg p-0.5 transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <Star className={cn("h-7 w-7 transition", i <= shown ? "fill-amber-400 text-amber-400" : "text-navy-200")} />
              </button>
            ))}
          </div>
          <span className={cn("w-20 text-xs font-semibold", shown ? "text-amber-600" : "text-navy-300")}>{shown ? RATING_LABEL[shown] : "Pilih"}</span>
        </div>
      </div>
      {error && !value && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
      <input type="hidden" name={name} value={value || ""} />
    </div>
  );
}

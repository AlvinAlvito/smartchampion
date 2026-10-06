"use client";

import { createContext, useContext, useState } from "react";
import { Check, ListChecks, X } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { BulkDeleteBar, HeaderCheckbox, SelectAllBanner, useBulkSelection, type BulkSelection } from "@/components/bulk-select";
import { cn } from "@/lib/utils";
import { useReadOnly } from "@/components/read-only";

const Ctx = createContext<{ selecting: boolean; sel: BulkSelection } | null>(null);

/**
 * Grid kartu + mode "Pilih" untuk hapus massal (dipakai Produk & Tutor).
 * Tiap kartu dibungkus <SelectableCard> agar bisa dicentang. Beri `key` berdasarkan filter + halaman agar pilihan direset.
 */
export function SelectableGrid({
  ids,
  total,
  noun,
  pageName,
  note,
  gridClassName = "grid gap-4 md:grid-cols-2 xl:grid-cols-3",
  deleteSelected,
  deleteByFilter,
  children,
}: {
  ids: number[];
  total: number;
  noun: string;
  pageName: string;
  note?: React.ReactNode;
  gridClassName?: string;
  deleteSelected: (ids: number[]) => Promise<ActionResult>;
  deleteByFilter: () => Promise<ActionResult>;
  children: React.ReactNode;
}) {
  const [selecting, setSelecting] = useState(false);
  const readOnly = useReadOnly();
  const sel = useBulkSelection(ids, total);
  const stop = () => {
    sel.clear();
    setSelecting(false);
  };

  return (
    <Ctx.Provider value={{ selecting, sel }}>
      {ids.length > 0 && !readOnly && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {selecting ? (
            <>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-navy-600 hover:bg-white">
                <HeaderCheckbox sel={sel} label={`Pilih semua ${noun} di halaman ini`} /> Pilih semua di halaman ini
              </label>
              <button type="button" className="btn-ghost btn-sm" onClick={stop}>
                <X className="h-4 w-4" /> Selesai memilih
              </button>
            </>
          ) : (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setSelecting(true)}>
              <ListChecks className="h-4 w-4" /> Pilih untuk hapus
            </button>
          )}
        </div>
      )}
      {selecting && <SelectAllBanner sel={sel} noun={noun} />}
      <div className={cn("stagger", gridClassName)}>{children}</div>
      <BulkDeleteBar sel={sel} noun={noun} pageName={pageName} note={note} deleteSelected={deleteSelected} deleteByFilter={deleteByFilter} />
    </Ctx.Provider>
  );
}

/** Pembungkus kartu: saat mode pilih, klik kartu = centang (tidak membuka detail). */
export function SelectableCard({ id, name, children }: { id: number; name: string; children: React.ReactNode }) {
  const ctx = useContext(Ctx);
  if (!ctx?.selecting) return <>{children}</>;
  const on = ctx.sel.isSelected(id);
  return (
    <div className={cn("relative h-full rounded-3xl transition", on && "ring-2 ring-brand-500 ring-offset-2 ring-offset-navy-50")}>
      {children}
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={`Pilih ${name}`}
        onClick={() => ctx.sel.toggleOne(id)}
        className="absolute inset-0 z-10 cursor-pointer rounded-3xl bg-white/0 transition hover:bg-brand-500/5"
      >
        <span
          className={cn(
            "absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-lg border-2 shadow-sm transition",
            on ? "border-brand-600 bg-brand-600 text-white" : "border-navy-200 bg-white",
          )}
        >
          {on && <Check className="h-4 w-4" />}
        </span>
      </button>
    </div>
  );
}

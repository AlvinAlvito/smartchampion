"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCheck, Trash2, X } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { ConfirmButton } from "@/components/modal";

/**
 * Pilihan baris tabel (centang): per baris, semua di halaman, atau semua yang cocok dengan filter (lintas halaman).
 * Komponen tabel sebaiknya diberi `key` berdasarkan filter + halaman agar pilihan otomatis direset.
 */
export function useBulkSelection(pageIds: number[], total: number) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const pageSelectedCount = pageIds.filter((id) => selected.has(id)).length;
  const allOnPage = pageIds.length > 0 && pageSelectedCount === pageIds.length;
  const someOnPage = pageSelectedCount > 0 && !allOnPage;

  return {
    selected,
    allMatching,
    allOnPage,
    total,
    pageCount: pageIds.length,
    count: allMatching ? total : selected.size,
    /** sebagian baris di halaman ini dicentang (checkbox header setengah) */
    indeterminate: someOnPage && !allMatching,
    isSelected: (id: number) => allMatching || selected.has(id),
    selectAllMatching: () => setAllMatching(true),
    clear: () => {
      setSelected(new Set());
      setAllMatching(false);
    },
    toggleOne: (id: number) => {
      setAllMatching(false);
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    toggleAllOnPage: () => {
      setAllMatching(false);
      setSelected((prev) => {
        const next = new Set(prev);
        if (allOnPage) pageIds.forEach((id) => next.delete(id));
        else pageIds.forEach((id) => next.add(id));
        return next;
      });
    },
  };
}

export type BulkSelection = ReturnType<typeof useBulkSelection>;

/** Checkbox header tabel (mendukung status setengah/indeterminate). */
export function HeaderCheckbox({ sel, label }: { sel: BulkSelection; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const { indeterminate } = sel;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={sel.allOnPage || sel.allMatching}
      onChange={sel.toggleAllOnPage}
      className="h-4 w-4 cursor-pointer accent-brand-600"
      aria-label={label}
    />
  );
}

export function RowCheckbox({ sel, id, label }: { sel: BulkSelection; id: number; label: string }) {
  return <input type="checkbox" checked={sel.isSelected(id)} onChange={() => sel.toggleOne(id)} className="h-4 w-4 cursor-pointer accent-brand-600" aria-label={label} />;
}

/** Banner "pilih semua N data yang cocok dengan filter" setelah satu halaman dicentang semua. */
export function SelectAllBanner({ sel, noun }: { sel: BulkSelection; noun: string }) {
  if (!((sel.allOnPage || sel.allMatching) && sel.total > sel.pageCount)) return null;
  return (
    <div className="mb-3 flex animate-fade-in flex-wrap items-center justify-center gap-2 rounded-2xl bg-brand-50 px-4 py-2.5 text-sm text-navy-700 ring-1 ring-brand-100">
      {sel.allMatching ? (
        <>
          Semua <b>{sel.total.toLocaleString("id-ID")}</b> {noun} yang cocok dengan filter dipilih.
          <button onClick={sel.clear} className="font-bold text-brand-700 underline">
            Batalkan pilihan
          </button>
        </>
      ) : (
        <>
          {sel.pageCount} {noun} di halaman ini dipilih.
          <button onClick={sel.selectAllMatching} className="font-bold text-brand-700 underline">
            Pilih semua {sel.total.toLocaleString("id-ID")} {noun} yang cocok dengan filter
          </button>
        </>
      )}
    </div>
  );
}

/** Bar aksi massal melayang + dialog konfirmasi hapus. */
export function BulkDeleteBar({
  sel,
  noun,
  pageName,
  note,
  deleteSelected,
  deleteByFilter,
}: {
  sel: BulkSelection;
  noun: string;
  /** nama halaman untuk pesan konfirmasi, mis. "Master Lead" */
  pageName: string;
  /** keterangan tambahan di dialog konfirmasi */
  note?: React.ReactNode;
  deleteSelected: (ids: number[]) => Promise<ActionResult>;
  deleteByFilter: () => Promise<ActionResult>;
}) {
  if (sel.count === 0) return null;
  const n = sel.count.toLocaleString("id-ID");
  return (
    <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4" role="region" aria-label="Aksi massal">
      <div className="flex animate-slide-up flex-wrap items-center gap-2 rounded-3xl bg-navy-900 py-2.5 pl-5 pr-2.5 text-sm text-white shadow-[0_20px_50px_-12px_rgba(8,22,37,0.7)] ring-1 ring-white/10">
        <CheckCheck className="h-4 w-4 text-brand-300" />
        <span>
          <b>{n}</b> {noun} dipilih{sel.allMatching ? " (semua sesuai filter)" : ""}
        </span>
        <button onClick={sel.clear} className="ml-2 inline-flex items-center gap-1 rounded-xl px-3 py-2 font-semibold text-navy-200 transition hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" /> Batal
        </button>
        <ConfirmButton
          className="btn-danger btn-sm"
          title={`Hapus ${n} ${noun}?`}
          confirmText={`Ya, hapus ${n} ${noun}`}
          message={
            <>
              <b>
                {n} {noun}
              </b>{" "}
              {sel.allMatching ? "yang cocok dengan filter saat ini" : "yang dipilih"} akan dihapus permanen dari {pageName} dan <b>tidak bisa dikembalikan</b>.
              {note ? <span className="mt-2 block text-xs text-navy-400">{note}</span> : null}
            </>
          }
          action={() => (sel.allMatching ? deleteByFilter() : deleteSelected([...sel.selected]))}
          onDone={sel.clear}
        >
          <Trash2 className="h-4 w-4" /> Hapus
        </ConfirmButton>
      </div>
    </div>
  );
}

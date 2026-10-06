"use client";

import { MessageSquareQuote, Save } from "lucide-react";
import { saveRootNoteAction } from "@/app/actions/jobdesk";
import { formatDate } from "@/lib/utils";
import { Modal } from "@/components/modal";
import { SubmitButton, useFormAction } from "@/components/form-buttons";

/** Kotak catatan root/evaluasi (tampil untuk admin & root) */
export function RootNoteBox({ note, by, at, className = "" }: { note: string | null; by: string | null; at: string | null; className?: string }) {
  if (!note) return null;
  return (
    <div className={`rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 ${className}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
        <MessageSquareQuote className="h-3.5 w-3.5" /> Catatan root{by ? ` · ${by}` : ""}
        {at ? <span className="font-medium normal-case tracking-normal text-amber-600">· {formatDate(at, true)}</span> : null}
      </p>
      <p className="mt-0.5 whitespace-pre-line">{note}</p>
    </div>
  );
}

export type RootNoteTarget =
  | { kind: "daily" | "weekly"; id: number; title: string; note: string | null }
  | { kind: "week"; ownerId: number; year: number; week: number; title: string; note: string | null };

/** Dialog root menulis/menghapus catatan (kosongkan untuk menghapus) */
export function RootNoteDialog({ target, onClose }: { target: RootNoteTarget; onClose: () => void }) {
  const { formProps, pending } = useFormAction(saveRootNoteAction, { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      icon={MessageSquareQuote}
      title={target.kind === "week" ? "Catatan evaluasi pekan" : "Catatan root"}
      description={target.title}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="root-note-form" pending={pending}>
            <Save className="h-4 w-4" /> Simpan
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="root-note-form" className="space-y-2">
        <input type="hidden" name="kind" value={target.kind} />
        {target.kind === "week" ? (
          <>
            <input type="hidden" name="ownerId" value={target.ownerId} />
            <input type="hidden" name="year" value={target.year} />
            <input type="hidden" name="week" value={target.week} />
          </>
        ) : (
          <input type="hidden" name="id" value={target.id} />
        )}
        <textarea
          name="note"
          rows={5}
          maxLength={3000}
          defaultValue={target.note ?? ""}
          className="input"
          placeholder="Arahan, apresiasi, atau evaluasi untuk admin…"
          aria-label="Catatan root"
          autoFocus
        />
        <p className="text-xs text-navy-400">
          Catatan langsung terlihat oleh admin dan ikut tercetak di Agenda Pekanan. Kosongkan lalu simpan untuk menghapus.
        </p>
      </form>
    </Modal>
  );
}

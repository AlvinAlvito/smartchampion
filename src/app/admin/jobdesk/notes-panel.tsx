"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, NotebookPen, Pencil, Pin, PinOff, Save, Send, Trash2 } from "lucide-react";
import { deleteNoteAction, pinNoteAction, saveNoteAction } from "@/app/actions/jobdesk";
import { fmtLong } from "@/lib/jobdesk-shared";
import { cn, formatDate } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { Badge, EmptyState, Field } from "@/components/ui";
import { useToast } from "@/components/toast";
import type { JobCtx, NoteItem } from "./types";

function EditNoteDialog({ note, onClose }: { note: NoteItem; onClose: () => void }) {
  const { formProps, pending, fieldErrors } = useFormAction(saveNoteAction, { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      icon={NotebookPen}
      title="Ubah catatan"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="note-edit-form" pending={pending}>
            <Save className="h-4 w-4" /> Simpan
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="note-edit-form" className="space-y-4">
        <input type="hidden" name="id" value={note.id} />
        <Field label="Catatan" htmlFor="n-content" errors={fieldErrors?.content}>
          <textarea id="n-content" name="content" rows={6} maxLength={5000} defaultValue={note.content} className="input" />
        </Field>
        <Field label="Untuk tanggal (opsional)" htmlFor="n-date">
          <input id="n-date" name="date" type="date" defaultValue={note.date ?? ""} className="input" />
        </Field>
      </form>
    </Modal>
  );
}

/** Papan catatan bersama admin & root (umum atau per tanggal) */
export function NotesPanel({ ctx, notes }: { ctx: JobCtx; notes: NoteItem[] }) {
  const add = useFormAction(saveNoteAction, { resetOnSuccess: true });
  const [editing, setEditing] = useState<NoteItem | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const canManage = (n: NoteItem) => n.mine || ctx.isRoot;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        {notes.length ? (
          notes.map((n) => (
            <article key={n.id} className={cn("card space-y-2 p-4!", n.pinned && "ring-2 ring-brand-200")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-linear-to-br from-brand-500 to-navy-700 text-xs font-black text-white">
                  {n.authorName.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-navy-900">
                    {n.authorName} {n.mine && <span className="font-medium text-brand-600">(Anda)</span>}
                  </p>
                  <p className="text-xs text-navy-400">
                    {n.authorRole} · {formatDate(n.createdAt, true)}
                  </p>
                </div>
                {n.pinned && <Badge tone="brand">Disematkan</Badge>}
                {n.date && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-navy-50 px-2 py-1 text-xs font-semibold text-navy-600">
                    <CalendarDays className="h-3 w-3" /> {fmtLong(n.date)}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-navy-700">{n.content}</p>
              {(ctx.canEdit || canManage(n)) && (
                <div className="flex justify-end gap-1 border-t border-navy-50 pt-2">
                  {ctx.canEdit && (
                    <button
                      className="btn-icon h-8 w-8"
                      disabled={pending}
                      title={n.pinned ? "Lepas sematan" : "Sematkan di atas"}
                      aria-label={n.pinned ? "Lepas sematan" : "Sematkan catatan"}
                      onClick={() =>
                        start(async () => {
                          toast.fromResult(await pinNoteAction(n.id));
                          router.refresh();
                        })
                      }
                    >
                      {n.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </button>
                  )}
                  {canManage(n) && ctx.canEdit && (
                    <>
                      <button className="btn-icon h-8 w-8" onClick={() => setEditing(n)} aria-label="Ubah catatan">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <ConfirmButton
                        className="btn-icon h-8 w-8 text-rose-500 hover:bg-rose-50"
                        title="Hapus catatan?"
                        action={() => deleteNoteAction(n.id)}
                        ariaLabel="Hapus catatan"
                      >
                        <Trash2 className="h-4 w-4" />
                      </ConfirmButton>
                    </>
                  )}
                </div>
              )}
            </article>
          ))
        ) : (
          <EmptyState
            icon={NotebookPen}
            title="Belum ada catatan"
            desc="Catatan bersama admin & root: arahan, hasil rapat, kendala, atau ide untuk pekan depan."
          />
        )}
      </div>
      <aside>
        {ctx.canEdit ? (
          <form {...add.formProps} className="card sticky top-24 space-y-3">
            <p className="flex items-center gap-2 font-bold text-navy-900">
              <NotebookPen className="h-5 w-5 text-brand-600" /> Catatan baru
            </p>
            <input type="hidden" name="ownerId" value={ctx.ownerId} />
            <textarea
              name="content"
              rows={6}
              maxLength={5000}
              className="input"
              placeholder={ctx.isRoot ? `Arahan atau evaluasi untuk ${ctx.ownerName}…` : "Kendala, hasil rapat, ide, atau hal yang perlu diingat…"}
              aria-label="Isi catatan"
            />
            <Field label="Untuk tanggal (opsional)" htmlFor="n-new-date">
              <input id="n-new-date" name="date" type="date" className="input" />
            </Field>
            <SubmitButton pending={add.pending} className="btn-primary w-full">
              <Send className="h-4 w-4" /> Simpan catatan
            </SubmitButton>
            <p className="text-xs text-navy-400">Catatan terlihat oleh admin {ctx.ownerName} dan Root.</p>
          </form>
        ) : (
          <div className="card text-sm text-navy-500">Mode lihat saja.</div>
        )}
      </aside>
      {editing && <EditNoteDialog note={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

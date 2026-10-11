"use client";

import { useState } from "react";
import { LoaderCircle, Pencil, Plus, Save, Share2, Trash2, Zap } from "lucide-react";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Field } from "@/components/ui";
import { WA_MAX_TEXT } from "@/lib/wa-shared";
import { postJson } from "./use-poll";

export type WaTemplateRow = {
  id: number;
  shortcut: string;
  title: string;
  body: string;
  isShared: boolean;
  useCount: number;
  mine: boolean;
  ownerName: string;
};

type Draft = { id: number; shortcut: string; title: string; body: string; isShared: boolean };
const EMPTY: Draft = { id: 0, shortcut: "", title: "", body: "", isShared: false };

/** Kelola template balasan cepat (tambah / ubah / hapus milik sendiri; template admin lain yang dibagikan hanya bisa dipakai) */
export function TemplatesDialog({ templates, onClose, onChanged }: { templates: WaTemplateRow[]; onClose: () => void; onChanged: () => unknown }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(templates.some((t) => t.mine) ? null : EMPTY);
  const [busy, setBusy] = useState(false);
  const mine = templates.filter((t) => t.mine);
  const shared = templates.filter((t) => !t.mine);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const r = await postJson("/api/admin/wa/templates", draft);
    setBusy(false);
    if (r.error) return toast.error(r.error);
    toast.success(draft.id ? "Template diperbarui." : "Template ditambahkan.");
    setDraft(null);
    await onChanged();
  };
  const remove = async (t: WaTemplateRow) => {
    if (!window.confirm(`Hapus template /${t.shortcut}?`)) return;
    const r = await fetch(`/api/admin/wa/templates?id=${t.id}`, { method: "DELETE" });
    if (!r.ok) return toast.error("Gagal menghapus template.");
    toast.success("Template dihapus.");
    await onChanged();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={Zap}
      title="Template balasan"
      description="Ketik /pintasan di kolom chat (mis. /coc) atau tekan tombol ⚡ Template untuk memakainya."
      footer={
        draft ? (
          <>
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)} disabled={busy}>
              Batal
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={busy}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Simpan template
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Tutup
            </button>
            <button type="button" className="btn-primary" onClick={() => setDraft(EMPTY)}>
              <Plus className="h-4 w-4" /> Template baru
            </button>
          </>
        )
      }
    >
      {draft ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <Field label="Pintasan *" htmlFor="tpl-shortcut" hint="Tanpa spasi, mis. coc">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-amber-600">/</span>
                <input
                  id="tpl-shortcut"
                  value={draft.shortcut}
                  onChange={(e) => setDraft({ ...draft, shortcut: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) })}
                  className="input pl-6 font-mono"
                  placeholder="coc"
                  autoFocus
                />
              </div>
            </Field>
            <Field label="Judul" htmlFor="tpl-title" hint="Supaya mudah dicari">
              <input id="tpl-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value.slice(0, 120) })} className="input" placeholder="Penjelasan program COC" />
            </Field>
          </div>
          <Field
            label="Isi pesan *"
            htmlFor="tpl-body"
            hint={
              <>
                <code>{"{nama}"}</code> = nama depan customer · <code>{"{admin}"}</code> = nama Anda · format WA: <code>*tebal*</code>, <code>_miring_</code> · {draft.body.length}/{WA_MAX_TEXT}
              </>
            }
          >
            <textarea
              id="tpl-body"
              rows={9}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value.slice(0, WA_MAX_TEXT) })}
              className="input"
              placeholder={"Halo Kak {nama} 😊\nCOC (Champion Online Class) adalah kelas pendampingan olimpiade…"}
            />
          </Field>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-navy-50/60 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold text-navy-800">Bagikan ke admin lain</span>
              <span className="text-xs text-navy-400">Admin lain bisa memakai (tidak bisa mengubah) template ini.</span>
            </span>
            <input type="checkbox" checked={draft.isShared} onChange={(e) => setDraft({ ...draft, isShared: e.target.checked })} className="h-5 w-5 accent-brand-600" />
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          {!mine.length && <p className="rounded-2xl bg-navy-50/60 p-4 text-center text-sm text-navy-400">Belum ada template milik Anda.</p>}
          {mine.length > 0 && (
            <ul className="space-y-2">
              {mine.map((t) => (
                <li key={t.id} className="flex items-start gap-3 rounded-2xl p-3 ring-1 ring-navy-100">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-mono text-xs font-bold text-amber-800">/{t.shortcut}</span>
                      <span className="truncate text-sm font-bold text-navy-800">{t.title}</span>
                      {t.isShared && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                          <Share2 className="h-3 w-3" /> dibagikan
                        </span>
                      )}
                      <span className="text-[11px] text-navy-400">dipakai {t.useCount}x</span>
                    </p>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-navy-500">{t.body}</p>
                  </div>
                  <button className="btn-icon h-8 w-8" onClick={() => setDraft({ id: t.id, shortcut: t.shortcut, title: t.title, body: t.body, isShared: t.isShared })} aria-label={`Edit /${t.shortcut}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="btn-icon h-8 w-8 text-rose-500 hover:bg-rose-50" onClick={() => remove(t)} aria-label={`Hapus /${t.shortcut}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {shared.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-400">Dibagikan admin lain</p>
              <ul className="space-y-2">
                {shared.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 rounded-2xl bg-navy-50/50 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-mono text-xs font-bold text-amber-800">/{t.shortcut}</span>
                        <span className="truncate text-sm font-bold text-navy-800">{t.title}</span>
                        <span className="text-[11px] text-navy-400">oleh {t.ownerName}</span>
                      </p>
                      <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-navy-500">{t.body}</p>
                    </div>
                    <button
                      className="btn-ghost btn-sm shrink-0"
                      onClick={() => setDraft({ id: 0, shortcut: t.shortcut, title: t.title, body: t.body, isShared: false })}
                      title="Salin jadi template milik Anda (bisa diubah)"
                    >
                      Salin
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

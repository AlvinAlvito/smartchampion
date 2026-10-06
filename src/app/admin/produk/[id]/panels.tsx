"use client";

import { useState } from "react";
import { FileText, Link2, Newspaper, Pencil, Plus, Save, Trash2, Upload, Video } from "lucide-react";
import { deleteMaterialAction, deleteProductAction, saveMaterialAction } from "@/app/actions/products";
import { cn, formatDate } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { Badge, EmptyState, Field } from "@/components/ui";

/* ======================= MATERI ======================= */

export type MaterialRow = {
  id: number;
  title: string;
  type: "PDF" | "VIDEO" | "ARTICLE";
  url: string | null;
  content: string | null;
  summary: string | null;
  isPublished: boolean;
  createdAt: Date;
  author: { name: string } | null;
};

const TYPES = [
  { v: "ARTICLE", l: "Artikel", icon: Newspaper, grad: "from-brand-400 to-brand-700" },
  { v: "PDF", l: "PDF", icon: FileText, grad: "from-rose-400 to-rose-600" },
  { v: "VIDEO", l: "Video", icon: Video, grad: "from-sky-400 to-navy-600" },
] as const;

function MaterialDialog({ productId, material, onClose }: { productId: number; material: MaterialRow | null; onClose: () => void }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveMaterialAction, { onSuccess: onClose });
  const [type, setType] = useState<MaterialRow["type"]>(material?.type ?? "ARTICLE");
  const [fileName, setFileName] = useState("");
  const m = material;
  const storedPdf = m?.url?.startsWith("/api/files/");

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={FileText}
      title={m ? "Edit materi" : "Tambah materi"}
      description="Materi tayang hanya untuk peserta yang sudah lunas di kelas ini."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="material-form" pending={pending} pendingText={type === "PDF" ? "Mengunggah..." : "Menyimpan..."}>
            <Save className="h-4 w-4" /> {m ? "Simpan materi" : "Tambah materi"}
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="material-form" className="space-y-4">
        <input type="hidden" name="productId" value={productId} />
        {m && <input type="hidden" name="id" value={m.id} />}
        <div>
          <span className="label">Tipe materi</span>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <label
                key={t.v}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 p-3 text-sm font-semibold transition",
                  type === t.v ? "border-brand-500 bg-brand-50 text-brand-700 shadow-md shadow-brand-100" : "border-navy-100 text-navy-500 hover:border-brand-200",
                )}
              >
                <input type="radio" name="type" value={t.v} checked={type === t.v} onChange={() => setType(t.v)} className="sr-only" />
                <span className={cn("grid h-10 w-10 place-items-center rounded-xl bg-linear-to-br text-white", t.grad)}>
                  <t.icon className="h-5 w-5" />
                </span>
                {t.l}
              </label>
            ))}
          </div>
        </div>
        <Field label="Judul *" htmlFor="title" errors={fe?.title}>
          <input id="title" name="title" defaultValue={m?.title} className="input" />
        </Field>
        <Field label="Ringkasan" htmlFor="summary">
          <input id="summary" name="summary" defaultValue={m?.summary ?? ""} className="input" maxLength={255} />
        </Field>

        {type === "PDF" && (
          <div className="grid gap-4 rounded-3xl bg-navy-50/60 p-4 sm:grid-cols-2">
            <div>
              <span className="label">Unggah PDF (maks 10 MB)</span>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand-200 bg-white p-4 text-center text-sm text-navy-500 transition hover:border-brand-400 hover:bg-brand-50/40">
                <Upload className="h-6 w-6 text-brand-500" />
                <span className="font-semibold text-navy-700">{fileName || "Pilih file PDF"}</span>
                <input type="file" name="file" accept="application/pdf" className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
              </label>
              {storedPdf && (
                <p className="mt-1.5 text-xs text-navy-400">
                  File tersimpan:{" "}
                  <a href={m!.url!} target="_blank" rel="noreferrer" className="font-semibold text-brand-600 underline">
                    lihat PDF
                  </a>
                  . Unggah baru untuk mengganti.
                </p>
              )}
              {fe?.file && <p className="mt-1 text-xs font-medium text-rose-600">{fe.file[0]}</p>}
            </div>
            <Field label="…atau link PDF" htmlFor="url" hint="Google Drive, dll.">
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                <input id="url" name="url" defaultValue={storedPdf ? "" : (m?.url ?? "")} className="input pl-10" placeholder="https://" />
              </div>
            </Field>
          </div>
        )}

        {type === "VIDEO" && (
          <Field label="Link video (YouTube / Google Drive) *" htmlFor="url" errors={fe?.url}>
            <div className="relative">
              <Video className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
              <input id="url" name="url" defaultValue={m?.url ?? ""} className="input pl-10" placeholder="https://youtu.be/..." />
            </div>
          </Field>
        )}

        <Field
          label={type === "ARTICLE" ? "Isi artikel *" : "Catatan tambahan (opsional)"}
          htmlFor="content"
          errors={fe?.content}
          hint={
            <>
              Format: baris kosong = paragraf, <code>## Judul</code>, <code>- poin</code>, <code>1. langkah</code>, <code>**tebal**</code>, <code>*miring*</code>.
            </>
          }
        >
          <textarea id="content" name="content" rows={type === "ARTICLE" ? 12 : 4} defaultValue={m?.content ?? ""} className="input font-mono text-[13px]" />
        </Field>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-navy-50/60 px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-navy-800">Tayangkan ke peserta</span>
            <span className="text-xs text-navy-400">Matikan untuk menyimpan sebagai draft.</span>
          </span>
          <input type="checkbox" name="isPublished" defaultChecked={m?.isPublished ?? true} className="h-5 w-5 accent-brand-600" />
        </label>
      </form>
    </Modal>
  );
}

export function MaterialsPanel({ productId, materials }: { productId: number; materials: MaterialRow[] }) {
  const [dialog, setDialog] = useState<{ open: boolean; material: MaterialRow | null }>({ open: false, material: null });
  return (
    <section id="materi" className="card scroll-mt-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold text-navy-900">
          <FileText className="h-5 w-5 text-brand-600" /> Materi kelas <span className="text-sm font-medium text-navy-400">({materials.length})</span>
        </h2>
        <button className="btn-primary btn-sm" onClick={() => setDialog({ open: true, material: null })}>
          <Plus className="h-3.5 w-3.5" /> Tambah materi
        </button>
      </div>
      {materials.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {materials.map((m, i) => {
            const t = TYPES.find((x) => x.v === m.type)!;
            return (
              <div key={m.id} className="group flex animate-fade-up gap-3 rounded-2xl p-3 ring-1 ring-navy-100 transition hover:bg-brand-50/40 hover:ring-brand-200" style={{ animationDelay: `${i * 40}ms` }}>
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-linear-to-br text-white", t.grad)}>
                  <t.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge tone={m.isPublished ? "green" : "gray"}>{m.isPublished ? "Tayang" : "Draft"}</Badge>
                  </div>
                  <p className="mt-1 truncate font-semibold text-navy-800">{m.title}</p>
                  <p className="text-xs text-navy-400">
                    {t.l} · {formatDate(m.createdAt)}
                    {m.author ? ` · ${m.author.name}` : ""}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <button className="btn-icon h-8 w-8" onClick={() => setDialog({ open: true, material: m })} aria-label={`Edit ${m.title}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <ConfirmButton
                    className="btn-icon h-8 w-8 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                    title="Hapus materi?"
                    message={<>Materi <b>{m.title}</b> akan dihapus beserta file-nya.</>}
                    action={() => deleteMaterialAction(m.id)}
                    ariaLabel={`Hapus ${m.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmButton>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={FileText} title="Belum ada materi" desc="Tambahkan artikel, PDF, atau video untuk peserta kelas ini." />
      )}
      {dialog.open && <MaterialDialog productId={productId} material={dialog.material} onClose={() => setDialog({ open: false, material: null })} />}
    </section>
  );
}

/* ======================= HAPUS PRODUK ======================= */

export function DeleteProductButton({ id, name }: { id: number; name: string }) {
  return (
    <ConfirmButton
      className="btn-secondary text-rose-600 hover:border-rose-200 hover:bg-rose-50"
      title="Hapus kelas?"
      message={
        <>
          Kelas <b>{name}</b> akan dihapus beserta jadwal & materinya. Jika sudah ada pendaftar, kelas hanya akan <b>ditutup</b> agar riwayat transaksi tetap aman.
        </>
      }
      action={() => deleteProductAction(id)}
    >
      <Trash2 className="h-4 w-4" /> Hapus
    </ConfirmButton>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, Image as ImageIcon, ImagePlus, LayoutTemplate, Megaphone, Pencil, Plus, Save, Trash2, Upload } from "lucide-react";
import {
  deleteGalleryAction,
  deletePostAction,
  moveGalleryAction,
  movePostAction,
  saveFlyerAction,
  savePostAction,
  updateGalleryCaptionAction,
  uploadGalleryAction,
} from "@/app/actions/class-showcase";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { Badge, Field } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useReadOnly } from "@/components/read-only";

export type PostRow = { id: number; title: string; category: string | null; body: string; imageUrl: string | null; isPublished: boolean };
export type GalleryRow = { id: number; url: string; caption: string | null };

/** Jalankan action langsung (tanpa form) lalu tampilkan hasilnya sebagai toast */
function useRun() {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (toast.fromResult(r)) router.refresh();
    });
  return { run, pending };
}

/* ---------------- Flyer ---------------- */

function FlyerCard({ productId, slug, imageUrl }: { productId: number; slug: string; imageUrl: string | null }) {
  const [preview, setPreview] = useState<string | null>(null);
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveFlyerAction, { resetOnSuccess: true, onSuccess: () => setPreview(null) });
  const shown = preview ?? imageUrl;
  return (
    <div className="rounded-3xl bg-navy-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-navy-800">
          <ImageIcon className="h-4 w-4 text-brand-600" /> Flyer / gambar latar
        </p>
        <a href={`/kelas/${slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
          Lihat halaman kelas <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <form {...formProps} className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <input type="hidden" name="productId" value={productId} />
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-linear-to-br from-navy-800 to-brand-700 ring-1 ring-navy-100">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="Flyer kelas" className="h-full w-full object-cover" />
          ) : (
            <span className="absolute inset-0 grid place-items-center p-4 text-center text-xs text-white/70">Belum ada flyer — halaman kelas memakai latar biru biasa.</span>
          )}
        </div>
        <div className="space-y-3 text-sm text-navy-500">
          <p>
            Flyer tampil sebagai <b>latar header</b> halaman kelas (diberi lapisan gelap agar teks tetap terbaca) dan bisa diperbesar oleh pengunjung. Disarankan potret 4:5 atau
            lanskap 16:9, JPG/PNG/WebP, maks 5 MB.
          </p>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-brand-200 bg-white p-3 transition hover:border-brand-400">
            <Upload className="h-5 w-5 shrink-0 text-brand-500" />
            <span className="font-semibold text-navy-700">{preview ? "Gambar baru dipilih — klik Simpan" : imageUrl ? "Ganti flyer" : "Pilih gambar flyer"}</span>
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPreview(f ? URL.createObjectURL(f) : null);
              }}
            />
          </label>
          {fe?.file && <p className="text-xs font-medium text-rose-600">{fe.file[0]}</p>}
          <div className="flex flex-wrap gap-2">
            <SubmitButton pending={pending} className="btn-primary btn-sm" pendingText="Mengunggah...">
              <Save className="h-3.5 w-3.5" /> Simpan flyer
            </SubmitButton>
            {imageUrl && !preview && (
              <ConfirmButton
                className="btn-ghost btn-sm text-rose-600"
                title="Hapus flyer?"
                message="Halaman kelas akan kembali memakai latar biru biasa."
                action={() => {
                  const fd = new FormData();
                  fd.set("productId", String(productId));
                  fd.set("remove", "1");
                  return saveFlyerAction(undefined, fd);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Hapus flyer
              </ConfirmButton>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

/* ---------------- Mading ---------------- */

function PostDialog({ productId, post, onClose }: { productId: number; post: PostRow | null; onClose: () => void }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(savePostAction, { onSuccess: onClose });
  const [preview, setPreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const p = post;
  const shown = preview ?? (removeImage ? null : p?.imageUrl);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={Megaphone}
      title={p ? "Edit mading" : "Tambah mading"}
      description="Kartu mading tampil sebagai slider di halaman kelas publik."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="post-form" pending={pending} pendingText="Menyimpan...">
            <Save className="h-4 w-4" /> {p ? "Simpan mading" : "Tambah mading"}
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="post-form" className="space-y-4">
        <input type="hidden" name="productId" value={productId} />
        {p && <input type="hidden" name="id" value={p.id} />}
        {removeImage && <input type="hidden" name="removeImage" value="1" />}
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div>
            <span className="label">Gambar</span>
            <label className="relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-brand-200 bg-navy-50/60 text-center text-xs text-navy-400 transition hover:border-brand-400">
              {shown ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shown} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-1.5 p-3">
                  <ImagePlus className="h-6 w-6 text-brand-500" /> Opsional · JPG/PNG/WebP maks 5 MB
                </span>
              )}
              <input
                type="file"
                name="image"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setPreview(f ? URL.createObjectURL(f) : null);
                  if (f) setRemoveImage(false);
                }}
              />
            </label>
            {fe?.image && <p className="mt-1 text-xs font-medium text-rose-600">{fe.image[0]}</p>}
            {p?.imageUrl && !preview && !removeImage && (
              <button type="button" className="mt-1.5 text-xs font-semibold text-rose-600 hover:underline" onClick={() => setRemoveImage(true)}>
                Hapus gambar
              </button>
            )}
          </div>
          <div className="space-y-4">
            <Field label="Judul *" htmlFor="post-title" errors={fe?.title}>
              <input id="post-title" name="title" defaultValue={p?.title} maxLength={160} className="input" placeholder="mis. Juara 1 OSN Matematika 2026!" />
            </Field>
            <Field label="Kategori" htmlFor="post-category" hint="mis. Pengumuman, Prestasi, Tips, Info Lomba">
              <input id="post-category" name="category" defaultValue={p?.category ?? ""} maxLength={60} className="input" list="post-categories" />
              <datalist id="post-categories">
                {["Pengumuman", "Prestasi", "Tips Belajar", "Info Lomba", "Testimoni", "Kegiatan"].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
        </div>
        <Field label="Teks *" htmlFor="post-body" errors={fe?.body} hint="Baris baru tetap dipertahankan.">
          <textarea id="post-body" name="body" rows={6} defaultValue={p?.body} maxLength={5000} className="input" />
        </Field>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-navy-50/60 px-4 py-3">
          <span>
            <span className="block text-sm font-semibold text-navy-800">Tayangkan di halaman kelas</span>
            <span className="text-xs text-navy-400">Matikan untuk menyimpan sebagai draft.</span>
          </span>
          <input type="checkbox" name="isPublished" defaultChecked={p?.isPublished ?? true} className="h-5 w-5 accent-brand-600" />
        </label>
      </form>
    </Modal>
  );
}

function PostsCard({ productId, posts }: { productId: number; posts: PostRow[] }) {
  const [dialog, setDialog] = useState<{ open: boolean; post: PostRow | null }>({ open: false, post: null });
  const { run, pending } = useRun();
  const locked = useReadOnly();
  return (
    <div className="rounded-3xl bg-navy-50/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-navy-800">
          <Megaphone className="h-4 w-4 text-brand-600" /> Mading <span className="font-medium text-navy-400">({posts.length})</span>
        </p>
        <button className="btn-primary btn-sm" onClick={() => setDialog({ open: true, post: null })}>
          <Plus className="h-3.5 w-3.5" /> Tambah mading
        </button>
      </div>
      {posts.length ? (
        <ul className="space-y-2">
          {posts.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white p-2.5 ring-1 ring-navy-100">
              <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-linear-to-br from-brand-100 to-navy-100">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Megaphone className="absolute inset-0 m-auto h-5 w-5 text-brand-400" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {p.category && <Badge tone="blue">{p.category}</Badge>}
                  {!p.isPublished && <Badge tone="gray">Draft</Badge>}
                </div>
                <p className="truncate text-sm font-semibold text-navy-800">{p.title}</p>
                <p className="truncate text-xs text-navy-400">{p.body}</p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button className="btn-icon h-8 w-8" disabled={locked || pending || i === 0} onClick={() => run(() => movePostAction(p.id, -1))} aria-label={`Naikkan ${p.title}`}>
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  className="btn-icon h-8 w-8"
                  disabled={locked || pending || i === posts.length - 1}
                  onClick={() => run(() => movePostAction(p.id, 1))}
                  aria-label={`Turunkan ${p.title}`}
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button className="btn-icon h-8 w-8" onClick={() => setDialog({ open: true, post: p })} aria-label={`Edit ${p.title}`}>
                  <Pencil className="h-4 w-4" />
                </button>
                <ConfirmButton
                  className="btn-icon h-8 w-8 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                  title="Hapus mading?"
                  message={
                    <>
                      Mading <b>{p.title}</b> akan dihapus beserta gambarnya.
                    </>
                  }
                  action={() => deletePostAction(p.id)}
                  ariaLabel={`Hapus ${p.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-white p-4 text-center text-sm text-navy-400 ring-1 ring-navy-100">
          Belum ada mading — bagian ini tidak tampil di halaman kelas sampai diisi.
        </p>
      )}
      {dialog.open && <PostDialog productId={productId} post={dialog.post} onClose={() => setDialog({ open: false, post: null })} />}
    </div>
  );
}

/* ---------------- Galeri ---------------- */

function CaptionInput({ g }: { g: GalleryRow }) {
  const [v, setV] = useState(g.caption ?? "");
  const { run, pending } = useRun();
  const locked = useReadOnly();
  const dirty = v.trim() !== (g.caption ?? "");
  return (
    <div className="flex gap-1">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && dirty) {
            e.preventDefault();
            run(() => updateGalleryCaptionAction(g.id, v));
          }
        }}
        maxLength={160}
        placeholder="Keterangan (opsional)"
        className="input h-8 min-w-0 flex-1 px-2.5 py-1 text-xs"
        aria-label="Keterangan gambar"
        disabled={locked}
      />
      {dirty && (
        <button type="button" className="btn-primary btn-sm h-8 px-2" disabled={pending} onClick={() => run(() => updateGalleryCaptionAction(g.id, v))} aria-label="Simpan keterangan">
          <Save className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function GalleryCard({ productId, images }: { productId: number; images: GalleryRow[] }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(uploadGalleryAction, { resetOnSuccess: true, onSuccess: () => setPicked(0) });
  const [picked, setPicked] = useState(0);
  const { run, pending: busy } = useRun();
  const locked = useReadOnly();
  return (
    <div className="rounded-3xl bg-navy-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-navy-800">
          <ImageIcon className="h-4 w-4 text-brand-600" /> Galeri <span className="font-medium text-navy-400">({images.length})</span>
        </p>
        <form {...formProps} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="productId" value={productId} />
          <label className="btn-secondary btn-sm cursor-pointer">
            <ImagePlus className="h-3.5 w-3.5" /> {picked ? `${picked} gambar dipilih` : "Pilih gambar"}
            <input type="file" name="files" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setPicked(e.target.files?.length ?? 0)} />
          </label>
          {picked > 0 && (
            <SubmitButton pending={pending} className="btn-primary btn-sm" pendingText="Mengunggah...">
              <Upload className="h-3.5 w-3.5" /> Unggah
            </SubmitButton>
          )}
        </form>
      </div>
      {fe?.files && <p className="mb-2 text-xs font-medium text-rose-600">{fe.files.join(" · ")}</p>}
      <p className="mb-3 text-xs text-navy-400">Maks 10 gambar sekali unggah (masing-masing ≤ 5 MB, total ≤ 35 MB), hingga 60 gambar per kelas.</p>
      {images.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((g, i) => (
            <li key={g.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-navy-100">
              <div className="relative aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.url} alt={g.caption ?? ""} className="h-full w-full object-cover" loading="lazy" />
                <div className="absolute right-1.5 top-1.5 flex gap-1">
                  <button
                    className="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-navy-600 shadow disabled:opacity-40"
                    disabled={locked || busy || i === 0}
                    onClick={() => run(() => moveGalleryAction(g.id, -1))}
                    aria-label="Geser ke depan"
                  >
                    <ArrowUp className="h-3.5 w-3.5 -rotate-90" />
                  </button>
                  <button
                    className="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-navy-600 shadow disabled:opacity-40"
                    disabled={locked || busy || i === images.length - 1}
                    onClick={() => run(() => moveGalleryAction(g.id, 1))}
                    aria-label="Geser ke belakang"
                  >
                    <ArrowDown className="h-3.5 w-3.5 -rotate-90" />
                  </button>
                  <ConfirmButton
                    className="grid h-7 w-7 place-items-center rounded-lg bg-white/90 text-rose-600 shadow"
                    title="Hapus gambar?"
                    message="Gambar ini akan dihapus dari galeri."
                    action={() => deleteGalleryAction(g.id)}
                    ariaLabel="Hapus gambar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </ConfirmButton>
                </div>
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-navy-900/70 px-1.5 text-[10px] font-bold text-white">{i + 1}</span>
              </div>
              <div className="p-1.5">
                <CaptionInput g={g} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-white p-4 text-center text-sm text-navy-400 ring-1 ring-navy-100">
          Belum ada foto — bagian galeri tidak tampil di halaman kelas sampai diisi.
        </p>
      )}
    </div>
  );
}

/* ---------------- Panel gabungan ---------------- */

export function ShowcasePanel({
  productId,
  slug,
  imageUrl,
  posts,
  gallery,
}: {
  productId: number;
  slug: string;
  imageUrl: string | null;
  posts: PostRow[];
  gallery: GalleryRow[];
}) {
  const filled = [imageUrl ? "flyer" : null, posts.length ? "mading" : null, gallery.length ? "galeri" : null].filter(Boolean);
  return (
    <section id="tampilan" className="card scroll-mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-navy-900">
          <LayoutTemplate className="h-5 w-5 text-brand-600" /> Tampilan halaman kelas
        </h2>
        <span className={cn("text-xs font-semibold", filled.length ? "text-emerald-600" : "text-navy-400")}>
          {filled.length ? `Aktif: ${filled.join(", ")}` : "Semua opsional — kosong = tidak ditampilkan"}
        </span>
      </div>
      <FlyerCard productId={productId} slug={slug} imageUrl={imageUrl} />
      <PostsCard productId={productId} posts={posts} />
      <GalleryCard productId={productId} images={gallery} />
    </section>
  );
}

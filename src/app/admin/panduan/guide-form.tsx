"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Film, ImagePlus, ListOrdered, Monitor, Network, Plus, Save, Smartphone, Trash2, Upload, Video } from "lucide-react";
import { saveGuideAction } from "@/app/actions/guides";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { Field } from "@/components/ui";
import { videoInfo } from "@/lib/video";
import { cn } from "@/lib/utils";

export type GuideValues = {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  coverUrl: string | null;
  videoUrl: string | null;
  videoFileUrl?: string | null;
  videoFileMobileUrl?: string | null;
  infographicUrl?: string | null;
  content: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  steps: { id: number; title: string; body: string; imageUrl: string | null }[];
};

type StepState = { key: string; title: string; body: string; imageUrl: string | null; preview: string | null; removeImage: boolean };

let seq = 0;
const newKey = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Pemilih file media (video MP4 / gambar) dengan pratinjau & hapus — dipakai video laptop, video HP, infografis */
function MediaPicker({
  name,
  removeName,
  label,
  hint,
  current,
  kind,
  icon: Icon,
}: {
  name: string;
  removeName: string;
  label: string;
  hint: string;
  current: string | null | undefined;
  kind: "video" | "image";
  icon: typeof Film;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const shown = preview ?? (removed ? null : current);
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-bold text-navy-700">
        <Icon className="h-3.5 w-3.5 text-brand-600" /> {label}
      </p>
      {removed && <input type="hidden" name={removeName} value="1" />}
      {shown &&
        (kind === "video" ? (
          <video src={shown} controls preload="metadata" playsInline className="aspect-video w-full rounded-2xl bg-navy-950" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="max-h-60 w-full rounded-2xl bg-navy-50 object-contain ring-1 ring-navy-100" />
        ))}
      <label className="flex cursor-pointer items-center gap-2 rounded-2xl border-2 border-dashed border-brand-200 bg-navy-50/60 px-3 py-2.5 text-xs text-navy-500 transition hover:border-brand-400">
        <Upload className="h-4 w-4 shrink-0 text-brand-500" />
        <span className="font-semibold text-navy-700">{preview ? "File baru dipilih — klik Simpan" : shown ? "Ganti file" : "Pilih file"}</span>
        <span className="ml-auto text-[11px] text-navy-400">{hint}</span>
        <input
          type="file"
          name={name}
          accept={kind === "video" ? "video/mp4" : "image/jpeg,image/png,image/webp"}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? URL.createObjectURL(f) : null);
            if (f) setRemoved(false);
          }}
        />
      </label>
      {current && !preview && !removed && (
        <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => setRemoved(true)}>
          Hapus file
        </button>
      )}
    </div>
  );
}

export const GUIDE_CATEGORIES = ["Memulai", "Akun", "Pendaftaran & Pembayaran", "Belajar di Kelas", "Games", "Lainnya"];

export function GuideForm({ guide, categories }: { guide: GuideValues | null; categories: string[] }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveGuideAction);
  const g = guide;
  const [steps, setSteps] = useState<StepState[]>(() =>
    (g?.steps ?? []).map((s) => ({ key: `e${s.id}`, title: s.title, body: s.body, imageUrl: s.imageUrl, preview: null, removeImage: false })),
  );
  const [video, setVideo] = useState(g?.videoUrl ?? "");
  const [cover, setCover] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const vi = useMemo(() => videoInfo(video), [video]);
  const shownCover = cover ?? (removeCover ? null : g?.coverUrl);

  const update = (key: string, patch: Partial<StepState>) => setSteps((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((list) => {
      const n = [...list];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  const payload = JSON.stringify(steps.map((s) => ({ key: s.key, title: s.title, body: s.body, imageUrl: s.imageUrl, removeImage: s.removeImage })));
  const cats = [...new Set([...GUIDE_CATEGORIES, ...categories])];

  return (
    <form {...formProps} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {g && <input type="hidden" name="id" value={g.id} />}
      <input type="hidden" name="steps" value={payload} />
      {removeCover && <input type="hidden" name="removeCover" value="1" />}

      <div className="space-y-6">
        <section className="card space-y-4">
          <Field label="Judul panduan *" htmlFor="title" errors={fe?.title}>
            <input id="title" name="title" defaultValue={g?.title} maxLength={160} className="input" placeholder="mis. Cara mendaftar kelas & membayar" />
          </Field>
          <Field label="Ringkasan" htmlFor="summary" hint="1–2 kalimat, tampil di kartu daftar panduan.">
            <input id="summary" name="summary" defaultValue={g?.summary ?? ""} maxLength={255} className="input" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kategori" htmlFor="category">
              <input id="category" name="category" defaultValue={g?.category ?? "Memulai"} maxLength={60} className="input" list="guide-cats" />
              <datalist id="guide-cats">
                {cats.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Slug URL" htmlFor="slug" hint="Kosongkan agar dibuat otomatis dari judul.">
              <input id="slug" name="slug" defaultValue={g?.slug ?? ""} maxLength={150} className="input" placeholder="cara-daftar-kelas" />
            </Field>
          </div>
          <Field
            label="Pengantar / catatan"
            htmlFor="content"
            hint={
              <>
                Opsional. Baris kosong = paragraf, <code>## Judul</code>, <code>- poin</code>, <code>**tebal**</code>.
              </>
            }
          >
            <textarea id="content" name="content" rows={5} defaultValue={g?.content ?? ""} className="input" />
          </Field>
        </section>

        <section className="card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-bold text-navy-900">
              <ListOrdered className="h-5 w-5 text-brand-600" /> Langkah-langkah <span className="text-sm font-medium text-navy-400">({steps.length})</span>
            </h2>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setSteps((l) => [...l, { key: newKey(), title: "", body: "", imageUrl: null, preview: null, removeImage: false }])}
            >
              <Plus className="h-3.5 w-3.5" /> Tambah langkah
            </button>
          </div>
          {fe?.steps && <p className="mb-3 rounded-2xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{fe.steps[0]}</p>}
          {steps.length ? (
            <ol className="space-y-4">
              {steps.map((s, i) => {
                const img = s.preview ?? (s.removeImage ? null : s.imageUrl);
                return (
                  <li key={s.key} className="rounded-3xl bg-navy-50/60 p-4 ring-1 ring-navy-100">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-600 text-sm font-extrabold text-white">{i + 1}</span>
                      <input
                        value={s.title}
                        onChange={(e) => update(s.key, { title: e.target.value })}
                        maxLength={160}
                        placeholder="Judul langkah, mis. Buka halaman Daftar"
                        className="input h-10 flex-1 font-semibold"
                        aria-label={`Judul langkah ${i + 1}`}
                      />
                      <button type="button" className="btn-icon h-9 w-9" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Naikkan langkah">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button type="button" className="btn-icon h-9 w-9" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Turunkan langkah">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="btn-icon h-9 w-9 text-rose-500 hover:bg-rose-50"
                        onClick={() => setSteps((l) => l.filter((x) => x.key !== s.key))}
                        aria-label="Hapus langkah"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                      <textarea
                        value={s.body}
                        onChange={(e) => update(s.key, { body: e.target.value })}
                        rows={6}
                        placeholder="Jelaskan apa yang harus dilakukan peserta pada langkah ini…"
                        className="input text-sm"
                        aria-label={`Penjelasan langkah ${i + 1}`}
                      />
                      <div>
                        <label className="relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-brand-200 bg-white text-center text-xs text-navy-400 transition hover:border-brand-400">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
                          ) : (
                            <span className="flex flex-col items-center gap-1 p-2">
                              <ImagePlus className="h-6 w-6 text-brand-500" /> Gambar / screenshot (opsional)
                            </span>
                          )}
                          <input
                            type="file"
                            name={`stepImage_${s.key}`}
                            accept="image/jpeg,image/png,image/webp"
                            className="sr-only"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              update(s.key, { preview: f ? URL.createObjectURL(f) : null, removeImage: false });
                            }}
                          />
                        </label>
                        {img && (
                          <button
                            type="button"
                            className="mt-1 text-xs font-semibold text-rose-600 hover:underline"
                            onClick={(e) => {
                              const input = (e.currentTarget.previousElementSibling as HTMLElement).querySelector("input") as HTMLInputElement;
                              input.value = "";
                              update(s.key, { preview: null, removeImage: true });
                            }}
                          >
                            Hapus gambar
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="rounded-2xl bg-navy-50/60 p-5 text-center text-sm text-navy-400">Belum ada langkah. Klik “Tambah langkah” untuk membuat tutorial bertahap dengan gambar.</p>
          )}
          {steps.length > 0 && (
            <button
              type="button"
              className="btn-ghost btn-sm mt-3"
              onClick={() => setSteps((l) => [...l, { key: newKey(), title: "", body: "", imageUrl: null, preview: null, removeImage: false }])}
            >
              <Plus className="h-3.5 w-3.5" /> Tambah langkah
            </button>
          )}
        </section>
      </div>

      <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start">
        <section className="card space-y-4">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-navy-50/60 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold text-navy-800">Tayangkan</span>
              <span className="text-xs text-navy-400">Matikan untuk menyimpan sebagai draft.</span>
            </span>
            <input type="checkbox" name="isPublished" defaultChecked={g?.isPublished ?? true} className="h-5 w-5 accent-brand-600" />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-navy-50/60 px-4 py-3">
            <span>
              <span className="block text-sm font-semibold text-navy-800">Panduan unggulan</span>
              <span className="text-xs text-navy-400">Ditampilkan besar di paling atas.</span>
            </span>
            <input type="checkbox" name="isFeatured" defaultChecked={g?.isFeatured ?? false} className="h-5 w-5 accent-brand-600" />
          </label>
          <SubmitButton pending={pending} className="btn-primary w-full" pendingText="Menyimpan...">
            <Save className="h-4 w-4" /> {g ? "Simpan panduan" : "Buat panduan"}
          </SubmitButton>
          {g && (
            <a href={`/panduan/${g.slug}`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm w-full">
              Lihat halaman <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <Link href="/admin/panduan" className="btn-ghost btn-sm w-full">
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke daftar
          </Link>
        </section>

        <section className="card space-y-4">
          <p className="flex items-center gap-2 text-sm font-bold text-navy-800">
            <Film className="h-4 w-4 text-brand-600" /> Video simulasi (unggah MP4)
          </p>
          {fe?.media && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{fe.media[0]}</p>}
          <MediaPicker name="videoFile" removeName="removeVideoFile" label="Versi laptop / komputer" hint="MP4 ≤ 30 MB" current={g?.videoFileUrl} kind="video" icon={Monitor} />
          <MediaPicker name="videoFileMobile" removeName="removeVideoFileMobile" label="Versi HP" hint="MP4 ≤ 30 MB" current={g?.videoFileMobileUrl} kind="video" icon={Smartphone} />
          <p className="text-[11px] text-navy-400">Unggah satu per satu bila ukuran total &gt; 30 MB. Peserta bisa memilih tab Laptop / HP.</p>
        </section>

        <section className="card space-y-3">
          <p className="flex items-center gap-2 text-sm font-bold text-navy-800">
            <Network className="h-4 w-4 text-brand-600" /> Infografis / flowchart
          </p>
          <MediaPicker name="infographic" removeName="removeInfographic" label="Gambar ringkasan alur" hint="JPG/PNG ≤ 5 MB" current={g?.infographicUrl} kind="image" icon={ImagePlus} />
        </section>

        <section className="card space-y-3">
          <p className="flex items-center gap-2 text-sm font-bold text-navy-800">
            <Video className="h-4 w-4 text-brand-600" /> Video dari YouTube / Drive (opsional)
          </p>
          <Field label="Link YouTube / Google Drive" htmlFor="videoUrl" errors={fe?.videoUrl}>
            <input id="videoUrl" name="videoUrl" value={video} onChange={(e) => setVideo(e.target.value)} className="input" placeholder="https://youtu.be/…" />
          </Field>
          {video && !vi && <p className="text-xs text-amber-700">Link belum dikenali sebagai video YouTube / Google Drive.</p>}
          {vi && (
            <div className="overflow-hidden rounded-2xl bg-navy-900 ring-1 ring-navy-100">
              <iframe src={vi.embed} title="Pratinjau video" className="aspect-video w-full" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
            </div>
          )}
          {vi?.kind === "drive" && <p className="text-xs text-navy-400">Pastikan file Drive dibagikan “Siapa saja yang memiliki link”.</p>}
        </section>

        <section className="card space-y-3">
          <p className="text-sm font-bold text-navy-800">Gambar sampul</p>
          <label className="relative flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-brand-200 bg-navy-50/60 text-center text-xs text-navy-400 transition hover:border-brand-400">
            {shownCover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownCover} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : vi ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vi.thumb} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
            ) : (
              <span className="flex flex-col items-center gap-1 p-3">
                <Upload className="h-6 w-6 text-brand-500" /> Opsional · JPG/PNG/WebP ≤ 5 MB
              </span>
            )}
            <input
              type="file"
              name="cover"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                setCover(f ? URL.createObjectURL(f) : null);
                if (f) setRemoveCover(false);
              }}
            />
          </label>
          <p className={cn("text-xs text-navy-400", shownCover && "hidden")}>Tanpa sampul, kartu memakai thumbnail video atau gambar langkah pertama.</p>
          {g?.coverUrl && !cover && !removeCover && (
            <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => setRemoveCover(true)}>
              Hapus sampul
            </button>
          )}
        </section>
      </aside>
    </form>
  );
}

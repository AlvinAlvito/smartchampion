"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Download, Eye, FileDown, FileUp, ImagePlus, LoaderCircle, Palette, Save, TriangleAlert, Upload } from "lucide-react";
import { importWorksheetDocxAction, saveWorksheetPdfDesignAction, type WorksheetImportState } from "@/app/actions/worksheet-import";
import { DEFAULT_WORKSHEET_PDF, MARGIN_RANGE, type WorksheetPdfConfig } from "@/lib/worksheet-pdf-config";
import { LETTERS } from "@/lib/worksheet-shared";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/modal";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { Badge, Field } from "@/components/ui";
import { useToast } from "@/components/toast";
import { RichText } from "@/components/rich-text";

/* ======================= Impor soal dari Word ======================= */

function ImportDialog({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const [state, formAction, pending] = useActionState<WorksheetImportState | undefined, FormData>(importWorksheetDocxAction, undefined);
  const [replace, setReplace] = useState(false);
  // File disimpan di state: form action React me-reset input file setelah submit
  const [file, setFile] = useState<File | null>(null);
  const [previewedFile, setPreviewedFile] = useState<File | null>(null);
  const toast = useToast();
  const router = useRouter();
  const preview = file && previewedFile === file ? state?.preview : undefined;

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    if (state?.ok) {
      toast.success(state.ok);
      router.refresh();
      onClose();
    }
  }, [state, toast, router, onClose]);

  const submit = (mode: "preview" | "commit") => {
    if (!file) return;
    const fd = new FormData();
    fd.set("sessionId", String(sessionId));
    fd.set("mode", mode);
    fd.set("replace", replace ? "1" : "0");
    fd.set("file", file);
    if (mode === "preview") setPreviewedFile(file);
    startTransition(() => formAction(fd));
  };

  return (
    <Modal
      open
      onClose={onClose}
      icon={FileUp}
      size="xl"
      title="Impor soal dari Word"
      description="Isi template Word, unggah di sini, periksa pratinjaunya, lalu simpan."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          {preview && preview.validCount > 0 ? (
            <button type="button" className="btn-primary" disabled={pending} onClick={() => submit("commit")}>
              {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {replace ? "Ganti dengan" : "Impor"}{" "}
              {preview.validCount} soal
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={pending || !file} onClick={() => submit("preview")}>
              {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Baca &amp; pratinjau
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="File Word (.docx)" htmlFor="ws-docx" hint="Maks. 10 MB. Gambar PNG/JPG, tabel, dan rumus Insert › Equation ikut terbaca.">
            <input
              id="ws-docx"
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="input file:mr-3 file:rounded-xl file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-700"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <a href={`/api/admin/worksheet-template?session=${sessionId}`} className="btn-secondary">
            <Download className="h-4 w-4" /> Unduh template
          </a>
        </div>
      </div>

      {preview && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-navy-50/70 p-3 text-sm">
            <Badge tone="brand">{preview.questions.length} soal terbaca</Badge>
            <Badge tone="green">{preview.validCount} siap diimpor</Badge>
            {preview.questions.some((q) => q.valid && q.issues.length) && (
              <Badge tone="yellow">{preview.questions.filter((q) => q.valid && q.issues.length).length} perlu dicek</Badge>
            )}
            {preview.questions.some((q) => !q.valid) && <Badge tone="red">{preview.questions.filter((q) => !q.valid).length} tidak valid (dilewati)</Badge>}
          </div>
          {preview.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {w}
            </p>
          ))}
          {preview.existing > 0 && (
            <fieldset className="grid gap-2 sm:grid-cols-2">
              {[
                { v: false, t: `Tambahkan setelah ${preview.existing} soal yang ada`, d: "Soal lama tetap." },
                {
                  v: true,
                  t: "Ganti semua soal lama",
                  d: preview.hasAttempts ? "Tidak bisa: sudah ada peserta yang mengerjakan." : "Soal lama & gambarnya dihapus.",
                },
              ].map((o) => (
                <label
                  key={String(o.v)}
                  className={cn(
                    "cursor-pointer rounded-2xl p-3 text-sm ring-1 transition",
                    replace === o.v ? "bg-brand-50 ring-brand-400" : "ring-navy-100",
                    o.v && preview.hasAttempts && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input type="radio" className="sr-only" checked={replace === o.v} disabled={o.v && preview.hasAttempts} onChange={() => setReplace(o.v)} />
                  <b className="text-navy-900">{o.t}</b>
                  <span className="block text-xs text-navy-400">{o.d}</span>
                </label>
              ))}
            </fieldset>
          )}
          <ol className="space-y-3">
            {preview.questions.map((q, i) => (
              <li
                key={i}
                className={cn(
                  "rounded-2xl p-4 ring-1",
                  !q.valid ? "bg-rose-50/50 ring-rose-200" : q.issues.length ? "bg-amber-50/40 ring-amber-200" : "ring-navy-100",
                )}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">Soal {q.no}</span>
                  <span className="text-xs text-navy-400">{q.points} poin</span>
                  {!q.valid && <Badge tone="red">tidak valid</Badge>}
                  {q.issues.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                      <CircleAlert className="h-3 w-3" /> {s}
                    </span>
                  ))}
                </div>
                <RichText text={q.text} allowData className="text-sm text-navy-900" imgClassName="max-h-48" />
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {q.options.map((o, oi) => (
                    <div
                      key={oi}
                      className={cn(
                        "flex gap-2 rounded-xl px-2.5 py-1.5 text-sm",
                        oi === q.answerIndex && q.valid
                          ? "bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-200"
                          : "bg-navy-50/60 text-navy-700",
                      )}
                    >
                      <b>{LETTERS[oi]}.</b>
                      <RichText text={o} allowData className="min-w-0 flex-1" imgClassName="max-h-24" />
                    </div>
                  ))}
                </div>
                {q.explanation && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-xs font-semibold text-brand-700">Lihat pembahasan</summary>
                    <RichText text={q.explanation} allowData className="mt-1 text-navy-700" imgClassName="max-h-40" />
                  </details>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Modal>
  );
}

export function ImportWordButton({ sessionId }: { sessionId: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
        <FileUp className="h-3.5 w-3.5" /> Impor Word
      </button>
      {open && <ImportDialog sessionId={sessionId} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ======================= PDF Soal & Pembahasan ======================= */

function DesignDialog({ productId, config, bgUrl, onClose }: { productId: number; config: WorksheetPdfConfig; bgUrl: string | null; onClose: () => void }) {
  const { formProps, pending, fieldErrors } = useFormAction(saveWorksheetPdfDesignAction, { onSuccess: onClose });
  const [c, setC] = useState(config);
  const [bgPreview, setBgPreview] = useState<string | null>(bgUrl);
  const [removeBg, setRemoveBg] = useState(false);
  const shown = removeBg ? null : bgPreview;
  // pratinjau mini A4 (210 × 297 mm)
  const pct = (mm: number, of: number) => `${(mm / of) * 100}%`;
  const margins: [keyof WorksheetPdfConfig, string][] = [
    ["marginTop", "Atas"],
    ["marginBottom", "Bawah"],
    ["marginLeft", "Kiri"],
    ["marginRight", "Kanan"],
  ];
  return (
    <Modal
      open
      onClose={onClose}
      icon={Palette}
      size="lg"
      title="Desain PDF Soal & Pembahasan"
      description="Berlaku untuk semua pertemuan di kelas ini — untuk unduhan admin maupun peserta."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="ws-pdf-design" pending={pending}>
            <Save className="h-4 w-4" /> Simpan desain
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="ws-pdf-design" className="grid gap-5 sm:grid-cols-[180px_1fr]">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="removeBackground" value={removeBg ? "1" : "0"} />
        <input type="hidden" name="paper" value={c.paper ? "1" : "0"} />
        {/* pratinjau mini */}
        <div>
          <div
            className={cn("relative aspect-[210/297] w-full overflow-hidden rounded-xl shadow-lg ring-1 ring-navy-100", !shown && "bg-hero")}
            style={shown ? { backgroundImage: `url(${shown})`, backgroundSize: "100% 100%" } : undefined}
          >
            {!shown && <div className="absolute inset-0 bg-grid-hero opacity-90 [background-size:8px_8px,8px_8px,32px_32px,32px_32px]" />}
            <div
              className={cn("absolute rounded-md transition-all", c.paper ? "bg-white shadow" : "ring-1 ring-dashed ring-sun-400")}
              style={{ top: pct(c.marginTop, 297), bottom: pct(c.marginBottom, 297), left: pct(c.marginLeft, 210), right: pct(c.marginRight, 210) }}
            >
              <div className="space-y-1 p-2">
                <div className="h-1.5 w-1/2 rounded bg-brand-600/70" />
                <div className="h-1 w-3/4 rounded bg-navy-200" />
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-1 rounded bg-navy-100" style={{ width: `${60 + ((i * 13) % 35)}%` }} />
                ))}
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-navy-400">{shown ? "Latar unggahan" : "Latar bawaan: biru berjaring"}</p>
        </div>

        <div className="space-y-4">
          <Field
            label="Gambar latar (opsional)"
            htmlFor="background"
            errors={fieldErrors?.background}
            hint="JPG/PNG maks 5 MB, A4 potret (mis. 2480×3508 px). Kosong = latar bawaan biru berjaring."
          >
            <input
              id="background"
              name="background"
              type="file"
              accept="image/png,image/jpeg"
              className="input file:mr-3 file:rounded-xl file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-700"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setBgPreview(URL.createObjectURL(f));
                  setRemoveBg(false);
                }
              }}
            />
          </Field>
          {bgPreview && !removeBg && (
            <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={() => setRemoveBg(true)}>
              <ImagePlus className="h-3.5 w-3.5" /> Hapus latar, pakai bawaan
            </button>
          )}
          <div className="grid grid-cols-2 gap-3">
            {margins.map(([k, label]) => (
              <Field key={k} label={`Margin ${label} (mm)`} htmlFor={k}>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={MARGIN_RANGE.min}
                    max={MARGIN_RANGE.max}
                    value={c[k] as number}
                    onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })}
                    className="min-w-0 flex-1 accent-brand-600"
                    aria-label={`Margin ${label}`}
                  />
                  <input
                    id={k}
                    name={k}
                    type="number"
                    min={MARGIN_RANGE.min}
                    max={MARGIN_RANGE.max}
                    value={c[k] as number}
                    onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })}
                    className="input w-16 px-2!"
                  />
                </div>
              </Field>
            ))}
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="checkbox" checked={c.paper} onChange={(e) => setC({ ...c, paper: e.target.checked })} className="mt-0.5 h-4 w-4 accent-brand-600" />
            <span>
              <b className="text-navy-900">Kertas putih di atas latar</b>
              <span className="block text-xs text-navy-400">
                Disarankan aktif agar soal tetap terbaca. Matikan bila gambar latar Anda sudah punya area putih untuk isi.
              </span>
            </span>
          </label>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setC(DEFAULT_WORKSHEET_PDF)}>
            Kembalikan margin bawaan
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function WorksheetPdfCard({
  sessionId,
  productId,
  questionCount,
  config,
  bgUrl,
}: {
  sessionId: number;
  productId: number;
  questionCount: number;
  config: WorksheetPdfConfig;
  bgUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-bold text-navy-900">
          <FileDown className="h-5 w-5 text-brand-600" /> PDF Soal &amp; Pembahasan
        </p>
        <p className="text-xs text-navy-400">
          Pegangan peserta: soal, kunci, &amp; pembahasan worksheet ini. Peserta bisa mengunduhnya setelah mengumpulkan (atau setelah batas waktu). Latar:{" "}
          {bgUrl ? "gambar unggahan" : "bawaan biru berjaring"}.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
          <Palette className="h-3.5 w-3.5" /> Atur desain
        </button>
        <a
          href={`/api/worksheet-pdf/${sessionId}`}
          target="_blank"
          rel="noreferrer"
          className={cn("btn-secondary btn-sm", !questionCount && "pointer-events-none opacity-50")}
        >
          <Eye className="h-3.5 w-3.5" /> Pratinjau
        </a>
        <a href={`/api/worksheet-pdf/${sessionId}?dl=1`} className={cn("btn-primary btn-sm", !questionCount && "pointer-events-none opacity-50")}>
          <Download className="h-3.5 w-3.5" /> Unduh PDF
        </a>
      </div>
      {open && <DesignDialog productId={productId} config={config} bgUrl={bgUrl} onClose={() => setOpen(false)} />}
    </section>
  );
}

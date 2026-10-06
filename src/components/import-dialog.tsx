"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, CircleX, Copy, FileSpreadsheet, FileUp, RotateCcw, Upload } from "lucide-react";
import type { ImportState } from "@/lib/import-types";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/form-buttons";
import { cn } from "@/lib/utils";

const STATUS_META = {
  error: { label: "Error", icon: CircleX, cls: "bg-rose-50 text-rose-700 ring-rose-100" },
  warning: { label: "Peringatan", icon: CircleAlert, cls: "bg-amber-50 text-amber-800 ring-amber-100" },
  duplicate: { label: "Duplikat", icon: Copy, cls: "bg-sky-50 text-sky-700 ring-sky-100" },
  ok: { label: "OK", icon: CircleCheck, cls: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
} as const;

export type ImportConfig<S> = {
  action: (prev: ImportState<S> | undefined, form: FormData) => Promise<ImportState<S>>;
  templateHref: string;
  /** kata benda untuk tombol & pesan, mis. "lead" / "data blast" */
  noun: string;
  /** judul kotak jumlah duplikat, mis. "Duplikat WA" */
  duplicateLabel: string;
  /** penjelasan opsi lewati duplikat */
  skipLabel: React.ReactNode;
  sampleColumns: { label: string; render: (row: S) => React.ReactNode; className?: string }[];
};

function ImportDialog<S>({ onClose, config }: { onClose: () => void; config: ImportConfig<S> }) {
  const [state, dispatch, pending] = useActionState<ImportState<S> | undefined, FormData>(config.action, undefined);
  const [file, setFile] = useState<File | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();
  const [mode, setMode] = useState<"preview" | "commit">("preview");
  const modeRef = useRef<"preview" | "commit">("preview"); // dibaca di effect (hindari toast ganda)

  const run = (next: "preview" | "commit", f = file, skip = skipDuplicates) => {
    if (!f) return;
    setMode(next);
    modeRef.current = next;
    const fd = new FormData();
    fd.set("file", f);
    fd.set("mode", next);
    fd.set("skipDuplicates", skip ? "1" : "0");
    startTransition(() => dispatch(fd));
  };

  useEffect(() => {
    if (!state) return;
    if (state.error) toast.error(state.error);
    else if (state.ok && modeRef.current === "commit") {
      toast.success(state.ok);
      router.refresh();
      onClose();
    }
  }, [state, toast, router, onClose]);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) {
      toast.error("Format file harus .xlsx (Excel).");
      return;
    }
    setFile(f);
    run("preview", f);
  };

  // hanya tampilkan hasil untuk file yang sedang dipilih
  const summary = state?.summary && state.summary.fileName === file?.name ? state.summary : undefined;

  return (
    <Modal
      open
      onClose={pending ? () => {} : onClose}
      size="lg"
      icon={FileUp}
      title={`Import ${config.noun} dari Excel`}
      description="Gunakan file template. Data dicek dulu sebelum disimpan."
      footer={
        <>
          <a href={config.templateHref} className="btn-ghost mr-auto">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Download template
          </a>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Batal
          </button>
          <button type="button" className="btn-primary" disabled={!summary || summary.ready === 0 || pending} onClick={() => run("commit")}>
            {pending && mode === "commit" ? <Spinner /> : <Upload className="h-4 w-4" />}
            {pending && mode === "commit" ? "Mengimpor..." : `Import ${summary?.ready.toLocaleString("id-ID") ?? ""} ${config.noun}`}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Area pilih file */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed p-6 text-center transition",
            dragging ? "border-brand-500 bg-brand-50" : "border-navy-100 hover:border-brand-300 hover:bg-brand-50/40",
          )}
        >
          <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-linear-to-br from-emerald-400 to-emerald-600 text-white shadow-md">
            <FileSpreadsheet className="h-6 w-6" />
          </span>
          {file ? (
            <>
              <p className="font-bold text-navy-900">{file.name}</p>
              <p className="text-xs text-navy-400">{(file.size / 1024).toFixed(0)} KB · klik untuk mengganti file</p>
            </>
          ) : (
            <>
              <p className="font-bold text-navy-900">Klik atau seret file .xlsx ke sini</p>
              <p className="text-xs text-navy-400">Maks 5.000 baris · 10 MB. Belum punya format? Download template di bawah.</p>
            </>
          )}
        </div>

        {pending && mode === "preview" && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm font-semibold text-navy-500">
            <Spinner className="h-5 w-5 text-brand-600" /> Memeriksa isi file…
          </div>
        )}

        {summary && !pending && (
          <div className="animate-fade-in space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { l: "Baris terbaca", v: summary.total, c: "text-navy-900" },
                { l: "Siap diimpor", v: summary.ready, c: "text-emerald-600" },
                { l: config.duplicateLabel, v: summary.duplicates, c: "text-sky-600" },
                { l: "Error", v: summary.errors, c: "text-rose-600" },
              ].map((x) => (
                <div key={x.l} className="rounded-2xl bg-navy-50/60 p-3 text-center">
                  <p className={cn("text-2xl font-extrabold", x.c)}>{x.v.toLocaleString("id-ID")}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">{x.l}</p>
                </div>
              ))}
            </div>

            {summary.duplicates > 0 && (
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-100">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(e) => {
                    setSkipDuplicates(e.target.checked);
                    run("preview", file, e.target.checked);
                  }}
                  className="mt-0.5 h-4 w-4 accent-brand-600"
                />
                <span>{config.skipLabel}</span>
              </label>
            )}

            {summary.sample.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-400">Contoh data yang akan masuk</p>
                <div className="overflow-x-auto rounded-2xl ring-1 ring-navy-100">
                  <table className="table min-w-[520px]">
                    <thead>
                      <tr>
                        <th>Baris</th>
                        {config.sampleColumns.map((c) => (
                          <th key={c.label}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.sample.map((r) => (
                        <tr key={r.row}>
                          <td className="text-xs text-navy-400">{r.row}</td>
                          {config.sampleColumns.map((c) => (
                            <td key={c.label} className={c.className ?? "text-xs"}>
                              {c.render(r) ?? <span className="text-navy-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {summary.issues.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-400">
                  Perlu diperhatikan ({summary.issues.length}
                  {summary.issues.length === 200 ? "+" : ""})
                </p>
                <ul className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
                  {summary.issues.map((it) => {
                    const m = STATUS_META[it.status];
                    return (
                      <li key={it.row} className={cn("rounded-2xl px-3 py-2 text-xs ring-1", m.cls)}>
                        <p className="flex items-center gap-1.5 font-bold">
                          <m.icon className="h-3.5 w-3.5" /> Baris {it.row} · {it.nama} <span className="font-medium opacity-70">({m.label})</span>
                        </p>
                        <ul className="mt-0.5 list-disc pl-5">
                          {it.messages.map((msg, i) => (
                            <li key={i}>{msg}</li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
                {summary.errors > 0 && <p className="mt-2 text-xs text-navy-400">Baris error tidak ikut diimpor. Perbaiki di Excel lalu unggah ulang bila perlu.</p>}
              </div>
            )}

            {summary.ready === 0 && (
              <p className="flex items-center gap-2 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">
                <RotateCcw className="h-4 w-4" /> Tidak ada baris yang bisa diimpor dari file ini.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function ImportButton<S>({ config }: { config: ImportConfig<S> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary">
        <FileUp className="h-4 w-4 text-brand-600" /> Import
      </button>
      {open && <ImportDialog config={config} onClose={() => setOpen(false)} />}
    </>
  );
}

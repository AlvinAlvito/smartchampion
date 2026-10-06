"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Lightbulb, RefreshCw, Save, Sparkles, Wand2 } from "lucide-react";
import type { GeneratedQuestion } from "@/lib/ai-questions";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/form-buttons";
import { Field } from "@/components/ui";
import { MathText } from "@/components/math-text";

const DIFF = [
  { v: "mudah", l: "Mudah" },
  { v: "sedang", l: "Sedang" },
  { v: "sulit", l: "Sulit" },
  { v: "campuran", l: "Campuran" },
];
const LETTERS = "ABCDE";
const MAX = 25;

export type AiGenerateOptions = { count: number; optionCount: number; difficulty: string; instructions: string };

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-sm font-semibold transition",
        active ? "bg-linear-to-r from-brand-600 to-navy-700 text-white shadow-md shadow-brand-500/25" : "bg-navy-50 text-navy-600 hover:bg-brand-50 hover:text-brand-700",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Dialog generate soal pilihan ganda dengan AI (dipakai Games & Worksheet pertemuan).
 * Hasil hanya pratinjau (rumus LaTeX dirender) sampai admin memilih & menyimpan.
 */
export function AiQuestionsDialog({
  contextTitle,
  context,
  intro,
  defaultPoints,
  pointsStep = 10,
  generate,
  save,
  onClose,
}: {
  contextTitle: string;
  context: [string, React.ReactNode][];
  intro: string;
  defaultPoints: number;
  pointsStep?: number;
  generate: (o: AiGenerateOptions) => Promise<ActionResult & { questions?: GeneratedQuestion[] }>;
  save: (chosen: GeneratedQuestion[], points: number) => Promise<ActionResult>;
  onClose: () => void;
}) {
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState("campuran");
  const [optionCount, setOptionCount] = useState(4);
  const [points, setPoints] = useState(defaultPoints);
  const [instructions, setInstructions] = useState("");
  const [result, setResult] = useState<GeneratedQuestion[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [generating, startGen] = useTransition();
  const [saving, startSave] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const busy = generating || saving;

  const run = () =>
    startGen(async () => {
      const r = await generate({ count, optionCount, difficulty, instructions });
      if (r.error || !r.questions) {
        toast.error(r.error ?? "Gagal membuat soal.");
        return;
      }
      toast.success(r.ok ?? "Soal siap ditinjau.");
      setResult(r.questions);
      setPicked(new Set(r.questions.map((_, i) => i)));
    });

  const store = () =>
    startSave(async () => {
      if (!result) return;
      const r = await save(
        result.filter((_, i) => picked.has(i)),
        points,
      );
      if (toast.fromResult(r)) {
        router.refresh();
        onClose();
      }
    });

  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      size="xl"
      icon={Sparkles}
      title={result ? "Tinjau soal dari AI" : "Generate soal dengan AI"}
      description={result ? "Soal belum disimpan. Hapus centang pada soal yang tidak ingin dipakai." : intro}
      footer={
        result ? (
          <>
            <button type="button" className="btn-ghost mr-auto" onClick={() => setResult(null)} disabled={busy}>
              <ArrowLeft className="h-4 w-4" /> Ubah pengaturan
            </button>
            <button type="button" className="btn-secondary" onClick={run} disabled={busy}>
              {generating ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />} Generate ulang
            </button>
            <button type="button" className="btn-primary" onClick={store} disabled={busy || picked.size === 0}>
              {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} Simpan {picked.size} soal
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              Batal
            </button>
            <button type="button" className="btn-primary" onClick={run} disabled={busy}>
              {generating ? <Spinner className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />} {generating ? "AI sedang menyusun soal…" : `Generate ${count} soal`}
            </button>
          </>
        )
      }
    >
      {generating && (
        <div className="mb-5 flex animate-fade-in items-center gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-brand-800 ring-1 ring-brand-100">
          <span className="grid h-10 w-10 shrink-0 animate-pulse place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-sky-400 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <p>
            <b>AI sedang menyusun & memeriksa {count} soal…</b>
            <span className="block text-xs text-brand-600">Biasanya 5–30 detik, tergantung jumlah soal.</span>
          </p>
        </div>
      )}

      {!result ? (
        <div className="space-y-5">
          <div className="rounded-2xl bg-navy-50/60 p-4 text-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-400">{contextTitle}</p>
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[130px_1fr]">
              {context.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-navy-400">{k}</dt>
                  <dd className="font-semibold text-navy-800">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <Field label={`Jumlah soal (maks ${MAX})`} htmlFor="ai-count">
            <div className="flex flex-wrap items-center gap-2">
              {[5, 10, 15, 20].map((n) => (
                <Chip key={n} active={count === n} onClick={() => setCount(n)}>
                  {n}
                </Chip>
              ))}
              <input
                id="ai-count"
                type="number"
                min={1}
                max={MAX}
                value={count}
                onChange={(e) => setCount(Math.min(MAX, Math.max(1, Number(e.target.value) || 1)))}
                className="input w-24 py-1.5!"
              />
            </div>
          </Field>

          <Field label="Tingkat kesulitan">
            <div className="flex flex-wrap gap-2">
              {DIFF.map((d) => (
                <Chip key={d.v} active={difficulty === d.v} onClick={() => setDifficulty(d.v)}>
                  {d.l}
                </Chip>
              ))}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Jumlah opsi jawaban" htmlFor="ai-options">
              <select id="ai-options" value={optionCount} onChange={(e) => setOptionCount(Number(e.target.value))} className="input">
                <option value={3}>3 opsi (A–C)</option>
                <option value={4}>4 opsi (A–D)</option>
                <option value={5}>5 opsi (A–E)</option>
              </select>
            </Field>
            <Field label="Poin per soal" htmlFor="ai-points">
              <input
                id="ai-points"
                type="number"
                min={1}
                max={1000}
                step={pointsStep}
                value={points}
                onChange={(e) => setPoints(Number(e.target.value) || defaultPoints)}
                className="input"
              />
            </Field>
          </div>

          <Field label="Instruksi tambahan (opsional)" htmlFor="ai-instructions" hint="Mis. fokus topik tertentu, gaya soal, atau hal yang harus dihindari. Rumus otomatis ditulis dengan LaTeX.">
            <textarea
              id="ai-instructions"
              rows={4}
              maxLength={1000}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="input"
              placeholder={"Contoh: fokus pada limit & turunan, sertakan soal cerita, hindari angka desimal panjang."}
            />
          </Field>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <p className="text-navy-500">
              <b className="text-navy-900">{picked.size}</b> dari {result.length} soal dipilih · {points} poin/soal
            </p>
            <button
              type="button"
              className="font-semibold text-brand-700 hover:underline"
              onClick={() => setPicked(picked.size === result.length ? new Set() : new Set(result.map((_, i) => i)))}
            >
              {picked.size === result.length ? "Kosongkan pilihan" : "Pilih semua"}
            </button>
          </div>
          <ol className="space-y-3">
            {result.map((q, i) => {
              const on = picked.has(i);
              return (
                <li key={i} className={cn("rounded-3xl p-4 ring-1 transition", on ? "bg-white ring-brand-200" : "bg-navy-50/40 opacity-60 ring-navy-100")}>
                  <label className="flex cursor-pointer gap-3">
                    <input type="checkbox" checked={on} onChange={() => toggle(i)} className="mt-1 h-4 w-4 shrink-0 accent-brand-600" aria-label={`Pilih soal ${i + 1}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-navy-900">
                        <span className="mr-1.5 text-brand-600">{i + 1}.</span>
                        <MathText text={q.text} />
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {q.options.map((o, oi) => (
                          <span
                            key={oi}
                            className={cn(
                              "rounded-xl px-2.5 py-1 text-sm",
                              oi === q.answerIndex ? "bg-emerald-50 font-semibold text-emerald-700 ring-1 ring-emerald-200" : "bg-navy-50 text-navy-600",
                            )}
                          >
                            {LETTERS[oi]}. <MathText text={o} /> {oi === q.answerIndex && <Check className="inline h-3.5 w-3.5" />}
                          </span>
                        ))}
                      </div>
                      {q.explanation && (
                        <p className="mt-2 flex gap-1.5 text-xs text-navy-500">
                          <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500" /> <MathText text={q.explanation} />
                        </p>
                      )}
                    </div>
                  </label>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-navy-400">Periksa kebenaran jawaban sebelum menyimpan. Soal yang tersimpan tetap bisa diedit atau dihapus satu per satu.</p>
        </div>
      )}
    </Modal>
  );
}

export function AiButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="btn-sm inline-flex items-center gap-1.5 rounded-2xl bg-linear-to-r from-brand-500 to-brand-700 px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-brand-500/25 transition hover:brightness-110"
    >
      <Sparkles className="h-3.5 w-3.5" /> Generate soal AI
    </button>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Send } from "lucide-react";
import { submitWorksheetAction } from "@/app/actions/meetings";
import { cn } from "@/lib/utils";
import { LETTERS } from "@/lib/worksheet-shared";
import { Modal } from "@/components/modal";
import { Spinner } from "@/components/form-buttons";
import { useToast } from "@/components/toast";
import { RichText } from "@/components/rich-text";

export type PlayQuestion = { id: number; text: string; imageUrl: string | null; options: string[]; points: number };

const STYLES = [
  "from-brand-500 to-brand-700",
  "from-sky-500 to-navy-700",
  "from-brand-400 to-navy-800",
  "from-emerald-500 to-teal-700",
  "from-amber-500 to-orange-600",
];

/**
 * Pengerjaan worksheet: satu soal per layar (seperti games) tanpa batas waktu per soal.
 * Jawaban disimpan sementara di browser agar tidak hilang saat halaman dimuat ulang; dinilai di server saat dikumpulkan.
 */
export function WorksheetPlayer({ sessionId, questions, userId }: { sessionId: number; questions: PlayQuestion[]; userId: number }) {
  const key = `ws:${userId}:${sessionId}`;
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [index, setIndex] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const q = questions[index];
  const answered = questions.filter((x) => answers[x.id] != null).length;

  // pulihkan jawaban tersimpan (bila halaman sempat tertutup)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && typeof saved === "object") setAnswers(saved);
    } catch {}
  }, [key]);
  const pick = (choice: number) => {
    const next = { ...answers, [q.id]: choice };
    setAnswers(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };

  const submit = () =>
    start(async () => {
      const r = await submitWorksheetAction(
        sessionId,
        questions.map((x) => ({ questionId: x.id, choice: answers[x.id] ?? -1 })),
      );
      if (r.error) {
        toast.error(r.error);
        setConfirm(false);
        return;
      }
      try {
        localStorage.removeItem(key);
      } catch {}
      toast.success(r.ok ?? "Worksheet terkumpul.");
      router.refresh();
    });

  return (
    <div className="space-y-5">
      {/* navigasi nomor soal */}
      <div className="card flex flex-wrap items-center gap-1.5 p-3!">
        {questions.map((x, i) => (
          <button
            key={x.id}
            onClick={() => setIndex(i)}
            aria-label={`Soal ${i + 1}${answers[x.id] != null ? " (terjawab)" : ""}`}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-xl text-sm font-bold transition",
              i === index
                ? "bg-linear-to-br from-brand-600 to-navy-700 text-white shadow-md"
                : answers[x.id] != null
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-navy-50 text-navy-500 hover:bg-brand-50",
            )}
          >
            {i + 1}
          </button>
        ))}
        <span className="ml-auto text-sm text-navy-500">
          <b className="text-navy-900">{answered}</b>/{questions.length} terjawab
        </span>
      </div>

      <div key={q.id} className="card animate-fade-up space-y-4">
        <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
          Soal {index + 1} dari {questions.length} · {q.points} poin
        </p>
        <RichText text={q.text} className="text-lg font-bold leading-relaxed text-navy-900" />
        {q.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={q.imageUrl} alt={`Gambar soal ${index + 1}`} className="max-h-80 max-w-full rounded-2xl ring-1 ring-navy-100" />
        )}
        <div className="grid gap-2.5">
          {q.options.map((o, i) => {
            const on = answers[q.id] === i;
            return (
              <button
                key={i}
                data-option={i}
                aria-pressed={on}
                onClick={() => pick(i)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-left font-semibold transition",
                  on
                    ? `bg-linear-to-br ${STYLES[i % STYLES.length]} text-white shadow-lg ring-4 ring-brand-200`
                    : "bg-navy-50/70 text-navy-800 ring-1 ring-navy-100 hover:bg-brand-50 hover:ring-brand-200",
                )}
              >
                <span
                  className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-extrabold", on ? "bg-white/25" : "bg-white text-navy-500")}
                >
                  {on ? <Check className="h-4 w-4" /> : LETTERS[i]}
                </span>
                <RichText text={o} className="min-w-0" imgClassName="max-h-32" />
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <button className="btn-ghost" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            <ArrowLeft className="h-4 w-4" /> Sebelumnya
          </button>
          {index < questions.length - 1 ? (
            <button className="btn-primary" onClick={() => setIndex((i) => i + 1)}>
              Berikutnya <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button className="btn-primary" onClick={() => setConfirm(true)}>
              <Send className="h-4 w-4" /> Kumpulkan
            </button>
          )}
        </div>
      </div>

      {answered === questions.length && index < questions.length - 1 && (
        <button className="btn-primary w-full py-3" onClick={() => setConfirm(true)}>
          <Send className="h-4 w-4" /> Semua soal terjawab — kumpulkan sekarang
        </button>
      )}

      <Modal
        open={confirm}
        onClose={pending ? () => {} : () => setConfirm(false)}
        size="sm"
        icon={Send}
        title="Kumpulkan worksheet?"
        description={answered < questions.length ? `Masih ada ${questions.length - answered} soal kosong (dinilai salah).` : "Semua soal sudah terjawab."}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirm(false)} disabled={pending}>
              Periksa lagi
            </button>
            <button className="btn-primary" onClick={submit} disabled={pending}>
              {pending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />} Ya, kumpulkan
            </button>
          </>
        }
      >
        <p className="text-sm text-navy-600">Worksheet hanya bisa dikumpulkan sekali. Nilai & pembahasan langsung tampil setelah dikumpulkan.</p>
      </Modal>
    </div>
  );
}

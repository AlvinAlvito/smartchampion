"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleHelp, Lightbulb, Pencil, Plus, Rocket, RotateCcw, Save, Trash2, Undo2 } from "lucide-react";
import { deleteGameAction, deleteQuestionAction, resetScoresAction, saveQuestionAction, togglePublishGameAction } from "@/app/actions/games-admin";
import { cn } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Spinner, SubmitButton, useFormAction } from "@/components/form-buttons";
import { EmptyState, Field } from "@/components/ui";
import { AiExplainButton, AiGenerateButton, type AiGameContext } from "./ai-generate";
import { MathInput } from "@/components/math-input";
import { MathText } from "@/components/math-text";

export type QuestionRow = { id: number; text: string; options: string[]; answerIndex: number; explanation: string | null; points: number };
const LETTERS = ["A", "B", "C", "D", "E"];

function QuestionDialog({ gameId, question, onClose, number }: { gameId: number; question: QuestionRow | null; onClose: () => void; number: number }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveQuestionAction, { onSuccess: onClose });
  const [answer, setAnswer] = useState(question?.answerIndex ?? 0);
  const q = question;
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={CircleHelp}
      title={q ? `Edit soal #${number}` : `Soal baru #${number}`}
      description="Isi minimal 2 opsi. Klik huruf untuk menandai jawaban benar."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="question-form" pending={pending}>
            <Save className="h-4 w-4" /> Simpan soal
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="question-form" className="space-y-4">
        <input type="hidden" name="gameId" value={gameId} />
        {q && <input type="hidden" name="id" value={q.id} />}
        <input type="hidden" name="answerIndex" value={answer} />
        <Field label="Pertanyaan *" htmlFor="text" errors={fe?.text}>
          <MathInput id="text" name="text" rows={3} defaultValue={q?.text} placeholder="Tulis pertanyaan… rumus di antara $...$, mis. $\frac{1}{2}x^{2}$" />
        </Field>
        <div className="space-y-2">
          <span className="label">Opsi jawaban</span>
          {LETTERS.map((l, i) => (
            <div key={l} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAnswer(i)}
                title="Tandai sebagai jawaban benar"
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-extrabold transition",
                  answer === i
                    ? "animate-pop bg-linear-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-200"
                    : "bg-navy-50 text-navy-400 hover:bg-brand-50 hover:text-brand-600",
                )}
              >
                {answer === i ? <Check className="h-4 w-4" /> : l}
              </button>
              <div className="min-w-0 flex-1">
                <MathInput
                  single
                  name={`option${i}`}
                  defaultValue={q?.options[i] ?? ""}
                  placeholder={i < 2 ? `Opsi ${l} (wajib)` : `Opsi ${l} (opsional)`}
                  className={cn(answer === i && "border-emerald-300 bg-emerald-50/40")}
                />
              </div>
            </div>
          ))}
          {(fe?.answerIndex || fe?.option1) && <p className="text-xs font-medium text-rose-600">{fe?.answerIndex?.[0] ?? fe?.option1?.[0]}</p>}
        </div>
        <Field
          label="Pembahasan"
          htmlFor="explanation"
          errors={fe?.explanation}
          hint="Tampil ke pemain tepat setelah menjawab (benar maupun salah). Jelaskan mengapa jawaban benar & kesalahan yang sering terjadi."
        >
          <MathInput
            id="explanation"
            name="explanation"
            rows={3}
            defaultValue={q?.explanation ?? ""}
            placeholder="mis. Gaya diukur dalam newton ($N$), sedangkan joule adalah satuan energi…"
          />
        </Field>
        <Field label="Poin" htmlFor="points" hint="Poin penuh jika dijawab instan; minimal 50% bila benar di detik terakhir.">
          <input id="points" name="points" type="number" min={10} step={10} defaultValue={q?.points ?? 100} className="input max-w-[140px]" />
        </Field>
      </form>
    </Modal>
  );
}

export function QuestionsPanel({ gameId, questions, ai }: { gameId: number; questions: QuestionRow[]; ai: AiGameContext }) {
  const [dialog, setDialog] = useState<{ open: boolean; q: QuestionRow | null; n: number }>({ open: false, q: null, n: 1 });
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold text-navy-900">
          <CircleHelp className="h-5 w-5 text-brand-600" /> Soal <span className="text-sm font-medium text-navy-400">({questions.length})</span>
        </h2>
        <div className="flex flex-wrap justify-end gap-2">
          {questions.some((q) => !q.explanation) && <AiExplainButton gameId={gameId} missing={questions.filter((q) => !q.explanation).length} />}
          <AiGenerateButton game={ai} />
          <button className="btn-primary btn-sm" onClick={() => setDialog({ open: true, q: null, n: questions.length + 1 })}>
            <Plus className="h-3.5 w-3.5" /> Tambah soal
          </button>
        </div>
      </div>
      {questions.length ? (
        <ol className="stagger space-y-3">
          {questions.map((q, i) => (
            <li key={q.id} className="card group flex gap-4 p-4!">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-navy-700 text-sm font-extrabold text-white">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <MathText as="p" text={q.text} className="font-semibold text-navy-900" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {q.options.map((o, oi) => (
                    <span
                      key={oi}
                      className={cn(
                        "rounded-lg px-2 py-1 text-xs font-medium",
                        oi === q.answerIndex ? "bg-emerald-50 font-bold text-emerald-700 ring-1 ring-emerald-200" : "bg-navy-50 text-navy-500",
                      )}
                    >
                      {LETTERS[oi]}. <MathText text={o} /> {oi === q.answerIndex && "✓"}
                    </span>
                  ))}
                </div>
                {q.explanation ? (
                  <p className="mt-2 flex gap-1.5 rounded-xl bg-sun-50/70 px-2.5 py-1.5 text-xs leading-relaxed text-navy-600 ring-1 ring-sun-100">
                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <MathText text={q.explanation} />
                  </p>
                ) : (
                  <p className="mt-2 text-xs italic text-navy-300">Belum ada pembahasan</p>
                )}
                <p className="mt-1.5 text-xs text-navy-400">{q.points} poin</p>
              </div>
              <div className="flex flex-col gap-1">
                <button className="btn-icon h-8 w-8" onClick={() => setDialog({ open: true, q, n: i + 1 })} aria-label={`Edit soal ${i + 1}`}>
                  <Pencil className="h-4 w-4" />
                </button>
                <ConfirmButton
                  className="btn-icon h-8 w-8 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                  title="Hapus soal?"
                  message={<>Soal #{i + 1} akan dihapus dari game ini.</>}
                  action={() => deleteQuestionAction(q.id)}
                  ariaLabel={`Hapus soal ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon={CircleHelp} title="Belum ada soal" desc="Tambahkan soal manual, atau klik Generate soal AI untuk membuat banyak soal sekaligus." />
      )}
      {dialog.open && <QuestionDialog gameId={gameId} question={dialog.q} number={dialog.n} onClose={() => setDialog({ open: false, q: null, n: 1 })} />}
    </section>
  );
}

export function PublishButton({ id, published }: { id: number; published: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (toast.fromResult(await togglePublishGameAction(id))) router.refresh();
        })
      }
      className={published ? "btn-outline-light" : "btn-light"}
    >
      {pending ? <Spinner /> : published ? <Undo2 className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
      {published ? "Tarik dari publik" : "Rilis game"}
    </button>
  );
}

export function GameDangerButtons({ id, title, hasScores }: { id: number; title: string; hasScores: boolean }) {
  return (
    <>
      {hasScores && (
        <ConfirmButton
          className="btn-outline-light"
          title="Reset leaderboard?"
          message={
            <>
              Semua skor game <b>{title}</b> akan dihapus.
            </>
          }
          confirmText="Ya, reset"
          action={() => resetScoresAction(id)}
        >
          <RotateCcw className="h-4 w-4" /> Reset skor
        </ConfirmButton>
      )}
      <ConfirmButton
        className="btn-outline-light hover:bg-rose-500/20!"
        title="Hapus game?"
        message={
          <>
            Game <b>{title}</b> beserta soal dan seluruh skornya akan dihapus permanen.
          </>
        }
        action={() => deleteGameAction(id)}
      >
        <Trash2 className="h-4 w-4" /> Hapus
      </ConfirmButton>
    </>
  );
}

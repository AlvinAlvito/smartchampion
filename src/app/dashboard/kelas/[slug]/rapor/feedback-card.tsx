"use client";

import { useState } from "react";
import { Heart, Lock, MessageSquareHeart, Pencil, Send } from "lucide-react";
import { submitFeedbackAction } from "@/app/actions/feedback";
import { RATING_LABEL, TEXT_MAX, type FeedbackQuestionDTO } from "@/lib/feedback-shared";
import { cn } from "@/lib/utils";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { StarDisplay, StarInput } from "@/components/star-rating";

/** Jawaban tersimpan peserta (per pertanyaan; questionId null = pertanyaan sudah dihapus admin) */
export type MyAnswer = { questionId: number | null; questionText: string; type: string; rating: number | null; text: string | null };

function ChoiceInput({ q, defaultValue, error }: { q: FeedbackQuestionDTO; defaultValue?: string; error?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  return (
    <fieldset className={cn("rounded-2xl border bg-white p-3 sm:p-4", error && !value ? "border-rose-300" : "border-navy-100")}>
      <legend className="sr-only">{q.text}</legend>
      <p className="text-sm font-bold text-navy-900">
        {q.text}
        {q.required && <span className="text-rose-500"> *</span>}
      </p>
      {q.description && <p className="text-xs text-navy-400">{q.description}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {q.options.map((o) => (
          <label
            key={o}
            className={cn(
              "cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition",
              value === o ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-navy-600 ring-navy-200 hover:ring-brand-300",
            )}
          >
            <input type="radio" name={`q_${q.id}`} value={o} checked={value === o} onChange={() => setValue(o)} className="sr-only" />
            {o}
          </label>
        ))}
      </div>
      {error && !value && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </fieldset>
  );
}

export function FeedbackCard({
  productId,
  open,
  reason,
  questions,
  answers,
}: {
  productId: number;
  open: boolean;
  reason?: string;
  questions: FeedbackQuestionDTO[];
  answers: MyAnswer[] | null;
}) {
  const [editing, setEditing] = useState(!answers);
  const { formProps, pending, fieldErrors } = useFormAction(submitFeedbackAction, { onSuccess: () => setEditing(false) });
  const mine = new Map((answers ?? []).filter((a) => a.questionId).map((a) => [a.questionId!, a]));

  return (
    <section id="feedback" className="card scroll-mt-24 space-y-4 bg-linear-to-br from-rose-50/60 via-white to-amber-50/60">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-bold text-navy-900">
            <MessageSquareHeart className="h-5 w-5 text-rose-500" /> Feedback pelatihan
          </p>
          <p className="text-sm text-navy-500">Bantu kami jadi lebih baik — ceritakan pengalamanmu dengan tutor, admin, modul/materi, dan kelas ini.</p>
        </div>
        {answers && !editing && open && questions.length > 0 && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Ubah feedback
          </button>
        )}
      </div>

      {!open ? (
        <p className="flex items-center gap-2 rounded-2xl bg-navy-50 p-3 text-sm text-navy-500">
          <Lock className="h-4 w-4 shrink-0" /> {reason}
        </p>
      ) : answers && !editing ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <Heart className="h-4 w-4 fill-rose-500 text-rose-500" /> Terima kasih, feedback-mu sudah kami terima.
          </p>
          <div className="space-y-2">
            {answers.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-3 ring-1 ring-navy-100">
                <span className="min-w-0 text-sm font-semibold text-navy-700">{a.questionText}</span>
                {a.type === "RATING" && a.rating ? (
                  <span className="flex items-center gap-1.5">
                    <StarDisplay value={a.rating} />
                    <span className="hidden text-xs text-navy-400 sm:inline">{RATING_LABEL[a.rating]}</span>
                  </span>
                ) : a.type === "CHOICE" ? (
                  <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">{a.text}</span>
                ) : (
                  <p className="w-full whitespace-pre-line text-sm italic text-navy-600">“{a.text}”</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : !questions.length ? (
        <p className="rounded-2xl bg-navy-50 p-3 text-sm text-navy-500">Belum ada pertanyaan feedback. Silakan cek lagi nanti.</p>
      ) : (
        <form {...formProps} className="space-y-3">
          <input type="hidden" name="productId" value={productId} />
          {questions.map((q) => {
            const err = fieldErrors?.[`q_${q.id}`]?.[0];
            const prev = mine.get(q.id);
            if (q.type === "RATING")
              return (
                <StarInput
                  key={q.id}
                  name={`q_${q.id}`}
                  label={q.text}
                  hint={q.description}
                  required={q.required}
                  defaultValue={prev?.rating ?? 0}
                  error={err}
                />
              );
            if (q.type === "CHOICE") return <ChoiceInput key={q.id} q={q} defaultValue={prev?.text ?? undefined} error={err} />;
            return (
              <div key={q.id}>
                <label className="label" htmlFor={`q_${q.id}`}>
                  {q.text}
                  {q.required ? <span className="text-rose-500"> *</span> : <span className="font-normal text-navy-400"> (opsional)</span>}
                </label>
                <textarea
                  id={`q_${q.id}`}
                  name={`q_${q.id}`}
                  rows={3}
                  maxLength={TEXT_MAX}
                  defaultValue={prev?.text ?? ""}
                  className={cn("input", err && "border-rose-300")}
                  placeholder={q.description ?? ""}
                />
                {err && <p className="mt-1 text-xs font-medium text-rose-600">{err}</p>}
              </div>
            );
          })}
          <div className="flex flex-wrap justify-end gap-2">
            {answers && (
              <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
                Batal
              </button>
            )}
            <SubmitButton pending={pending}>
              <Send className="h-4 w-4" /> {answers ? "Simpan perubahan" : "Kirim feedback"}
            </SubmitButton>
          </div>
        </form>
      )}
    </section>
  );
}

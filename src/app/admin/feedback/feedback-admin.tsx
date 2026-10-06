"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Eye, EyeOff, ListChecks, MessageSquareHeart, Pencil, Plus, Save, Trash2 } from "lucide-react";
import {
  deleteFeedbackAction,
  deleteFeedbackQuestionAction,
  moveFeedbackQuestionAction,
  saveFeedbackQuestionAction,
  setFeedbackQuestionActiveAction,
} from "@/app/actions/feedback";
import {
  CATEGORY_LABEL,
  CATEGORY_TONE,
  FEEDBACK_ASPECTS,
  OPTIONS_MAX,
  RATING_LABEL,
  TYPE_LABEL,
  type FeedbackAspectValues,
  type FeedbackCategoryKey,
  type FeedbackQuestionDTO,
  type FeedbackTypeKey,
} from "@/lib/feedback-shared";
import { cn, formatDate } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { SubmitButton, Spinner, useFormAction } from "@/components/form-buttons";
import { Badge, EmptyState, Field } from "@/components/ui";
import { useToast } from "@/components/toast";
import { StarDisplay } from "@/components/star-rating";

/* ======================= Hasil feedback ======================= */

type Answer = {
  questionId: number | null;
  questionText: string;
  category: FeedbackCategoryKey;
  type: FeedbackTypeKey;
  rating: number | null;
  text: string | null;
};
export type AdminFeedbackRow = FeedbackAspectValues & {
  id: number;
  productName: string;
  name: string;
  school: string;
  score: number | null;
  updatedAt: Date;
  answers: Answer[];
};

function DetailDialog({ row, onClose }: { row: AdminFeedbackRow; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      icon={MessageSquareHeart}
      size="lg"
      title={`Feedback ${row.name}`}
      description={`${row.productName} · ${formatDate(row.updatedAt, true)}`}
      footer={
        <button type="button" className="btn-secondary" onClick={onClose}>
          Tutup
        </button>
      }
    >
      <div className="space-y-2">
        {row.answers.map((a, i) => (
          <div key={i} className="rounded-2xl bg-navy-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm font-semibold text-navy-800">{a.questionText}</p>
              <Badge tone={CATEGORY_TONE[a.category]}>{CATEGORY_LABEL[a.category]}</Badge>
            </div>
            <div className="mt-1.5 text-sm">
              {a.type === "RATING" && a.rating ? (
                <span className="flex items-center gap-2">
                  <StarDisplay value={a.rating} /> <b className="text-navy-800">{a.rating}</b>{" "}
                  <span className="text-xs text-navy-400">{RATING_LABEL[a.rating]}</span>
                </span>
              ) : (
                <p className="whitespace-pre-line text-navy-700">{a.text}</p>
              )}
            </div>
          </div>
        ))}
        {!row.answers.length && <p className="text-sm text-navy-400">Tidak ada jawaban.</p>}
      </div>
    </Modal>
  );
}

export function FeedbackTable({ rows, scope, reportPending }: { rows: AdminFeedbackRow[]; scope: string | null; reportPending: boolean }) {
  const [detail, setDetail] = useState<AdminFeedbackRow | null>(null);
  return (
    <section className="card p-0!">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-50 p-4">
        <p className="text-sm text-navy-500">
          <b className="text-navy-900">{rows.length}</b> feedback · {scope ?? "semua kelas"}
          {reportPending && <span className="ml-2 text-xs text-amber-600">(rapor kelas ini belum terbit — peserta belum bisa mengisi)</span>}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="table min-w-225">
          <thead>
            <tr>
              <th>Peserta</th>
              {FEEDBACK_ASPECTS.map((a) => (
                <th key={a.key}>{a.short}</th>
              ))}
              <th className="text-right">Rata-rata</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <p className="font-semibold text-navy-900">{r.name}</p>
                  <p className="text-xs text-navy-400">{scope ? r.school : r.productName}</p>
                  <p className="text-xs text-navy-400">{formatDate(r.updatedAt, true)}</p>
                </td>
                {FEEDBACK_ASPECTS.map((a) => (
                  <td key={a.key} className="whitespace-nowrap">
                    {r[a.key] != null ? (
                      <>
                        <StarDisplay value={r[a.key]} size="h-3.5 w-3.5" />
                        <span className="ml-1 text-xs font-bold text-navy-700">{r[a.key]}</span>
                      </>
                    ) : (
                      <span className="text-xs text-navy-300">-</span>
                    )}
                  </td>
                ))}
                <td className="text-right text-lg font-extrabold text-navy-900">{r.score ?? "-"}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button className="btn-icon h-8 w-8" onClick={() => setDetail(r)} aria-label={`Detail feedback ${r.name}`} title="Lihat semua jawaban">
                      <Eye className="h-4 w-4" />
                    </button>
                    <ConfirmButton
                      className="btn-icon h-8 w-8 text-rose-500 hover:bg-rose-50"
                      title="Hapus feedback?"
                      message={
                        <>
                          Feedback <b>{r.name}</b> untuk {r.productName} akan dihapus. Peserta bisa mengisinya lagi.
                        </>
                      }
                      confirmText="Ya, hapus"
                      action={() => deleteFeedbackAction(r.id)}
                      ariaLabel={`Hapus feedback ${r.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-navy-400">
                  Belum ada feedback. Peserta bisa mengisi setelah semua pertemuan selesai & rapor diterbitkan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {detail && <DetailDialog row={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}

/* ======================= Bank pertanyaan ======================= */

type AdminQuestion = FeedbackQuestionDTO & { isActive: boolean; order: number; answerCount: number };

function QuestionDialog({ q, onClose }: { q: AdminQuestion | null; onClose: () => void }) {
  const { formProps, pending, fieldErrors } = useFormAction(saveFeedbackQuestionAction, { onSuccess: onClose });
  const [type, setType] = useState<FeedbackTypeKey>(q?.type ?? "RATING");
  return (
    <Modal
      open
      onClose={onClose}
      icon={ListChecks}
      title={q ? "Ubah pertanyaan" : "Tambah pertanyaan"}
      description="Pertanyaan aktif tampil di form feedback semua kelas."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="question-form" pending={pending}>
            <Save className="h-4 w-4" /> Simpan
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="question-form" className="space-y-4">
        {q && <input type="hidden" name="id" value={q.id} />}
        <Field label="Pertanyaan" htmlFor="text" errors={fieldErrors?.text}>
          <input
            id="text"
            name="text"
            defaultValue={q?.text ?? ""}
            maxLength={300}
            className="input"
            placeholder="mis. Seberapa puas kamu dengan cara tutor mengajar?"
          />
        </Field>
        <Field label="Keterangan (opsional)" htmlFor="description" hint="Teks kecil di bawah pertanyaan / petunjuk isian.">
          <input id="description" name="description" defaultValue={q?.description ?? ""} maxLength={300} className="input" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Aspek penilaian"
            htmlFor="category"
            errors={fieldErrors?.category}
            hint="Rating di aspek Tutor/Admin/Materi/Keseluruhan dihitung ke rata-rata aspek itu."
          >
            <select id="category" name="category" defaultValue={q?.category ?? "TUTOR"} className="input">
              {(Object.keys(CATEGORY_LABEL) as FeedbackCategoryKey[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jenis jawaban" htmlFor="type" errors={fieldErrors?.type}>
            <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as FeedbackTypeKey)} className="input">
              {(Object.keys(TYPE_LABEL) as FeedbackTypeKey[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {type === "CHOICE" && (
          <Field label="Pilihan jawaban" htmlFor="options" errors={fieldErrors?.options} hint={`Satu pilihan per baris, 2–${OPTIONS_MAX} pilihan.`}>
            <textarea
              id="options"
              name="options"
              rows={4}
              defaultValue={q?.options.join("\n") ?? ""}
              className="input"
              placeholder={"Ya, pasti\nMungkin\nTidak"}
            />
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm font-semibold text-navy-700">
          <input type="checkbox" name="required" value="1" defaultChecked={q?.required ?? true} className="h-4 w-4 accent-brand-600" /> Wajib dijawab
        </label>
      </form>
    </Modal>
  );
}

export function QuestionManager({ questions }: { questions: AdminQuestion[] }) {
  const [editing, setEditing] = useState<AdminQuestion | "new" | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.error || r.ok) toast.fromResult(r);
      router.refresh();
    });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy-500">
          {questions.length} pertanyaan · urutan di bawah = urutan di form peserta {pending && <Spinner className="ml-1 inline h-3.5 w-3.5" />}
        </p>
        <button className="btn-primary" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Tambah pertanyaan
        </button>
      </div>
      {!questions.length ? (
        <EmptyState icon={ListChecks} title="Belum ada pertanyaan" desc="Tambahkan pertanyaan agar peserta bisa mengisi feedback." />
      ) : (
        <ol className="space-y-3">
          {questions.map((q, i) => (
            <li key={q.id} className={cn("card flex flex-wrap items-start gap-3 p-4!", !q.isActive && "opacity-60")}>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-sm font-black text-brand-700">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy-900">
                  {q.text}
                  {q.required && <span className="text-rose-500"> *</span>}
                </p>
                {q.description && <p className="text-xs text-navy-400">{q.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={CATEGORY_TONE[q.category]}>{CATEGORY_LABEL[q.category]}</Badge>
                  <Badge>{TYPE_LABEL[q.type]}</Badge>
                  {!q.required && <Badge>Opsional</Badge>}
                  {!q.isActive && <Badge tone="red">Disembunyikan</Badge>}
                  <span className="text-xs text-navy-400">{q.answerCount} jawaban</span>
                </div>
                {q.type === "CHOICE" && <p className="mt-1 text-xs text-navy-500">Pilihan: {q.options.join(" · ")}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  className="btn-icon h-8 w-8"
                  disabled={pending || i === 0}
                  onClick={() => run(() => moveFeedbackQuestionAction(q.id, "up"))}
                  aria-label={`Naikkan ${q.text}`}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  className="btn-icon h-8 w-8"
                  disabled={pending || i === questions.length - 1}
                  onClick={() => run(() => moveFeedbackQuestionAction(q.id, "down"))}
                  aria-label={`Turunkan ${q.text}`}
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  className="btn-icon h-8 w-8"
                  disabled={pending}
                  onClick={() => run(() => setFeedbackQuestionActiveAction(q.id, !q.isActive))}
                  aria-label={q.isActive ? `Sembunyikan ${q.text}` : `Tampilkan ${q.text}`}
                  title={q.isActive ? "Sembunyikan dari peserta" : "Tampilkan ke peserta"}
                >
                  {q.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button className="btn-icon h-8 w-8" onClick={() => setEditing(q)} aria-label={`Ubah ${q.text}`} title="Ubah">
                  <Pencil className="h-4 w-4" />
                </button>
                <ConfirmButton
                  className="btn-icon h-8 w-8 text-rose-500 hover:bg-rose-50"
                  title="Hapus pertanyaan?"
                  message={
                    <>
                      Pertanyaan <b>{q.text}</b> akan dihapus dari form.
                      {q.answerCount > 0 && ` ${q.answerCount} jawaban yang sudah masuk tetap tersimpan di hasil feedback.`} Jika hanya ingin menyembunyikan
                      sementara, pakai tombol mata.
                    </>
                  }
                  confirmText="Ya, hapus"
                  action={() => deleteFeedbackQuestionAction(q.id)}
                  ariaLabel={`Hapus ${q.text}`}
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ol>
      )}
      {editing && <QuestionDialog q={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

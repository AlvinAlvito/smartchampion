"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCheck,
  CircleHelp,
  Eye,
  ImagePlus,
  Lightbulb,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteWorksheetQuestionAction,
  generateWorksheetQuestionsAction,
  markAllPresentAction,
  moveWorksheetQuestionAction,
  resetAttemptAction,
  saveGeneratedWorksheetQuestionsAction,
  saveWorksheetQuestionAction,
  saveWorksheetSettingsAction,
  setAttendanceAction,
} from "@/app/actions/meetings";
import { cn, formatDate, toDateTimeInput } from "@/lib/utils";
import { ATTENDANCE_LABEL, ATTENDANCE_STATUS, ATTENDANCE_TONE, GRADE_SCALE, LETTERS, gradeTone } from "@/lib/worksheet-shared";
import { ConfirmButton, Modal } from "@/components/modal";
import { SubmitButton, Spinner, useFormAction } from "@/components/form-buttons";
import { Badge, EmptyState, Field } from "@/components/ui";
import { useToast } from "@/components/toast";
import { MathInput } from "@/components/math-input";
import { AiButton, AiQuestionsDialog } from "@/components/ai-questions-dialog";
import { MeetingDialog } from "../../meetings-panel";
import { RichText } from "@/components/rich-text";
import { ImportWordButton } from "./worksheet-tools";

export type WsQuestion = {
  id: number;
  text: string;
  imageUrl: string | null;
  options: string[];
  answerIndex: number;
  points: number;
  explanation: string | null;
};
type MeetingInfo = { id: number; title: string; startAt: Date; endAt: Date; meetingUrl: string | null; recordingUrl: string | null; notes: string | null };

export function EditMeetingButton({ productId, meeting, number }: { productId: number; meeting: MeetingInfo; number: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-light" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" /> Edit pertemuan
      </button>
      {open && <MeetingDialog productId={productId} meeting={meeting} nextNumber={number} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ============================ WORKSHEET ============================ */

export function WorksheetSettings({
  sessionId,
  published,
  dueAt,
  questionCount,
}: {
  sessionId: number;
  published: boolean;
  dueAt: Date | null;
  questionCount: number;
}) {
  const { formProps, pending } = useFormAction(saveWorksheetSettingsAction);
  const [on, setOn] = useState(published);
  return (
    <form {...formProps} className="card flex flex-wrap items-end gap-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="published" value={on ? "1" : "0"} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-bold text-navy-900">
          <Settings2 className="h-4 w-4 text-brand-600" /> Pengaturan worksheet
        </p>
        <label className="mt-3 flex cursor-pointer items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => setOn((v) => !v)}
            disabled={!questionCount}
            className={cn("relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40", on ? "bg-emerald-500" : "bg-navy-200")}
          >
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
          </button>
          <span className="text-sm">
            <b className="text-navy-800">{on ? "Terbit — tampil ke peserta" : "Draf — belum tampil ke peserta"}</b>
            <span className="block text-xs text-navy-400">
              {questionCount ? "Peserta mengerjakan sekali; nilai langsung keluar." : "Tambahkan soal dulu sebelum menerbitkan."}
            </span>
          </span>
        </label>
      </div>
      <Field label="Batas pengumpulan (opsional)" htmlFor="dueAt" hint="Kosongkan bila tanpa batas." className="w-full sm:w-64">
        <input id="dueAt" name="dueAt" type="datetime-local" defaultValue={toDateTimeInput(dueAt)} className="input" />
      </Field>
      <SubmitButton pending={pending}>
        <Save className="h-4 w-4" /> Simpan
      </SubmitButton>
    </form>
  );
}

function QuestionDialog({ sessionId, question, number, onClose }: { sessionId: number; question: WsQuestion | null; number: number; onClose: () => void }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveWorksheetQuestionAction, { onSuccess: onClose });
  const [answer, setAnswer] = useState(question?.answerIndex ?? 0);
  const [removeImage, setRemoveImage] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const q = question;
  const image = preview ?? (removeImage ? null : q?.imageUrl);
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={CircleHelp}
      title={q ? `Edit soal #${number}` : `Soal baru #${number}`}
      description="Rumus ditulis dengan LaTeX di antara $...$ (klik tombol Rumus). Isi minimal 2 opsi, klik huruf untuk menandai jawaban benar."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="ws-question-form" pending={pending}>
            <Save className="h-4 w-4" /> Simpan soal
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="ws-question-form" className="space-y-4" encType="multipart/form-data">
        <input type="hidden" name="sessionId" value={sessionId} />
        {q && <input type="hidden" name="id" value={q.id} />}
        <input type="hidden" name="answerIndex" value={answer} />
        <input type="hidden" name="removeImage" value={removeImage ? "1" : "0"} />
        <Field label="Pertanyaan *" htmlFor="text" errors={fe?.text}>
          <MathInput id="text" name="text" rows={4} defaultValue={q?.text} placeholder="Tulis pertanyaan… contoh: Hitung $\lim_{x \to 0} \frac{\sin 3x}{x}$" />
        </Field>
        <Field label="Gambar soal (opsional)" htmlFor="image" errors={fe?.image} hint="JPG/PNG/WebP maks 3 MB. Hanya bisa dilihat staf & peserta kelas ini.">
          <div className="flex flex-wrap items-center gap-3">
            {image && (
              <span className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="Gambar soal" className="max-h-40 rounded-2xl ring-1 ring-navy-100" />
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    setRemoveImage(true);
                    const el = document.getElementById("image") as HTMLInputElement | null;
                    if (el) el.value = "";
                  }}
                  className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-rose-500 text-white shadow"
                  aria-label="Hapus gambar"
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            )}
            <label className="btn-secondary btn-sm cursor-pointer">
              <ImagePlus className="h-3.5 w-3.5" /> {image ? "Ganti gambar" : "Pilih gambar"}
              <input
                id="image"
                name="image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setPreview(f ? URL.createObjectURL(f) : null);
                  if (f) setRemoveImage(false);
                }}
              />
            </label>
          </div>
        </Field>
        <div className="space-y-2">
          <span className="label">Opsi jawaban</span>
          {LETTERS.map((l, i) => (
            <div key={l} className="flex items-start gap-2">
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
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <Field label="Poin" htmlFor="points">
            <input id="points" name="points" type="number" min={1} max={1000} defaultValue={q?.points ?? 10} className="input" />
          </Field>
          <Field label="Pembahasan (opsional)" htmlFor="explanation" hint="Tampil ke peserta setelah worksheet dikumpulkan.">
            <MathInput id="explanation" name="explanation" rows={2} defaultValue={q?.explanation} placeholder="Jelaskan cara menjawabnya…" />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

export function WorksheetQuestions({
  sessionId,
  questions,
  ai,
}: {
  sessionId: number;
  questions: WsQuestion[];
  ai: { className: string; meetingTitle: string; subject: string; jenjang: string; notes: string };
}) {
  const [dialog, setDialog] = useState<{ open: boolean; q: WsQuestion | null; n: number }>({ open: false, q: null, n: 1 });
  const [aiOpen, setAiOpen] = useState(false);
  const [moving, startMove] = useTransition();
  const router = useRouter();
  const total = questions.reduce((s, q) => s + q.points, 0);
  const move = (id: number, dir: -1 | 1) =>
    startMove(async () => {
      await moveWorksheetQuestionAction(id, dir);
      router.refresh();
    });

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold text-navy-900">
          <CircleHelp className="h-5 w-5 text-brand-600" /> Soal worksheet{" "}
          <span className="text-sm font-medium text-navy-400">
            ({questions.length} soal · {total} poin)
          </span>
        </h2>
        <div className="flex flex-wrap justify-end gap-2">
          <ImportWordButton sessionId={sessionId} />
          <AiButton onClick={() => setAiOpen(true)} />
          <button className="btn-primary btn-sm" onClick={() => setDialog({ open: true, q: null, n: questions.length + 1 })}>
            <Plus className="h-3.5 w-3.5" /> Tambah soal
          </button>
        </div>
      </div>
      {questions.length ? (
        <ol className="space-y-3">
          {questions.map((q, i) => (
            <li key={q.id} className="card flex gap-4 p-4!">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-navy-700 text-sm font-extrabold text-white">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <RichText text={q.text} className="font-semibold text-navy-900" imgClassName="max-h-48" />
                {q.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.imageUrl} alt={`Gambar soal ${i + 1}`} className="mt-2 max-h-48 rounded-2xl ring-1 ring-navy-100" />
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {q.options.map((o, oi) => (
                    <span
                      key={oi}
                      className={cn(
                        "rounded-lg px-2 py-1 text-xs font-medium",
                        oi === q.answerIndex ? "bg-emerald-50 font-bold text-emerald-700 ring-1 ring-emerald-200" : "bg-navy-50 text-navy-500",
                      )}
                    >
                      <span className="flex items-start gap-1">
                        {LETTERS[oi]}. <RichText text={o} imgClassName="max-h-20" /> {oi === q.answerIndex && "✓"}
                      </span>
                    </span>
                  ))}
                </div>
                {q.explanation && (
                  <div className="mt-2 flex gap-1.5 text-xs text-navy-500">
                    <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500" />{" "}
                    <RichText text={q.explanation} className="min-w-0 flex-1" imgClassName="max-h-32" />
                  </div>
                )}
                <p className="mt-1.5 text-xs text-navy-400">{q.points} poin</p>
              </div>
              <div className="flex flex-col gap-1">
                <button className="btn-icon h-8 w-8" disabled={moving || i === 0} onClick={() => move(q.id, -1)} aria-label={`Naikkan soal ${i + 1}`}>
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  className="btn-icon h-8 w-8"
                  disabled={moving || i === questions.length - 1}
                  onClick={() => move(q.id, 1)}
                  aria-label={`Turunkan soal ${i + 1}`}
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button className="btn-icon h-8 w-8" onClick={() => setDialog({ open: true, q, n: i + 1 })} aria-label={`Edit soal ${i + 1}`}>
                  <Pencil className="h-4 w-4" />
                </button>
                <ConfirmButton
                  className="btn-icon h-8 w-8 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                  title="Hapus soal?"
                  message={<>Soal #{i + 1} akan dihapus dari worksheet ini.</>}
                  action={() => deleteWorksheetQuestionAction(q.id)}
                  ariaLabel={`Hapus soal ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState icon={CircleHelp} title="Belum ada soal" desc="Tambahkan soal manual (bisa dengan rumus & gambar), atau klik Generate soal AI." />
      )}
      {dialog.open && <QuestionDialog sessionId={sessionId} question={dialog.q} number={dialog.n} onClose={() => setDialog({ open: false, q: null, n: 1 })} />}
      {aiOpen && (
        <AiQuestionsDialog
          contextTitle="Konteks pertemuan (dipakai AI)"
          intro="AI menyusun soal dari kelas, judul & catatan pertemuan. Rumus ditulis dengan LaTeX dan dicek bisa ditampilkan."
          context={[
            ["Kelas", ai.className],
            ["Pertemuan", ai.meetingTitle],
            ["Bidang · Jenjang", `${ai.subject} · ${ai.jenjang}`],
            ["Catatan", ai.notes || <i className="font-normal text-navy-400">(kosong, isi lewat Edit pertemuan agar soal lebih tepat)</i>],
          ]}
          defaultPoints={10}
          pointsStep={1}
          generate={(o) => generateWorksheetQuestionsAction({ sessionId, ...o })}
          save={(chosen, points) => saveGeneratedWorksheetQuestionsAction(sessionId, chosen, points)}
          onClose={() => setAiOpen(false)}
        />
      )}
    </section>
  );
}

/* ============================ ABSENSI ============================ */

export type AttendanceRow = {
  userId: number;
  name: string;
  school: string;
  status: string | null;
  method: string | null;
  updatedAt: Date | null;
  markedBy: string | null;
};

function AttendanceSelect({ sessionId, row }: { sessionId: number; row: AttendanceRow }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const change = (status: string) =>
    start(async () => {
      const r = await setAttendanceAction(sessionId, row.userId, status);
      if (r.error) toast.error(r.error);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ATTENDANCE_STATUS.map((s) => (
        <button
          key={s}
          disabled={pending}
          onClick={() => change(row.status === s ? "" : s)}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold transition",
            row.status === s
              ? s === "HADIR"
                ? "bg-emerald-500 text-white"
                : s === "ALPA"
                  ? "bg-rose-500 text-white"
                  : s === "IZIN"
                    ? "bg-sky-500 text-white"
                    : "bg-amber-500 text-white"
              : "bg-navy-50 text-navy-500 hover:bg-brand-50 hover:text-brand-700",
          )}
          title={row.status === s ? "Klik lagi untuk mengosongkan" : undefined}
        >
          {ATTENDANCE_LABEL[s]}
        </button>
      ))}
      {pending && <Spinner className="h-3.5 w-3.5 text-brand-600" />}
    </div>
  );
}

export function AttendancePanel({ sessionId, rows, live }: { sessionId: number; rows: AttendanceRow[]; live: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const counts = ATTENDANCE_STATUS.map((s) => [s, rows.filter((r) => r.status === s).length] as const);
  const unmarked = rows.filter((r) => !r.status).length;
  return (
    <section className="card p-0!">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-50 p-4">
        <div className="flex flex-wrap gap-1.5 text-xs">
          {counts.map(([s, n]) => (
            <Badge key={s} tone={ATTENDANCE_TONE[s]}>
              {ATTENDANCE_LABEL[s]} {n}
            </Badge>
          ))}
          <Badge>Belum diabsen {unmarked}</Badge>
          {live && <Badge tone="green">● Pertemuan berlangsung — peserta bisa absen sendiri</Badge>}
        </div>
        <button
          className="btn-secondary btn-sm"
          disabled={pending || !unmarked}
          onClick={() =>
            start(async () => {
              toast.fromResult(await markAllPresentAction(sessionId));
              router.refresh();
            })
          }
        >
          {pending ? <Spinner className="h-3.5 w-3.5" /> : <CheckCheck className="h-3.5 w-3.5" />} Tandai sisanya hadir
        </button>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="table min-w-[640px]">
            <thead>
              <tr>
                <th>Peserta</th>
                <th>Kehadiran</th>
                <th>Dicatat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId}>
                  <td>
                    <p className="font-semibold text-navy-900">{r.name}</p>
                    <p className="text-xs text-navy-400">{r.school}</p>
                  </td>
                  <td>
                    <AttendanceSelect sessionId={sessionId} row={r} />
                  </td>
                  <td className="text-xs text-navy-500">
                    {r.status ? (
                      <>
                        {r.method === "MANDIRI" ? "Absen mandiri" : `Admin${r.markedBy ? ` · ${r.markedBy}` : ""}`}
                        <br />
                        {formatDate(r.updatedAt, true)}
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-6 text-center text-sm text-navy-400">Belum ada peserta lunas di kelas ini.</p>
      )}
    </section>
  );
}

/* ============================ NILAI ============================ */

export type ScoreRow = {
  userId: number;
  name: string;
  school: string;
  attempt: {
    score: number;
    grade: string;
    correctCount: number;
    totalQuestions: number;
    submittedAt: Date;
    answers: { questionId: number; choice: number }[];
  } | null;
};

function ReviewDialog({ row, questions, onClose }: { row: ScoreRow; questions: WsQuestion[]; onClose: () => void }) {
  const chosen = new Map(row.attempt?.answers.map((a) => [a.questionId, a.choice]));
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={Eye}
      title={`Jawaban ${row.name}`}
      description={row.attempt ? `Nilai ${row.attempt.score} (${row.attempt.grade}) · ${row.attempt.correctCount}/${row.attempt.totalQuestions} benar` : ""}
    >
      <ol className="space-y-3">
        {questions.map((q, i) => {
          const c = chosen.has(q.id) ? chosen.get(q.id)! : -1;
          const ok = c === q.answerIndex;
          return (
            <li key={q.id} className={cn("rounded-2xl p-3 ring-1", ok ? "bg-emerald-50/50 ring-emerald-100" : "bg-rose-50/40 ring-rose-100")}>
              <div className="flex gap-1 text-sm font-semibold text-navy-900">
                {i + 1}. <RichText text={q.text} className="min-w-0 flex-1" imgClassName="max-h-40" />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {q.options.map((o, oi) => (
                  <span
                    key={oi}
                    className={cn(
                      "rounded-lg px-2 py-1 text-xs",
                      oi === q.answerIndex
                        ? "bg-emerald-100 font-bold text-emerald-800"
                        : oi === c
                          ? "bg-rose-100 font-bold text-rose-700"
                          : "bg-white text-navy-500",
                    )}
                  >
                    <span className="flex items-start gap-1">
                      {LETTERS[oi]}. <RichText text={o} imgClassName="max-h-16" /> {oi === c && "← dipilih"}
                    </span>
                  </span>
                ))}
                {c < 0 && <span className="rounded-lg bg-white px-2 py-1 text-xs italic text-navy-400">tidak dijawab</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}

export function ScoresPanel({ sessionId, rows, questions }: { sessionId: number; rows: ScoreRow[]; questions: WsQuestion[] }) {
  const [review, setReview] = useState<ScoreRow | null>(null);
  const done = rows.filter((r) => r.attempt);
  const avg = done.length ? Math.round(done.reduce((s, r) => s + r.attempt!.score, 0) / done.length) : null;
  return (
    <section className="card p-0!">
      <div className="flex flex-wrap items-center gap-3 border-b border-navy-50 p-4 text-sm">
        <span>
          <b className="text-navy-900">{done.length}</b>
          <span className="text-navy-500">/{rows.length} peserta sudah mengerjakan</span>
        </span>
        {avg != null && (
          <span>
            · rata-rata <b className="text-navy-900">{avg}</b>
          </span>
        )}
        <span className="ml-auto flex flex-wrap gap-1 text-[11px]">
          {GRADE_SCALE.map((g) => (
            <Badge key={g.grade} tone={g.tone}>
              {g.grade} ≥ {g.min}
            </Badge>
          ))}
        </span>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="table min-w-[640px]">
            <thead>
              <tr>
                <th>Peserta</th>
                <th className="text-right">Nilai</th>
                <th>Grade</th>
                <th>Benar</th>
                <th>Dikumpulkan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => (b.attempt?.score ?? -1) - (a.attempt?.score ?? -1))
                .map((r) => (
                  <tr key={r.userId}>
                    <td>
                      <p className="font-semibold text-navy-900">{r.name}</p>
                      <p className="text-xs text-navy-400">{r.school}</p>
                    </td>
                    <td className="text-right text-lg font-extrabold text-navy-900">{r.attempt?.score ?? "-"}</td>
                    <td>
                      {r.attempt ? <Badge tone={gradeTone(r.attempt.grade)}>{r.attempt.grade}</Badge> : <span className="text-xs text-navy-400">belum</span>}
                    </td>
                    <td className="text-sm text-navy-600">{r.attempt ? `${r.attempt.correctCount}/${r.attempt.totalQuestions}` : "-"}</td>
                    <td className="text-xs text-navy-500">{r.attempt ? formatDate(r.attempt.submittedAt, true) : "-"}</td>
                    <td>
                      {r.attempt && (
                        <div className="flex justify-end gap-1">
                          <button className="btn-icon h-8 w-8" onClick={() => setReview(r)} aria-label={`Lihat jawaban ${r.name}`} title="Lihat jawaban">
                            <Eye className="h-4 w-4" />
                          </button>
                          <ConfirmButton
                            className="btn-icon h-8 w-8 text-amber-600 hover:bg-amber-50"
                            title="Izinkan mengerjakan ulang?"
                            message={
                              <>
                                Nilai <b>{r.name}</b> ({r.attempt.score}) akan dihapus, lalu peserta bisa mengerjakan ulang worksheet ini.
                              </>
                            }
                            confirmText="Ya, reset"
                            action={() => resetAttemptAction(sessionId, r.userId)}
                            ariaLabel={`Reset nilai ${r.name}`}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </ConfirmButton>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-6 text-center text-sm text-navy-400">Belum ada peserta lunas di kelas ini.</p>
      )}
      {review && <ReviewDialog row={review} questions={questions} onClose={() => setReview(null)} />}
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PenLine, RotateCcw, Save } from "lucide-react";
import { saveMeetingScoreAction, saveTryoutScoreAction } from "@/app/actions/scores";
import { Modal } from "@/components/modal";
import { Spinner } from "@/components/form-buttons";
import { useToast } from "@/components/toast";
import { Field } from "@/components/ui";
import { cn } from "@/lib/utils";

type Target =
  | { kind: "meeting"; productId: number; sessionId: number; userId: number; meetingLabel: string; worksheetScore: number | null }
  | { kind: "tryout"; productId: number; userId: number };

/** Sel nilai yang bisa diklik untuk diisi/diubah (nilai manual pertemuan atau Try Out Mimpi.mu) */
export function ScoreCell({
  target,
  studentName,
  score,
  manual,
  note,
  missed,
  canEdit,
  emptyText = "–",
}: {
  target: Target;
  studentName: string;
  score: number | null;
  /** nilai pertemuan diisi manual (bukan dari worksheet) */
  manual?: boolean;
  note?: string | null;
  missed?: boolean;
  canEdit: boolean;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const isTryout = target.kind === "tryout";
  const hasOwn = isTryout ? score != null : !!manual;

  const submit = (val: string) =>
    start(async () => {
      setErr("");
      const r = isTryout
        ? await saveTryoutScoreAction({ productId: target.productId, userId: target.userId, score: val, note: memo })
        : await saveMeetingScoreAction({ productId: target.productId, sessionId: target.sessionId, userId: target.userId, score: val, note: memo });
      if (r.fieldErrors?.score) return setErr(r.fieldErrors.score[0]);
      if (toast.fromResult(r)) {
        setOpen(false);
        router.refresh();
      }
    });

  const label =
    score != null ? (
      <span className={cn("text-sm font-bold", missed ? "text-rose-500" : manual ? "text-violet-700" : "text-navy-800")}>
        {score}
        {manual && <PenLine className="ml-0.5 inline h-3 w-3 align-[-1px]" aria-label="nilai manual" />}
      </span>
    ) : (
      <span className="text-xs text-navy-300">{emptyText}</span>
    );

  if (!canEdit) return <span title={note ?? undefined}>{label}</span>;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValue(hasOwn && score != null ? String(score) : "");
          setMemo(note ?? "");
          setErr("");
          setOpen(true);
        }}
        className="min-w-9 rounded-lg px-1.5 py-0.5 transition hover:bg-brand-50 hover:ring-1 hover:ring-brand-200"
        title={
          isTryout
            ? "Isi / ubah nilai Try Out Mimpi.mu"
            : manual
              ? `Nilai manual${note ? ` — ${note}` : ""} (worksheet: ${target.worksheetScore ?? "-"}). Klik untuk ubah.`
              : missed
                ? "Tidak mengumpulkan (dihitung 0). Klik untuk isi nilai manual."
                : "Klik untuk isi / ubah nilai"
        }
      >
        {label}
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          icon={PenLine}
          title={isTryout ? "Nilai Try Out Mimpi.mu" : `Nilai ${target.meetingLabel}`}
          description={studentName}
          footer={
            <>
              {hasOwn && (
                <button type="button" className="btn-ghost mr-auto text-rose-600" disabled={pending} onClick={() => submit("")}>
                  <RotateCcw className="h-4 w-4" /> {isTryout ? "Hapus nilai" : "Pakai nilai worksheet"}
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Batal
              </button>
              <button type="button" className="btn-primary" disabled={pending || !value.trim()} onClick={() => submit(value)}>
                {pending ? <Spinner /> : <Save className="h-4 w-4" />} Simpan nilai
              </button>
            </>
          }
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim()) submit(value);
            }}
          >
            {!isTryout && (
              <p className="rounded-2xl bg-navy-50/70 px-3 py-2 text-sm text-navy-600">
                Nilai worksheet otomatis: <b className="text-navy-900">{target.worksheetScore ?? "belum ada"}</b>
                <span className="block text-xs text-navy-400">Nilai manual menggantikan nilai worksheet di rekap, rapor & sertifikat.</span>
              </p>
            )}
            {isTryout && (
              <p className="rounded-2xl bg-navy-50/70 px-3 py-2 text-xs text-navy-500">
                Nilai Try Out Mimpi.mu setelah pelatihan; ikut dirata-rata sebagai satu nilai bersama nilai tiap pertemuan.
              </p>
            )}
            <Field label="Nilai (0–100)" htmlFor="score-input" errors={err ? [err] : undefined}>
              <input
                id="score-input"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="input max-w-40 text-lg font-bold"
                autoFocus
                placeholder="mis. 85"
              />
            </Field>
            <Field label="Catatan (opsional)" htmlFor="score-note">
              <input
                id="score-note"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={255}
                className="input"
                placeholder="mis. nilai tambahan keaktifan"
              />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Award,
  BarChart3,
  CalendarPlus,
  CalendarRange,
  ChevronRight,
  ClipboardCheck,
  Copy,
  FileQuestion,
  Pencil,
  Plus,
  Save,
  Trash2,
  Video,
  PlayCircle,
} from "lucide-react";
import { deleteSessionAction, saveSessionAction } from "@/app/actions/products";
import { createSessionsBulkAction } from "@/app/actions/meetings";
import { cn, formatDate, toDateTimeInput } from "@/lib/utils";
import { meetingPhase } from "@/lib/worksheet-shared";
import { ConfirmButton, Modal } from "@/components/modal";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { Badge, Field } from "@/components/ui";

export type MeetingRow = {
  id: number;
  title: string;
  startAt: Date;
  endAt: Date;
  meetingUrl: string | null;
  recordingUrl: string | null;
  notes: string | null;
  worksheetPublished: boolean;
  questions: number;
  attempts: number;
  present: number;
};

/** Tambah / edit satu pertemuan (jadwal, link Zoom, link rekaman, catatan) */
export function MeetingDialog({
  productId,
  meeting,
  onClose,
  nextNumber,
  copy = false,
}: {
  productId: number;
  meeting: Pick<MeetingRow, "id" | "title" | "startAt" | "endAt" | "meetingUrl" | "recordingUrl" | "notes"> | null;
  onClose: () => void;
  nextNumber: number;
  /** true = form terisi salinan pertemuan lain, disimpan sebagai pertemuan BARU */
  copy?: boolean;
}) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveSessionAction, { onSuccess: onClose });
  const s = meeting;
  return (
    <Modal
      open
      onClose={onClose}
      icon={CalendarPlus}
      title={copy ? "Duplikat pertemuan" : s ? "Edit pertemuan" : "Tambah pertemuan"}
      description={
        copy
          ? "Salinan dari pertemuan sebelumnya — periksa judul & jadwal, lalu simpan sebagai pertemuan baru. Soal worksheet, absensi & nilai tidak ikut disalin."
          : "Waktu dalam WIB. Jika waktu selesai kosong, otomatis 90 menit. Peserta hanya bisa absen sendiri di antara waktu mulai & selesai."
      }
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="session-form" pending={pending}>
            <Save className="h-4 w-4" /> Simpan pertemuan
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="session-form" className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="productId" value={productId} />
        {s && !copy && <input type="hidden" name="id" value={s.id} />}
        <Field label="Judul pertemuan *" htmlFor="title" errors={fe?.title} className="sm:col-span-2">
          <input id="title" name="title" defaultValue={s?.title ?? `Pertemuan ${nextNumber}: `} className="input" />
        </Field>
        <Field label="Mulai *" htmlFor="startAt" errors={fe?.startAt}>
          <input id="startAt" name="startAt" type="datetime-local" defaultValue={toDateTimeInput(s?.startAt)} className="input" />
        </Field>
        <Field label="Selesai" htmlFor="endAt" errors={fe?.endAt}>
          <input id="endAt" name="endAt" type="datetime-local" defaultValue={toDateTimeInput(s?.endAt)} className="input" />
        </Field>
        <Field label="Link Zoom / Meet" htmlFor="meetingUrl" className="sm:col-span-2" errors={fe?.meetingUrl}>
          <input id="meetingUrl" name="meetingUrl" defaultValue={s?.meetingUrl ?? ""} className="input" placeholder="https://zoom.us/j/..." />
        </Field>
        <Field
          label="Link rekaman"
          htmlFor="recordingUrl"
          className="sm:col-span-2"
          errors={fe?.recordingUrl}
          hint="Rekaman Zoom / YouTube / Google Drive. Tampil ke peserta agar yang tertinggal tetap bisa menonton."
        >
          <input id="recordingUrl" name="recordingUrl" defaultValue={s?.recordingUrl ?? ""} className="input" placeholder="https://" />
        </Field>
        <Field label="Catatan / materi pertemuan" htmlFor="notes" className="sm:col-span-2" hint="Juga dipakai AI sebagai konteks saat membuat soal worksheet.">
          <textarea id="notes" name="notes" rows={3} defaultValue={s?.notes ?? ""} className="input" />
        </Field>
      </form>
    </Modal>
  );
}

function BulkDialog({ productId, nextNumber, onClose }: { productId: number; nextNumber: number; onClose: () => void }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(createSessionsBulkAction, { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      icon={CalendarRange}
      title="Buat banyak pertemuan sekaligus"
      description={`Mis. 8 pertemuan tiap minggu di jam yang sama. Nomor dimulai dari Pertemuan ${nextNumber}; judul, link & worksheet bisa diubah per pertemuan setelahnya.`}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="bulk-form" pending={pending}>
            <CalendarPlus className="h-4 w-4" /> Buat pertemuan
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="bulk-form" className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="productId" value={productId} />
        <Field label="Jumlah pertemuan *" htmlFor="count" errors={fe?.count}>
          <input id="count" name="count" type="number" min={1} max={40} defaultValue={8} className="input" />
        </Field>
        <Field label="Awalan judul" htmlFor="prefix">
          <input id="prefix" name="prefix" defaultValue="Pertemuan" className="input" />
        </Field>
        <Field label="Pertemuan pertama (WIB) *" htmlFor="firstStart" errors={fe?.firstStart} className="sm:col-span-2">
          <input id="firstStart" name="firstStart" type="datetime-local" className="input" />
        </Field>
        <Field label="Durasi (menit)" htmlFor="duration" errors={fe?.duration}>
          <input id="duration" name="duration" type="number" min={15} max={600} defaultValue={90} className="input" />
        </Field>
        <Field label="Jarak antar pertemuan (hari)" htmlFor="interval" errors={fe?.interval} hint="7 = seminggu sekali">
          <input id="interval" name="interval" type="number" min={1} max={60} defaultValue={7} className="input" />
        </Field>
      </form>
    </Modal>
  );
}

const PHASE = { upcoming: { l: "Akan datang", tone: "blue" }, live: { l: "Berlangsung", tone: "green" }, done: { l: "Selesai", tone: "gray" } } as const;

export function MeetingsPanel({ productId, meetings, paidCount, now }: { productId: number; meetings: MeetingRow[]; paidCount: number; now: number }) {
  const [dialog, setDialog] = useState<{ open: boolean; meeting: MeetingRow | null; copy?: boolean }>({ open: false, meeting: null });
  const [bulk, setBulk] = useState(false);
  /** Salinan pertemuan → diletakkan setelah pertemuan terakhir: nomor berikutnya, jadwal +7 hari, durasi sama */
  const duplicate = (m: MeetingRow) => {
    const next = meetings.length + 1;
    const last = meetings.reduce((a, b) => (new Date(b.startAt) > new Date(a.startAt) ? b : a), m);
    const start = new Date(new Date(last.startAt).getTime() + 7 * 86_400_000);
    const end = new Date(start.getTime() + (new Date(m.endAt).getTime() - new Date(m.startAt).getTime()));
    const title = /^pertemuan\s+\d+/i.test(m.title) ? m.title.replace(/^(pertemuan\s+)\d+/i, `$1${next}`) : `${m.title} (salinan)`;
    setDialog({ open: true, copy: true, meeting: { ...m, title, startAt: start, endAt: end, recordingUrl: null } });
  };
  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold text-navy-900">
          <CalendarRange className="h-5 w-5 text-brand-600" /> Pertemuan <span className="text-sm font-medium text-navy-400">({meetings.length})</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {meetings.length > 0 && (
            <>
              <Link href={`/admin/produk/${productId}/rekap`} className="btn-secondary btn-sm">
                <BarChart3 className="h-3.5 w-3.5" /> Rekap nilai & absensi
              </Link>
              <Link href={`/admin/produk/${productId}/kelulusan`} className="btn-secondary btn-sm">
                <Award className="h-3.5 w-3.5 text-amber-500" /> Sertifikat & rapor
              </Link>
            </>
          )}
          <button className="btn-secondary btn-sm" onClick={() => setBulk(true)}>
            <CalendarRange className="h-3.5 w-3.5" /> Buat sekaligus
          </button>
          <button className="btn-primary btn-sm" onClick={() => setDialog({ open: true, meeting: null })}>
            <Plus className="h-3.5 w-3.5" /> Tambah pertemuan
          </button>
        </div>
      </div>
      {meetings.length ? (
        <ol className="space-y-2">
          {meetings.map((m, i) => {
            const phase = meetingPhase(m, now);
            return (
              <li
                key={m.id}
                className={cn(
                  "flex animate-fade-up items-center gap-3 rounded-2xl p-3 transition hover:bg-brand-50/50",
                  phase === "done" ? "bg-navy-50/50" : "bg-white ring-1 ring-navy-100",
                )}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-extrabold",
                    phase === "done" ? "bg-navy-100 text-navy-500" : "bg-linear-to-br from-brand-500 to-navy-700 text-white",
                  )}
                >
                  {i + 1}
                </span>
                <Link href={`/admin/produk/${productId}/pertemuan/${m.id}`} className="group min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate font-semibold text-navy-800 group-hover:text-brand-700">
                    {m.title} <ChevronRight className="h-4 w-4 shrink-0 opacity-0 transition group-hover:opacity-100" />
                  </p>
                  <p className="text-xs text-navy-400">{formatDate(m.startAt, true)} WIB</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                    <Badge tone={PHASE[phase].tone}>{PHASE[phase].l}</Badge>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                        m.meetingUrl ? "bg-sky-50 text-sky-700" : "bg-navy-50 text-navy-400",
                      )}
                    >
                      <Video className="h-3 w-3" /> {m.meetingUrl ? "Zoom" : "Zoom belum ada"}
                    </span>
                    {m.recordingUrl && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">
                        <PlayCircle className="h-3 w-3" /> Rekaman
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                        m.worksheetPublished ? "bg-emerald-50 text-emerald-700" : m.questions ? "bg-amber-50 text-amber-700" : "bg-navy-50 text-navy-400",
                      )}
                    >
                      <FileQuestion className="h-3 w-3" />
                      {m.questions ? `${m.questions} soal · ${m.worksheetPublished ? `${m.attempts}/${paidCount} mengerjakan` : "draf"}` : "Worksheet kosong"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-navy-600">
                      <ClipboardCheck className="h-3 w-3" /> Hadir {m.present}/{paidCount}
                    </span>
                  </div>
                </Link>
                <button className="btn-icon" onClick={() => setDialog({ open: true, meeting: m })} aria-label={`Edit ${m.title}`} title="Edit">
                  <Pencil className="h-4 w-4" />
                </button>
                <button className="btn-icon" onClick={() => duplicate(m)} aria-label={`Duplikat ${m.title}`} title="Duplikat jadi pertemuan baru">
                  <Copy className="h-4 w-4" />
                </button>
                <ConfirmButton
                  title="Hapus pertemuan?"
                  message={
                    <>
                      <b>{m.title}</b> beserta soal worksheet, nilai, dan absensinya akan dihapus permanen.
                    </>
                  }
                  action={() => deleteSessionAction(m.id)}
                  ariaLabel={`Hapus ${m.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-2xl bg-navy-50/60 p-4 text-center text-sm text-navy-400">
          Belum ada pertemuan. Klik <b>Buat sekaligus</b> untuk membuat mis. 8 pertemuan mingguan.
        </p>
      )}
      {dialog.open && (
        <MeetingDialog
          productId={productId}
          meeting={dialog.meeting}
          copy={dialog.copy}
          nextNumber={meetings.length + 1}
          onClose={() => setDialog({ open: false, meeting: null })}
        />
      )}
      {bulk && <BulkDialog productId={productId} nextNumber={meetings.length + 1} onClose={() => setBulk(false)} />}
    </section>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightToLine,
  Check,
  Clock,
  Link2,
  ListTodo,
  MessageSquareQuote,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  deleteDailyAction,
  deleteRoutineAction,
  moveDailyAction,
  saveDailyAction,
  saveRoutineAction,
  toggleDailyAction,
  toggleRoutineAction,
} from "@/app/actions/jobdesk";
import {
  CATEGORY_OF,
  PRIORITY_LABEL,
  PRIORITY_RANK,
  PRIORITY_TONE,
  WEEKDAYS,
  daysText,
  fmtDay,
  fmtShort,
  isoWeekday,
  ymdToDate,
  type JobPriorityKey,
} from "@/lib/jobdesk-shared";
import { cn } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { Badge, EmptyState, Field } from "@/components/ui";
import { useToast } from "@/components/toast";
import { RootNoteBox, RootNoteDialog, type RootNoteTarget } from "./root-note";
import type { DailyItem, JobCtx, RoutineItem, WeeklyItem } from "./types";
import { AiDailyButton } from "./ai-generate";

const PRIORITIES: JobPriorityKey[] = ["TINGGI", "SEDANG", "RENDAH"];

/** Urutan tampil: belum selesai dulu → prioritas → jam tenggat */
const sortDaily = (a: DailyItem, b: DailyItem) =>
  Number(a.done) - Number(b.done) ||
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
  (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99") ||
  a.id - b.id;

/** Centang dengan tampilan instan (optimistik), lalu sinkron ke server */
function useToggle() {
  const [local, setLocal] = useState<Record<number, boolean>>({});
  const [, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const toggle = (item: DailyItem) => {
    const next = !(local[item.id] ?? item.done);
    setLocal((s) => ({ ...s, [item.id]: next }));
    start(async () => {
      const r = await toggleDailyAction(item.id, next);
      if (r.error) {
        toast.fromResult(r);
        setLocal((s) => ({ ...s, [item.id]: !next }));
      }
      router.refresh();
    });
  };
  return { isDone: (item: DailyItem) => local[item.id] ?? item.done, toggle };
}

function CheckBox({ done, disabled, onClick, label }: { done: boolean; disabled?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition",
        done ? "border-emerald-500 bg-emerald-500 text-white" : "border-navy-200 bg-white hover:border-brand-400",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {done && <Check className="h-4 w-4" strokeWidth={3} />}
    </button>
  );
}

function agendaOptions(agendas: WeeklyItem[]) {
  return agendas.map((a) => ({ id: a.id, label: `${CATEGORY_OF[a.category].short} · ${a.title}` }));
}

/* ======================= dialog jobdesk harian ======================= */

function DailyDialog({ ctx, item, date, agendas, onClose }: { ctx: JobCtx; item: DailyItem | null; date: string; agendas: WeeklyItem[]; onClose: () => void }) {
  const { formProps, pending, fieldErrors } = useFormAction(saveDailyAction, { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      icon={ListTodo}
      title={item ? "Ubah jobdesk harian" : "Tambah jobdesk harian"}
      description={item?.routineId ? "Berasal dari rutin harian — tanggalnya tetap." : undefined}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="daily-form" pending={pending}>
            <Save className="h-4 w-4" /> Simpan
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="daily-form" className="space-y-4">
        {item ? <input type="hidden" name="id" value={item.id} /> : <input type="hidden" name="ownerId" value={ctx.ownerId} />}
        <Field label="Jobdesk" htmlFor="d-title" errors={fieldErrors?.title}>
          <input
            id="d-title"
            name="title"
            defaultValue={item?.title ?? ""}
            maxLength={200}
            className="input"
            placeholder="mis. Follow-up 20 leads hangat COC"
            autoFocus
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tanggal" htmlFor="d-date" errors={fieldErrors?.date}>
            <input id="d-date" name="date" type="date" defaultValue={item?.date ?? date} className="input" readOnly={!!item?.routineId} />
          </Field>
          <Field label="Prioritas" htmlFor="d-priority" errors={fieldErrors?.priority}>
            <select id="d-priority" name="priority" defaultValue={item?.priority ?? "SEDANG"} className="input">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tenggat jam (opsional)" htmlFor="d-time" errors={fieldErrors?.dueTime}>
            <input id="d-time" name="dueTime" type="time" defaultValue={item?.dueTime ?? ""} className="input" />
          </Field>
        </div>
        <Field
          label="Mendukung agenda pekanan (opsional)"
          htmlFor="d-weekly"
          hint="Jobdesk yang ditautkan tercetak sebagai langkah kerja agenda itu di file Agenda Pekanan."
        >
          <select id="d-weekly" name="weeklyId" defaultValue={item?.weeklyId ?? ""} className="input">
            <option value="">— Tidak ditautkan —</option>
            {agendaOptions(agendas).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Catatan / detail (opsional)" htmlFor="d-notes">
          <textarea id="d-notes" name="notes" rows={3} defaultValue={item?.notes ?? ""} className="input" placeholder="Hasil, kendala, atau tautan pendukung" />
        </Field>
      </form>
    </Modal>
  );
}

/* ======================= rutin harian ======================= */

function RoutineDialog({ ctx, item, onClose }: { ctx: JobCtx; item: RoutineItem | null; onClose: () => void }) {
  const { formProps, pending, fieldErrors } = useFormAction(saveRoutineAction, { onSuccess: onClose });
  const [days, setDays] = useState<number[]>(item?.weekdays ?? [1, 2, 3, 4, 5]);
  return (
    <Modal
      open
      onClose={onClose}
      icon={Repeat}
      title={item ? "Ubah rutin harian" : "Tambah rutin harian"}
      description="Rutin otomatis muncul di checklist pada hari yang dipilih (pekerjaan BAU, mis. follow-up leads pagi)."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="routine-form" pending={pending}>
            <Save className="h-4 w-4" /> Simpan
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="routine-form" className="space-y-4">
        {item ? <input type="hidden" name="id" value={item.id} /> : <input type="hidden" name="ownerId" value={ctx.ownerId} />}
        <Field label="Nama rutin" htmlFor="r-title" errors={fieldErrors?.title}>
          <input
            id="r-title"
            name="title"
            defaultValue={item?.title ?? ""}
            maxLength={200}
            className="input"
            placeholder={ctx.ops ? "mis. Isi link meeting 3 pertemuan kelas SMP" : "mis. Follow-up 20 leads di Master Lead"}
            autoFocus
          />
        </Field>
        <Field label="Hari aktif" errors={fieldErrors?.weekdays}>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = days.includes(d.n);
              return (
                <label
                  key={d.n}
                  className={cn(
                    "cursor-pointer rounded-xl px-3 py-1.5 text-sm font-semibold ring-1 transition",
                    on ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-navy-500 ring-navy-200",
                  )}
                >
                  <input
                    type="checkbox"
                    name="weekdays"
                    value={d.n}
                    checked={on}
                    onChange={() => setDays((s) => (on ? s.filter((x) => x !== d.n) : [...s, d.n]))}
                    className="sr-only"
                  />
                  {d.short}
                </label>
              );
            })}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prioritas" htmlFor="r-priority" errors={fieldErrors?.priority}>
            <select id="r-priority" name="priority" defaultValue={item?.priority ?? "SEDANG"} className="input">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tenggat jam (opsional)" htmlFor="r-time" errors={fieldErrors?.dueTime}>
            <input id="r-time" name="dueTime" type="time" defaultValue={item?.dueTime ?? ""} className="input" />
          </Field>
        </div>
        <Field label="Cara menangani / catatan (opsional)" htmlFor="r-notes" hint="Tercetak di tabel pekerjaan operasional pada Agenda Pekanan.">
          <textarea id="r-notes" name="notes" rows={2} defaultValue={item?.notes ?? ""} className="input" />
        </Field>
      </form>
    </Modal>
  );
}

function RoutinesCard({ ctx, routines }: { ctx: JobCtx; routines: RoutineItem[] }) {
  const [editing, setEditing] = useState<RoutineItem | "new" | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-bold text-navy-900">
          <Repeat className="h-5 w-5 text-brand-600" /> Rutin harian
        </p>
        {ctx.canEdit && (
          <button className="btn-secondary btn-sm" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" /> Rutin
          </button>
        )}
      </div>
      <p className="text-xs text-navy-400">Pekerjaan rutin otomatis masuk checklist di hari aktifnya.</p>
      <ul className="space-y-2">
        {routines.map((r) => (
          <li key={r.id} className={cn("rounded-2xl bg-navy-50/60 p-3", !r.isActive && "opacity-60")}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy-900">{r.title}</p>
                <p className="text-xs text-navy-400">
                  {daysText(r.weekdays)}
                  {r.dueTime ? ` · maks. ${r.dueTime}` : ""} · {PRIORITY_LABEL[r.priority]}
                  {!r.isActive && " · dijeda"}
                </p>
              </div>
              {ctx.canEdit && (
                <div className="flex shrink-0">
                  <button
                    className="btn-icon h-7 w-7"
                    disabled={pending}
                    title={r.isActive ? "Jeda" : "Aktifkan"}
                    aria-label={r.isActive ? `Jeda ${r.title}` : `Aktifkan ${r.title}`}
                    onClick={() =>
                      start(async () => {
                        toast.fromResult(await toggleRoutineAction(r.id));
                        router.refresh();
                      })
                    }
                  >
                    {r.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <button className="btn-icon h-7 w-7" onClick={() => setEditing(r)} aria-label={`Ubah rutin ${r.title}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <ConfirmButton
                    className="btn-icon h-7 w-7 text-rose-500 hover:bg-rose-50"
                    title="Hapus rutin?"
                    message={
                      <>
                        Rutin <b>{r.title}</b> dihapus. Checklist mendatang yang belum dicentang ikut hilang; riwayat yang sudah lewat tetap tersimpan.
                      </>
                    }
                    action={() => deleteRoutineAction(r.id)}
                    ariaLabel={`Hapus rutin ${r.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </ConfirmButton>
                </div>
              )}
            </div>
          </li>
        ))}
        {!routines.length && <li className="text-sm text-navy-400">Belum ada rutin.</li>}
      </ul>
      {editing && <RoutineDialog ctx={ctx} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/* ======================= panel ======================= */

function DailyRow({
  item,
  ctx,
  agendaTitle,
  isDone,
  onToggle,
  onEdit,
  onRootNote,
  showDate,
  onMoveToday,
}: {
  item: DailyItem;
  ctx: JobCtx;
  agendaTitle?: string;
  isDone: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRootNote: () => void;
  showDate?: boolean;
  onMoveToday?: () => void;
}) {
  const late = !isDone && item.date === ctx.today && item.dueTime && item.dueTime < ctx.nowTime;
  return (
    <li
      className={cn(
        "group rounded-2xl border bg-white p-3 transition",
        isDone ? "border-emerald-100 bg-emerald-50/30" : "border-navy-100 hover:border-brand-200",
      )}
    >
      <div className="flex items-start gap-3">
        <CheckBox done={isDone} disabled={!ctx.canEdit} onClick={onToggle} label={`${isDone ? "Batalkan centang" : "Centang"} ${item.title}`} />
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold leading-snug", isDone ? "text-navy-400 line-through" : "text-navy-900")}>{item.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {showDate && <Badge tone="red">{fmtShort(item.date)}</Badge>}
            <Badge tone={PRIORITY_TONE[item.priority]}>{PRIORITY_LABEL[item.priority]}</Badge>
            {item.dueTime && (
              <span className={cn("inline-flex items-center gap-1 font-semibold", late ? "text-rose-600" : "text-navy-500")}>
                <Clock className="h-3 w-3" /> {item.dueTime}
                {late && " · lewat"}
              </span>
            )}
            {item.routineId && (
              <span className="inline-flex items-center gap-1 text-navy-400">
                <Repeat className="h-3 w-3" /> Rutin
              </span>
            )}
            {agendaTitle && (
              <span className="inline-flex max-w-full items-center gap-1 truncate rounded-lg bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-700">
                <Link2 className="h-3 w-3 shrink-0" /> <span className="truncate">{agendaTitle}</span>
              </span>
            )}
          </div>
          {item.notes && <p className="mt-1.5 whitespace-pre-line text-sm text-navy-600">{item.notes}</p>}
          <RootNoteBox note={item.rootNote} by={item.rootNoteBy} at={item.rootNoteAt} className="mt-2" />
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onMoveToday && ctx.canEdit && !item.routineId && (
            <button className="btn-icon h-8 w-8" onClick={onMoveToday} title="Pindahkan ke hari ini" aria-label={`Pindahkan ${item.title} ke hari ini`}>
              <ArrowRightToLine className="h-4 w-4" />
            </button>
          )}
          {ctx.canReview && (
            <button className="btn-icon h-8 w-8 text-amber-600" onClick={onRootNote} title="Catatan root" aria-label={`Catatan root untuk ${item.title}`}>
              <MessageSquareQuote className="h-4 w-4" />
            </button>
          )}
          {ctx.canEdit && (
            <>
              <button className="btn-icon h-8 w-8" onClick={onEdit} aria-label={`Ubah ${item.title}`} title="Ubah">
                <Pencil className="h-4 w-4" />
              </button>
              {!item.routineId && (
                <ConfirmButton
                  className="btn-icon h-8 w-8 text-rose-500 hover:bg-rose-50"
                  title="Hapus jobdesk?"
                  message={
                    <>
                      <b>{item.title}</b> akan dihapus dari checklist.
                    </>
                  }
                  action={() => deleteDailyAction(item.id)}
                  ariaLabel={`Hapus ${item.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export function DailyPanel({
  ctx,
  selectedDate,
  dailies,
  overdue,
  agendas,
  routines,
  dayHref,
}: {
  ctx: JobCtx;
  selectedDate: string;
  dailies: DailyItem[];
  overdue: DailyItem[];
  agendas: WeeklyItem[];
  routines: RoutineItem[];
  dayHref: Record<string, string>;
}) {
  const { isDone, toggle } = useToggle();
  const [editing, setEditing] = useState<DailyItem | "new" | null>(null);
  const [noteTarget, setNoteTarget] = useState<RootNoteTarget | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const agendaTitle = useMemo(() => new Map(agendas.map((a) => [a.id, a.title])), [agendas]);
  const items = dailies.filter((d) => d.date === selectedDate).sort(sortDaily);
  const doneCount = items.filter(isDone).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const quick = useFormAction(saveDailyAction, { resetOnSuccess: true });

  const rowProps = (d: DailyItem) => ({
    item: d,
    ctx,
    agendaTitle: d.weeklyId ? agendaTitle.get(d.weeklyId) : undefined,
    isDone: isDone(d),
    onToggle: () => toggle(d),
    onEdit: () => setEditing(d),
    onRootNote: () => setNoteTarget({ kind: "daily", id: d.id, title: d.title, note: d.rootNote }),
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        {/* strip hari */}
        <div className="grid grid-cols-7 gap-1.5">
          {ctx.dates.map((d) => {
            const list = dailies.filter((x) => x.date === d);
            const done = list.filter(isDone).length;
            const active = d === selectedDate;
            return (
              <Link
                key={d}
                href={dayHref[d]}
                scroll={false}
                className={cn(
                  "relative rounded-2xl px-1 py-2 text-center ring-1 transition",
                  active ? "bg-brand-600 text-white shadow-lg shadow-brand-500/25 ring-brand-600" : "bg-white text-navy-700 ring-navy-100 hover:ring-brand-300",
                )}
                aria-current={active ? "date" : undefined}
              >
                <p className={cn("text-[11px] font-semibold", active ? "text-brand-100" : "text-navy-400")}>{WEEKDAYS[isoWeekday(d) - 1].short}</p>
                <p className="text-lg font-black leading-tight">{ymdToDate(d).getUTCDate()}</p>
                <p
                  className={cn(
                    "text-[10px] font-semibold",
                    active ? "text-white/90" : list.length && done === list.length ? "text-emerald-600" : "text-navy-400",
                  )}
                >
                  {list.length ? `${done}/${list.length}` : "–"}
                </p>
                {d === ctx.today && (
                  <span className={cn("absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full", active ? "bg-white" : "bg-brand-500")} title="Hari ini" />
                )}
              </Link>
            );
          })}
        </div>

        <section className="card space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-brand-600">{selectedDate === ctx.today ? "Hari ini" : "Jobdesk harian"}</p>
              <h2 className="text-lg font-extrabold text-navy-900">{fmtDay(selectedDate)}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-navy-500">
                {doneCount}/{items.length} selesai
              </p>
              {ctx.canEdit && <AiDailyButton ctx={ctx} date={selectedDate} />}
            </div>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-navy-50">
            <div className="h-full rounded-full bg-linear-to-r from-emerald-400 to-teal-500 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>

          {ctx.canEdit && (
            <form {...quick.formProps} className="flex flex-wrap gap-2 rounded-2xl bg-navy-50/60 p-2">
              <input type="hidden" name="ownerId" value={ctx.ownerId} />
              <input type="hidden" name="date" value={selectedDate} />
              <input
                name="title"
                maxLength={200}
                placeholder="Tambah jobdesk untuk hari ini…"
                className="input min-w-0 flex-1 basis-56 bg-white"
                aria-label="Jobdesk baru"
              />
              <select name="priority" defaultValue="SEDANG" className="input w-28 bg-white" aria-label="Prioritas">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
              <input name="dueTime" type="time" className="input w-28 bg-white" aria-label="Tenggat jam" />
              {agendas.length > 0 && (
                <select name="weeklyId" defaultValue="" className="input w-44 bg-white" aria-label="Tautkan ke agenda pekanan">
                  <option value="">Tanpa agenda</option>
                  {agendaOptions(agendas).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
              <SubmitButton pending={quick.pending} pendingText="…">
                <Plus className="h-4 w-4" /> Tambah
              </SubmitButton>
              <button type="button" className="btn-ghost" onClick={() => setEditing("new")} title="Form lengkap (catatan)">
                Detail
              </button>
            </form>
          )}

          {items.length ? (
            <ul className="space-y-2">
              {items.map((d) => (
                <DailyRow key={d.id} {...rowProps(d)} />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ListTodo}
              title="Belum ada jobdesk"
              desc={ctx.canEdit ? "Tambahkan jobdesk hari ini atau atur rutin harian." : "Admin belum mengisi jobdesk untuk hari ini."}
            />
          )}
        </section>

        {selectedDate === ctx.today && overdue.length > 0 && (
          <section className="card space-y-3 ring-1 ring-rose-100">
            <p className="flex items-center gap-2 font-bold text-navy-900">
              <TriangleAlert className="h-5 w-5 text-rose-500" /> Tertunda dari hari sebelumnya ({overdue.length})
            </p>
            <ul className="space-y-2">
              {overdue.map((d) => (
                <DailyRow
                  key={d.id}
                  {...rowProps(d)}
                  showDate
                  onMoveToday={() =>
                    start(async () => {
                      toast.fromResult(await moveDailyAction(d.id, ctx.today));
                      router.refresh();
                    })
                  }
                />
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="space-y-6">
        <RoutinesCard ctx={ctx} routines={routines} />
        <section className="card space-y-2 text-sm text-navy-600">
          <p className="font-bold text-navy-900">Tips</p>
          <p>• Tautkan jobdesk harian ke agenda pekanan — tercetak sebagai langkah kerja di file Agenda Pekanan.</p>
          <p>• Jobdesk yang belum dicentang muncul di bagian &ldquo;Tertunda&rdquo; dan bisa dipindah ke hari ini.</p>
          {ctx.canReview && <p>• Klik ikon catatan kuning untuk memberi arahan root per jobdesk.</p>}
        </section>
      </aside>

      {editing && <DailyDialog ctx={ctx} item={editing === "new" ? null : editing} date={selectedDate} agendas={agendas} onClose={() => setEditing(null)} />}
      {noteTarget && <RootNoteDialog target={noteTarget} onClose={() => setNoteTarget(null)} />}
    </div>
  );
}

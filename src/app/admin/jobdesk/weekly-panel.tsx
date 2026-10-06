"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheck,
  CircleAlert,
  Copy,
  FileText,
  Flag,
  MessageSquareQuote,
  Pencil,
  Plus,
  Save,
  Target,
  Trash2,
  UserRound,
} from "lucide-react";
import { copyPreviousWeekAction, deleteWeeklyAction, moveWeeklyAction, saveWeekAction, saveWeeklyAction, toggleWeeklyAction } from "@/app/actions/jobdesk";
import {
  CATEGORY_OF,
  JOB_CATEGORIES,
  LD,
  MAIN_CATEGORIES,
  PRACTICAL_TOTAL,
  fmtLong,
  ldPass,
  lines,
  rangeShort,
  type JobCategoryKey,
} from "@/lib/jobdesk-shared";
import { cn } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { SubmitButton, Spinner, useFormAction } from "@/components/form-buttons";
import { Badge, EmptyState, Field } from "@/components/ui";
import { useToast } from "@/components/toast";
import { RootNoteBox, RootNoteDialog, type RootNoteTarget } from "./root-note";
import type { DailyItem, JobCtx, WeekSheet, WeeklyItem } from "./types";
import { AiWeeklyButton } from "./ai-generate";

const TONE: Record<JobCategoryKey, "brand" | "green" | "blue" | "gray"> = { PRIORITAS: "brand", SISTEM: "green", PEOPLE: "blue", OPERASIONAL: "gray" };

/* ======================= dialog lembar pekan ======================= */

function WeekDialog({ ctx, sheet, onClose }: { ctx: JobCtx; sheet: WeekSheet | null; onClose: () => void }) {
  const { formProps, pending } = useFormAction(saveWeekAction, { onSuccess: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      icon={FileText}
      size="lg"
      title={`Lembar Agenda Pekan ${ctx.week}`}
      description="Bagian sampul & konteks di file Agenda Pekanan."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="week-form" pending={pending}>
            <Save className="h-4 w-4" /> Simpan
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="week-form" className="space-y-4">
        <input type="hidden" name="ownerId" value={ctx.ownerId} />
        <input type="hidden" name="year" value={ctx.year} />
        <input type="hidden" name="week" value={ctx.week} />
        <Field label="Peran / subjudul sampul" htmlFor="w-role" hint={`Kosong = "${ctx.roleTitle} • ${ctx.ownerName}"`}>
          <input
            id="w-role"
            name="roleTitle"
            defaultValue={sheet?.roleTitle ?? ""}
            maxLength={200}
            className="input"
            placeholder={ctx.ops ? "mis. Admin SmartChampion • Operasional Kelas & Games" : "mis. Admin Pelatihan • Sales COC & MIMPI.MU"}
          />
        </Field>
        <Field label="Fokus pekan ini" htmlFor="w-focus" hint="Satu poin per baris. Kosong = otomatis dari judul agenda utama.">
          <textarea
            id="w-focus"
            name="focus"
            rows={4}
            defaultValue={sheet?.focus ?? ""}
            className="input"
            placeholder={"Menutup 15 pendaftar COC batch Oktober\nMerapikan follow-up leads lama di CRM"}
          />
        </Field>
        <Field label="Peran utama (konteks)" htmlFor="w-context" hint="Bagian 1. Konteks Peran dan Prinsip Penyusunan.">
          <textarea
            id="w-context"
            name="context"
            rows={3}
            defaultValue={sheet?.context ?? ""}
            className="input"
            placeholder={ctx.ops ? "Admin SmartChampion yang mengelola operasional kelas: jadwal pertemuan, materi, worksheet, absensi, tutor & games …" : "Admin Pelatihan yang memegang leads COC & MIMPI.MU …"}
          />
        </Field>
        <Field label="Kesimpulan agenda pekan ini" htmlFor="w-conclusion" hint="Kosong = otomatis dari agenda prioritas.">
          <textarea id="w-conclusion" name="conclusion" rows={2} defaultValue={sheet?.conclusion ?? ""} className="input" />
        </Field>
      </form>
    </Modal>
  );
}

/* ======================= dialog agenda ======================= */

function AgendaDialog({ ctx, item, category, onClose }: { ctx: JobCtx; item: WeeklyItem | null; category: JobCategoryKey; onClose: () => void }) {
  const { formProps, pending, fieldErrors } = useFormAction(saveWeeklyAction, { onSuccess: onClose });
  const [cat, setCat] = useState<JobCategoryKey>(item?.category ?? category);
  const [ld, setLd] = useState({ ld1Ok: item?.ld1Ok ?? false, ld2Ok: item?.ld2Ok ?? false, ld3Ok: item?.ld3Ok ?? false });
  const ops = cat === "OPERASIONAL";
  const pass = ld.ld1Ok && ld.ld2Ok && ld.ld3Ok;
  return (
    <Modal
      open
      onClose={onClose}
      icon={Target}
      size="xl"
      title={item ? "Ubah agenda pekanan" : "Tambah agenda pekanan"}
      description={CATEGORY_OF[cat].question}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form="agenda-form" pending={pending}>
            <Save className="h-4 w-4" /> Simpan
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id="agenda-form" className="space-y-5">
        {item ? (
          <input type="hidden" name="id" value={item.id} />
        ) : (
          <>
            <input type="hidden" name="ownerId" value={ctx.ownerId} />
            <input type="hidden" name="year" value={ctx.year} />
            <input type="hidden" name="week" value={ctx.week} />
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <Field label="Kategori" htmlFor="a-cat" errors={fieldErrors?.category}>
            <select id="a-cat" name="category" value={cat} onChange={(e) => setCat(e.target.value as JobCategoryKey)} className="input">
              {JOB_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={ops ? "Pekerjaan" : "Agenda"} htmlFor="a-title" errors={fieldErrors?.title}>
            <input
              id="a-title"
              name="title"
              defaultValue={item?.title ?? ""}
              maxLength={200}
              className="input"
              placeholder="mis. Closing 15 pendaftar COC batch Oktober"
              autoFocus
            />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-navy-400">{CATEGORY_OF[cat].hint}</p>

        {ops ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Status" htmlFor="a-ops-status" hint="mis. BAU / support, NEXT">
              <input id="a-ops-status" name="opsStatus" defaultValue={item?.opsStatus ?? "BAU / support"} maxLength={120} className="input" />
            </Field>
            <Field label="Alasan bukan agenda utama" htmlFor="a-ops-reason">
              <textarea id="a-ops-reason" name="opsReason" rows={3} defaultValue={item?.opsReason ?? ""} className="input" />
            </Field>
            <Field label="Cara menangani pekan ini" htmlFor="a-ops-handling">
              <textarea id="a-ops-handling" name="opsHandling" rows={3} defaultValue={item?.opsHandling ?? ""} className="input" />
            </Field>
          </div>
        ) : (
          <>
            <Field label="Tujuan singkat (opsional)" htmlFor="a-objective" hint="Tampil setelah label kategori, mis. PRIORITAS 1 | …">
              <input id="a-objective" name="objective" defaultValue={item?.objective ?? ""} maxLength={300} className="input" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ukuran selesai" htmlFor="a-done" hint="Kapan agenda ini dianggap benar-benar selesai?">
                <textarea id="a-done" name="doneMeasure" rows={3} defaultValue={item?.doneMeasure ?? ""} className="input" />
              </Field>
              <Field label="Lead measure" htmlFor="a-lead" hint="Angka yang dipantau selama pekan berjalan.">
                <textarea id="a-lead" name="leadMeasure" rows={3} defaultValue={item?.leadMeasure ?? ""} className="input" />
              </Field>
            </div>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="PIC" htmlFor="a-pic">
            <input id="a-pic" name="pic" defaultValue={item?.pic ?? `Admin / ${ctx.ownerName}`} maxLength={120} className="input" />
          </Field>
          <Field label="Mulai (opsional)" htmlFor="a-start" errors={fieldErrors?.startDate}>
            <input id="a-start" name="startDate" type="date" defaultValue={item?.startDate ?? ""} className="input" />
          </Field>
          <Field label="Tenggat" htmlFor="a-due" errors={fieldErrors?.dueDate}>
            <input id="a-due" name="dueDate" type="date" defaultValue={item?.dueDate ?? ""} className="input" />
          </Field>
        </div>

        {!ops && (
          <fieldset className="space-y-3 rounded-2xl bg-navy-50/60 p-4">
            <legend className="sr-only">Uji 3LD</legend>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-navy-900">Uji 3LD — Langsung Dapat</p>
              <Badge tone={pass ? "green" : "yellow"}>{pass ? "Lolos 3LD" : "Belum lolos — iris lebih kecil atau simpan di NEXT"}</Badge>
            </div>
            {LD.map((x) => (
              <div key={x.key} className="grid gap-2 sm:grid-cols-[210px_1fr]">
                <label className="flex cursor-pointer items-start gap-2 pt-2 text-sm font-semibold text-navy-800">
                  <input
                    type="checkbox"
                    name={x.ok}
                    value="1"
                    checked={ld[x.ok]}
                    onChange={(e) => setLd((s) => ({ ...s, [x.ok]: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 accent-emerald-600"
                  />
                  <span>
                    {x.code} · {x.label}
                    <span className="block text-xs font-normal text-navy-400">{x.question}</span>
                  </span>
                </label>
                <textarea
                  name={x.key}
                  rows={2}
                  defaultValue={item?.[x.key] ?? ""}
                  className="input bg-white"
                  aria-label={x.label}
                  placeholder="Alasan / bukti singkat"
                />
              </div>
            ))}
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Langkah kerja pekan ini" htmlFor="a-steps" hint="Satu langkah per baris. Jobdesk harian yang ditautkan ikut tercetak.">
            <textarea id="a-steps" name="steps" rows={5} defaultValue={item?.steps ?? ""} className="input" />
          </Field>
          {!ops && (
            <Field label="Penerima manfaat" htmlFor="a-benef" hint="Siapa yang menikmati hasilnya?">
              <textarea id="a-benef" name="beneficiaries" rows={5} defaultValue={item?.beneficiaries ?? ""} maxLength={300} className="input" />
            </Field>
          )}
        </div>
      </form>
    </Modal>
  );
}

/* ======================= kartu agenda ======================= */

function AgendaCard({
  ctx,
  item,
  label,
  linked,
  first,
  last,
  onEdit,
  onRootNote,
}: {
  ctx: JobCtx;
  item: WeeklyItem;
  label: string;
  linked: DailyItem[];
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onRootNote: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(item.done);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const ops = item.category === "OPERASIONAL";
  const run = (fn: () => Promise<{ ok?: string; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.error || r.ok) toast.fromResult(r);
      router.refresh();
    });
  const linkedDone = linked.filter((d) => d.done).length;
  const steps = lines(item.steps);

  return (
    <article className={cn("card space-y-3 p-4!", done && "bg-emerald-50/30")}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`${done ? "Buka kembali" : "Tandai selesai"} ${item.title}`}
          disabled={!ctx.canEdit || pending}
          onClick={() => {
            setDone(!done);
            run(() => toggleWeeklyAction(item.id, !done));
          }}
          className={cn(
            "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition",
            done ? "border-emerald-500 bg-emerald-500 text-white" : "border-navy-200 bg-white hover:border-brand-400",
            !ctx.canEdit && "cursor-not-allowed opacity-60",
          )}
        >
          {done && <Check className="h-4 w-4" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">{label}</p>
          <h3 className={cn("font-bold leading-snug", done ? "text-navy-400 line-through" : "text-navy-900")}>{item.title}</h3>
          {item.objective && <p className="text-sm text-navy-500">{item.objective}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            {(item.startDate || item.dueDate) && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-navy-50 px-2 py-1 font-semibold text-navy-600">
                <CalendarDays className="h-3 w-3" /> {rangeShort(item.startDate, item.dueDate)}
              </span>
            )}
            {item.pic && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-navy-50 px-2 py-1 font-semibold text-navy-600">
                <UserRound className="h-3 w-3" /> {item.pic}
              </span>
            )}
            {!ops && (
              <>
                {LD.map((x) => (
                  <span
                    key={x.code}
                    title={x.label}
                    className={cn(
                      "grid h-6 w-6 place-items-center rounded-md text-[11px] font-black",
                      item[x.ok] ? "bg-emerald-100 text-emerald-700" : "bg-navy-100 text-navy-300",
                    )}
                  >
                    {x.code}
                  </span>
                ))}
                <Badge tone={ldPass(item) ? "green" : "yellow"}>{ldPass(item) ? "Lolos 3LD" : "Belum lolos 3LD"}</Badge>
              </>
            )}
            {ops && item.opsStatus && <Badge>{item.opsStatus}</Badge>}
            {linked.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 font-semibold text-brand-700">
                <CircleCheck className="h-3 w-3" /> harian {linkedDone}/{linked.length}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-0.5">
          {ctx.canEdit && (
            <>
              <button
                className="btn-icon h-8 w-8"
                disabled={pending || first}
                onClick={() => run(() => moveWeeklyAction(item.id, "up"))}
                aria-label={`Naikkan ${item.title}`}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                className="btn-icon h-8 w-8"
                disabled={pending || last}
                onClick={() => run(() => moveWeeklyAction(item.id, "down"))}
                aria-label={`Turunkan ${item.title}`}
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </>
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
              <ConfirmButton
                className="btn-icon h-8 w-8 text-rose-500 hover:bg-rose-50"
                title="Hapus agenda?"
                message={
                  <>
                    Agenda <b>{item.title}</b> dihapus. Jobdesk harian yang tertaut tetap ada (tautannya dilepas).
                  </>
                }
                action={() => deleteWeeklyAction(item.id)}
                ariaLabel={`Hapus agenda ${item.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </ConfirmButton>
            </>
          )}
        </div>
      </div>

      <RootNoteBox note={item.rootNote} by={item.rootNoteBy} at={item.rootNoteAt} />

      <button type="button" className="flex items-center gap-1 text-xs font-semibold text-brand-600" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} /> {open ? "Sembunyikan detail" : "Lihat detail"}
      </button>
      {open && (
        <dl className="grid gap-x-4 gap-y-2 rounded-2xl bg-navy-50/50 p-3 text-sm sm:grid-cols-[170px_1fr]">
          {(ops
            ? [
                ["Alasan", item.opsReason],
                ["Cara menangani", item.opsHandling],
              ]
            : [
                ["Ukuran selesai", item.doneMeasure],
                ["Lead measure", item.leadMeasure],
                ["Tenggat", item.dueDate ? fmtLong(item.dueDate) : null],
                ...LD.map((x) => [x.label, item[x.key]] as [string, string | null]),
                ["Penerima manfaat", item.beneficiaries],
              ]
          ).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-navy-500">{k}</dt>
              <dd className="whitespace-pre-line text-navy-800">{v || <span className="text-navy-300">–</span>}</dd>
            </div>
          ))}
          {(steps.length > 0 || linked.length > 0) && (
            <div className="contents">
              <dt className="font-semibold text-navy-500">Langkah kerja</dt>
              <dd>
                <ul className="space-y-0.5 text-navy-800">
                  {steps.map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                  {linked.map((d) => (
                    <li key={`d${d.id}`} className={cn(d.done ? "text-emerald-700" : "text-navy-600")}>
                      {d.done ? "☑" : "☐"} {rangeShort(null, d.date)} — {d.title}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      )}
    </article>
  );
}

/* ======================= panel ======================= */

export function WeeklyPanel({ ctx, sheet, agendas, dailies }: { ctx: JobCtx; sheet: WeekSheet | null; agendas: WeeklyItem[]; dailies: DailyItem[] }) {
  const [weekOpen, setWeekOpen] = useState(false);
  const [editing, setEditing] = useState<{ item: WeeklyItem | null; category: JobCategoryKey } | null>(null);
  const [noteTarget, setNoteTarget] = useState<RootNoteTarget | null>(null);
  const [copying, startCopy] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const count = (c: JobCategoryKey) => agendas.filter((a) => a.category === c).length;
  const total = MAIN_CATEGORIES.reduce((s, c) => s + count(c), 0);
  const focus = lines(sheet?.focus);

  return (
    <div className="space-y-6">
      {/* lembar pekan */}
      <section className="relative overflow-hidden rounded-[28px] bg-hero p-5 text-white shadow-xl sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-200">Agenda Pekanan · Pekan {ctx.week}</p>
            <h2 className="mt-1 text-xl font-extrabold">{sheet?.roleTitle || `${ctx.roleTitle} • ${ctx.ownerName}`}</h2>
            {focus.length > 0 ? (
              <ul className="mt-2 space-y-0.5 text-sm text-navy-100">
                {focus.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-navy-200">Fokus pekan belum ditulis — otomatis diambil dari judul agenda utama saat diunduh.</p>
            )}
            {sheet?.context && <p className="mt-2 text-xs text-navy-300">Peran utama: {sheet.context}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {ctx.canEdit && <AiWeeklyButton ctx={ctx} light />}
            {ctx.canEdit && (
              <button className="btn-light" onClick={() => setWeekOpen(true)}>
                <Pencil className="h-4 w-4" /> Atur lembar pekan
              </button>
            )}
            {ctx.canEdit && (
              <button
                className="btn-outline-light"
                disabled={copying}
                onClick={() =>
                  startCopy(async () => {
                    toast.fromResult(await copyPreviousWeekAction(ctx.ownerId, ctx.year, ctx.week));
                    router.refresh();
                  })
                }
                title="Salin agenda yang belum selesai dari pekan lalu"
              >
                {copying ? <Spinner /> : <Copy className="h-4 w-4" />} Salin dari pekan lalu
              </button>
            )}
          </div>
        </div>
      </section>

      {/* evaluasi root */}
      {(sheet?.reviewNote || ctx.canReview) && (
        <section className="card space-y-2 ring-1 ring-amber-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-bold text-navy-900">
              <MessageSquareQuote className="h-5 w-5 text-amber-500" /> Catatan evaluasi pekan
            </p>
            {ctx.canReview && (
              <button
                className="btn-secondary btn-sm"
                onClick={() =>
                  setNoteTarget({
                    kind: "week",
                    ownerId: ctx.ownerId,
                    year: ctx.year,
                    week: ctx.week,
                    title: `${ctx.ownerName} · Pekan ${ctx.week}`,
                    note: sheet?.reviewNote ?? null,
                  })
                }
              >
                <Pencil className="h-3.5 w-3.5" /> {sheet?.reviewNote ? "Ubah evaluasi" : "Tulis evaluasi"}
              </button>
            )}
          </div>
          {sheet?.reviewNote ? (
            <RootNoteBox note={sheet.reviewNote} by={sheet.reviewNoteBy} at={sheet.reviewNoteAt} />
          ) : (
            <p className="text-sm text-navy-400">Belum ada evaluasi untuk pekan ini.</p>
          )}
        </section>
      )}

      {/* tiga pertanyaan */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {JOB_CATEGORIES.filter((c) => c.key !== "OPERASIONAL").map((c) => {
          const n = count(c.key);
          const ok = n >= c.min && n <= c.max;
          return (
            <div key={c.key} className={cn("card space-y-1 p-4!", !ok && "ring-1 ring-amber-200")}>
              <div className="flex items-center justify-between gap-2">
                <Badge tone={TONE[c.key]}>{c.label}</Badge>
                <span className={cn("flex items-center gap-1 text-xs font-bold", ok ? "text-emerald-600" : "text-amber-600")}>
                  {ok ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />} {n} / maks {c.max}
                </span>
              </div>
              <p className="text-sm font-semibold text-navy-900">{c.question}</p>
              <p className="text-xs text-navy-400">
                {n < c.min ? `Isi minimal ${c.min} agenda.` : n > c.max ? `Lebih dari ${c.max} — pertimbangkan untuk dikurangi.` : c.hint}
              </p>
            </div>
          );
        })}
      </section>
      <p className={cn("-mt-3 text-center text-xs", total >= PRACTICAL_TOTAL.min && total <= PRACTICAL_TOTAL.max ? "text-navy-400" : "text-amber-600")}>
        Total agenda utama = {total} (praktisnya {PRACTICAL_TOTAL.min}–{PRACTICAL_TOTAL.max} per pekan). Agenda layak masuk bila lolos uji 3LD: K = dikerjakan,
        S = diselesaikan, N = dinikmati.
      </p>

      {/* daftar agenda per kategori */}
      {JOB_CATEGORIES.map((c) => {
        const list = agendas.filter((a) => a.category === c.key);
        if (!list.length && !ctx.canEdit) return null;
        return (
          <section key={c.key} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-bold text-navy-900">
                <Flag className="h-4 w-4 text-brand-600" /> {c.label}
                <span className="text-sm font-medium text-navy-400">({list.length})</span>
              </h3>
              {ctx.canEdit && (
                <button className="btn-secondary btn-sm" onClick={() => setEditing({ item: null, category: c.key })}>
                  <Plus className="h-3.5 w-3.5" /> {c.key === "OPERASIONAL" ? "Pekerjaan operasional" : `Agenda ${c.short}`}
                </button>
              )}
            </div>
            {list.length ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {list.map((a, i) => (
                  <AgendaCard
                    key={a.id}
                    ctx={ctx}
                    item={a}
                    label={c.key === "OPERASIONAL" ? "Operasional" : `${c.short} ${i + 1}`}
                    linked={dailies.filter((d) => d.weeklyId === a.id)}
                    first={i === 0}
                    last={i === list.length - 1}
                    onEdit={() => setEditing({ item: a, category: a.category })}
                    onRootNote={() => setNoteTarget({ kind: "weekly", id: a.id, title: a.title, note: a.rootNote })}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-navy-200 p-4 text-center text-sm text-navy-400">{c.hint}</p>
            )}
          </section>
        );
      })}
      {!agendas.length && !ctx.canEdit && <EmptyState icon={Target} title="Belum ada agenda pekanan" desc="Admin belum menyusun agenda untuk pekan ini." />}

      {weekOpen && <WeekDialog ctx={ctx} sheet={sheet} onClose={() => setWeekOpen(false)} />}
      {editing && <AgendaDialog ctx={ctx} item={editing.item} category={editing.category} onClose={() => setEditing(null)} />}
      {noteTarget && <RootNoteDialog target={noteTarget} onClose={() => setNoteTarget(null)} />}
    </div>
  );
}

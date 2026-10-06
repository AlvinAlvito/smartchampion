"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CalendarCheck2, Check, Clock, Contact, Gamepad2, MessageCircle, RefreshCw, Save, Send, Sparkles, Target } from "lucide-react";
import { generateDailyAction, generateWeeklyAction, saveGeneratedDailyAction, saveGeneratedWeeklyAction } from "@/app/actions/jobdesk-ai";
import type { GenAgenda, GenDaily, GenResult, GenWeekly, Workload } from "@/lib/jobdesk-ai";
import type { OpsItem, OpsWorkload } from "@/lib/jobdesk-ai-ops";
import { CATEGORY_OF, PRIORITY_LABEL, PRIORITY_TONE, fmtDay, fmtShort, lines } from "@/lib/jobdesk-shared";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/modal";
import { Spinner } from "@/components/form-buttons";
import { useToast } from "@/components/toast";
import { Badge, type Tone } from "@/components/ui";
import type { JobCtx } from "./types";

const nf = (n: number) => n.toLocaleString("id-ID");
const SOURCE: Record<GenDaily["source"], { label: string; tone: Tone }> = {
  lead: { label: "Master Lead", tone: "brand" },
  blast: { label: "Data Blast", tone: "blue" },
  chat: { label: "Chat WA", tone: "green" },
  kelas: { label: "Produk & Materi", tone: "brand" },
  pertemuan: { label: "Pertemuan", tone: "green" },
  tutor: { label: "Tutor", tone: "yellow" },
  games: { label: "Games", tone: "red" },
  lainnya: { label: "Lainnya", tone: "gray" },
};

type AnyWorkload = Workload | OpsWorkload;
const isOps = (w: AnyWorkload): w is OpsWorkload => "kind" in w && w.kind === "ops";

/** Ringkasan data operasional (Admin SmartChampion) */
function OpsSummary({ w }: { w: OpsWorkload }) {
  const first = (l: OpsItem[]) => (l[0] ? ` (mis. ${l[0].nama})` : "");
  const cards = [
    {
      icon: CalendarCheck2,
      title: "Pertemuan",
      items: [
        [`${w.sessions.today}`, `pertemuan hari ini${w.sessions.todayNoLink ? ` · ${w.sessions.todayNoLink} tanpa link` : ""}`],
        [`${w.sessions.next7NoLink}/${w.sessions.next7}`, "7 hari ke depan tanpa link meeting"],
        [`${w.sessions.noAttendance}`, `selesai, belum diabsen${first(w.sessions.noAttendanceList)}`],
        [`${w.sessions.noWorksheet}`, "worksheet belum terbit"],
        [`${w.sessions.noRecording}`, "belum ada rekaman"],
      ],
    },
    {
      icon: BookOpen,
      title: "Kelas & tutor",
      items: [
        [`${w.classes.active}`, "kelas aktif (dibuka/berjalan)"],
        [`${w.classes.noSessions}`, "tanpa jadwal pertemuan"],
        [`${w.classes.noTutor}`, "tanpa tutor"],
        [`${w.classes.noMaterial}`, "tanpa materi"],
        [`${w.classes.needCertificate}`, "peserta belum bersertifikat (kelas selesai)"],
        [`${w.tutors.incomplete}`, "profil tutor belum lengkap"],
      ],
    },
    {
      icon: Gamepad2,
      title: "Games & aktivitas",
      items: [
        [`${w.games.published}`, `games terbit · ${w.games.drafts} draf`],
        [`${w.games.fewQuestions}`, "games soalnya < 10"],
        [`${w.games.noExplanation}`, "soal tanpa pembahasan"],
        [nf(w.activity.today), "aktivitas Anda hari ini"],
        [nf(w.activity.week), `aktivitas pekan ini (lalu ${nf(w.activity.lastWeek)})`],
      ],
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {cards.map((c) => (
        <div key={c.title} className="rounded-2xl bg-navy-50/70 p-3 ring-1 ring-navy-100">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-navy-500">
            <c.icon className="h-3.5 w-3.5 text-brand-600" /> {c.title}
          </p>
          <ul className="space-y-0.5 text-xs text-navy-600">
            {c.items.map(([n, l]) => (
              <li key={l}>
                <b className="text-navy-900">{n}</b> {l}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Ringkasan data yang dianalisis — supaya admin tahu dari mana jobdesk disusun */
function WorkloadSummary({ w: any }: { w: AnyWorkload }) {
  if (isOps(any)) return <OpsSummary w={any} />;
  const w = any;
  const cards = [
    {
      icon: Contact,
      title: "Master Lead",
      items: [
        [`${w.lead.overdue}`, "lewat jadwal follow-up"],
        [`${w.lead.dueToday}`, "follow-up hari ini"],
        [`${w.lead.pending}`, "menunggu bayar"],
        [`${w.lead.paidNoClass}`, "lunas belum masuk kelas"],
        [`${w.lead.neverContacted}`, "baru, belum dikontak"],
        [`${w.lead.paidThisWeek}`, `Paid pekan ini (lalu ${w.lead.paidLastWeek})`],
      ],
    },
    {
      icon: Send,
      title: "Data Blast",
      items: [
        [`${nf(w.blast.thisWeek)}/${nf(w.blast.target)}`, "kontak pekan ini"],
        [nf(w.blast.remaining), `sisa · ${w.blast.daysLeft} hari kerja`],
        [nf(w.blast.perDay), "target per hari"],
        [nf(w.blast.today), "sudah hari ini"],
      ],
    },
    {
      icon: MessageCircle,
      title: "Chat WA",
      items: w.chat.connected
        ? [
            [`${w.chat.waiting}`, "chat menunggu balasan"],
            [`${w.chat.waitingOver24h}`, "menunggu > 24 jam"],
            [`${w.chat.unread}`, "pesan belum dibaca"],
            [`${w.chat.repliedThisWeek}`, "balasan terkirim pekan ini"],
          ]
        : [["–", `WhatsApp ${w.chat.status === "Belum terhubung" ? "belum terhubung" : "tidak tersambung"}`]],
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {cards.map((c) => (
        <div key={c.title} className="rounded-2xl bg-navy-50/70 p-3 ring-1 ring-navy-100">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-navy-500">
            <c.icon className="h-3.5 w-3.5 text-brand-600" /> {c.title}
          </p>
          <ul className="space-y-0.5 text-xs text-navy-600">
            {c.items.map(([n, l]) => (
              <li key={l}>
                <b className="text-navy-900">{n}</b> {l}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Tick({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={cn(
        "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg ring-1 transition",
        on ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-transparent ring-navy-200 hover:ring-brand-400",
      )}
    >
      <Check className="h-4 w-4" />
    </button>
  );
}

/** Generate sekali saat dialog dibuka (+ tombol Generate ulang); hanya respons permintaan terakhir yang dipakai */
function useGenerate<T>(run: () => Promise<GenResult<T, AnyWorkload> | { error: string }>, onNew: () => void) {
  const [res, setRes] = useState<GenResult<T, AnyWorkload> | null>(null);
  const [error, setError] = useState("");
  const [loading, start] = useTransition();
  const lastReq = useRef(0);
  const started = useRef(false);
  const go = useCallback(() => {
    const id = ++lastReq.current;
    setError("");
    start(async () => {
      try {
        const r = await run();
        if (id !== lastReq.current) return; // sudah ada permintaan yang lebih baru
        if ("error" in r) setError(r.error);
        else {
          onNew();
          setRes(r);
        }
      } catch {
        if (id === lastReq.current) setError("Gagal menghubungi server. Coba lagi.");
      }
    });
  }, [run, onNew]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    go();
  }, [go]);
  return { res, error, loading, go };
}

function Loading({ text, ops }: { text: string; ops?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-navy-500">
      <Spinner className="h-8 w-8 text-brand-600" />
      {text}
      <p className="text-xs text-navy-400">{ops ? "Menganalisis pertemuan, kelas, tutor, games & log aktivitas…" : "Menganalisis Master Lead, Data Blast & Chat WA…"}</p>
    </div>
  );
}

function Origin({ byAi, note }: { byAi: boolean; note?: string }) {
  return (
    <p className={cn("rounded-xl px-3 py-2 text-xs", byAi ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700")}>
      {byAi ? "Disusun AI dari data di atas. Periksa, hapus centang yang tidak perlu, lalu simpan." : note}
    </p>
  );
}

/* ======================= Jobdesk harian ======================= */

function DailyDialog({ ctx, date, onClose }: { ctx: JobCtx; date: string; onClose: () => void }) {
  const run = useCallback(() => generateDailyAction(ctx.ownerId, date), [ctx.ownerId, date]);
  const [off, setOff] = useState<Set<number>>(new Set());
  const resetOff = useCallback(() => setOff(new Set()), []);
  const { res, error, loading, go } = useGenerate<GenDaily[]>(run, resetOff);
  const [saving, startSave] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const items = res?.items ?? [];
  const chosen = items.filter((_, i) => !off.has(i));
  const agendaTitle = new Map(res?.workload.jobdesk.agendas.map((a) => [a.id, a.title]) ?? []);

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={Sparkles}
      title="Generate jobdesk harian"
      description={`${fmtDay(date)} · ${ctx.ownerName}`}
      footer={
        <>
          <button type="button" className="btn-ghost mr-auto" onClick={go} disabled={loading || saving}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Generate ulang
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading || saving || !chosen.length}
            onClick={() =>
              startSave(async () => {
                if (toast.fromResult(await saveGeneratedDailyAction(ctx.ownerId, date, chosen))) {
                  router.refresh();
                  onClose();
                }
              })
            }
          >
            {saving ? <Spinner /> : <Save className="h-4 w-4" />} Simpan {chosen.length} jobdesk
          </button>
        </>
      }
    >
      {loading && !res ? (
        <Loading text="Menyusun jobdesk harian…" ops={ctx.ops} />
      ) : error ? (
        <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>
      ) : res ? (
        <div className={cn("space-y-4", loading && "pointer-events-none opacity-50")}>
          <WorkloadSummary w={res.workload} />
          <Origin byAi={res.byAi} note={res.note} />
          {items.length ? (
            <ul className="space-y-2">
              {items.map((t, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex gap-3 rounded-2xl p-3 ring-1 transition",
                    off.has(i) ? "bg-navy-50/40 opacity-60 ring-navy-100" : "bg-white ring-brand-100",
                  )}
                >
                  <Tick
                    on={!off.has(i)}
                    label={`Pilih ${t.title}`}
                    onClick={() => setOff((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set([...s, i])))}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-navy-900">{t.title}</p>
                    {t.notes && <p className="mt-0.5 whitespace-pre-line text-xs text-navy-500">{t.notes}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Badge>
                      <Badge tone={SOURCE[t.source].tone}>{SOURCE[t.source].label}</Badge>
                      {t.dueTime && (
                        <span className="inline-flex items-center gap-1 text-xs text-navy-500">
                          <Clock className="h-3 w-3" /> {t.dueTime}
                        </span>
                      )}
                      {t.weeklyId && agendaTitle.get(t.weeklyId) && (
                        <span className="inline-flex items-center gap-1 text-xs text-navy-500">
                          <Target className="h-3 w-3" /> {agendaTitle.get(t.weeklyId)}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
              Tidak ada pekerjaan baru dari data — semua sudah tercatat di jobdesk hari ini.
            </p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

export function AiDailyButton({ ctx, date }: { ctx: JobCtx; date: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AiButton onClick={() => setOpen(true)} label="Generate AI" title={ctx.ops ? "Susun jobdesk operasional hari ini dari data pertemuan, kelas, tutor & games" : "Susun jobdesk hari ini dari Master Lead, Data Blast & Chat WA"} />
      {open && <DailyDialog ctx={ctx} date={date} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ======================= Agenda pekanan ======================= */

function WeeklyDialog({ ctx, onClose }: { ctx: JobCtx; onClose: () => void }) {
  const run = useCallback(() => generateWeeklyAction(ctx.ownerId, ctx.year, ctx.week, ctx.today), [ctx.ownerId, ctx.year, ctx.week, ctx.today]);
  const [off, setOff] = useState<Set<number>>(new Set());
  const resetOff = useCallback(() => setOff(new Set()), []);
  const { res, error, loading, go } = useGenerate<GenWeekly>(run, resetOff);
  const [saving, startSave] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const agendas: GenAgenda[] = res?.items.agendas ?? [];
  const chosen = agendas.filter((_, i) => !off.has(i));

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={Sparkles}
      title={`Generate agenda pekanan · Pekan ${ctx.week}`}
      description={ctx.ownerName}
      footer={
        <>
          <button type="button" className="btn-ghost mr-auto" onClick={go} disabled={loading || saving}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Generate ulang
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading || saving || !res || (!chosen.length && !res.items.focus.length)}
            onClick={() =>
              startSave(async () => {
                if (toast.fromResult(await saveGeneratedWeeklyAction(ctx.ownerId, ctx.year, ctx.week, { focus: res!.items.focus, agendas: chosen }))) {
                  router.refresh();
                  onClose();
                }
              })
            }
          >
            {saving ? <Spinner /> : <Save className="h-4 w-4" />} Simpan {chosen.length} agenda
          </button>
        </>
      }
    >
      {loading && !res ? (
        <Loading text="Menyusun agenda pekanan…" ops={ctx.ops} />
      ) : error ? (
        <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>
      ) : res ? (
        <div className={cn("space-y-4", loading && "pointer-events-none opacity-50")}>
          <WorkloadSummary w={res.workload} />
          <Origin byAi={res.byAi} note={res.note} />
          {res.items.focus.length > 0 && (
            <div className="rounded-2xl bg-hero p-4 text-white">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-200">Fokus pekan (diisi bila masih kosong)</p>
              <ul className="mt-1 space-y-0.5 text-sm">
                {res.items.focus.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            </div>
          )}
          <ul className="space-y-2">
            {agendas.map((a, i) => (
              <li
                key={i}
                className={cn(
                  "flex gap-3 rounded-2xl p-3 ring-1 transition",
                  off.has(i) ? "bg-navy-50/40 opacity-60 ring-navy-100" : "bg-white ring-brand-100",
                )}
              >
                <Tick
                  on={!off.has(i)}
                  label={`Pilih ${a.title}`}
                  onClick={() => setOff((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set([...s, i])))}
                />
                <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={CATEGORY_OF[a.category].tone as Tone}>{CATEGORY_OF[a.category].short}</Badge>
                    <span className="text-xs text-navy-400">tenggat {fmtShort(a.dueDate)}</span>
                  </div>
                  <p className="font-semibold text-navy-900">{a.title}</p>
                  {a.objective && <p className="text-xs text-navy-500">{a.objective}</p>}
                  <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                    {a.doneMeasure && (
                      <div>
                        <dt className="font-semibold text-navy-500">Ukuran selesai</dt>
                        <dd className="text-navy-700">{a.doneMeasure}</dd>
                      </div>
                    )}
                    {a.leadMeasure && (
                      <div>
                        <dt className="font-semibold text-navy-500">Lead measure</dt>
                        <dd className="text-navy-700">{a.leadMeasure}</dd>
                      </div>
                    )}
                  </dl>
                  {lines(a.steps).length > 0 && (
                    <ol className="list-inside list-decimal text-xs text-navy-600">
                      {lines(a.steps).map((st) => (
                        <li key={st}>{st}</li>
                      ))}
                    </ol>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-navy-400">Jawaban uji 3LD ikut terisi sebagai usulan; centang uji 3LD tetap dilakukan admin di tiap agenda.</p>
        </div>
      ) : null}
    </Modal>
  );
}

export function AiWeeklyButton({ ctx, light = false }: { ctx: JobCtx; light?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AiButton onClick={() => setOpen(true)} label="Generate agenda AI" title={ctx.ops ? "Susun agenda pekanan operasional dari data pertemuan, kelas, tutor & games" : "Susun agenda pekanan dari Master Lead, Data Blast & Chat WA"} light={light} />
      {open && <WeeklyDialog ctx={ctx} onClose={() => setOpen(false)} />}
    </>
  );
}

function AiButton({ onClick, label, title, light = false }: { onClick: () => void; label: string; title: string; light?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-sm font-semibold shadow-md transition hover:brightness-110",
        light ? "bg-sun-400 text-brand-900 shadow-sun-500/30" : "bg-linear-to-r from-brand-500 to-brand-700 text-white shadow-brand-500/25",
      )}
    >
      <Sparkles className="h-4 w-4" /> {label}
    </button>
  );
}

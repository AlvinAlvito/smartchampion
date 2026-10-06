import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck2, ChevronLeft, ChevronRight, ClipboardList, Download, ListTodo, NotebookPen, Target, TriangleAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { jobdeskAccess, jobdeskRoleTitle, loadJobWeek } from "@/lib/jobdesk";
import { ROLE_LABEL } from "@/lib/constants";
import { MAIN_CATEGORIES, dateToYmd, fmtLong, isYmd, isoWeekOf, nowTimeWib, periodText, shiftWeek, todayWib, weekMonday } from "@/lib/jobdesk-shared";
import { cn } from "@/lib/utils";
import { EmptyState, PageTitle, StatCard } from "@/components/ui";
import { AdminPicker } from "./admin-picker";
import { DailyPanel } from "./daily-panel";
import { WeeklyPanel } from "./weekly-panel";
import { NotesPanel } from "./notes-panel";
import type { DailyItem, JobCtx, NoteItem, RoutineItem, WeekSheet, WeeklyItem } from "./types";

export const metadata = { title: "Jobdesk" };
export const dynamic = "force-dynamic";

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const ymd = (d: Date | null) => (d ? dateToYmd(d) : null);

export default async function JobdeskPage({ searchParams }: PageProps<"/admin/jobdesk">) {
  const session = await requirePanel();
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const access = await jobdeskAccess(session, Number(get("user")) || null);
  if (!access) redirect("/admin");

  const today = todayWib();
  const now = isoWeekOf(today);
  const year = Number(get("year")) || now.year;
  const weekRaw = Number(get("week")) || now.week;
  const { year: y, week } = weekRaw >= 1 && weekRaw <= 53 && year >= 2020 && year <= 2100 ? isoWeekOf(weekMonday(year, weekRaw)) : now;
  const tab = ["pekanan", "catatan"].includes(get("tab")) ? get("tab") : "harian";

  const roleTitle = jobdeskRoleTitle(access.ownerRole);
  const title = (
    <PageTitle
      icon={ClipboardList}
      eyebrow={roleTitle}
      title="Jobdesk"
      subtitle={
        access.ownerRole === "SMARTCHAMPION"
          ? "Checklist jobdesk operasional harian (kelas, pertemuan, materi, worksheet, tutor, games), agenda pekanan, catatan, dan unduhan Agenda Pekanan."
          : "Checklist jobdesk harian, agenda pekanan (Prioritas • Sistem • People & Kinerja, uji 3LD), catatan, dan unduhan Agenda Pekanan."
      }
    />
  );
  if (!access.ownerId) {
    return (
      <>
        {title}
        <EmptyState icon={ClipboardList} title="Belum ada admin" desc="Jobdesk dipakai oleh akun Admin Pelatihan & Admin SmartChampion. Tambahkan akun di menu Pengguna." />
      </>
    );
  }

  const data = await loadJobWeek(access.ownerId, y, week);
  const notesRaw = await prisma.jobNote.findMany({
    where: { userId: access.ownerId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: { author: { select: { name: true, role: true } } },
  });

  const ctx: JobCtx = {
    ownerId: access.ownerId,
    ownerName: access.ownerName,
    roleTitle,
    ops: access.ownerRole === "SMARTCHAMPION",
    year: y,
    week,
    dates: data.dates,
    today,
    nowTime: nowTimeWib(),
    canEdit: access.canEdit,
    canReview: access.canReview,
    isRoot: session.role === "ROOT",
    viewerId: session.userId,
  };
  const toDaily = (d: (typeof data.dailies)[number]): DailyItem => ({
    id: d.id,
    date: dateToYmd(d.date),
    title: d.title,
    notes: d.notes,
    priority: d.priority,
    dueTime: d.dueTime,
    weeklyId: d.weeklyId,
    routineId: d.routineId,
    done: d.done,
    rootNote: d.rootNote,
    rootNoteBy: d.rootNoteBy,
    rootNoteAt: iso(d.rootNoteAt),
  });
  const dailies = data.dailies.map(toDaily);
  const overdue = data.overdue.map(toDaily);
  const agendas: WeeklyItem[] = (data.plan?.agendas ?? []).map((a) => ({
    id: a.id,
    category: a.category,
    title: a.title,
    objective: a.objective,
    doneMeasure: a.doneMeasure,
    leadMeasure: a.leadMeasure,
    pic: a.pic,
    startDate: ymd(a.startDate),
    dueDate: ymd(a.dueDate),
    ld1: a.ld1,
    ld2: a.ld2,
    ld3: a.ld3,
    ld1Ok: a.ld1Ok,
    ld2Ok: a.ld2Ok,
    ld3Ok: a.ld3Ok,
    steps: a.steps,
    beneficiaries: a.beneficiaries,
    opsStatus: a.opsStatus,
    opsReason: a.opsReason,
    opsHandling: a.opsHandling,
    done: a.done,
    doneAt: iso(a.doneAt),
    rootNote: a.rootNote,
    rootNoteBy: a.rootNoteBy,
    rootNoteAt: iso(a.rootNoteAt),
  }));
  const sheet: WeekSheet | null = data.plan
    ? {
        roleTitle: data.plan.roleTitle,
        focus: data.plan.focus,
        context: data.plan.context,
        conclusion: data.plan.conclusion,
        reviewNote: data.plan.reviewNote,
        reviewNoteBy: data.plan.reviewNoteBy,
        reviewNoteAt: iso(data.plan.reviewNoteAt),
      }
    : null;
  const routines: RoutineItem[] = data.routines.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    priority: r.priority,
    dueTime: r.dueTime,
    weekdays: r.weekdays.split(",").map(Number),
    isActive: r.isActive,
  }));
  const notes: NoteItem[] = notesRaw.map((n) => ({
    id: n.id,
    content: n.content,
    date: ymd(n.date),
    pinned: n.pinned,
    createdAt: n.createdAt.toISOString(),
    authorName: n.author?.name ?? "Akun dihapus",
    authorRole: n.author ? (ROLE_LABEL[n.author.role] ?? n.author.role) : "",
    mine: n.authorId === session.userId,
  }));

  // ringkasan
  const todayItems = dailies.filter((d) => d.date === today);
  const mainAgendas = agendas.filter((a) => MAIN_CATEGORIES.includes(a.category));
  const doneWeekDaily = dailies.filter((d) => d.done).length;
  const selectedDate = isYmd(get("date")) && data.dates.includes(get("date")) ? get("date") : data.dates.includes(today) ? today : data.dates[0];

  const params = (over: Record<string, string | number | null>) => {
    const q = new URLSearchParams();
    const base: Record<string, string | number | null> = {
      user: access.admins.length ? access.ownerId : null,
      year: y,
      week,
      tab: tab === "harian" ? null : tab,
    };
    for (const [k, v] of Object.entries({ ...base, ...over })) if (v != null && v !== "") q.set(k, String(v));
    const s = q.toString();
    return s ? `/admin/jobdesk?${s}` : "/admin/jobdesk";
  };
  const prev = shiftWeek(y, week, -1);
  const next = shiftWeek(y, week, 1);
  const isThisWeek = y === now.year && week === now.week;

  return (
    <>
      {title}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {access.admins.length > 0 && <AdminPicker admins={access.admins} value={access.ownerId} hrefBase={params({ user: null, date: null })} />}
        <div className="flex items-center gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-navy-100">
          <Link href={params({ year: prev.year, week: prev.week, date: null })} className="btn-icon h-9 w-9" aria-label="Pekan sebelumnya">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 px-2 text-center">
            <p className="text-sm font-extrabold text-navy-900">
              Pekan {week} <span className="font-medium text-navy-400">· {y}</span>
            </p>
            <p className="text-[11px] text-navy-400">{periodText(y, week)}</p>
          </div>
          <Link href={params({ year: next.year, week: next.week, date: null })} className="btn-icon h-9 w-9" aria-label="Pekan berikutnya">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {!isThisWeek && (
          <Link href={params({ year: null, week: null, date: null })} className="btn-ghost btn-sm">
            Ke pekan ini
          </Link>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {access.canDownload && (
            <a
              href={`/api/admin/jobdesk/agenda?${new URLSearchParams({ user: String(access.ownerId), year: String(y), week: String(week) })}`}
              className="btn-primary"
            >
              <Download className="h-4 w-4" /> Unduh Agenda Pekanan
            </a>
          )}
        </div>
      </div>

      <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jobdesk hari ini"
          value={isThisWeek ? `${todayItems.filter((d) => d.done).length}/${todayItems.length}` : "-"}
          hint={isThisWeek ? fmtLong(today) : "pekan lain"}
          icon={ListTodo}
          tone="brand"
        />
        <StatCard
          label="Harian pekan ini"
          value={`${doneWeekDaily}/${dailies.length}`}
          hint={dailies.length ? `${Math.round((doneWeekDaily / dailies.length) * 100)}% terlaksana` : "belum ada"}
          icon={CalendarCheck2}
          tone="green"
        />
        <StatCard
          label="Agenda pekanan"
          value={`${mainAgendas.filter((a) => a.done).length}/${mainAgendas.length}`}
          hint="agenda utama selesai"
          icon={Target}
          tone="navy"
        />
        <StatCard label="Tertunda" value={overdue.length} hint="belum dicentang (14 hari)" icon={TriangleAlert} tone={overdue.length ? "red" : "gray"} />
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-sm ring-1 ring-navy-100 sm:inline-flex">
        {[
          { k: "harian", label: "Jobdesk Harian", icon: ListTodo },
          { k: "pekanan", label: "Agenda Pekanan", icon: Target },
          { k: "catatan", label: `Catatan (${notes.length})`, icon: NotebookPen },
        ].map((t) => (
          <Link
            key={t.k}
            href={params({ tab: t.k === "harian" ? null : t.k, date: t.k === "harian" ? selectedDate : null })}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition",
              tab === t.k ? "bg-brand-600 text-white shadow" : "text-navy-500 hover:bg-navy-50",
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </Link>
        ))}
      </div>

      {tab === "harian" && (
        <DailyPanel
          key={`${access.ownerId}|${y}|${week}`}
          ctx={ctx}
          selectedDate={selectedDate}
          dailies={dailies}
          overdue={overdue}
          agendas={agendas}
          routines={routines}
          dayHref={Object.fromEntries(data.dates.map((d) => [d, params({ date: d })]))}
        />
      )}
      {tab === "pekanan" && <WeeklyPanel key={`${access.ownerId}|${y}|${week}`} ctx={ctx} sheet={sheet} agendas={agendas} dailies={dailies} />}
      {tab === "catatan" && <NotesPanel ctx={ctx} notes={notes} />}
    </>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { canEditJobdesk } from "@/lib/jobdesk";
import { isoWeekOf, isTime, isYmd, weekDates, ymdToDate, type JobCategoryKey, type JobPriorityKey } from "@/lib/jobdesk-shared";
import { collectWorkload, generateDaily, generateWeekly, type GenAgenda, type GenDaily, type GenResult, type GenWeekly, type Workload } from "@/lib/jobdesk-ai";
import { collectOpsWorkload, generateOpsDaily, generateOpsWeekly, type OpsWorkload } from "@/lib/jobdesk-ai-ops";
import { limitAction } from "@/lib/security";

const NO_ACCESS = { error: "Anda tidak berhak mengubah jobdesk ini." };
const PRIORITIES: JobPriorityKey[] = ["TINGGI", "SEDANG", "RENDAH"];
const CATS: JobCategoryKey[] = ["PRIORITAS", "SISTEM", "PEOPLE", "OPERASIONAL"];
const s = (v: unknown, n: number) =>
  String(v ?? "")
    .trim()
    .slice(0, n);

async function guard(ownerId: number) {
  const session = await requirePanel();
  if (!(await canEditJobdesk(session, Number(ownerId) || 0))) return { error: NO_ACCESS.error };
  const limited = await limitAction("jobdesk-ai", session.userId, 30, 10 * 60_000);
  return limited ? { error: limited } : null;
}

/** Jobdesk operasional (Admin SmartChampion) atau sales (Admin Pelatihan) — ditentukan dari peran pemilik jobdesk */
const isOpsOwner = async (ownerId: number) => (await prisma.user.findUnique({ where: { id: Number(ownerId) || 0 }, select: { role: true } }))?.role === "SMARTCHAMPION";

/**
 * Pratinjau jobdesk harian (belum disimpan): Admin Pelatihan dari Master Lead, Data Blast & Chat WA;
 * Admin SmartChampion dari kesiapan pertemuan, kelas, tutor & games.
 */
export async function generateDailyAction(ownerId: number, date: string): Promise<GenResult<GenDaily[], Workload | OpsWorkload> | { error: string }> {
  const denied = await guard(ownerId);
  if (denied) return denied;
  if (!isYmd(date)) return { error: "Tanggal tidak valid." };
  const { year, week } = isoWeekOf(date);
  if (await isOpsOwner(ownerId)) return generateOpsDaily(await collectOpsWorkload(Number(ownerId), date, year, week));
  return generateDaily(await collectWorkload(Number(ownerId), date, year, week));
}

/** Pratinjau agenda pekanan (belum disimpan) */
export async function generateWeeklyAction(ownerId: number, year: number, week: number, today: string): Promise<GenResult<GenWeekly, Workload | OpsWorkload> | { error: string }> {
  const denied = await guard(ownerId);
  if (denied) return denied;
  const dates = weekDates(Number(year), Number(week));
  // dasar perhitungan: hari ini bila di dalam pekan, selain itu Senin pekan tsb
  const ref = isYmd(today) && today >= dates[0] && today <= dates[6] ? today : dates[0];
  if (await isOpsOwner(ownerId)) return generateOpsWeekly(await collectOpsWorkload(Number(ownerId), ref, Number(year), Number(week)));
  return generateWeekly(await collectWorkload(Number(ownerId), ref, Number(year), Number(week)));
}

export async function saveGeneratedDailyAction(ownerId: number, date: string, tasks: GenDaily[]): Promise<ActionResult> {
  const denied = await guard(ownerId);
  if (denied) return denied;
  if (!isYmd(date)) return { error: "Tanggal tidak valid." };
  const owner = Number(ownerId);
  const [existing, agendas, max] = await Promise.all([
    prisma.jobDaily.findMany({ where: { userId: owner, date: ymdToDate(date) }, select: { title: true } }),
    prisma.jobWeekly.findMany({ where: { week: { userId: owner } }, select: { id: true } }),
    prisma.jobDaily.aggregate({ where: { userId: owner, date: ymdToDate(date) }, _max: { order: true } }),
  ]);
  const seen = new Set(existing.map((e) => e.title.toLowerCase()));
  const agendaIds = new Set(agendas.map((a) => a.id));
  const rows = (Array.isArray(tasks) ? tasks : [])
    .slice(0, 15)
    .map((t) => ({ title: s(t.title, 200), notes: s(t.notes, 1000), priority: t.priority, dueTime: s(t.dueTime, 5), weeklyId: Number(t.weeklyId) || null }))
    .filter((t) => t.title.length >= 2 && !seen.has(t.title.toLowerCase()) && (seen.add(t.title.toLowerCase()), true));
  if (!rows.length) return { error: "Tidak ada jobdesk baru untuk disimpan (semua sudah ada di hari ini)." };
  let order = (max._max.order ?? 0) + 1;
  await prisma.jobDaily.createMany({
    data: rows.map((t) => ({
      userId: owner,
      date: ymdToDate(date),
      title: t.title,
      notes: t.notes ? `${t.notes}\n(dibuat dengan Generate AI)` : "(dibuat dengan Generate AI)",
      priority: PRIORITIES.includes(t.priority) ? t.priority : "SEDANG",
      dueTime: isTime(t.dueTime) ? t.dueTime : null,
      weeklyId: t.weeklyId && agendaIds.has(t.weeklyId) ? t.weeklyId : null,
      order: order++,
    })),
  });
  revalidatePath("/admin/jobdesk");
  return { ok: `${rows.length} jobdesk ditambahkan. Kerjakan & centang yang sudah selesai.` };
}

export async function saveGeneratedWeeklyAction(
  ownerId: number,
  year: number,
  week: number,
  data: { focus: string[]; agendas: GenAgenda[] },
): Promise<ActionResult> {
  const denied = await guard(ownerId);
  if (denied) return denied;
  const owner = Number(ownerId);
  const y = Number(year);
  const wk = Number(week);
  if (!(y >= 2020 && y <= 2100 && wk >= 1 && wk <= 53)) return { error: "Pekan tidak valid." };
  const dates = weekDates(y, wk);
  const plan = await prisma.jobWeek.upsert({
    where: { userId_year_week: { userId: owner, year: y, week: wk } },
    create: { userId: owner, year: y, week: wk },
    update: {},
    select: { id: true, focus: true, agendas: { select: { title: true, order: true } } },
  });
  const seen = new Set(plan.agendas.map((a) => a.title.toLowerCase()));
  const agendas = (Array.isArray(data?.agendas) ? data.agendas : [])
    .slice(0, 10)
    .filter((a) => s(a.title, 200).length >= 3 && !seen.has(s(a.title, 200).toLowerCase()) && (seen.add(s(a.title, 200).toLowerCase()), true));
  const focus = (Array.isArray(data?.focus) ? data.focus : [])
    .map((f) => s(f, 160))
    .filter(Boolean)
    .slice(0, 4);
  if (!agendas.length && !focus.length) return { error: "Tidak ada agenda baru untuk disimpan." };
  let order = Math.max(0, ...plan.agendas.map((a) => a.order)) + 1;
  const due = (d: string) => (isYmd(d) && d >= dates[0] && d <= dates[6] ? ymdToDate(d) : ymdToDate(dates[4]));
  await prisma.$transaction([
    // fokus pekan hanya diisi bila masih kosong (tidak menimpa tulisan admin)
    ...(focus.length && !plan.focus?.trim() ? [prisma.jobWeek.update({ where: { id: plan.id }, data: { focus: focus.join("\n") } })] : []),
    ...agendas.map((a) =>
      prisma.jobWeekly.create({
        data: {
          weekId: plan.id,
          category: CATS.includes(a.category) ? a.category : "OPERASIONAL",
          title: s(a.title, 200),
          objective: s(a.objective, 300) || null,
          doneMeasure: s(a.doneMeasure, 2000) || null,
          leadMeasure: s(a.leadMeasure, 2000) || null,
          steps: s(a.steps, 3000) || null,
          ld1: s(a.ld1, 1000) || null,
          ld2: s(a.ld2, 1000) || null,
          ld3: s(a.ld3, 1000) || null,
          // AI hanya mengusulkan jawaban 3LD; admin yang mencentang uji 3LD
          beneficiaries: s(a.beneficiaries, 300) || null,
          startDate: ymdToDate(dates[0]),
          dueDate: due(a.dueDate),
          order: order++,
        },
      }),
    ),
  ]);
  revalidatePath("/admin/jobdesk");
  return {
    ok: `${agendas.length} agenda pekanan ditambahkan${focus.length && !plan.focus?.trim() ? " + fokus pekan" : ""}. Periksa & centang uji 3LD tiap agenda.`,
  };
}

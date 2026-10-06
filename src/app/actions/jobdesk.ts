"use server";

import { revalidatePath } from "next/cache";
import type { JobCategory, JobPriority } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePanel, requireRoot } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { canEditJobdesk } from "@/lib/jobdesk";
import { isTime, isYmd, shiftWeek, ymdToDate, type JobCategoryKey, type JobPriorityKey } from "@/lib/jobdesk-shared";
import { optInt, str } from "@/lib/utils";

const CATEGORIES: JobCategoryKey[] = ["PRIORITAS", "SISTEM", "PEOPLE", "OPERASIONAL"];
const PRIORITIES: JobPriorityKey[] = ["TINGGI", "SEDANG", "RENDAH"];
const NO_ACCESS: ActionResult = { error: "Anda tidak berhak mengubah jobdesk ini." };

const revalidate = () => revalidatePath("/admin/jobdesk");
const text = (form: FormData, key: string, max = 5000) => str(form, key).slice(0, max) || null;
const validWeek = (year: number, week: number) => Number.isInteger(year) && year >= 2020 && year <= 2100 && Number.isInteger(week) && week >= 1 && week <= 53;

/** Pastikan lembar pekan ada (dibuat otomatis saat agenda pertama ditambahkan) */
async function ensureWeek(userId: number, year: number, week: number) {
  return prisma.jobWeek.upsert({ where: { userId_year_week: { userId, year, week } }, create: { userId, year, week }, update: {}, select: { id: true } });
}

/* ======================= Daily jobdesk ======================= */

export async function saveDailyAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const session = await requirePanel();
  const id = optInt(form, "id");
  const existing = id ? await prisma.jobDaily.findUnique({ where: { id }, select: { userId: true, routineId: true, date: true } }) : null;
  if (id && !existing) return { error: "Jobdesk tidak ditemukan." };
  const ownerId = existing?.userId ?? optInt(form, "ownerId") ?? 0;
  if (!(await canEditJobdesk(session, ownerId))) return NO_ACCESS;

  const title = str(form, "title").slice(0, 200);
  const date = str(form, "date");
  const priority = str(form, "priority") as JobPriorityKey;
  const dueTime = str(form, "dueTime");
  const fe: Record<string, string[]> = {};
  if (title.length < 2) fe.title = ["Tulis jobdesk-nya (min. 2 karakter)."];
  if (!isYmd(date)) fe.date = ["Pilih tanggal."];
  if (!PRIORITIES.includes(priority)) fe.priority = ["Pilih prioritas."];
  if (dueTime && !isTime(dueTime)) fe.dueTime = ["Format jam HH:MM."];
  if (Object.keys(fe).length) return { fieldErrors: fe };

  // tautan ke agenda pekanan harus milik admin yang sama
  let weeklyId = optInt(form, "weeklyId") ?? null;
  if (weeklyId && !(await prisma.jobWeekly.count({ where: { id: weeklyId, week: { userId: ownerId } } }))) weeklyId = null;

  const data = { title, notes: text(form, "notes"), priority: priority as JobPriority, dueTime: dueTime || null, weeklyId };
  if (id) {
    // baris dari rutin tetap di tanggalnya (unik per rutin + tanggal)
    const moveDate = existing!.routineId ? {} : { date: ymdToDate(date) };
    await prisma.jobDaily.update({ where: { id }, data: { ...data, ...moveDate } });
  } else {
    await prisma.jobDaily.create({ data: { ...data, userId: ownerId, date: ymdToDate(date) } });
  }
  revalidate();
  return { ok: id ? "Jobdesk harian diperbarui." : "Jobdesk harian ditambahkan." };
}

export async function toggleDailyAction(id: number, done: boolean): Promise<ActionResult> {
  const session = await requirePanel();
  const d = await prisma.jobDaily.findUnique({ where: { id: Number(id) || 0 }, select: { userId: true } });
  if (!d) return { error: "Jobdesk tidak ditemukan." };
  if (!(await canEditJobdesk(session, d.userId))) return NO_ACCESS;
  await prisma.jobDaily.update({ where: { id: Number(id) }, data: { done: !!done, doneAt: done ? new Date() : null } });
  revalidate();
  return { ok: "" };
}

export async function deleteDailyAction(id: number): Promise<ActionResult> {
  const session = await requirePanel();
  const d = await prisma.jobDaily.findUnique({ where: { id: Number(id) || 0 }, select: { userId: true, title: true } });
  if (!d) return { error: "Jobdesk tidak ditemukan." };
  if (!(await canEditJobdesk(session, d.userId))) return NO_ACCESS;
  await prisma.jobDaily.delete({ where: { id: Number(id) } });
  revalidate();
  return { ok: `"${d.title}" dihapus.` };
}

/** Pindahkan jobdesk tertunda ke tanggal lain (mis. hari ini) */
export async function moveDailyAction(id: number, toDate: string): Promise<ActionResult> {
  const session = await requirePanel();
  if (!isYmd(toDate)) return { error: "Tanggal tidak valid." };
  const d = await prisma.jobDaily.findUnique({ where: { id: Number(id) || 0 }, select: { userId: true, routineId: true } });
  if (!d) return { error: "Jobdesk tidak ditemukan." };
  if (!(await canEditJobdesk(session, d.userId))) return NO_ACCESS;
  if (d.routineId) return { error: "Jobdesk rutin tidak bisa dipindah — centang atau biarkan sebagai catatan tertunda." };
  await prisma.jobDaily.update({ where: { id: Number(id) }, data: { date: ymdToDate(toDate) } });
  revalidate();
  return { ok: "Jobdesk dipindahkan." };
}

/* ======================= Rutin harian ======================= */

export async function saveRoutineAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const session = await requirePanel();
  const id = optInt(form, "id");
  const existing = id ? await prisma.jobRoutine.findUnique({ where: { id }, select: { userId: true } }) : null;
  if (id && !existing) return { error: "Rutin tidak ditemukan." };
  const ownerId = existing?.userId ?? optInt(form, "ownerId") ?? 0;
  if (!(await canEditJobdesk(session, ownerId))) return NO_ACCESS;

  const title = str(form, "title").slice(0, 200);
  const priority = str(form, "priority") as JobPriorityKey;
  const dueTime = str(form, "dueTime");
  const days = [
    ...new Set(
      form
        .getAll("weekdays")
        .map(Number)
        .filter((n) => n >= 1 && n <= 7),
    ),
  ].sort();
  const fe: Record<string, string[]> = {};
  if (title.length < 2) fe.title = ["Tulis nama rutin (min. 2 karakter)."];
  if (!PRIORITIES.includes(priority)) fe.priority = ["Pilih prioritas."];
  if (dueTime && !isTime(dueTime)) fe.dueTime = ["Format jam HH:MM."];
  if (!days.length) fe.weekdays = ["Pilih minimal satu hari."];
  if (Object.keys(fe).length) return { fieldErrors: fe };

  const data = { title, notes: text(form, "notes"), priority: priority as JobPriority, dueTime: dueTime || null, weekdays: days.join(",") };
  if (id) {
    await prisma.jobRoutine.update({ where: { id }, data });
    await syncRoutineFuture(id);
  } else {
    const max = await prisma.jobRoutine.aggregate({ where: { userId: ownerId }, _max: { order: true } });
    await prisma.jobRoutine.create({ data: { ...data, userId: ownerId, order: (max._max.order ?? 0) + 1 } });
  }
  revalidate();
  return { ok: id ? "Rutin diperbarui (berlaku mulai hari ini)." : "Rutin ditambahkan — otomatis muncul di checklist harian." };
}

/** Rutin diubah/dinonaktifkan → sesuaikan baris mendatang yang belum dicentang (riwayat lama tidak diubah) */
async function syncRoutineFuture(routineId: number) {
  const r = await prisma.jobRoutine.findUnique({ where: { id: routineId } });
  if (!r) return;
  const today = new Date(Date.now() + 7 * 3600_000);
  today.setUTCHours(0, 0, 0, 0);
  const future = await prisma.jobDaily.findMany({ where: { routineId, done: false, date: { gte: today } }, select: { id: true, date: true } });
  const days = r.weekdays.split(",").map(Number);
  const drop = future.filter((f) => !r.isActive || !days.includes(((f.date.getUTCDay() + 6) % 7) + 1)).map((f) => f.id);
  if (drop.length) await prisma.jobDaily.deleteMany({ where: { id: { in: drop } } });
  await prisma.jobDaily.updateMany({
    where: { routineId, done: false, date: { gte: today } },
    data: { title: r.title, notes: r.notes, priority: r.priority, dueTime: r.dueTime },
  });
}

export async function toggleRoutineAction(id: number): Promise<ActionResult> {
  const session = await requirePanel();
  const r = await prisma.jobRoutine.findUnique({ where: { id: Number(id) || 0 }, select: { userId: true, isActive: true, title: true } });
  if (!r) return { error: "Rutin tidak ditemukan." };
  if (!(await canEditJobdesk(session, r.userId))) return NO_ACCESS;
  await prisma.jobRoutine.update({ where: { id: Number(id) }, data: { isActive: !r.isActive } });
  await syncRoutineFuture(Number(id));
  revalidate();
  return { ok: r.isActive ? `Rutin "${r.title}" dijeda.` : `Rutin "${r.title}" aktif kembali.` };
}

export async function deleteRoutineAction(id: number): Promise<ActionResult> {
  const session = await requirePanel();
  const r = await prisma.jobRoutine.findUnique({ where: { id: Number(id) || 0 }, select: { userId: true, title: true } });
  if (!r) return { error: "Rutin tidak ditemukan." };
  if (!(await canEditJobdesk(session, r.userId))) return NO_ACCESS;
  const today = new Date(Date.now() + 7 * 3600_000);
  today.setUTCHours(0, 0, 0, 0);
  // baris mendatang yang belum dikerjakan ikut dihapus; riwayat tetap (routineId jadi null)
  await prisma.jobDaily.deleteMany({ where: { routineId: Number(id), done: false, date: { gte: today } } });
  await prisma.jobRoutine.delete({ where: { id: Number(id) } });
  revalidate();
  return { ok: `Rutin "${r.title}" dihapus. Riwayat yang sudah lewat tetap tersimpan.` };
}

/* ======================= Lembar pekan ======================= */

export async function saveWeekAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const session = await requirePanel();
  const ownerId = optInt(form, "ownerId") ?? 0;
  const year = optInt(form, "year") ?? 0;
  const week = optInt(form, "week") ?? 0;
  if (!validWeek(year, week)) return { error: "Pekan tidak valid." };
  if (!(await canEditJobdesk(session, ownerId))) return NO_ACCESS;
  const data = { roleTitle: text(form, "roleTitle", 200), focus: text(form, "focus"), context: text(form, "context"), conclusion: text(form, "conclusion") };
  await prisma.jobWeek.upsert({ where: { userId_year_week: { userId: ownerId, year, week } }, create: { userId: ownerId, year, week, ...data }, update: data });
  revalidate();
  return { ok: "Lembar pekan disimpan." };
}

/* ======================= Weekly jobdesk (agenda pekanan) ======================= */

export async function saveWeeklyAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const session = await requirePanel();
  const id = optInt(form, "id");
  const existing = id ? await prisma.jobWeekly.findUnique({ where: { id }, select: { week: { select: { userId: true } } } }) : null;
  if (id && !existing) return { error: "Agenda tidak ditemukan." };
  const ownerId = existing?.week.userId ?? optInt(form, "ownerId") ?? 0;
  if (!(await canEditJobdesk(session, ownerId))) return NO_ACCESS;

  const category = str(form, "category") as JobCategoryKey;
  const title = str(form, "title").slice(0, 200);
  const startDate = str(form, "startDate");
  const dueDate = str(form, "dueDate");
  const fe: Record<string, string[]> = {};
  if (!CATEGORIES.includes(category)) fe.category = ["Pilih kategori."];
  if (title.length < 3) fe.title = ["Tulis agendanya (min. 3 karakter)."];
  if (startDate && !isYmd(startDate)) fe.startDate = ["Tanggal tidak valid."];
  if (dueDate && !isYmd(dueDate)) fe.dueDate = ["Tanggal tidak valid."];
  if (startDate && dueDate && startDate > dueDate) fe.startDate = ["Tanggal mulai harus sebelum tenggat."];
  if (Object.keys(fe).length) return { fieldErrors: fe };

  const data = {
    category: category as JobCategory,
    title,
    objective: text(form, "objective", 300),
    doneMeasure: text(form, "doneMeasure"),
    leadMeasure: text(form, "leadMeasure"),
    pic: text(form, "pic", 120),
    startDate: startDate ? ymdToDate(startDate) : null,
    dueDate: dueDate ? ymdToDate(dueDate) : null,
    ld1: text(form, "ld1"),
    ld2: text(form, "ld2"),
    ld3: text(form, "ld3"),
    ld1Ok: form.get("ld1Ok") === "1",
    ld2Ok: form.get("ld2Ok") === "1",
    ld3Ok: form.get("ld3Ok") === "1",
    steps: text(form, "steps"),
    beneficiaries: text(form, "beneficiaries", 300),
    opsStatus: text(form, "opsStatus", 120),
    opsReason: text(form, "opsReason"),
    opsHandling: text(form, "opsHandling"),
  };
  if (id) {
    await prisma.jobWeekly.update({ where: { id }, data });
  } else {
    const year = optInt(form, "year") ?? 0;
    const week = optInt(form, "week") ?? 0;
    if (!validWeek(year, week)) return { error: "Pekan tidak valid." };
    const w = await ensureWeek(ownerId, year, week);
    const max = await prisma.jobWeekly.aggregate({ where: { weekId: w.id }, _max: { order: true } });
    await prisma.jobWeekly.create({ data: { ...data, weekId: w.id, order: (max._max.order ?? 0) + 1 } });
  }
  revalidate();
  return { ok: id ? "Agenda pekanan diperbarui." : "Agenda pekanan ditambahkan." };
}

async function weeklyOwner(id: number) {
  const a = await prisma.jobWeekly.findUnique({
    where: { id: Number(id) || 0 },
    select: { id: true, title: true, weekId: true, week: { select: { userId: true } } },
  });
  return a;
}

export async function toggleWeeklyAction(id: number, done: boolean): Promise<ActionResult> {
  const session = await requirePanel();
  const a = await weeklyOwner(id);
  if (!a) return { error: "Agenda tidak ditemukan." };
  if (!(await canEditJobdesk(session, a.week.userId))) return NO_ACCESS;
  await prisma.jobWeekly.update({ where: { id: a.id }, data: { done: !!done, doneAt: done ? new Date() : null } });
  revalidate();
  return { ok: done ? `"${a.title}" ditandai selesai.` : `"${a.title}" dibuka kembali.` };
}

export async function deleteWeeklyAction(id: number): Promise<ActionResult> {
  const session = await requirePanel();
  const a = await weeklyOwner(id);
  if (!a) return { error: "Agenda tidak ditemukan." };
  if (!(await canEditJobdesk(session, a.week.userId))) return NO_ACCESS;
  await prisma.jobWeekly.delete({ where: { id: a.id } });
  revalidate();
  return { ok: `Agenda "${a.title}" dihapus. Jobdesk harian yang tertaut tetap ada.` };
}

export async function moveWeeklyAction(id: number, dir: "up" | "down"): Promise<ActionResult> {
  const session = await requirePanel();
  const a = await weeklyOwner(id);
  if (!a) return { error: "Agenda tidak ditemukan." };
  if (!(await canEditJobdesk(session, a.week.userId))) return NO_ACCESS;
  // geser di dalam kategori yang sama (tampilan dikelompokkan per kategori)
  const all = await prisma.jobWeekly.findMany({
    where: { weekId: a.weekId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { id: true, category: true },
  });
  const cat = all.find((x) => x.id === a.id)!.category;
  const same = all.filter((x) => x.category === cat);
  const i = same.findIndex((x) => x.id === a.id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= same.length) return { ok: "" };
  [same[i], same[j]] = [same[j], same[i]];
  // susun ulang seluruh pekan: posisi kategori lain tetap, urutan di dalam kategori ini berubah
  let k = 0;
  const ordered = all.map((x) => (x.category === cat ? same[k++] : x));
  await prisma.$transaction(ordered.map((x, n) => prisma.jobWeekly.update({ where: { id: x.id }, data: { order: n + 1 } })));
  revalidate();
  return { ok: "" };
}

/** Salin lembar & agenda yang belum selesai dari pekan sebelumnya */
export async function copyPreviousWeekAction(ownerId: number, year: number, week: number): Promise<ActionResult> {
  const session = await requirePanel();
  if (!validWeek(Number(year), Number(week))) return { error: "Pekan tidak valid." };
  if (!(await canEditJobdesk(session, Number(ownerId)))) return NO_ACCESS;
  const prev = shiftWeek(Number(year), Number(week), -1);
  const src = await prisma.jobWeek.findUnique({
    where: { userId_year_week: { userId: Number(ownerId), year: prev.year, week: prev.week } },
    include: { agendas: { where: { done: false }, orderBy: [{ order: "asc" }, { id: "asc" }] } },
  });
  if (!src) return { error: `Pekan ${prev.week} belum punya agenda untuk disalin.` };
  const target = await prisma.jobWeek.upsert({
    where: { userId_year_week: { userId: Number(ownerId), year: Number(year), week: Number(week) } },
    create: { userId: Number(ownerId), year: Number(year), week: Number(week), roleTitle: src.roleTitle, context: src.context },
    update: {},
    include: { agendas: { select: { title: true } } },
  });
  const have = new Set(target.agendas.map((a) => a.title));
  const todo = src.agendas.filter((a) => !have.has(a.title));
  if (!todo.length) return { ok: "Tidak ada agenda baru untuk disalin (semua sudah selesai atau sudah ada)." };
  const base = target.agendas.length;
  await prisma.jobWeekly.createMany({
    data: todo.map((a, i) => ({
      weekId: target.id,
      category: a.category,
      title: a.title,
      objective: a.objective,
      doneMeasure: a.doneMeasure,
      leadMeasure: a.leadMeasure,
      pic: a.pic,
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
      order: base + i + 1,
    })),
  });
  revalidate();
  return { ok: `${todo.length} agenda yang belum selesai disalin dari pekan ${prev.week}. Sesuaikan tanggalnya.` };
}

/* ======================= Catatan Root (evaluasi) ======================= */

export async function saveRootNoteAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const session = await requireRoot();
  const kind = str(form, "kind");
  const id = optInt(form, "id") ?? 0;
  const note = text(form, "note", 3000);
  const stamp = note ? { by: session.name, at: new Date() } : { by: null, at: null };
  if (kind === "daily") {
    const r = await prisma.jobDaily.update({ where: { id }, data: { rootNote: note, rootNoteBy: stamp.by, rootNoteAt: stamp.at } }).catch(() => null);
    if (!r) return { error: "Jobdesk tidak ditemukan." };
  } else if (kind === "weekly") {
    const r = await prisma.jobWeekly.update({ where: { id }, data: { rootNote: note, rootNoteBy: stamp.by, rootNoteAt: stamp.at } }).catch(() => null);
    if (!r) return { error: "Agenda tidak ditemukan." };
  } else if (kind === "week") {
    const ownerId = optInt(form, "ownerId") ?? 0;
    const year = optInt(form, "year") ?? 0;
    const week = optInt(form, "week") ?? 0;
    if (!validWeek(year, week) || !(await canEditJobdesk(session, ownerId))) return { error: "Pekan tidak valid." };
    await prisma.jobWeek.upsert({
      where: { userId_year_week: { userId: ownerId, year, week } },
      create: { userId: ownerId, year, week, reviewNote: note, reviewNoteBy: stamp.by, reviewNoteAt: stamp.at },
      update: { reviewNote: note, reviewNoteBy: stamp.by, reviewNoteAt: stamp.at },
    });
  } else return { error: "Jenis catatan tidak dikenal." };
  revalidate();
  return { ok: note ? "Catatan root disimpan — admin langsung bisa membacanya." : "Catatan root dihapus." };
}

/* ======================= Papan catatan ======================= */

export async function saveNoteAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const session = await requirePanel();
  const id = optInt(form, "id");
  const content = str(form, "content").slice(0, 5000);
  if (content.length < 2) return { fieldErrors: { content: ["Tulis catatannya."] } };
  const date = str(form, "date");
  if (id) {
    const n = await prisma.jobNote.findUnique({ where: { id }, select: { authorId: true, userId: true } });
    if (!n) return { error: "Catatan tidak ditemukan." };
    if (n.authorId !== session.userId && session.role !== "ROOT") return { error: "Hanya penulis atau Root yang bisa mengubah catatan ini." };
    await prisma.jobNote.update({ where: { id }, data: { content, date: isYmd(date) ? ymdToDate(date) : null } });
  } else {
    const ownerId = optInt(form, "ownerId") ?? 0;
    if (!(await canEditJobdesk(session, ownerId))) return NO_ACCESS;
    await prisma.jobNote.create({ data: { userId: ownerId, authorId: session.userId, content, date: isYmd(date) ? ymdToDate(date) : null } });
  }
  revalidate();
  return { ok: id ? "Catatan diperbarui." : "Catatan ditambahkan." };
}

export async function deleteNoteAction(id: number): Promise<ActionResult> {
  const session = await requirePanel();
  const n = await prisma.jobNote.findUnique({ where: { id: Number(id) || 0 }, select: { authorId: true, userId: true } });
  if (!n) return { error: "Catatan tidak ditemukan." };
  if (n.authorId !== session.userId && session.role !== "ROOT") return { error: "Hanya penulis atau Root yang bisa menghapus catatan ini." };
  await prisma.jobNote.delete({ where: { id: Number(id) } });
  revalidate();
  return { ok: "Catatan dihapus." };
}

export async function pinNoteAction(id: number): Promise<ActionResult> {
  const session = await requirePanel();
  const n = await prisma.jobNote.findUnique({ where: { id: Number(id) || 0 }, select: { userId: true, pinned: true } });
  if (!n) return { error: "Catatan tidak ditemukan." };
  if (!(await canEditJobdesk(session, n.userId))) return NO_ACCESS;
  await prisma.jobNote.update({ where: { id: Number(id) }, data: { pinned: !n.pinned } });
  revalidate();
  return { ok: n.pinned ? "Sematan dilepas." : "Catatan disematkan." };
}

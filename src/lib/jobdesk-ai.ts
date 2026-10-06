import "server-only";
import { prisma } from "./prisma";
import { groqConfigured, groqJson } from "./groq";
import { addDays, isTime, isoWeekday, isYmd, weekDates, ymdToDate, type JobCategoryKey, type JobPriorityKey } from "./jobdesk-shared";

/**
 * Generate jobdesk harian & agenda pekanan dari data kerja admin:
 * Master Lead (follow-up, pembayaran, aktivasi kelas), Data Blast (target ≥ 1.000 kontak/pekan), dan Chat WA (chat menunggu balasan).
 * Angka beban kerja dihitung pasti dari database; AI hanya menyusun & merangkai tugasnya. Tanpa AI → penyusun berbasis aturan.
 */

export const BLAST_WEEKLY_TARGET = 1000;
const WIB = 7 * 3600_000;
const ACTIVE = { notIn: ["Paid", "Lost"] };
/** 00:00 WIB dari "YYYY-MM-DD" */
const wibStart = (ymd: string) => new Date(ymdToDate(ymd).getTime() - WIB);

export type WorkloadPerson = { nama: string; info: string };
export type Workload = {
  date: string;
  week: { year: number; week: number; dates: string[] };
  lead: {
    dueToday: number;
    overdue: number;
    neverContacted: number;
    pending: number;
    trial: number;
    paidNoClass: number;
    newThisWeek: number;
    paidThisWeek: number;
    paidLastWeek: number;
    unownedAll: number;
    followUpList: WorkloadPerson[];
    pendingList: WorkloadPerson[];
    paidNoClassList: WorkloadPerson[];
  };
  blast: { thisWeek: number; email: number; wa: number; lastWeek: number; target: number; remaining: number; daysLeft: number; perDay: number; today: number };
  chat: {
    connected: boolean;
    status: string;
    waiting: number;
    waitingOver24h: number;
    unread: number;
    repliedThisWeek: number;
    newChatsThisWeek: number;
    waitingList: WorkloadPerson[];
  };
  jobdesk: { todayTitles: string[]; agendas: { id: number; title: string; category: string }[]; overdueTasks: number };
};

/** hari kerja (Senin–Sabtu) tersisa di pekan ini, termasuk hari ini (0 = Minggu) */
const daysLeftInWeek = (date: string, dates: string[]) => dates.filter((d) => d >= date && isoWeekday(d) <= 6).length;

export async function collectWorkload(ownerId: number, date: string, year: number, week: number): Promise<Workload> {
  const dates = weekDates(year, week);
  const dayStart = wibStart(date);
  const dayEnd = wibStart(addDays(date, 1));
  const weekStart = wibStart(dates[0]);
  const weekEnd = wibStart(addDays(dates[6], 1));
  const lastWeekStart = wibStart(addDays(dates[0], -7));
  const since7 = new Date(dayEnd.getTime() - 7 * 86400_000);
  const mine = { ownerId, kategori: { not: "Bukan Lead" } };

  const [dueToday, overdue, neverContacted, pending, trial, newThisWeek, paidThisWeek, paidLastWeek, unownedAll, followUps, pendings, paidLeads] =
    await Promise.all([
      prisma.lead.count({ where: { ...mine, statusFunnel: ACTIVE, nextFollowUp: { gte: dayStart, lt: dayEnd } } }),
      prisma.lead.count({ where: { ...mine, statusFunnel: ACTIVE, nextFollowUp: { lt: dayStart } } }),
      prisma.lead.count({ where: { ...mine, statusFunnel: "Baru", lastContact: null } }),
      prisma.lead.count({ where: { ...mine, OR: [{ statusFunnel: "Pending" }, { statusBayar: "Pending" }] } }),
      prisma.lead.count({ where: { ...mine, statusFunnel: "Trial" } }),
      prisma.lead.count({ where: { ownerId, tanggalMasuk: { gte: weekStart, lt: weekEnd } } }),
      prisma.lead.count({ where: { ownerId, statusFunnel: "Paid", tanggalBayar: { gte: weekStart, lt: weekEnd } } }),
      prisma.lead.count({ where: { ownerId, statusFunnel: "Paid", tanggalBayar: { gte: lastWeekStart, lt: weekStart } } }),
      prisma.lead.count({ where: { ownerId: null, statusFunnel: { not: "Lost" }, kategori: { not: "Bukan Lead" } } }),
      prisma.lead.findMany({
        where: { ...mine, statusFunnel: ACTIVE, nextFollowUp: { lt: dayEnd } },
        orderBy: { nextFollowUp: "asc" },
        take: 8,
        select: { nama: true, produk: true, statusFunnel: true, nextAction: true },
      }),
      prisma.lead.findMany({
        where: { ...mine, OR: [{ statusFunnel: "Pending" }, { statusBayar: "Pending" }] },
        orderBy: { tanggalMasuk: "desc" },
        take: 5,
        select: { nama: true, paket: true, produk: true },
      }),
      prisma.lead.findMany({
        where: { ownerId, statusFunnel: "Paid", OR: [{ produk: { contains: "COC" } }, { produk: { contains: "VIP" } }] },
        select: { id: true, nama: true, invoiceId: true, paket: true },
        take: 500,
      }),
    ]);

  // lead lunas (kelas) yang belum tertaut pendaftaran → perlu didaftarkan ke kelas
  const linked = paidLeads.length
    ? await prisma.registration.findMany({
        where: {
          OR: [{ sourceLeadId: { in: paidLeads.map((l) => l.id) } }, { code: { in: paidLeads.map((l) => l.invoiceId).filter((x): x is string => !!x) } }],
        },
        select: { sourceLeadId: true, code: true },
      })
    : [];
  const linkedIds = new Set(linked.map((r) => r.sourceLeadId));
  const linkedCodes = new Set(linked.map((r) => r.code));
  const noClass = paidLeads.filter((l) => !linkedIds.has(l.id) && !(l.invoiceId && linkedCodes.has(l.invoiceId)));

  const blastWhere = (from: Date, to: Date) => ({ ownerId, tanggal: { gte: from, lt: to } });
  const [blastByChannel, blastLast, blastToday, account] = await Promise.all([
    prisma.blast.groupBy({ by: ["asalBlast"], where: blastWhere(weekStart, weekEnd), _count: { _all: true } }),
    prisma.blast.count({ where: blastWhere(lastWeekStart, weekStart) }),
    prisma.blast.count({ where: blastWhere(dayStart, dayEnd) }),
    prisma.waAccount.findUnique({ where: { userId: ownerId }, select: { id: true, status: true } }),
  ]);
  const blastEmail = blastByChannel.find((b) => b.asalBlast === "Email")?._count._all ?? 0;
  const blastWa = blastByChannel.filter((b) => b.asalBlast !== "Email").reduce((s, b) => s + b._count._all, 0);
  const blastWeek = blastEmail + blastWa;
  const daysLeft = daysLeftInWeek(date, dates);
  const remaining = Math.max(0, BLAST_WEEKLY_TARGET - blastWeek);

  // Chat WA: chat yang pesan terakhirnya dari customer (7 hari terakhir) = menunggu balasan
  let chat: Workload["chat"] = {
    connected: false,
    status: "Belum terhubung",
    waiting: 0,
    waitingOver24h: 0,
    unread: 0,
    repliedThisWeek: 0,
    newChatsThisWeek: 0,
    waitingList: [],
  };
  if (account) {
    // hanya chat pribadi customer (grup WhatsApp tidak dihitung sebagai chat yang menunggu balasan)
    const waitingWhere = { accountId: account.id, isGroup: false, hasIncoming: true, lastFromMe: false, lastMessageAt: { gte: since7 } };
    const [waiting, waitingOld, unread, replied, newChats, waitingRows] = await Promise.all([
      prisma.waChat.count({ where: waitingWhere }),
      prisma.waChat.count({ where: { ...waitingWhere, lastMessageAt: { gte: since7, lt: new Date(Date.now() - 24 * 3600_000) } } }),
      prisma.waChat.aggregate({ where: { accountId: account.id, isGroup: false }, _sum: { unread: true } }),
      prisma.waMessage.count({ where: { fromMe: true, chat: { accountId: account.id, isGroup: false }, timestamp: { gte: weekStart, lt: weekEnd } } }),
      prisma.waChat.count({ where: { accountId: account.id, isGroup: false, createdAt: { gte: weekStart, lt: weekEnd } } }),
      prisma.waChat.findMany({ where: waitingWhere, orderBy: { lastMessageAt: "asc" }, take: 6, select: { name: true, phone: true, lastMessageText: true } }),
    ]);
    chat = {
      connected: account.status === "CONNECTED",
      status: account.status,
      waiting,
      waitingOver24h: waitingOld,
      unread: unread._sum.unread ?? 0,
      repliedThisWeek: replied,
      newChatsThisWeek: newChats,
      waitingList: waitingRows.map((c) => ({ nama: c.name || c.phone || "Kontak", info: (c.lastMessageText ?? "").slice(0, 60) })),
    };
  }

  const [todayTasks, agendas, overdueTasks] = await Promise.all([
    prisma.jobDaily.findMany({ where: { userId: ownerId, date: ymdToDate(date) }, select: { title: true } }),
    prisma.jobWeekly.findMany({
      where: { week: { userId: ownerId, year, week } },
      select: { id: true, title: true, category: true },
      orderBy: { order: "asc" },
    }),
    prisma.jobDaily.count({ where: { userId: ownerId, done: false, date: { lt: ymdToDate(date), gte: ymdToDate(addDays(date, -14)) } } }),
  ]);

  return {
    date,
    week: { year, week, dates },
    lead: {
      dueToday,
      overdue,
      neverContacted,
      pending,
      trial,
      paidNoClass: noClass.length,
      newThisWeek,
      paidThisWeek,
      paidLastWeek,
      unownedAll,
      followUpList: followUps.map((l) => ({ nama: l.nama, info: [l.produk, l.statusFunnel, l.nextAction].filter(Boolean).join(" · ").slice(0, 80) })),
      pendingList: pendings.map((l) => ({ nama: l.nama, info: (l.paket || l.produk || "").slice(0, 60) })),
      paidNoClassList: noClass.slice(0, 5).map((l) => ({ nama: l.nama, info: (l.paket ?? "").slice(0, 60) })),
    },
    blast: {
      thisWeek: blastWeek,
      email: blastEmail,
      wa: blastWa,
      lastWeek: blastLast,
      target: BLAST_WEEKLY_TARGET,
      remaining,
      daysLeft,
      // target harian realistis: sisa dibagi hari kerja tersisa, maks. sepertiga target pekanan per hari
      perDay: remaining ? Math.min(Math.ceil(remaining / Math.max(1, daysLeft)), Math.ceil(BLAST_WEEKLY_TARGET / 3)) : 0,
      today: blastToday,
    },
    chat,
    jobdesk: { todayTitles: todayTasks.map((t) => t.title), agendas, overdueTasks },
  };
}

/* ======================= hasil generate ======================= */

export type GenDaily = {
  title: string;
  notes: string;
  priority: JobPriorityKey;
  dueTime: string;
  /** sales: lead/blast/chat · operasional (Admin SmartChampion): kelas/pertemuan/tutor/games */
  source: "lead" | "blast" | "chat" | "kelas" | "pertemuan" | "tutor" | "games" | "lainnya";
  weeklyId: number | null;
};
export type GenAgenda = {
  category: JobCategoryKey;
  title: string;
  objective: string;
  doneMeasure: string;
  leadMeasure: string;
  steps: string;
  ld1: string;
  ld2: string;
  ld3: string;
  beneficiaries: string;
  dueDate: string;
};
export type GenWeekly = { focus: string[]; agendas: GenAgenda[] };

export const PRIORITIES: JobPriorityKey[] = ["TINGGI", "SEDANG", "RENDAH"];
export const CATS: JobCategoryKey[] = ["PRIORITAS", "SISTEM", "PEOPLE", "OPERASIONAL"];

/** bagian Workload yang dipakai penyaring hasil (sama untuk jobdesk sales & operasional) */
export type WorkCtx = { date: string; week: { year: number; week: number; dates: string[] }; jobdesk: Workload["jobdesk"] };
const SOURCES = ["lead", "blast", "chat", "lainnya"] as const;
export const clip = (v: unknown, n: number) =>
  String(v ?? "")
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, n);
const names = (list: WorkloadPerson[], n = 5) =>
  list
    .slice(0, n)
    .map((p) => p.nama)
    .join(", ");
const nf = (n: number) => n.toLocaleString("id-ID");

/** Penyusun berbasis aturan (dipakai bila AI tidak tersedia / gagal) */
export function ruleDaily(w: Workload): GenDaily[] {
  const out: GenDaily[] = [];
  const add = (t: Omit<GenDaily, "weeklyId">) => out.push({ ...t, weeklyId: null });
  if (w.chat.waiting)
    add({
      title: `Balas ${w.chat.waiting} chat WA yang menunggu balasan`,
      notes: `Dahulukan ${w.chat.waitingOver24h} chat yang menunggu > 24 jam.${w.chat.waitingList.length ? ` Antara lain: ${names(w.chat.waitingList)}.` : ""}`,
      priority: "TINGGI",
      dueTime: "10:00",
      source: "chat",
    });
  if (w.lead.overdue)
    add({
      title: `Follow-up ${Math.min(w.lead.overdue, 20)} lead yang lewat jadwal`,
      notes: `Total ${w.lead.overdue} lead lewat jadwal follow-up. Mulai dari: ${names(w.lead.followUpList)}. Update status & next follow-up di Master Lead.`,
      priority: "TINGGI",
      dueTime: "11:00",
      source: "lead",
    });
  if (w.lead.dueToday)
    add({
      title: `Follow-up ${w.lead.dueToday} lead terjadwal hari ini`,
      notes: "Sesuai kolom Next Follow-up di Master Lead.",
      priority: "TINGGI",
      dueTime: "13:00",
      source: "lead",
    });
  if (w.lead.pending)
    add({
      title: `Ingatkan ${w.lead.pending} lead yang menunggu pembayaran`,
      notes: w.lead.pendingList.length ? `Antara lain: ${names(w.lead.pendingList)}.` : "",
      priority: "TINGGI",
      dueTime: "14:00",
      source: "lead",
    });
  if (w.lead.paidNoClass)
    add({
      title: `Daftarkan ${w.lead.paidNoClass} peserta lunas ke kelasnya`,
      notes: `Lewat tombol aktivasi di Master Lead. ${names(w.lead.paidNoClassList)}`.trim(),
      priority: "SEDANG",
      dueTime: "15:00",
      source: "lead",
    });
  if (w.blast.remaining && w.blast.daysLeft)
    add({
      title: `Blast ${nf(w.blast.perDay)} kontak hari ini (Email/WA)`,
      notes: `Pekan ini baru ${nf(w.blast.thisWeek)} dari target ${nf(w.blast.target)}; sisa ${nf(w.blast.remaining)} untuk ${w.blast.daysLeft} hari kerja. Catat di Data Blast.`,
      priority: "SEDANG",
      dueTime: "16:00",
      source: "blast",
    });
  if (w.lead.neverContacted)
    add({
      title: `Hubungi ${Math.min(w.lead.neverContacted, 15)} lead baru yang belum pernah dikontak`,
      notes: `${w.lead.neverContacted} lead berstatus Baru tanpa Last Contact.`,
      priority: "SEDANG",
      dueTime: "15:30",
      source: "lead",
    });
  if (w.lead.trial) add({ title: `Arahkan ${w.lead.trial} lead trial Mimpi.mu ke pembelian`, notes: "", priority: "SEDANG", dueTime: "", source: "lead" });
  add({
    title: "Rekap hasil hari ini di Master Lead",
    notes: "Pastikan semua kontak hari ini sudah tercatat (status, last contact, next follow-up).",
    priority: "RENDAH",
    dueTime: "17:00",
    source: "lainnya",
  });
  return out.sort((a, b) => (a.dueTime || "99").localeCompare(b.dueTime || "99"));
}

export function ruleWeekly(w: Workload): GenWeekly {
  const [mon, , , , fri, sat] = w.week.dates;
  const due = w.date > fri ? sat : fri;
  const agendas: GenAgenda[] = [
    {
      category: "PRIORITAS",
      title: `Closing penjualan: ${Math.max(w.lead.paidLastWeek + 2, 5)} transaksi Paid pekan ini`,
      objective: "Menaikkan transaksi Paid dari lead aktif",
      doneMeasure: `≥ ${Math.max(w.lead.paidLastWeek + 2, 5)} lead berstatus Paid dengan tanggal bayar pekan ini`,
      leadMeasure: `Follow-up ${w.lead.overdue + w.lead.dueToday} lead terjadwal; ingatkan ${w.lead.pending} pembayaran pending`,
      steps: "Prioritaskan lead lewat jadwal\nIngatkan pembayaran pending\nUpdate status di Master Lead setiap hari",
      ld1: "Data lead & WA tersedia, dikerjakan sendiri",
      ld2: "Diukur dari Paid pekan ini",
      ld3: "Calon peserta mendapat kelas; tim mencapai target penjualan",
      beneficiaries: "Calon peserta, tim sales",
      dueDate: due,
    },
    {
      category: "PRIORITAS",
      title: `Blast ${nf(w.blast.target)} kontak (Email & WA)`,
      objective: "Menjaga arus lead baru dari Data Blast",
      doneMeasure: `≥ ${nf(w.blast.target)} kontak tercatat di Data Blast pekan ini (sekarang ${nf(w.blast.thisWeek)})`,
      leadMeasure: `± ${nf(Math.ceil(w.blast.target / 6))} kontak per hari kerja`,
      steps: "Siapkan daftar kontak\nKirim blast email & WA\nCatat di Data Blast",
      ld1: "Daftar kontak & template tersedia",
      ld2: "Selesai dalam pekan ini",
      ld3: "Lebih banyak calon peserta mengenal program",
      beneficiaries: "Tim sales, calon peserta",
      dueDate: due,
    },
    {
      category: "SISTEM",
      title: "Rapikan data Master Lead (status, next follow-up, owner)",
      objective: "Data lead akurat untuk follow-up & laporan",
      doneMeasure: `0 lead aktif tanpa next follow-up; ${w.lead.paidNoClass} peserta lunas terdaftar di kelas`,
      leadMeasure: "Cek & perbarui 30 lead per hari",
      steps: "Filter lead tanpa next follow-up\nIsi status & jadwal\nAktifkan akun/kelas peserta lunas",
      ld1: "Dikerjakan langsung di Master Lead",
      ld2: "Selesai pekan ini",
      ld3: "Admin & atasan melihat data yang benar",
      beneficiaries: "Tim admin, atasan",
      dueDate: due,
    },
    {
      category: "PEOPLE",
      title: "Waktu respons chat WA < 1 jam di jam kerja",
      objective: "Calon peserta tidak menunggu lama",
      doneMeasure: "Tidak ada chat menunggu > 24 jam pada akhir pekan",
      leadMeasure: `Cek Chat WA minimal 3x sehari (sekarang ${w.chat.waiting} chat menunggu)`,
      steps: "Cek Chat WA pagi, siang, sore\nGunakan template jawaban\nCatat calon peserta ke Master Lead",
      ld1: "WA admin tersedia",
      ld2: "Dipantau sepanjang pekan",
      ld3: "Calon peserta mendapat jawaban cepat",
      beneficiaries: "Calon peserta",
      dueDate: due,
    },
  ];
  return {
    focus: [`Closing & follow-up lead (${w.lead.overdue} lewat jadwal)`, `Blast ${nf(w.blast.target)} kontak`, "Respons chat WA cepat & data lead rapi"],
    agendas: agendas.map((a) => ({ ...a, dueDate: a.dueDate || mon })),
  };
}

/* ======================= AI ======================= */

export const dailySchema = (sources: readonly string[]) => ({
  type: "object",
  additionalProperties: false,
  required: ["tasks"],
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "notes", "priority", "dueTime", "source", "weeklyId"],
        properties: {
          title: { type: "string" },
          notes: { type: "string" },
          priority: { type: "string", enum: PRIORITIES },
          dueTime: { type: "string" },
          source: { type: "string", enum: [...sources] },
          weeklyId: { type: "integer" },
        },
      },
    },
  },
});
const DAILY_SCHEMA = dailySchema(SOURCES);

export const WEEKLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["focus", "agendas"],
  properties: {
    focus: { type: "array", items: { type: "string" } },
    agendas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "title", "objective", "doneMeasure", "leadMeasure", "steps", "ld1", "ld2", "ld3", "beneficiaries", "dueDate"],
        properties: {
          category: { type: "string", enum: CATS },
          title: { type: "string" },
          objective: { type: "string" },
          doneMeasure: { type: "string" },
          leadMeasure: { type: "string" },
          steps: { type: "string" },
          ld1: { type: "string" },
          ld2: { type: "string" },
          ld3: { type: "string" },
          beneficiaries: { type: "string" },
          dueDate: { type: "string" },
        },
      },
    },
  },
};

const ROLE =
  "Kamu asisten kerja untuk Admin Pelatihan POSI (sales Champion Online Class / COC & Mimpi.mu, bimbel olimpiade online). " +
  "Tugas admin: follow-up lead di Master Lead, blast Email/WA (target minimal 1.000 kontak per pekan, dicatat di Data Blast), membalas Chat WA calon peserta, " +
  "menagih pembayaran pending, dan mendaftarkan peserta lunas ke kelas. Tulis dalam bahasa Indonesia yang ringkas & operasional. " +
  "Gunakan ANGKA dari data (jangan mengarang angka lain). Jangan menulis data pribadi selain nama yang diberikan.";

export function cleanDaily(raw: unknown[], w: WorkCtx, sources: readonly string[] = SOURCES): GenDaily[] {
  const agendaIds = new Set(w.jobdesk.agendas.map((a) => a.id));
  const existing = new Set(w.jobdesk.todayTitles.map((t) => t.toLowerCase()));
  const seen = new Set<string>();
  const out: GenDaily[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const title = clip(r.title, 200);
    const key = title.toLowerCase();
    if (title.length < 4 || seen.has(key) || existing.has(key)) continue;
    seen.add(key);
    const due = clip(r.dueTime, 5);
    out.push({
      title,
      notes: clip(r.notes, 1000),
      priority: PRIORITIES.includes(r.priority as JobPriorityKey) ? (r.priority as JobPriorityKey) : "SEDANG",
      dueTime: isTime(due) ? due : "",
      source: sources.includes(r.source as string) ? (r.source as GenDaily["source"]) : "lainnya",
      weeklyId: agendaIds.has(Number(r.weeklyId)) ? Number(r.weeklyId) : null,
    });
    if (out.length >= 12) break;
  }
  return out;
}

export function cleanWeekly(raw: { focus?: unknown[]; agendas?: unknown[] }, w: WorkCtx): GenWeekly {
  const dates = w.week.dates;
  const existing = new Set(w.jobdesk.agendas.map((a) => a.title.toLowerCase()));
  const agendas: GenAgenda[] = [];
  for (const r of (raw.agendas ?? []) as Record<string, unknown>[]) {
    const title = clip(r.title, 200);
    if (title.length < 4 || existing.has(title.toLowerCase()) || agendas.some((a) => a.title.toLowerCase() === title.toLowerCase())) continue;
    const due = clip(r.dueDate, 10);
    agendas.push({
      category: CATS.includes(r.category as JobCategoryKey) ? (r.category as JobCategoryKey) : "OPERASIONAL",
      title,
      objective: clip(r.objective, 300),
      doneMeasure: clip(r.doneMeasure, 600),
      leadMeasure: clip(r.leadMeasure, 600),
      steps: clip(r.steps, 1200),
      ld1: clip(r.ld1, 400),
      ld2: clip(r.ld2, 400),
      ld3: clip(r.ld3, 400),
      beneficiaries: clip(r.beneficiaries, 300),
      // tenggat di dalam pekan & tidak lebih awal dari tanggal acuan (mis. generate hari Minggu → Minggu)
      dueDate: (() => {
        const d = isYmd(due) && due >= dates[0] && due <= dates[6] ? due : dates[4];
        return d < w.date && w.date <= dates[6] ? w.date : d;
      })(),
    });
    if (agendas.length >= 8) break;
  }
  const focus = ((raw.focus ?? []) as unknown[])
    .map((f) => clip(f, 160))
    .filter(Boolean)
    .slice(0, 4);
  return { focus, agendas };
}

/** Batas waktu total panggilan AI (termasuk rotasi model) — lewat dari ini dipakai penyusun berbasis aturan */
const AI_DEADLINE_MS = 40_000;
export function withDeadline<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`AI melebihi ${AI_DEADLINE_MS / 1000} detik`)), AI_DEADLINE_MS))]);
}

export type GenResult<T, W = Workload> = { items: T; byAi: boolean; workload: W; note?: string };

export async function generateDaily(w: Workload): Promise<GenResult<GenDaily[]>> {
  if (!groqConfigured()) return { items: ruleDaily(w), byAi: false, workload: w, note: "AI belum aktif — disusun otomatis dari data." };
  try {
    const res = await withDeadline(
      groqJson<{ tasks: unknown[] }>(
        [
          {
            role: "system",
            content: [
              ROLE,
              "Susun 5–10 jobdesk HARIAN untuk tanggal yang diminta berdasarkan data beban kerja (JSON `data`).",
              "`kerangka` = tugas wajib yang angkanya sudah dihitung pasti dari database: PAKAI SEMUA tugas kerangka, JANGAN mengubah angkanya, jangan memecah atau menggandakannya (satu tugas per masalah).",
              "Tugasmu: perjelas judul & notes (cara kerja, siapa didahulukan dari daftar nama di data), atur urutan & jam, pilih weeklyId, dan boleh menambah maksimal 3 tugas lain yang relevan dari data (mis. persiapan, evaluasi) tanpa angka baru.",
              "Aturan: urutkan dari yang paling mendesak (chat menunggu lama, follow-up lewat jadwal, pembayaran pending) → blast → administrasi.",
              "Setiap tugas spesifik & terukur (jumlah orang/kontak), judul ≤ 90 karakter diawali kata kerja; notes berisi cara/target & nama yang perlu didahulukan bila ada.",
              "Blast harian = blast.perDay (sisa target pekan dibagi hari kerja tersisa, sudah dibatasi wajar); jika blast.remaining 0 jangan buat tugas blast.",
              "Jika blast.daysLeft 0 (hari Minggu): jangan buat tugas blast hari ini; ganti dengan menyiapkan daftar kontak & template blast untuk pekan depan.",
              "Jika chat.connected false, tambahkan tugas menyambungkan WhatsApp di menu Chat WA. Jangan buat tugas untuk angka 0.",
              "dueTime format HH:MM antara 08:00–17:00 (boleh kosong), priority TINGGI/SEDANG/RENDAH, source lead/blast/chat/lainnya.",
              "weeklyId = id agenda pekanan yang paling sesuai dari jobdesk.agendas, atau 0 bila tidak ada.",
              "Jangan mengulang tugas yang sudah ada di jobdesk.todayTitles. Akhiri dengan 1 tugas rekap/laporan sore.",
            ].join("\n"),
          },
          {
            role: "user",
            content: JSON.stringify({
              data: w,
              kerangka: ruleDaily(w).map(({ title, notes, priority, dueTime, source }) => ({ title, notes, priority, dueTime, source })),
            }),
          },
        ],
        "jobdesk_harian",
        DAILY_SCHEMA,
        { temperature: 0.4, reasoningEffort: "low", timeoutMs: 30_000, maxTokens: 4000 },
      ),
    );
    const items = cleanDaily(res.tasks ?? [], w);
    if (items.length >= 3) return { items, byAi: true, workload: w };
  } catch (e) {
    console.error("[jobdesk-ai] harian:", (e as Error).message);
  }
  return { items: cleanDaily(ruleDaily(w), w), byAi: false, workload: w, note: "AI sedang tidak tersedia — disusun otomatis dari data." };
}

export async function generateWeekly(w: Workload): Promise<GenResult<GenWeekly>> {
  const fallback = () => cleanWeekly(ruleWeekly(w) as unknown as { focus: unknown[]; agendas: unknown[] }, w);
  if (!groqConfigured()) return { items: fallback(), byAi: false, workload: w, note: "AI belum aktif — disusun otomatis dari data." };
  try {
    const res = await withDeadline(
      groqJson<{ focus: unknown[]; agendas: unknown[] }>(
        [
          {
            role: "system",
            content: [
              ROLE,
              "Susun AGENDA PEKANAN untuk pekan di data (Senin–Minggu) mengikuti Panduan Agenda Pekanan POSI:",
              "- PRIORITAS 1–3 agenda (paling berdampak pada penjualan: closing, follow-up, blast ≥ 1.000 kontak), SISTEM 1–2 (perbaikan cara kerja: data lead, template, alur aktivasi), PEOPLE 1–2 (respons chat, kualitas layanan, belajar produk); total agenda utama 3–5. OPERASIONAL (BAU) 0–2 untuk rutinitas.",
              "- Tiap agenda: title ringkas & terukur; objective 1 kalimat; doneMeasure = ukuran selesai pakai angka dari data; leadMeasure = aktivitas harian yang mendorongnya; steps 3–5 langkah (satu per baris, tanpa nomor);",
              "  ld1 (bisa dikerjakan pekan ini tanpa menunggu pihak lain?), ld2 (bisa selesai 1 pekan?), ld3 (siapa yang menikmati hasilnya & bedanya); beneficiaries singkat; dueDate YYYY-MM-DD di dalam pekan.",
              "- focus = 2–4 poin fokus pekan (pendek).",
              "Target realistis dari data (mis. Paid pekan lalu, sisa blast, jumlah lead lewat jadwal). Jangan mengulang agenda yang sudah ada di jobdesk.agendas.",
              "`kerangka` = usulan agenda dengan angka yang sudah dihitung pasti dari database. Angka apa pun yang kamu tulis HARUS sama dengan angka di `data`/`kerangka` (jangan mengarang/mengubah angka); boleh mengganti, menggabungkan, atau menambah agenda selama tetap sesuai data.",
            ].join("\n"),
          },
          { role: "user", content: JSON.stringify({ data: w, kerangka: ruleWeekly(w) }) },
        ],
        "agenda_pekanan",
        WEEKLY_SCHEMA,
        { temperature: 0.4, reasoningEffort: "low", timeoutMs: 35_000, maxTokens: 6000 },
      ),
    );
    const items = cleanWeekly(res, w);
    if (items.agendas.length >= 2) return { items, byAi: true, workload: w };
  } catch (e) {
    console.error("[jobdesk-ai] pekanan:", (e as Error).message);
  }
  return { items: fallback(), byAi: false, workload: w, note: "AI sedang tidak tersedia — disusun otomatis dari data." };
}

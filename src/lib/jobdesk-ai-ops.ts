import "server-only";
import { prisma } from "./prisma";
import { groqConfigured, groqJson } from "./groq";
import { addDays, weekDates, ymdToDate } from "./jobdesk-shared";
import { ACTIVITY_GROUP, type ActivityEntity } from "./activity-shared";
import { cleanDaily, cleanWeekly, dailySchema, withDeadline, WEEKLY_SCHEMA, type GenAgenda, type GenDaily, type GenResult, type GenWeekly, type WorkCtx } from "./jobdesk-ai";

/**
 * Generate jobdesk harian & agenda pekanan untuk Admin SmartChampion (operasional pelatihan):
 * kesiapan pertemuan (link, absensi, worksheet, rekaman), kelas (jadwal, tutor, materi, kelulusan), tutor, dan games.
 * Angka dihitung pasti dari database + log aktivitas; AI hanya menyusun & merangkai tugasnya. Tanpa AI → penyusun berbasis aturan.
 */

const WIB = 7 * 3600_000;
const DAY = 86_400_000;
const wibStart = (ymd: string) => new Date(ymdToDate(ymd).getTime() - WIB);
const hhmm = (d: Date) => new Date(d.getTime() + WIB).toISOString().slice(11, 16);
const dm = (d: Date) => {
  const x = new Date(d.getTime() + WIB);
  return `${x.getUTCDate()}/${x.getUTCMonth() + 1}`;
};

export type OpsItem = { nama: string; info: string };
export type OpsWorkload = WorkCtx & {
  kind: "ops";
  sessions: {
    today: number;
    todayNoLink: number;
    todayList: OpsItem[];
    next7: number;
    next7NoLink: number;
    next7NoLinkList: OpsItem[];
    noAttendance: number;
    noAttendanceList: OpsItem[];
    noWorksheet: number;
    noWorksheetList: OpsItem[];
    noRecording: number;
    noRecordingList: OpsItem[];
  };
  classes: {
    active: number;
    noSessions: number;
    noSessionsList: OpsItem[];
    noTutor: number;
    noTutorList: OpsItem[];
    noMaterial: number;
    noMaterialList: OpsItem[];
    startingSoon: OpsItem[];
    needCertificate: number;
    needCertificateList: OpsItem[];
  };
  tutors: { published: number; incomplete: number; incompleteList: OpsItem[] };
  games: { published: number; drafts: number; draftList: OpsItem[]; fewQuestions: number; fewQuestionsList: OpsItem[]; noExplanation: number };
  activity: { today: number; week: number; lastWeek: number; weekByGroup: Record<string, number> };
};

export async function collectOpsWorkload(ownerId: number, date: string, year: number, week: number): Promise<OpsWorkload> {
  const dates = weekDates(year, week);
  const now = new Date();
  const dayStart = wibStart(date);
  const dayEnd = wibStart(addDays(date, 1));
  const weekStart = wibStart(dates[0]);
  const weekEnd = wibStart(addDays(dates[6], 1));
  const since14 = new Date(dayEnd.getTime() - 14 * DAY);
  const ended = { endAt: { lt: now, gte: since14 } };
  const active = { status: { in: ["OPEN", "RUNNING"] as ("OPEN" | "RUNNING")[] }, type: { in: ["COC", "OTHER"] as ("COC" | "OTHER")[] } };
  const pick = { title: true, startAt: true, product: { select: { name: true } } } as const;
  const item = (s: { title: string; startAt: Date; product: { name: string } }): OpsItem => ({ nama: `${s.product.name} · ${s.title}`, info: `${dm(s.startAt)} ${hhmm(s.startAt)}` });

  const [today, todayNoLink, todayList, next7, next7NoLink, next7NoLinkRows, noAtt, noAttRows, noWs, noWsRows, noRec, noRecRows] = await Promise.all([
    prisma.classSession.count({ where: { startAt: { gte: dayStart, lt: dayEnd } } }),
    prisma.classSession.count({ where: { startAt: { gte: dayStart, lt: dayEnd }, meetingUrl: null } }),
    prisma.classSession.findMany({ where: { startAt: { gte: dayStart, lt: dayEnd } }, orderBy: { startAt: "asc" }, take: 8, select: pick }),
    prisma.classSession.count({ where: { startAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY) } } }),
    prisma.classSession.count({ where: { startAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY) }, meetingUrl: null } }),
    prisma.classSession.findMany({ where: { startAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY) }, meetingUrl: null }, orderBy: { startAt: "asc" }, take: 6, select: pick }),
    // pertemuan selesai (14 hari) yang belum diabsen sama sekali — hanya kelas yang punya peserta lunas
    prisma.classSession.count({ where: { ...ended, attendances: { none: {} }, product: { registrations: { some: { status: "PAID" } } } } }),
    prisma.classSession.findMany({ where: { ...ended, attendances: { none: {} }, product: { registrations: { some: { status: "PAID" } } } }, orderBy: { startAt: "desc" }, take: 6, select: pick }),
    prisma.classSession.count({ where: { ...ended, worksheetPublished: false } }),
    prisma.classSession.findMany({ where: { ...ended, worksheetPublished: false }, orderBy: { startAt: "desc" }, take: 6, select: pick }),
    prisma.classSession.count({ where: { ...ended, recordingUrl: null } }),
    prisma.classSession.findMany({ where: { ...ended, recordingUrl: null }, orderBy: { startAt: "desc" }, take: 6, select: pick }),
  ]);

  const [activeCount, noSess, noTutor, noMat, soon, closedWithPaid] = await Promise.all([
    prisma.product.count({ where: active }),
    prisma.product.findMany({ where: { ...active, sessions: { none: {} } }, select: { name: true, startDate: true }, take: 20 }),
    prisma.product.findMany({ where: { ...active, tutors: { none: {} } }, select: { name: true }, take: 20 }),
    prisma.product.findMany({ where: { ...active, materials: { none: {} } }, select: { name: true }, take: 20 }),
    prisma.product.findMany({ where: { ...active, startDate: { gte: dayStart, lt: new Date(dayStart.getTime() + 7 * DAY) } }, select: { name: true, startDate: true }, take: 10 }),
    // kelas yang semua pertemuannya sudah lewat & punya peserta lunas → sertifikat/rapor
    prisma.product.findMany({
      where: { type: { in: ["COC", "OTHER"] }, sessions: { some: {}, none: { endAt: { gte: now } } }, registrations: { some: { status: "PAID" } } },
      select: { id: true, name: true, _count: { select: { registrations: { where: { status: "PAID" } } } } },
      take: 30,
    }),
  ]);
  const certs = closedWithPaid.length
    ? await prisma.classResult.groupBy({ by: ["productId"], where: { productId: { in: closedWithPaid.map((p) => p.id) }, certificateNo: { not: null } }, _count: { _all: true } })
    : [];
  const needCert = closedWithPaid
    .map((p) => ({ name: p.name, missing: p._count.registrations - (certs.find((c) => c.productId === p.id)?._count._all ?? 0) }))
    .filter((p) => p.missing > 0);

  const [pubTutors, tutorRows, pubGames, gameRows, noExpl] = await Promise.all([
    prisma.tutor.count({ where: { isPublished: true } }),
    prisma.tutor.findMany({ where: { isPublished: true, OR: [{ foto: null }, { prestasi: null }, { bidang: null }] }, select: { nama: true, foto: true, prestasi: true, bidang: true }, take: 20 }),
    prisma.game.count({ where: { isPublished: true } }),
    prisma.game.findMany({ select: { title: true, isPublished: true, _count: { select: { questions: true } } }, take: 300 }),
    prisma.gameQuestion.count({ where: { OR: [{ explanation: null }, { explanation: "" }], game: { isPublished: true } } }),
  ]);
  const drafts = gameRows.filter((g) => !g.isPublished);
  const few = gameRows.filter((g) => g._count.questions < 10);

  const [actToday, actWeek, actLast, actRows] = await Promise.all([
    prisma.activityLog.aggregate({ where: { userId: ownerId, createdAt: { gte: dayStart, lt: dayEnd } }, _sum: { count: true } }),
    prisma.activityLog.aggregate({ where: { userId: ownerId, createdAt: { gte: weekStart, lt: weekEnd } }, _sum: { count: true } }),
    prisma.activityLog.aggregate({ where: { userId: ownerId, createdAt: { gte: new Date(weekStart.getTime() - 7 * DAY), lt: weekStart } }, _sum: { count: true } }),
    prisma.activityLog.groupBy({ by: ["entity"], where: { userId: ownerId, createdAt: { gte: weekStart, lt: weekEnd } }, _sum: { count: true } }),
  ]);
  const weekByGroup: Record<string, number> = { kelas: 0, pertemuan: 0, tutor: 0, games: 0 };
  for (const r of actRows) {
    const g = ACTIVITY_GROUP[r.entity as ActivityEntity];
    if (g) weekByGroup[g] += r._sum.count ?? 0;
  }

  const [todayTasks, agendas, overdueTasks] = await Promise.all([
    prisma.jobDaily.findMany({ where: { userId: ownerId, date: ymdToDate(date) }, select: { title: true } }),
    prisma.jobWeekly.findMany({ where: { week: { userId: ownerId, year, week } }, select: { id: true, title: true, category: true }, orderBy: { order: "asc" } }),
    prisma.jobDaily.count({ where: { userId: ownerId, done: false, date: { lt: ymdToDate(date), gte: ymdToDate(addDays(date, -14)) } } }),
  ]);

  return {
    kind: "ops",
    date,
    week: { year, week, dates },
    sessions: {
      today,
      todayNoLink,
      todayList: todayList.map(item),
      next7,
      next7NoLink,
      next7NoLinkList: next7NoLinkRows.map(item),
      noAttendance: noAtt,
      noAttendanceList: noAttRows.map(item),
      noWorksheet: noWs,
      noWorksheetList: noWsRows.map(item),
      noRecording: noRec,
      noRecordingList: noRecRows.map(item),
    },
    classes: {
      active: activeCount,
      noSessions: noSess.length,
      noSessionsList: noSess.slice(0, 6).map((p) => ({ nama: p.name, info: p.startDate ? `mulai ${dm(p.startDate)}` : "" })),
      noTutor: noTutor.length,
      noTutorList: noTutor.slice(0, 6).map((p) => ({ nama: p.name, info: "" })),
      noMaterial: noMat.length,
      noMaterialList: noMat.slice(0, 6).map((p) => ({ nama: p.name, info: "" })),
      startingSoon: soon.map((p) => ({ nama: p.name, info: p.startDate ? `mulai ${dm(p.startDate)}` : "" })),
      needCertificate: needCert.reduce((n, p) => n + p.missing, 0),
      needCertificateList: needCert.slice(0, 6).map((p) => ({ nama: p.name, info: `${p.missing} peserta belum bersertifikat` })),
    },
    tutors: {
      published: pubTutors,
      incomplete: tutorRows.length,
      incompleteList: tutorRows.slice(0, 6).map((t) => ({ nama: t.nama, info: [!t.foto && "foto", !t.prestasi && "prestasi", !t.bidang && "bidang"].filter(Boolean).join(", ") })),
    },
    games: {
      published: pubGames,
      drafts: drafts.length,
      draftList: drafts.slice(0, 6).map((g) => ({ nama: g.title, info: `${g._count.questions} soal` })),
      fewQuestions: few.length,
      fewQuestionsList: few.slice(0, 6).map((g) => ({ nama: g.title, info: `${g._count.questions} soal` })),
      noExplanation: noExpl,
    },
    activity: { today: actToday._sum.count ?? 0, week: actWeek._sum.count ?? 0, lastWeek: actLast._sum.count ?? 0, weekByGroup },
    jobdesk: { todayTitles: todayTasks.map((t) => t.title), agendas, overdueTasks },
  };
}

/* ======================= penyusun berbasis aturan ======================= */

const OPS_SOURCES = ["kelas", "pertemuan", "tutor", "games", "lainnya"] as const;
const names = (l: OpsItem[], n = 4) =>
  l
    .slice(0, n)
    .map((x) => (x.info ? `${x.nama} (${x.info})` : x.nama))
    .join("; ");

export function ruleOpsDaily(w: OpsWorkload): GenDaily[] {
  const out: GenDaily[] = [];
  const add = (t: Omit<GenDaily, "weeklyId">) => out.push({ ...t, weeklyId: null });
  if (w.sessions.today)
    add({
      title: `Siapkan ${w.sessions.today} pertemuan hari ini (link, materi, worksheet)`,
      notes: `${w.sessions.todayNoLink ? `${w.sessions.todayNoLink} pertemuan belum punya link meeting. ` : ""}Jadwal: ${names(w.sessions.todayList, 6)}.`,
      priority: "TINGGI",
      dueTime: "09:00",
      source: "pertemuan",
    });
  if (w.sessions.next7NoLink)
    add({
      title: `Isi link meeting ${w.sessions.next7NoLink} pertemuan 7 hari ke depan`,
      notes: `Di Produk & Materi › kelas › Pertemuan. Mulai dari: ${names(w.sessions.next7NoLinkList)}.`,
      priority: "TINGGI",
      dueTime: "10:00",
      source: "pertemuan",
    });
  if (w.sessions.noAttendance)
    add({
      title: `Catat absensi ${w.sessions.noAttendance} pertemuan yang sudah selesai`,
      notes: `Belum ada absensi sama sekali: ${names(w.sessions.noAttendanceList)}.`,
      priority: "TINGGI",
      dueTime: "11:00",
      source: "pertemuan",
    });
  if (w.sessions.noWorksheet)
    add({
      title: `Terbitkan worksheet ${w.sessions.noWorksheet} pertemuan yang sudah selesai`,
      notes: `Tambah/impor soal lalu terbitkan. Antara lain: ${names(w.sessions.noWorksheetList)}.`,
      priority: "SEDANG",
      dueTime: "13:00",
      source: "pertemuan",
    });
  if (w.sessions.noRecording)
    add({
      title: `Unggah link rekaman ${w.sessions.noRecording} pertemuan`,
      notes: `Agar peserta yang tertinggal bisa menonton ulang. Antara lain: ${names(w.sessions.noRecordingList)}.`,
      priority: "SEDANG",
      dueTime: "14:00",
      source: "pertemuan",
    });
  if (w.classes.noSessions)
    add({
      title: `Buat jadwal pertemuan untuk ${w.classes.noSessions} kelas aktif`,
      notes: `Pakai "Buat beberapa pertemuan sekaligus". Kelas: ${names(w.classes.noSessionsList)}.`,
      priority: "TINGGI",
      dueTime: "10:30",
      source: "kelas",
    });
  if (w.classes.noTutor)
    add({ title: `Tautkan tutor ke ${w.classes.noTutor} kelas aktif`, notes: `Kelas: ${names(w.classes.noTutorList)}.`, priority: "SEDANG", dueTime: "15:00", source: "tutor" });
  if (w.classes.noMaterial)
    add({ title: `Unggah materi untuk ${w.classes.noMaterial} kelas aktif`, notes: `Belum ada materi: ${names(w.classes.noMaterialList)}.`, priority: "SEDANG", dueTime: "15:00", source: "kelas" });
  if (w.classes.needCertificate)
    add({
      title: `Terbitkan ${w.classes.needCertificate} sertifikat peserta kelas yang sudah selesai`,
      notes: `Cek rekap nilai & catatan rapor dulu. ${names(w.classes.needCertificateList)}.`,
      priority: "SEDANG",
      dueTime: "16:00",
      source: "kelas",
    });
  if (w.tutors.incomplete)
    add({ title: `Lengkapi profil ${w.tutors.incomplete} tutor`, notes: `Yang kurang: ${names(w.tutors.incompleteList)}.`, priority: "RENDAH", dueTime: "", source: "tutor" });
  if (w.games.fewQuestions)
    add({
      title: `Tambah soal ${Math.min(w.games.fewQuestions, 3)} games (minimal 10 soal per game)`,
      notes: `Games dengan soal < 10: ${names(w.games.fewQuestionsList)}. Bisa pakai Generate soal AI.`,
      priority: "RENDAH",
      dueTime: "",
      source: "games",
    });
  if (w.games.noExplanation)
    add({ title: `Lengkapi pembahasan ${w.games.noExplanation} soal games`, notes: 'Tombol "Lengkapi pembahasan (AI)" di halaman game.', priority: "RENDAH", dueTime: "", source: "games" });
  add({ title: "Rekap pekerjaan operasional hari ini", notes: "Cek Performa Saya: aktivitas hari ini & KPI operasional.", priority: "RENDAH", dueTime: "17:00", source: "lainnya" });
  return out.sort((a, b) => (a.dueTime || "99").localeCompare(b.dueTime || "99"));
}

export function ruleOpsWeekly(w: OpsWorkload): { focus: string[]; agendas: GenAgenda[] } {
  const [, , , , fri, sat] = w.week.dates;
  const due = w.date > fri ? sat : fri;
  const agendas: GenAgenda[] = [
    {
      category: "PRIORITAS",
      title: "Semua pertemuan pekan ini siap & tercatat lengkap",
      objective: "Kelas berjalan tanpa kendala & data pertemuan lengkap",
      doneMeasure: `100% pertemuan punya link meeting, absensi tercatat, worksheet terbit (sekarang: ${w.sessions.next7NoLink} tanpa link, ${w.sessions.noAttendance} tanpa absensi, ${w.sessions.noWorksheet} worksheet belum terbit)`,
      leadMeasure: "Cek menu Pertemuan setiap pagi & setelah kelas selesai",
      steps: "Isi link meeting H-1\nCatat absensi setelah kelas\nTerbitkan worksheet & unggah rekaman",
      ld1: "Dikerjakan langsung di Produk & Materi",
      ld2: "Selesai dalam pekan ini",
      ld3: "Peserta & tutor mendapat kelas yang rapi; data rapor akurat",
      beneficiaries: "Peserta, tutor",
      dueDate: due,
    },
    {
      category: "PRIORITAS",
      title: `Kelas aktif siap jalan (${w.classes.active} kelas)`,
      objective: "Setiap kelas aktif punya jadwal, tutor, dan materi",
      doneMeasure: `0 kelas aktif tanpa jadwal (sekarang ${w.classes.noSessions}), tanpa tutor (${w.classes.noTutor}), tanpa materi (${w.classes.noMaterial})`,
      leadMeasure: "Lengkapi 1–2 kelas per hari",
      steps: "Buat jadwal pertemuan\nTautkan tutor\nUnggah materi awal",
      ld1: "Data kelas tersedia di sistem",
      ld2: "Bisa selesai 1 pekan",
      ld3: "Calon peserta melihat kelas yang lengkap",
      beneficiaries: "Peserta, tim sales",
      dueDate: due,
    },
    {
      category: "SISTEM",
      title: "Kualitas games: minimal 10 soal & pembahasan lengkap",
      objective: "Games menarik & mendidik",
      doneMeasure: `${w.games.fewQuestions} game dengan soal < 10 dilengkapi; ${w.games.noExplanation} soal tanpa pembahasan dilengkapi`,
      leadMeasure: "Lengkapi 1 game per hari",
      steps: "Generate soal AI\nPeriksa & simpan\nLengkapi pembahasan",
      ld1: "Fitur AI tersedia",
      ld2: "Bisa selesai 1 pekan",
      ld3: "Peserta belajar sambil bermain",
      beneficiaries: "Peserta",
      dueDate: due,
    },
    {
      category: "PEOPLE",
      title: "Profil tutor lengkap & terkoordinasi",
      objective: "Tutor tampil profesional di situs",
      doneMeasure: `${w.tutors.incomplete} profil tutor dilengkapi (foto, bidang, prestasi)`,
      leadMeasure: "Minta data ke tutor & perbarui di menu Tutor",
      steps: "Hubungi tutor\nPerbarui profil\nCek tampilan halaman /tutor",
      ld1: "Bisa dikerjakan sendiri",
      ld2: "Selesai dalam pekan ini",
      ld3: "Calon peserta lebih percaya",
      beneficiaries: "Calon peserta, tutor",
      dueDate: due,
    },
  ];
  return {
    focus: [
      `Kesiapan ${w.sessions.next7} pertemuan 7 hari ke depan`,
      `Kelengkapan ${w.classes.active} kelas aktif`,
      w.classes.needCertificate ? `Sertifikat ${w.classes.needCertificate} peserta` : "Kualitas games & profil tutor",
    ],
    agendas,
  };
}

/* ======================= AI ======================= */

const ROLE =
  "Kamu asisten kerja untuk Admin SmartChampion POSI — admin OPERASIONAL pelatihan (bukan sales). " +
  "Tugasnya di panel: kelola kelas/produk & materi, jadwal pertemuan (link meeting, rekaman), worksheet (soal & terbit), absensi & nilai, " +
  "sertifikat & rapor, profil tutor, dan games edukasi (soal & pembahasan). Tulis dalam bahasa Indonesia yang ringkas & operasional. " +
  "Gunakan ANGKA & NAMA dari data (jangan mengarang). Jangan membuat tugas penjualan, follow-up lead, blast, atau chat customer.";

export async function generateOpsDaily(w: OpsWorkload): Promise<GenResult<GenDaily[], OpsWorkload>> {
  const fallback = () => cleanDaily(ruleOpsDaily(w), w, OPS_SOURCES);
  if (!groqConfigured()) return { items: fallback(), byAi: false, workload: w, note: "AI belum aktif — disusun otomatis dari data." };
  try {
    const res = await withDeadline(
      groqJson<{ tasks: unknown[] }>(
        [
          {
            role: "system",
            content: [
              ROLE,
              "Susun 5–10 jobdesk HARIAN untuk tanggal yang diminta berdasarkan data operasional (JSON `data`).",
              "`kerangka` = tugas wajib yang angkanya sudah dihitung pasti dari database: PAKAI SEMUA, JANGAN mengubah angkanya, jangan menggandakannya.",
              "Tugasmu: perjelas judul & notes (cara kerja di menu mana, kelas/game mana yang didahulukan dari daftar nama di data), atur urutan & jam, pilih weeklyId, boleh menambah maksimal 3 tugas lain yang relevan dari data tanpa angka baru.",
              "Urutan: pertemuan hari ini & link meeting → absensi/worksheet pertemuan yang lewat → jadwal/tutor/materi kelas → sertifikat → tutor & games → rekap sore.",
              "Judul ≤ 90 karakter diawali kata kerja, spesifik & terukur (jumlah kelas/pertemuan/soal).",
              "dueTime HH:MM antara 08:00–17:00 (boleh kosong), priority TINGGI/SEDANG/RENDAH, source kelas/pertemuan/tutor/games/lainnya.",
              "weeklyId = id agenda pekanan yang paling sesuai dari jobdesk.agendas, atau 0 bila tidak ada. Jangan mengulang jobdesk.todayTitles. Jangan buat tugas untuk angka 0.",
            ].join("\n"),
          },
          { role: "user", content: JSON.stringify({ data: w, kerangka: ruleOpsDaily(w).map(({ title, notes, priority, dueTime, source }) => ({ title, notes, priority, dueTime, source })) }) },
        ],
        "jobdesk_harian_ops",
        dailySchema(OPS_SOURCES),
        { temperature: 0.4, reasoningEffort: "low", timeoutMs: 30_000, maxTokens: 4000 },
      ),
    );
    const items = cleanDaily(res.tasks ?? [], w, OPS_SOURCES);
    if (items.length >= 3) return { items, byAi: true, workload: w };
  } catch (e) {
    console.error("[jobdesk-ai-ops] harian:", (e as Error).message);
  }
  return { items: fallback(), byAi: false, workload: w, note: "AI sedang tidak tersedia — disusun otomatis dari data." };
}

export async function generateOpsWeekly(w: OpsWorkload): Promise<GenResult<GenWeekly, OpsWorkload>> {
  const fallback = () => cleanWeekly(ruleOpsWeekly(w) as unknown as { focus: unknown[]; agendas: unknown[] }, w);
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
              "- PRIORITAS 1–3 agenda (paling berdampak pada kelancaran kelas: kesiapan pertemuan, kelengkapan kelas aktif, sertifikat/rapor), SISTEM 1–2 (perbaikan cara kerja: template materi, bank soal worksheet/games, checklist pertemuan), PEOPLE 1–2 (koordinasi tutor, kualitas layanan ke peserta); total agenda utama 3–5. OPERASIONAL (BAU) 0–2 untuk rutinitas.",
              "- Tiap agenda: title ringkas & terukur; objective 1 kalimat; doneMeasure pakai angka dari data; leadMeasure = aktivitas harian pendorongnya; steps 3–5 langkah (satu per baris, tanpa nomor);",
              "  ld1 (bisa dikerjakan pekan ini tanpa menunggu pihak lain?), ld2 (bisa selesai 1 pekan?), ld3 (siapa yang menikmati hasilnya & bedanya); beneficiaries singkat; dueDate YYYY-MM-DD di dalam pekan.",
              "- focus = 2–4 poin fokus pekan (pendek). Jangan mengulang jobdesk.agendas. Angka harus sama dengan data/kerangka.",
            ].join("\n"),
          },
          { role: "user", content: JSON.stringify({ data: w, kerangka: ruleOpsWeekly(w) }) },
        ],
        "agenda_pekanan_ops",
        WEEKLY_SCHEMA,
        { temperature: 0.4, reasoningEffort: "low", timeoutMs: 35_000, maxTokens: 6000 },
      ),
    );
    const items = cleanWeekly(res, w);
    if (items.agendas.length >= 2) return { items, byAi: true, workload: w };
  } catch (e) {
    console.error("[jobdesk-ai-ops] pekanan:", (e as Error).message);
  }
  return { items: fallback(), byAi: false, workload: w, note: "AI sedang tidak tersedia — disusun otomatis dari data." };
}

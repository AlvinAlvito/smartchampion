import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { SessionPayload } from "./session";
import type { DateRange } from "./date-range";
import { ACTIVITY_GROUP, GROUP_LABEL, describeActivity, entityLabel, type ActivityEntity } from "./activity-shared";

/**
 * Kinerja Admin SmartChampion (operasional pelatihan).
 * - Volume kerja: dihitung dari log aktivitas (activity_logs) — tutor, kelas & materi, pertemuan/worksheet/absensi/nilai, sertifikat, games.
 * - KPI kualitas operasional: kondisi kelas/pertemuan/tutor/games (milik tim operasional, bukan per orang).
 */

const DAY = 86_400_000;
const WIB = 7 * 3600_000;
const wibDay = (d: Date) => new Date(d.getTime() + WIB).toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const fmtDay = (k: string) => `${Number(k.slice(8, 10))} ${MONTHS[Number(k.slice(5, 7)) - 1]}`;

export type OpsScope = { ownerId?: number; ownerName: string };

/** Admin SmartChampion → dirinya; Root/Superadmin → admin terpilih atau semua admin SmartChampion. */
export async function resolveOpsScope(session: SessionPayload, ownerParam: string | null): Promise<OpsScope | null> {
  if (session.role === "SMARTCHAMPION") return { ownerId: session.userId, ownerName: session.name };
  if (session.role !== "ROOT" && session.role !== "SUPERADMIN") return null;
  const id = Number(ownerParam);
  if (!ownerParam || !Number.isInteger(id) || id <= 0) return { ownerName: "Semua Admin SmartChampion" };
  const u = await prisma.user.findFirst({ where: { id, role: "SMARTCHAMPION" }, select: { id: true, name: true } });
  return u ? { ownerId: u.id, ownerName: u.name } : null;
}

export const opsStaff = () => prisma.user.findMany({ where: { role: "SMARTCHAMPION" }, select: { id: true, name: true, isActive: true }, orderBy: { id: "asc" } });

/** hari kerja (Senin–Sabtu) dalam [start, end) */
function workdays(start: Date, end: Date) {
  let n = 0;
  for (let t = start.getTime(); t < end.getTime(); t += DAY) {
    const dow = new Date(t + WIB).getUTCDay();
    if (dow !== 0) n++;
  }
  return Math.max(1, n);
}

export type Kpi = {
  key: string;
  label: string;
  /** penjelasan cara hitung */
  basis: string;
  value: number;
  total: number;
  /** persen tercapai (0–100) */
  pct: number;
  target: number;
  status: "baik" | "cukup" | "kurang" | "na";
  /** KPI tim (kondisi data), bukan hasil satu orang */
  team: boolean;
};

const kpi = (k: Omit<Kpi, "pct" | "status">): Kpi => {
  if (!k.total) return { ...k, pct: 0, status: "na" };
  const pct = Math.round((k.value / k.total) * 100);
  return { ...k, pct, status: pct >= k.target ? "baik" : pct >= k.target * 0.75 ? "cukup" : "kurang" };
};

export type OpsCount = { key: string; label: string; value: number; hint?: string; group: keyof typeof GROUP_LABEL };

export async function buildOpsReport(range: Pick<DateRange, "start" | "end" | "label" | "preset">, scope: OpsScope, opts: { logLimit?: number } = {}) {
  const now = new Date();
  const staff = await opsStaff();
  const userFilter: Prisma.ActivityLogWhereInput = scope.ownerId ? { userId: scope.ownerId } : { userId: { in: staff.map((s) => s.id) } };
  const created: Prisma.DateTimeFilter | undefined = range.start || range.end ? { ...(range.start ? { gte: range.start } : {}), ...(range.end ? { lt: range.end } : {}) } : undefined;
  const logs = await prisma.activityLog.findMany({
    where: { ...userFilter, ...(created ? { createdAt: created } : {}) },
    orderBy: { createdAt: "desc" },
    take: 20_000,
    include: { user: { select: { name: true } } },
  });

  const start = range.start ?? (logs.length ? new Date(Date.parse(`${wibDay(logs[logs.length - 1].createdAt)}T00:00:00+07:00`)) : new Date(now.getTime() - 30 * DAY));
  const end = range.end && range.end < new Date(now.getTime() + DAY) ? range.end : new Date(Date.parse(`${wibDay(now)}T00:00:00+07:00`) + DAY);
  const days = workdays(start, end);

  /* ---------- volume ---------- */
  const sum = (f: (l: (typeof logs)[number]) => boolean) => logs.filter(f).reduce((n, l) => n + l.count, 0);
  const is = (e: ActivityEntity, ...acts: string[]) => (l: (typeof logs)[number]) => l.entity === e && (!acts.length || acts.includes(l.action));
  const distinct = (f: (l: (typeof logs)[number]) => number | null) => new Set(logs.map(f).filter((x): x is number => x != null)).size;
  const activeDays = new Set(logs.map((l) => wibDay(l.createdAt))).size;
  const total = logs.reduce((n, l) => n + l.count, 0);

  const counts: OpsCount[] = [
    { key: "kelasDikelola", label: "Kelas dikelola", value: distinct((l) => (ACTIVITY_GROUP[l.entity as ActivityEntity] === "kelas" || ACTIVITY_GROUP[l.entity as ActivityEntity] === "pertemuan" ? l.productId : null)), hint: "kelas berbeda yang disentuh", group: "kelas" },
    { key: "kelasBaru", label: "Kelas baru", value: sum(is("PRODUCT", "CREATE")), group: "kelas" },
    { key: "materi", label: "Materi diunggah", value: sum(is("MATERIAL", "CREATE")), hint: `${sum(is("MATERIAL", "UPDATE"))} materi diperbarui`, group: "kelas" },
    { key: "pertemuan", label: "Pertemuan dibuat", value: sum(is("SESSION", "CREATE")), hint: `${sum(is("SESSION", "UPDATE"))} pertemuan diperbarui`, group: "pertemuan" },
    { key: "soalWorksheet", label: "Soal worksheet ditambah", value: sum(is("WORKSHEET", "CREATE", "GENERATE", "IMPORT")), hint: `${sum(is("WORKSHEET", "PUBLISH"))} worksheet diterbitkan`, group: "pertemuan" },
    { key: "absensi", label: "Absensi dicatat", value: sum(is("ATTENDANCE")), hint: `${distinct((l) => (l.entity === "ATTENDANCE" ? l.entityId : null))} pertemuan`, group: "pertemuan" },
    { key: "nilai", label: "Nilai diinput", value: sum(is("SCORE")), group: "pertemuan" },
    { key: "sertifikat", label: "Sertifikat diterbitkan", value: sum(is("GRADUATION", "ISSUE")), hint: `${sum(is("GRADUATION", "PUBLISH"))}x rapor diterbitkan`, group: "kelas" },
    { key: "tutor", label: "Tutor dikelola", value: distinct((l) => (l.entity === "TUTOR" ? (l.entityId ?? -l.id) : null)), hint: `${sum(is("TUTOR", "CREATE"))} tutor baru`, group: "tutor" },
    { key: "games", label: "Games dikelola", value: distinct((l) => l.gameId), hint: `${sum(is("GAME", "CREATE"))} game baru · ${sum(is("GAME", "PUBLISH"))} dirilis`, group: "games" },
    { key: "soalGames", label: "Soal games ditambah", value: sum(is("GAME_QUESTION", "CREATE", "GENERATE")), hint: `${sum(is("GAME_QUESTION", "UPDATE"))} soal diperbarui`, group: "games" },
  ];

  /* ---------- per kelompok & per entitas ---------- */
  const groups = Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[];
  const byGroup = groups.map((g) => ({ key: g, label: GROUP_LABEL[g], value: sum((l) => ACTIVITY_GROUP[l.entity as ActivityEntity] === g) }));
  const entities = [...new Set(logs.map((l) => l.entity))];
  const byEntity = entities
    .map((e) => {
      const of = (a: string[]) => logs.filter((l) => l.entity === e && a.includes(l.action)).reduce((n, l) => n + l.count, 0);
      const create = of(["CREATE", "GENERATE", "IMPORT", "ISSUE"]);
      const update = of(["UPDATE", "PUBLISH", "UNPUBLISH", "RESET"]);
      const del = of(["DELETE", "REVOKE"]);
      return { entity: e, label: entityLabel(e), create, update, del, total: create + update + del };
    })
    .sort((a, b) => b.total - a.total);

  /* ---------- tren harian / pekanan ---------- */
  const spanDays = Math.round((end.getTime() - start.getTime()) / DAY);
  const weekly = spanDays > 45;
  const keyOf = (d: Date) => {
    const k = wibDay(d);
    if (!weekly) return k;
    const w = new Date(`${k}T00:00:00Z`);
    const dow = (w.getUTCDay() + 6) % 7;
    return new Date(w.getTime() - dow * DAY).toISOString().slice(0, 10);
  };
  const bucketKeys: string[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += weekly ? 7 * DAY : DAY) {
    const k = keyOf(new Date(t));
    if (!bucketKeys.includes(k)) bucketKeys.push(k);
  }
  const trend = bucketKeys.slice(-120).map((k) => {
    const row: Record<string, string | number> = { key: k, label: weekly ? `Pekan ${fmtDay(k)}` : fmtDay(k) };
    for (const g of groups) row[g] = 0;
    return row;
  });
  const trendMap = new Map(trend.map((r) => [r.key as string, r]));
  for (const l of logs) {
    const r = trendMap.get(keyOf(l.createdAt));
    const g = ACTIVITY_GROUP[l.entity as ActivityEntity];
    if (r && g) r[g] = (r[g] as number) + l.count;
  }

  /* ---------- per kelas & per game ---------- */
  const productIds = [...new Set(logs.map((l) => l.productId).filter((x): x is number => x != null))];
  const gameIds = [...new Set(logs.map((l) => l.gameId).filter((x): x is number => x != null))];
  const [products, games] = await Promise.all([
    productIds.length ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }) : [],
    gameIds.length ? prisma.game.findMany({ where: { id: { in: gameIds } }, select: { id: true, title: true } }) : [],
  ]);
  const pName = new Map(products.map((p) => [p.id, p.name]));
  const gName = new Map(games.map((g) => [g.id, g.title]));
  const perKelas = productIds
    .map((id) => {
      const mine = logs.filter((l) => l.productId === id);
      const c = (e: ActivityEntity[]) => mine.filter((l) => e.includes(l.entity as ActivityEntity)).reduce((n, l) => n + l.count, 0);
      return {
        id,
        name: pName.get(id) ?? mine.find((l) => l.entity === "PRODUCT")?.label ?? `Kelas #${id} (dihapus)`,
        total: mine.reduce((n, l) => n + l.count, 0),
        kelas: c(["PRODUCT", "PACKAGE"]),
        materi: c(["MATERIAL"]),
        pertemuan: c(["SESSION"]),
        worksheet: c(["WORKSHEET"]),
        absensiNilai: c(["ATTENDANCE", "SCORE"]),
        kelulusan: c(["GRADUATION"]),
        last: mine[0].createdAt,
      };
    })
    .sort((a, b) => b.total - a.total);
  const perGame = gameIds
    .map((id) => {
      const mine = logs.filter((l) => l.gameId === id);
      return {
        id,
        name: gName.get(id) ?? mine[0].label ?? `Game #${id} (dihapus)`,
        total: mine.reduce((n, l) => n + l.count, 0),
        soal: mine.filter((l) => l.entity === "GAME_QUESTION").reduce((n, l) => n + l.count, 0),
        last: mine[0].createdAt,
      };
    })
    .sort((a, b) => b.total - a.total);

  /* ---------- per admin (pemantauan Root/Superadmin) ---------- */
  const perAdmin = scope.ownerId
    ? []
    : staff.map((u) => {
        const mine = logs.filter((l) => l.userId === u.id);
        return {
          id: u.id,
          name: u.name,
          isActive: u.isActive,
          total: mine.reduce((n, l) => n + l.count, 0),
          activeDays: new Set(mine.map((l) => wibDay(l.createdAt))).size,
          kelas: new Set(mine.map((l) => l.productId).filter(Boolean)).size,
          games: new Set(mine.map((l) => l.gameId).filter(Boolean)).size,
          last: mine[0]?.createdAt ?? null,
        };
      });

  /* ---------- KPI kualitas operasional (kondisi data tim) ---------- */
  const past = { startAt: { gte: start, lt: end }, endAt: { lt: now } };
  const next7 = { startAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY) } };
  const activeClass = { status: { in: ["OPEN", "RUNNING"] as ("OPEN" | "RUNNING")[] }, type: "COC" as const };
  const [pastSessions, withAttendance, withWorksheet, withRecording, upcoming, upcomingLinked, classes, classesWithSessions, classesWithTutor, pubGames, pubTutors, goodTutors] =
    await Promise.all([
      prisma.classSession.count({ where: past }),
      prisma.classSession.count({ where: { ...past, attendances: { some: {} } } }),
      prisma.classSession.count({ where: { ...past, worksheetPublished: true } }),
      prisma.classSession.count({ where: { ...past, recordingUrl: { not: null } } }),
      prisma.classSession.count({ where: next7 }),
      prisma.classSession.count({ where: { ...next7, meetingUrl: { not: null } } }),
      prisma.product.count({ where: activeClass }),
      prisma.product.count({ where: { ...activeClass, sessions: { some: {} } } }),
      prisma.product.count({ where: { ...activeClass, tutors: { some: {} } } }),
      prisma.game.count({ where: { isPublished: true } }),
      prisma.tutor.count({ where: { isPublished: true } }),
      prisma.tutor.count({ where: { isPublished: true, foto: { not: null }, prestasi: { not: null } } }),
    ]);
  // game "berkualitas" juga minimal 10 soal
  const goodGames10 = pubGames
    ? (await prisma.game.findMany({ where: { isPublished: true }, select: { questions: { select: { explanation: true } } } })).filter(
        (g) => g.questions.length >= 10 && g.questions.every((q) => q.explanation?.trim()),
      ).length
    : 0;

  const kpis: Kpi[] = [
    kpi({ key: "hariAktif", label: "Hari aktif bekerja", basis: `hari dengan aktivitas tercatat dari ${days} hari kerja (Senin–Sabtu)`, value: Math.min(activeDays, days), total: days, target: 80, team: false }),
    kpi({ key: "absensi", label: "Absensi pertemuan tercatat", basis: "pertemuan yang sudah selesai pada periode ini & sudah diabsen", value: withAttendance, total: pastSessions, target: 100, team: true }),
    kpi({ key: "worksheet", label: "Worksheet diterbitkan", basis: "pertemuan selesai pada periode ini yang worksheet-nya terbit", value: withWorksheet, total: pastSessions, target: 90, team: true }),
    kpi({ key: "rekaman", label: "Rekaman pertemuan diunggah", basis: "pertemuan selesai pada periode ini yang punya link rekaman", value: withRecording, total: pastSessions, target: 80, team: true }),
    kpi({ key: "linkMeeting", label: "Link meeting siap (7 hari ke depan)", basis: "pertemuan 7 hari ke depan yang sudah punya link Zoom/Meet", value: upcomingLinked, total: upcoming, target: 100, team: true }),
    kpi({ key: "jadwal", label: "Kelas aktif punya jadwal", basis: "kelas COC dibuka/berjalan yang sudah punya pertemuan", value: classesWithSessions, total: classes, target: 100, team: true }),
    kpi({ key: "tutorKelas", label: "Kelas aktif punya tutor", basis: "kelas COC dibuka/berjalan yang sudah ditautkan tutor", value: classesWithTutor, total: classes, target: 100, team: true }),
    kpi({ key: "games", label: "Games terbit berkualitas", basis: "games terbit dengan ≥ 10 soal & semua soal punya pembahasan", value: goodGames10, total: pubGames, target: 80, team: true }),
    kpi({ key: "profilTutor", label: "Profil tutor lengkap", basis: "tutor tampil yang punya foto & prestasi", value: goodTutors, total: pubTutors, target: 90, team: true }),
  ];
  const scored = kpis.filter((k) => k.status !== "na");
  const score = scored.length ? Math.round(scored.reduce((n, k) => n + Math.min(1, k.pct / k.target), 0) / scored.length * 100) : 0;

  return {
    scope,
    range: { label: range.label, preset: range.preset },
    generatedAt: now,
    workdays: days,
    activeDays,
    total,
    actions: logs.length,
    perDay: Math.round((total / days) * 10) / 10,
    counts,
    byGroup,
    byEntity,
    trend,
    weekly,
    perKelas,
    perGame,
    perAdmin,
    kpis,
    score,
    logs: logs.slice(0, opts.logLimit ?? 500).map((l) => ({
      id: l.id,
      at: l.createdAt,
      user: l.user.name,
      entity: l.entity,
      action: l.action,
      group: ACTIVITY_GROUP[l.entity as ActivityEntity] ?? "kelas",
      text: describeActivity(l),
      kelas: l.productId ? (pName.get(l.productId) ?? null) : null,
      game: l.gameId ? (gName.get(l.gameId) ?? null) : null,
    })),
    logTotal: logs.length,
  };
}
export type OpsReport = Awaited<ReturnType<typeof buildOpsReport>>;

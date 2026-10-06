import "server-only";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import type { SessionPayload } from "./session";
import { dateToYmd, isoWeekday, todayWib, weekDates, ymdToDate } from "./jobdesk-shared";

/**
 * Hak akses Jobdesk:
 * - ADMIN (Admin Pelatihan, sales) & SMARTCHAMPION (Admin SmartChampion, operasional): jobdesk miliknya sendiri, CRUD penuh.
 * - ROOT: memilih admin mana pun, CRUD penuh + memberi catatan root.
 * - SUPERADMIN: memilih admin mana pun, lihat saja.
 */
export type JobdeskAccess = {
  ownerId: number;
  ownerName: string;
  /** peran pemilik jobdesk: ADMIN (sales) / SMARTCHAMPION (operasional) */
  ownerRole: Role | null;
  canEdit: boolean;
  /** boleh memberi catatan root / evaluasi */
  canReview: boolean;
  /** boleh mengunduh agenda pekanan */
  canDownload: boolean;
  /** daftar admin yang bisa dipilih (Root & Superadmin) */
  admins: { id: number; name: string; role: Role }[];
};

/** peran yang punya jobdesk */
export const JOBDESK_OWNER_ROLES: Role[] = ["ADMIN", "SMARTCHAMPION"];
export const JOBDESK_ROLES: Role[] = ["ROOT", "SUPERADMIN", ...JOBDESK_OWNER_ROLES];

export async function jobdeskAccess(session: SessionPayload, wantedOwner?: number | null): Promise<JobdeskAccess | null> {
  if (session.role === "ADMIN" || session.role === "SMARTCHAMPION") {
    return { ownerId: session.userId, ownerName: session.name, ownerRole: session.role, canEdit: true, canReview: false, canDownload: true, admins: [] };
  }
  if (session.role !== "ROOT" && session.role !== "SUPERADMIN") return null;
  const admins = await prisma.user.findMany({
    where: { role: { in: JOBDESK_OWNER_ROLES }, isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { id: "asc" }],
  });
  const owner = admins.find((a) => a.id === wantedOwner) ?? admins[0];
  if (!owner) return { ownerId: 0, ownerName: "", ownerRole: null, canEdit: false, canReview: false, canDownload: false, admins };
  const root = session.role === "ROOT";
  return { ownerId: owner.id, ownerName: owner.name, ownerRole: owner.role, canEdit: root, canReview: root, canDownload: root, admins };
}

/** Untuk server action: boleh mengubah jobdesk milik `ownerId`? */
export async function canEditJobdesk(session: SessionPayload, ownerId: number) {
  if (session.role === "ADMIN" || session.role === "SMARTCHAMPION") return ownerId === session.userId;
  if (session.role !== "ROOT") return false;
  return (await prisma.user.count({ where: { id: ownerId, role: { in: JOBDESK_OWNER_ROLES } } })) > 0;
}

/** Judul peran untuk sampul agenda & halaman */
export function jobdeskRoleTitle(role: Role | null | undefined) {
  return role === "SMARTCHAMPION" ? "Admin SmartChampion" : "Admin Pelatihan";
}

/**
 * Rutin harian → baris checklist pada tanggal-tanggal yang diminta (hanya hari aktif, sejak rutin dibuat).
 * Idempoten (unik routineId + date), jadi aman dipanggil setiap halaman dibuka.
 */
export async function ensureRoutineTasks(ownerId: number, dates: string[]) {
  const routines = await prisma.jobRoutine.findMany({ where: { userId: ownerId, isActive: true } });
  if (!routines.length) return;
  const data = [];
  for (const r of routines) {
    const days = r.weekdays.split(",").map(Number);
    const since = dateToYmd(new Date(r.createdAt.getTime() + 7 * 3600_000));
    for (const d of dates) {
      if (d < since || !days.includes(isoWeekday(d))) continue;
      data.push({
        userId: ownerId,
        date: ymdToDate(d),
        title: r.title,
        notes: r.notes,
        priority: r.priority,
        dueTime: r.dueTime,
        routineId: r.id,
        order: -1000 + r.order,
      });
    }
  }
  if (data.length) await prisma.jobDaily.createMany({ data, skipDuplicates: true });
}

/** Semua data satu pekan untuk halaman Jobdesk & dokumen agenda pekanan */
export async function loadJobWeek(ownerId: number, year: number, week: number) {
  const dates = weekDates(year, week);
  await ensureRoutineTasks(ownerId, dates);
  const today = todayWib();
  const [plan, dailies, overdue, routines] = await Promise.all([
    prisma.jobWeek.findUnique({
      where: { userId_year_week: { userId: ownerId, year, week } },
      include: { agendas: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
    }),
    prisma.jobDaily.findMany({
      where: { userId: ownerId, date: { gte: ymdToDate(dates[0]), lte: ymdToDate(dates[6]) } },
      orderBy: [{ date: "asc" }, { done: "asc" }, { order: "asc" }, { id: "asc" }],
    }),
    // tugas hari-hari sebelumnya (maks. 14 hari) yang belum dicentang
    prisma.jobDaily.findMany({
      where: { userId: ownerId, done: false, date: { lt: ymdToDate(today), gte: ymdToDate(dateToYmd(new Date(Date.parse(today) - 14 * 86400_000))) } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      take: 50,
    }),
    prisma.jobRoutine.findMany({ where: { userId: ownerId }, orderBy: [{ order: "asc" }, { id: "asc" }] }),
  ]);
  return { dates, plan, dailies, overdue, routines };
}
export type JobWeekData = Awaited<ReturnType<typeof loadJobWeek>>;

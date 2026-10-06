import "server-only";
import { prisma } from "./prisma";

export type LoginInfo = {
  lastLoginAt: Date | null;
  lastSeenAt: Date | null;
  /** jejak aktivitas peserta sebelum login mulai dicatat (worksheet, absen mandiri, games, feedback) */
  lastActivityAt: Date | null;
};

/** Pencatatan login dimulai pada rilis ini — sebelum tanggal ini login belum tercatat */
export const LOGIN_TRACKING_SINCE = "6 Okt 2026";

/** Login terakhir, terakhir aktif, dan aktivitas terakhir untuk sekumpulan akun peserta. */
export async function loginInfo(userIds: (number | null)[]) {
  const ids = [...new Set(userIds.filter((x): x is number => !!x))];
  const map = new Map<number, LoginInfo>();
  if (!ids.length) return map;
  const [users, ws, att, games, fb] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, lastLoginAt: true, lastSeenAt: true } }),
    prisma.worksheetAttempt.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { submittedAt: true } }),
    prisma.attendance.groupBy({ by: ["userId"], where: { userId: { in: ids }, method: "SELF" }, _max: { updatedAt: true } }),
    prisma.gameScore.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { createdAt: true } }),
    prisma.feedback.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { updatedAt: true } }),
  ]);
  const latest = (...d: (Date | null | undefined)[]) => d.filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  for (const u of users) {
    map.set(u.id, {
      lastLoginAt: u.lastLoginAt,
      lastSeenAt: u.lastSeenAt,
      lastActivityAt: latest(
        ws.find((x) => x.userId === u.id)?._max.submittedAt,
        att.find((x) => x.userId === u.id)?._max.updatedAt,
        games.find((x) => x.userId === u.id)?._max.createdAt,
        fb.find((x) => x.userId === u.id)?._max.updatedAt,
      ),
    });
  }
  return map;
}

/** Sudah pernah masuk ke akunnya (tercatat login/aktif, atau ada jejak aktivitas) */
export const hasLoggedIn = (i?: LoginInfo) => !!(i && (i.lastLoginAt || i.lastSeenAt || i.lastActivityAt));

import "server-only";
import { prisma } from "./prisma";
import { average, gradeOf, meetingPhase } from "./worksheet-shared";

/**
 * Rekap nilai & kehadiran satu kelas (per peserta × per pertemuan).
 * Nilai pertemuan = nilai manual tutor/admin bila ada, selain itu nilai worksheet; worksheet terbit yang lewat batas & tidak dikerjakan dihitung 0.
 * Nilai akhir = rata-rata semua nilai pertemuan + nilai Try Out Mimpi.mu (bila sudah diisi) — seperti format rapor.
 * Persentase hadir dihitung dari pertemuan yang sudah dimulai.
 */
export async function getClassRecap(productId: number) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, slug: true } });
  if (!product) return null;
  const [sessions, regs] = await Promise.all([
    prisma.classSession.findMany({
      where: { productId },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        worksheetPublished: true,
        worksheetDueAt: true,
        _count: { select: { worksheetQuestions: true } },
        worksheetAttempts: { select: { userId: true, score: true, grade: true } },
        attendances: { select: { userId: true, status: true } },
        manualScores: { select: { userId: true, score: true, note: true, updatedBy: true } },
      },
    }),
    prisma.registration.findMany({
      where: { productId, status: "PAID" },
      select: { userId: true, fullName: true, school: true, phone: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  const tryouts = await prisma.classResult.findMany({
    where: { productId, tryoutScore: { not: null } },
    select: { userId: true, tryoutScore: true, tryoutNote: true },
  });
  const tryoutBy = new Map(tryouts.map((t) => [t.userId, t]));
  const people = [...new Map(regs.map((r) => [r.userId, r])).values()];
  const now = Date.now();
  const meetings = sessions.map((s, i) => ({
    id: s.id,
    number: i + 1,
    title: s.title,
    startAt: s.startAt,
    started: meetingPhase(s, now) !== "upcoming",
    graded: s.worksheetPublished && s._count.worksheetQuestions > 0,
    closed: s.worksheetPublished && !!s.worksheetDueAt && s.worksheetDueAt.getTime() < now,
  }));

  const rows = people.map((p) => {
    const cells = sessions.map((s, i) => {
      const a = s.worksheetAttempts.find((x) => x.userId === p.userId);
      const att = s.attendances.find((x) => x.userId === p.userId);
      const manual = s.manualScores.find((x) => x.userId === p.userId);
      const missed = !manual && !a && meetings[i].closed;
      const worksheetScore = a?.score ?? (meetings[i].closed && !a ? 0 : null);
      const score = manual ? manual.score : (a?.score ?? (missed ? 0 : null));
      return {
        score: score == null ? null : Math.round(score * 10) / 10,
        grade: manual ? gradeOf(manual.score) : (a?.grade ?? (missed ? "E" : null)),
        missed,
        attendance: att?.status ?? null,
        /** nilai diisi manual (menggantikan nilai worksheet) */
        manual: manual ? { note: manual.note, updatedBy: manual.updatedBy } : null,
        /** nilai otomatis worksheet (untuk ditampilkan saat nilai manual dipakai) */
        worksheetScore,
      };
    });
    const t = tryoutBy.get(p.userId);
    const tryout = t?.tryoutScore != null ? Math.round(t.tryoutScore * 10) / 10 : null;
    const scores = [...cells.filter((c) => c.score != null).map((c) => c.score!), ...(tryout != null ? [tryout] : [])];
    const avg = average(scores);
    const started = meetings.filter((m) => m.started).length;
    const present = cells.filter((c) => c.attendance === "HADIR").length;
    return {
      userId: p.userId,
      name: p.fullName,
      school: p.school,
      phone: p.phone,
      cells,
      tryout,
      tryoutNote: t?.tryoutNote ?? null,
      average: avg,
      grade: avg == null ? null : gradeOf(avg),
      worksheetsDone: cells.filter((c) => c.score != null && !c.missed).length,
      present,
      attendanceRate: started ? Math.round((present / started) * 100) : null,
    };
  });

  const classAvg = average(rows.filter((r) => r.average != null).map((r) => r.average!));
  return { product, meetings, rows, classAvg, startedCount: meetings.filter((m) => m.started).length };
}

export type ClassRecap = NonNullable<Awaited<ReturnType<typeof getClassRecap>>>;

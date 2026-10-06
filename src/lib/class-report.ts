import "server-only";
import { prisma } from "./prisma";
import { getClassRecap } from "./class-recap";
import { JENJANG_LABEL } from "./constants";
import { PREDIKAT } from "./certificate";
import { formatDate } from "./utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTHS_LONG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const wib = (d: Date) => new Date(d.getTime() + 7 * 3600_000);

/** "12 Sep – 31 Okt 2026" */
export function periodText(from: Date | null, to: Date | null) {
  if (!from) return "-";
  const a = wib(from);
  const b = wib(to ?? from);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const left = `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}${sameYear ? "" : ` ${a.getUTCFullYear()}`}`;
  return `${left} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

/** "12 Oktober 2026" */
export function longDate(d: Date) {
  const w = wib(d);
  return `${w.getUTCDate()} ${MONTHS_LONG[w.getUTCMonth()]} ${w.getUTCFullYear()}`;
}

/**
 * Data rapor satu peserta di satu kelas: identitas, nilai tiap pertemuan, absensi, peringkat, rata-rata kelas,
 * catatan tutor & sertifikat. `null` bila peserta tidak terdaftar lunas di kelas tsb.
 */
export async function getStudentReport(productId: number, userId: number) {
  const recap = await getClassRecap(productId);
  if (!recap) return null;
  const row = recap.rows.find((r) => r.userId === userId);
  if (!row) return null;
  const [product, tutors, result, user] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, slug: true, bidang: true, jenjang: true, gradeLabel: true, level: true, reportPublished: true, startDate: true },
    }),
    prisma.tutor.findMany({ where: { isPublished: true, classes: { some: { id: productId } } }, select: { nama: true }, orderBy: [{ urutan: "asc" }, { id: "asc" }] }),
    prisma.classResult.findUnique({ where: { productId_userId: { productId, userId } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, school: true, kelas: true, kabKota: true, provinsi: true } }),
  ]);
  if (!product) return null;

  // peringkat berdasarkan rata-rata nilai (yang sama mendapat peringkat sama)
  const ranked = recap.rows.filter((r) => r.average != null).map((r) => r.average!);
  const rank = row.average != null ? ranked.filter((a) => a > row.average!).length + 1 : null;
  const scores = row.cells.filter((c) => c.score != null && !c.missed).map((c) => c.score!);
  const counts = { HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0 } as Record<string, number>;
  row.cells.forEach((c) => c.attendance && (counts[c.attendance] = (counts[c.attendance] ?? 0) + 1));
  const classAvgByMeeting = recap.meetings.map((_, i) => {
    const vals = recap.rows.map((r) => r.cells[i].score).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });
  const dates = recap.meetings.map((m) => m.startAt);

  return {
    product: { ...product, jenjangLabel: JENJANG_LABEL[product.jenjang] ?? product.jenjang },
    student: { name: row.name, school: row.school || user?.school || "-", kelas: user?.kelas ?? null, wilayah: [user?.kabKota, user?.provinsi].filter(Boolean).join(", ") || null, email: user?.email ?? null },
    tutors: tutors.map((t) => t.nama),
    period: periodText(dates[0] ?? product.startDate, dates[dates.length - 1] ?? null),
    meetings: recap.meetings.map((m, i) => ({
      number: m.number,
      title: m.title,
      date: formatDate(m.startAt),
      started: m.started,
      graded: m.graded,
      score: row.cells[i].score,
      grade: row.cells[i].grade,
      manual: !!row.cells[i].manual,
      missed: row.cells[i].missed,
      attendance: row.cells[i].attendance,
      classAverage: classAvgByMeeting[i],
    })),
    summary: {
      /** nilai Try Out Mimpi.mu (ikut dirata-rata) */
      tryout: row.tryout,
      average: row.average,
      grade: row.grade,
      predikat: row.grade ? PREDIKAT[row.grade] : null,
      best: scores.length ? Math.max(...scores) : null,
      worksheetsDone: row.worksheetsDone,
      worksheetsTotal: recap.meetings.filter((m) => m.graded).length,
      present: row.present,
      started: recap.startedCount,
      attendanceRate: row.attendanceRate,
      attendance: counts,
      rank,
      rankedCount: ranked.length,
      classSize: recap.rows.length,
      classAverage: recap.classAvg,
    },
    note: result?.note ?? null,
    certificate: result?.certificateNo ? { number: result.certificateNo, name: result.certificateName ?? row.name, issuedAt: result.certificateIssuedAt! } : null,
  };
}

export type StudentReport = NonNullable<Awaited<ReturnType<typeof getStudentReport>>>;

/** Aturan nilai worksheet & absensi (dipakai server & browser). */

/** Skala huruf mutu dari nilai 0–100 */
export const GRADE_SCALE = [
  { grade: "A", min: 85, label: "Sangat baik", tone: "green" },
  { grade: "B", min: 70, label: "Baik", tone: "blue" },
  { grade: "C", min: 55, label: "Cukup", tone: "yellow" },
  { grade: "D", min: 40, label: "Kurang", tone: "yellow" },
  { grade: "E", min: 0, label: "Perlu belajar lagi", tone: "red" },
] as const;

export function gradeOf(score: number) {
  return (GRADE_SCALE.find((g) => score >= g.min) ?? GRADE_SCALE[GRADE_SCALE.length - 1]).grade;
}

export function gradeTone(grade: string | null | undefined) {
  return (GRADE_SCALE.find((g) => g.grade === grade)?.tone ?? "gray") as "green" | "blue" | "yellow" | "red" | "gray";
}

export const ATTENDANCE_STATUS = ["HADIR", "IZIN", "SAKIT", "ALPA"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[number];
export const ATTENDANCE_LABEL: Record<string, string> = { HADIR: "Hadir", IZIN: "Izin", SAKIT: "Sakit", ALPA: "Alpa" };
export const ATTENDANCE_TONE: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = { HADIR: "green", IZIN: "blue", SAKIT: "yellow", ALPA: "red" };

export type MeetingPhase = "upcoming" | "live" | "done";
export function meetingPhase(s: { startAt: Date | string; endAt: Date | string }, now = Date.now()): MeetingPhase {
  const start = new Date(s.startAt).getTime();
  const end = new Date(s.endAt).getTime();
  return now < start ? "upcoming" : now <= end ? "live" : "done";
}

/** Peserta hanya bisa absen sendiri saat pertemuan berlangsung (mulai s.d. selesai) */
export const canSelfCheckIn = (s: { startAt: Date | string; endAt: Date | string }, now = Date.now()) => meetingPhase(s, now) === "live";

export const worksheetOpen = (s: { worksheetPublished: boolean; worksheetDueAt: Date | string | null }, now = Date.now()) =>
  s.worksheetPublished && (!s.worksheetDueAt || now <= new Date(s.worksheetDueAt).getTime());

export const LETTERS = ["A", "B", "C", "D", "E"];

/** Rata-rata nilai (hanya worksheet yang dikerjakan) */
export function average(scores: number[]) {
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
}

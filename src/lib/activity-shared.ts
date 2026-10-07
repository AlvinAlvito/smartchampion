/** Label log aktivitas (dipakai server & browser). */

export const ACTIVITY_ENTITY = {
  PRODUCT: "Kelas / produk",
  SESSION: "Pertemuan",
  MATERIAL: "Materi kelas",
  PACKAGE: "Paket VIP",
  SHOWCASE: "Flyer, mading & galeri",
  WORKSHEET: "Soal worksheet",
  ATTENDANCE: "Absensi",
  SCORE: "Nilai",
  GRADUATION: "Sertifikat & rapor",
  TUTOR: "Tutor",
  GAME: "Games",
  GAME_QUESTION: "Soal games",
} as const;
export type ActivityEntity = keyof typeof ACTIVITY_ENTITY;

export const ACTIVITY_ACTION = {
  CREATE: "Menambah",
  UPDATE: "Mengubah",
  DELETE: "Menghapus",
  PUBLISH: "Menerbitkan",
  UNPUBLISH: "Menyembunyikan",
  IMPORT: "Mengimpor",
  GENERATE: "Generate AI",
  RESET: "Mereset",
  ISSUE: "Menerbitkan",
  REVOKE: "Mencabut",
} as const;
export type ActivityAction = keyof typeof ACTIVITY_ACTION;

/** Kelompok menu kerja Admin SmartChampion (untuk grafik & KPI) */
export const ACTIVITY_GROUP: Record<ActivityEntity, "kelas" | "pertemuan" | "tutor" | "games"> = {
  PRODUCT: "kelas",
  MATERIAL: "kelas",
  PACKAGE: "kelas",
  SHOWCASE: "kelas",
  GRADUATION: "kelas",
  SESSION: "pertemuan",
  WORKSHEET: "pertemuan",
  ATTENDANCE: "pertemuan",
  SCORE: "pertemuan",
  TUTOR: "tutor",
  GAME: "games",
  GAME_QUESTION: "games",
};
export const GROUP_LABEL = { kelas: "Produk & materi", pertemuan: "Pertemuan & worksheet", tutor: "Tutor", games: "Games" } as const;
export const GROUP_COLOR = { kelas: "#1a6f9f", pertemuan: "#10b981", tutor: "#f9d014", games: "#f43f5e" } as const;

export const entityLabel = (e: string) => ACTIVITY_ENTITY[e as ActivityEntity] ?? e;
export const actionLabel = (a: string) => ACTIVITY_ACTION[a as ActivityAction] ?? a;

/** Kalimat ringkas satu log, mis. "Menambah 10 Soal games · Kuis Pecahan" */
export function describeActivity(l: { action: string; entity: string; count: number; label: string | null; detail?: string | null }) {
  const n = l.count > 1 ? `${l.count} ` : "";
  return `${actionLabel(l.action)} ${n}${entityLabel(l.entity).toLowerCase()}${l.label ? ` · ${l.label}` : ""}${l.detail ? ` (${l.detail})` : ""}`;
}

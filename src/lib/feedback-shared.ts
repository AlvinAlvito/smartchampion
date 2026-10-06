/** Konstanta & helper feedback yang aman dipakai di server maupun client. */

export type FeedbackCategoryKey = "TUTOR" | "ADMIN" | "MATERI" | "KESELURUHAN" | "UMUM";
export type FeedbackTypeKey = "RATING" | "CHOICE" | "TEXT";

/** Aspek kepuasan → kolom rata-rata di tabel feedbacks */
export const FEEDBACK_ASPECTS = [
  { key: "tutorRating", category: "TUTOR", label: "Kepuasan tutor", short: "Tutor" },
  { key: "adminRating", category: "ADMIN", label: "Kepuasan admin", short: "Admin" },
  { key: "materialRating", category: "MATERI", label: "Kepuasan modul/materi", short: "Materi" },
  { key: "overallRating", category: "KESELURUHAN", label: "Kepuasan keseluruhan", short: "Keseluruhan" },
] as const;
export type FeedbackAspect = (typeof FEEDBACK_ASPECTS)[number]["key"];
export type FeedbackAspectValues = Record<FeedbackAspect, number | null>;

export const CATEGORY_LABEL: Record<FeedbackCategoryKey, string> = {
  TUTOR: "Tutor",
  ADMIN: "Admin",
  MATERI: "Modul/materi",
  KESELURUHAN: "Keseluruhan",
  UMUM: "Umum",
};
export const CATEGORY_TONE: Record<FeedbackCategoryKey, "brand" | "blue" | "green" | "yellow" | "gray"> = {
  TUTOR: "brand",
  ADMIN: "blue",
  MATERI: "green",
  KESELURUHAN: "yellow",
  UMUM: "gray",
};
export const TYPE_LABEL: Record<FeedbackTypeKey, string> = {
  RATING: "Rating bintang 1–5",
  CHOICE: "Pilihan ganda",
  TEXT: "Isian teks",
};

export const RATING_LABEL: Record<number, string> = { 1: "Sangat kurang", 2: "Kurang", 3: "Cukup", 4: "Puas", 5: "Sangat puas" };

export const TEXT_MAX = 2000;
export const OPTIONS_MAX = 10;

/** Pertanyaan yang dikirim ke form peserta / admin */
export type FeedbackQuestionDTO = {
  id: number;
  text: string;
  description: string | null;
  category: FeedbackCategoryKey;
  type: FeedbackTypeKey;
  options: string[];
  required: boolean;
};

/** Baca kolom JSON pilihan → array string bersih */
export function readOptions(json: unknown): string[] {
  return Array.isArray(json) ? json.filter((o): o is string => typeof o === "string" && o.trim() !== "").map((o) => o.trim()) : [];
}

/** Rata-rata 1 desimal (null bila kosong) */
export function avgRating(values: (number | null | undefined)[]) {
  const v = values.filter((x): x is number => typeof x === "number");
  if (!v.length) return null;
  return Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10;
}

/** Rata-rata semua aspek yang terisi untuk satu feedback */
export function feedbackScore(f: FeedbackAspectValues) {
  return avgRating(FEEDBACK_ASPECTS.map((a) => f[a.key]));
}

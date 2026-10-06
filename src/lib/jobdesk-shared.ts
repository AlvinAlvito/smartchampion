/** Konstanta & helper Jobdesk yang aman dipakai di server maupun client. Tanggal selalu string "YYYY-MM-DD" (WIB). */

export type JobCategoryKey = "PRIORITAS" | "SISTEM" | "PEOPLE" | "OPERASIONAL";
export type JobPriorityKey = "RENDAH" | "SEDANG" | "TINGGI";

/** Tiga pertanyaan Panduan Agenda Pekanan + pekerjaan operasional (BAU) yang tidak dihitung sebagai agenda utama */
export const JOB_CATEGORIES: { key: JobCategoryKey; label: string; short: string; question: string; hint: string; min: number; max: number; tone: string }[] = [
  {
    key: "PRIORITAS",
    label: "Prioritas",
    short: "Prioritas",
    question: "Apa agenda prioritas pekan ini?",
    hint: "Pekerjaan yang paling berdampak pada target (OKR / initiative program), dikawal lewat weekly accountability.",
    min: 1,
    max: 3,
    tone: "brand",
  },
  {
    key: "SISTEM",
    label: "Perbaikan Sistem",
    short: "Sistem",
    question: "Apa agenda perbaikan sistem?",
    hint: "Perbaikan cara kerja: SOP, ritme, alur, piranti, dashboard.",
    min: 1,
    max: 2,
    tone: "green",
  },
  {
    key: "PEOPLE",
    label: "People & Kinerja",
    short: "People & Kinerja",
    question: "Apa agenda perbaikan people dan kinerja?",
    hint: "Kapasitas & akuntabilitas orang: umpan balik, pelatihan, kejelasan KPI, coaching.",
    min: 1,
    max: 2,
    tone: "blue",
  },
  {
    key: "OPERASIONAL",
    label: "Operasional (BAU)",
    short: "Operasional",
    question: "Pekerjaan operasional yang tidak dijadikan agenda 3LD utama",
    hint: "Tetap berjalan tetapi kondisional / belum punya tenggat & ukuran selesai yang sempit (BAU, standby, NEXT).",
    min: 0,
    max: 99,
    tone: "gray",
  },
];
export const CATEGORY_OF = Object.fromEntries(JOB_CATEGORIES.map((c) => [c.key, c])) as Record<JobCategoryKey, (typeof JOB_CATEGORIES)[number]>;
export const MAIN_CATEGORIES: JobCategoryKey[] = ["PRIORITAS", "SISTEM", "PEOPLE"];
/** jumlah agenda utama yang praktis per pekan */
export const PRACTICAL_TOTAL = { min: 3, max: 5 };

export const LD = [
  { key: "ld1", ok: "ld1Ok", code: "K", label: "LD-1 • Dikerjakan", question: "Resources, waktu & biaya tersedia pekan ini tanpa menunggu pihak lain?" },
  { key: "ld2", ok: "ld2Ok", code: "S", label: "LD-2 • Diselesaikan", question: "Bisa selesai dalam 1 pekan (maks. 2 pekan dengan output antara)?" },
  { key: "ld3", ok: "ld3Ok", code: "N", label: "LD-3 • Dinikmati", question: "Siapa yang menikmati hasilnya & apa bedanya bagi mereka?" },
] as const;

export const PRIORITY_LABEL: Record<JobPriorityKey, string> = { TINGGI: "Tinggi", SEDANG: "Sedang", RENDAH: "Rendah" };
export const PRIORITY_TONE: Record<JobPriorityKey, "red" | "yellow" | "gray"> = { TINGGI: "red", SEDANG: "yellow", RENDAH: "gray" };
export const PRIORITY_RANK: Record<JobPriorityKey, number> = { TINGGI: 0, SEDANG: 1, RENDAH: 2 };

export const WEEKDAYS = [
  { n: 1, short: "Sen", long: "Senin" },
  { n: 2, short: "Sel", long: "Selasa" },
  { n: 3, short: "Rab", long: "Rabu" },
  { n: 4, short: "Kam", long: "Kamis" },
  { n: 5, short: "Jum", long: "Jumat" },
  { n: 6, short: "Sab", long: "Sabtu" },
  { n: 7, short: "Min", long: "Minggu" },
];

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/* ---------------- tanggal (string YYYY-MM-DD, zona WIB) ---------------- */

const pad = (n: number) => String(n).padStart(2, "0");
export const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));
export const ymdToDate = (ymd: string) => new Date(ymd + "T00:00:00Z");
export const dateToYmd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
/** Hari ini di WIB */
export const todayWib = () => dateToYmd(new Date(Date.now() + 7 * 3600_000));
/** Jam sekarang di WIB, "HH:MM" */
export const nowTimeWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(11, 16);
export const addDays = (ymd: string, n: number) => {
  const d = ymdToDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToYmd(d);
};
/** 1 = Senin … 7 = Minggu */
export const isoWeekday = (ymd: string) => ((ymdToDate(ymd).getUTCDay() + 6) % 7) + 1;

/** Pekan ISO (Senin–Minggu) dari sebuah tanggal */
export function isoWeekOf(ymd: string) {
  const d = ymdToDate(ymd);
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - (isoWeekday(ymd) - 1) + 3);
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const week = 1 + Math.round((thursday.getTime() - week1Monday.getTime()) / (7 * 86400_000) - 3 / 7);
  return { year, week };
}

/** Tanggal Senin dari pekan ISO */
export function weekMonday(year: number, week: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (week - 1) * 7);
  return dateToYmd(monday);
}

/** 7 tanggal (Senin–Minggu) satu pekan */
export const weekDates = (year: number, week: number) => Array.from({ length: 7 }, (_, i) => addDays(weekMonday(year, week), i));

/** Pekan sebelum / sesudah */
export const shiftWeek = (year: number, week: number, by: number) => isoWeekOf(addDays(weekMonday(year, week), by * 7));

export const fmtShort = (ymd: string) => {
  const d = ymdToDate(ymd);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
};
export const fmtLong = (ymd: string) => {
  const d = ymdToDate(ymd);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
export const fmtDay = (ymd: string) => `${WEEKDAYS[isoWeekday(ymd) - 1].long}, ${fmtLong(ymd)}`;

/** "28 September – 4 Oktober 2026" */
export function periodText(year: number, week: number) {
  const dates = weekDates(year, week);
  const a = ymdToDate(dates[0]);
  const b = ymdToDate(dates[6]);
  const left = a.getUTCFullYear() === b.getUTCFullYear() ? `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]}` : fmtLong(dates[0]);
  return `${left} – ${fmtLong(dates[6])}`;
}

/** Rentang singkat "29–30 Sep" / "30 Sep–1 Okt" / "30 Sep" */
export function rangeShort(from: string | null, to: string | null) {
  if (from && to && from !== to) {
    const a = ymdToDate(from);
    const b = ymdToDate(to);
    return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${fmtShort(to)}` : `${fmtShort(from)}–${fmtShort(to)}`;
  }
  const one = to ?? from;
  return one ? fmtShort(one) : "";
}

/** Kode 3LD, mis. "K S N" atau "K – N" */
export const ldCode = (a: { ld1Ok: boolean; ld2Ok: boolean; ld3Ok: boolean }) => [a.ld1Ok ? "K" : "–", a.ld2Ok ? "S" : "–", a.ld3Ok ? "N" : "–"].join(" ");
export const ldPass = (a: { ld1Ok: boolean; ld2Ok: boolean; ld3Ok: boolean }) => a.ld1Ok && a.ld2Ok && a.ld3Ok;

/** Baris teks → daftar poin (buang bullet manual & baris kosong) */
export const lines = (text: string | null | undefined) =>
  (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

export const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** [1,2,3,4,5] → "Sen–Jum"; [1,3,5] → "Sen, Rab, Jum"; semua → "setiap hari" */
export function daysText(days: number[]) {
  const d = [...days].sort((a, b) => a - b);
  if (d.length === 7) return "setiap hari";
  const consecutive = d.length >= 3 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  if (consecutive) return `${WEEKDAYS[d[0] - 1].short}–${WEEKDAYS[d[d.length - 1] - 1].short}`;
  return d.map((x) => WEEKDAYS[x - 1]?.short).join(", ");
}

const DAY = 86_400_000;
const WIB = 7 * 3600_000;

export const RANGE_PRESETS = [
  { v: "7d", l: "7 hari" },
  { v: "30d", l: "30 hari" },
  { v: "month", l: "Bulan ini" },
  { v: "lastmonth", l: "Bulan lalu" },
  { v: "all", l: "Semua" },
] as const;

/** Preset halaman kinerja operasional (Admin SmartChampion): dipantau harian & pekanan */
export const OPS_RANGE_PRESETS = [
  { v: "today", l: "Hari ini" },
  { v: "week", l: "Pekan ini" },
  { v: "30d", l: "30 hari" },
  { v: "month", l: "Bulan ini" },
  { v: "lastmonth", l: "Bulan lalu" },
] as const;

export type DateRange = {
  /** batas bawah (inklusif), null = tanpa batas */
  start: Date | null;
  /** batas atas (eksklusif), null = tanpa batas */
  end: Date | null;
  from: string; // yyyy-mm-dd (WIB) untuk input
  to: string;
  preset: string;
  label: string;
};

/** yyyy-mm-dd (WIB) → Date 00:00 WIB */
function wibMidnight(ymd: string) {
  const d = new Date(`${ymd}T00:00:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ymd(d: Date) {
  return new Date(d.getTime() + WIB).toISOString().slice(0, 10);
}

function fmt(d: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(d);
}

/**
 * Baca rentang tanggal dari query (?preset=30d atau ?from=2026-09-01&to=2026-09-30).
 * Tanggal `to` inklusif (sampai 23.59 WIB).
 */
export function readDateRange(get: (k: string) => string | undefined, defaultPreset = "all"): DateRange {
  const from = get("from") ?? "";
  const to = get("to") ?? "";
  const custom = /^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to);
  const preset = custom ? "custom" : (get("preset") ?? defaultPreset);

  const todayStr = ymd(new Date());
  const today = wibMidnight(todayStr)!;
  const tomorrow = new Date(today.getTime() + DAY);

  if (custom) {
    const start = from ? wibMidnight(from) : null;
    const endDay = to ? wibMidnight(to) : null;
    const end = endDay ? new Date(endDay.getTime() + DAY) : null;
    const label = `${start ? fmt(start) : "awal"} – ${endDay ? fmt(endDay) : "sekarang"}`;
    return { start, end, from: start ? from : "", to: endDay ? to : "", preset, label };
  }

  const [y, m] = todayStr.split("-").map(Number);
  let start: Date | null = null;
  let end: Date | null = null;
  let label = "Semua waktu";
  if (preset === "today") {
    start = today;
    end = tomorrow;
    label = `Hari ini (${fmt(today)})`;
  } else if (preset === "week") {
    // Senin–hari ini (WIB)
    const dow = (new Date(today.getTime() + WIB).getUTCDay() + 6) % 7;
    start = new Date(today.getTime() - dow * DAY);
    end = tomorrow;
    label = `Pekan ini (${fmt(start)} – ${fmt(today)})`;
  } else if (preset === "7d" || preset === "30d") {
    const n = preset === "7d" ? 7 : 30;
    start = new Date(tomorrow.getTime() - n * DAY);
    end = tomorrow;
    label = `${n} hari terakhir`;
  } else if (preset === "month") {
    start = wibMidnight(`${y}-${String(m).padStart(2, "0")}-01`);
    end = tomorrow;
    label = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(today);
  } else if (preset === "lastmonth") {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    start = wibMidnight(`${py}-${String(pm).padStart(2, "0")}-01`);
    end = wibMidnight(`${y}-${String(m).padStart(2, "0")}-01`);
    label = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(start!);
  }
  return {
    start,
    end,
    from: start ? ymd(start) : "",
    to: end ? ymd(new Date(end.getTime() - DAY)) : "",
    preset: start ? preset : "all",
    label,
  };
}

export function inRange(d: Date | null | undefined, r: Pick<DateRange, "start" | "end">) {
  if (!r.start && !r.end) return true;
  if (!d) return false;
  return (!r.start || d >= r.start) && (!r.end || d < r.end);
}

/** Filter Prisma untuk kolom tanggal */
export function prismaRange(r: Pick<DateRange, "start" | "end">) {
  if (!r.start && !r.end) return undefined;
  return { ...(r.start ? { gte: r.start } : {}), ...(r.end ? { lt: r.end } : {}) };
}

export function formatRupiah(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export function formatDate(value: Date | string | null | undefined, withTime = false) {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Jakarta",
  }).format(d);
}

/** yyyy-mm-dd untuk <input type="date"> */
export function toDateInput(value: Date | null | undefined) {
  if (!value) return "";
  return new Date(value.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** yyyy-mm-ddThh:mm (WIB) untuk <input type="datetime-local"> */
export function toDateTimeInput(value: Date | null | undefined) {
  if (!value) return "";
  return new Date(value.getTime() + 7 * 3600_000).toISOString().slice(0, 16);
}

/** Parse input tanggal/waktu dari form (dianggap WIB) */
export function parseWibDate(value: FormDataEntryValue | null) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  const iso = s.length === 10 ? `${s}T00:00:00+07:00` : `${s}:00+07:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Seragamkan nomor WA ke format 62xxxxxxxxxx */
export function normalizePhone(raw: string | number | null | undefined) {
  if (raw == null) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  else if (digits.startsWith("8")) digits = "62" + digits;
  return digits;
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 150);
}

export function str(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(form: FormData, key: string) {
  return str(form, key) || null;
}

export function optInt(form: FormData, key: string) {
  const s = str(form, key).replace(/[^\d-]/g, "");
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/**
 * URL aman untuk href/src dari data yang diinput pengguna: hanya http(s) atau path internal "/...".
 * Menolak javascript:, data:, vbscript:, "//domain" dll. (mencegah XSS lewat tautan).
 */
export function safeUrl(url: string | null | undefined): string | null {
  const s = (url ?? "").trim();
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\")) return s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

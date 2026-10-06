import "server-only";
import ExcelJS from "exceljs";

/** Helper baca file Excel isian template (dipakai import Master Lead & Data Blast). */

export type CellVal = ExcelJS.CellValue;

export function cellText(v: CellVal): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
    if ("result" in v) return cellText((v as { result: CellVal }).result);
    if ("error" in v) return "";
  }
  return String(v).trim();
}

/** Tanggal dari sel Excel (tanggal asli / teks dd/mm/yyyy / yyyy-mm-dd) → Date 00:00 WIB. */
export function cellDate(v: CellVal): Date | null | "invalid" {
  if (v == null || v === "") return null;
  if (typeof v === "object" && !(v instanceof Date) && "result" in v) return cellDate((v as { result: CellVal }).result);
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "invalid";
    // Excel tidak punya zona waktu: ambil komponen tanggalnya apa adanya lalu jadikan 00:00 WIB
    const d = new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()) - 7 * 3600_000);
    // pembulatan jika sel berisi jam 23:59:xx (efek presisi Excel)
    return v.getUTCHours() >= 12 ? new Date(d.getTime() + 86_400_000) : d;
  }
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86_400_000);
    return cellDate(new Date(ms));
  }
  const s = cellText(v);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return wibDate(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return wibDate(+m[1], +m[2], +m[3]);
  return "invalid";
}

/** Tanggal kalender → 00:00 WIB; "invalid" untuk tanggal mustahil (mis. 31/13/2026, 30/02/2026). */
function wibDate(y: number, mo: number, d: number): Date | "invalid" {
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1900 || y > 2100 || t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return "invalid";
  return new Date(t.getTime() - 7 * 3600_000);
}

/** Judul kolom dinormalisasi: huruf kecil, tanpa tanda wajib "*" dan spasi berlebih. */
export function headerKey(v: CellVal) {
  return cellText(v).replace(/\s*\*\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function matchList(value: string, list: readonly string[]) {
  const v = value.trim().toLowerCase();
  return list.find((x) => x.toLowerCase() === v) ?? null;
}

/**
 * Cari sheet + baris header: sheet pertama yang (dalam 15 baris teratas) memuat semua judul `mustHave`.
 * Baris judul/keterangan di atas header (seperti pada file hasil Ekspor Excel) otomatis dilewati.
 */
export function findHeader(wb: ExcelJS.Workbook, mustHave: string[]) {
  const keys = mustHave.map((h) => h.toLowerCase());
  for (const sheet of wb.worksheets) {
    for (let r = 1; r <= Math.min(sheet.rowCount, 15); r++) {
      const texts = (sheet.getRow(r).values as CellVal[]).map((v) => headerKey(v));
      if (keys.every((k) => texts.includes(k))) return { ws: sheet, headerRow: r };
    }
  }
  return null;
}

/** Peta key kolom → nomor kolom berdasarkan judul header. */
export function mapColumns<K extends string>(ws: ExcelJS.Worksheet, headerRow: number, columns: readonly { key: K; header: string }[]) {
  const colIndex = new Map<K, number>();
  ws.getRow(headerRow).eachCell((cell, col) => {
    const t = headerKey(cell.value);
    const c = columns.find((x) => x.header.toLowerCase() === t);
    if (c) colIndex.set(c.key, col);
  });
  return colIndex;
}

/**
 * Cegah "zip bomb": .xlsx adalah ZIP — file kecil bisa mengembang jadi gigabyte saat dibaca dan membuat server down.
 * Baca direktori ZIP (tanpa membongkar) dan tolak bila total ukuran asli / jumlah entri tidak wajar.
 */
export function assertSafeXlsx(data: ArrayBuffer, maxUncompressed = 150 * 1024 * 1024, maxEntries = 3000) {
  const buf = Buffer.from(data);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Bukan file Excel (.xlsx) yang valid.");
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (entries > maxEntries || p === 0xffffffff) throw new Error("Struktur file Excel tidak wajar.");
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Bukan file Excel (.xlsx) yang valid.");
    const size = buf.readUInt32LE(p + 24);
    if (size === 0xffffffff) throw new Error("Struktur file Excel tidak wajar.");
    total += size;
    if (total > maxUncompressed) throw new Error("Isi file Excel terlalu besar untuk diproses.");
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
}

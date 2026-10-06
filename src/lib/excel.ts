import "server-only";
import ExcelJS from "exceljs";

export type ExcelColumn<T> = {
  header: string;
  /** nilai sel; Date → tanggal Excel asli, number → angka */
  value: (row: T) => string | number | Date | null | undefined;
  width?: number;
  /** format angka/tanggal Excel, mis. '"Rp" #,##0' atau 'dd/mm/yyyy' */
  numFmt?: string;
};

export const FMT = {
  rupiah: '"Rp" #,##0',
  date: "dd/mm/yyyy",
  dateTime: "dd/mm/yyyy hh:mm",
} as const;

const NAVY = "FF0C1436";
const BRAND_LIGHT = "FFF5F3FF";

/** Excel menyimpan tanggal tanpa zona waktu → geser ke WIB agar tanggal tidak mundur sehari. */
function toWib(d: Date) {
  return new Date(d.getTime() + 7 * 3600_000);
}

/**
 * Buat file .xlsx rapi: judul & keterangan, header tebal berwarna, baris header dibekukan,
 * filter otomatis, lebar kolom menyesuaikan isi, dan format Rupiah/tanggal yang benar.
 */
export type SheetOptions<T> = { sheetName: string; title: string; subtitle?: string; columns: ExcelColumn<T>[]; rows: T[] };

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pelatihan POSI";
  wb.created = new Date();
  return wb;
}

export async function buildWorkbook<T>(opts: SheetOptions<T>) {
  const wb = newWorkbook();
  addSheet(wb, opts);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Sheet dengan tipe baris masing-masing (untuk workbook berisi beberapa sheet). */
export type SheetSpec = { add: (wb: ExcelJS.Workbook) => void };
export const sheet = <T,>(opts: SheetOptions<T>): SheetSpec => ({ add: (wb) => addSheet(wb, opts) });

export async function buildWorkbookSheets(sheets: SheetSpec[]) {
  const wb = newWorkbook();
  sheets.forEach((s) => s.add(wb));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function addSheet<T>(wb: ExcelJS.Workbook, opts: SheetOptions<T>) {
  const ws = wb.addWorksheet(opts.sheetName.slice(0, 31), { views: [{ state: "frozen", ySplit: 4 }] });
  const n = opts.columns.length;

  // Judul
  ws.mergeCells(1, 1, 1, n);
  const title = ws.getCell(1, 1);
  title.value = opts.title;
  title.font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.mergeCells(2, 1, 2, n);
  const sub = ws.getCell(2, 1);
  sub.value = opts.subtitle ?? "";
  sub.font = { italic: true, size: 10, color: { argb: "FF4F66BD" } };

  // Header (baris 4)
  const headerRow = ws.getRow(4);
  opts.columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF7C3AED" } } };
  });
  headerRow.height = 30;

  // Data
  opts.rows.forEach((row, r) => {
    const excelRow = ws.getRow(5 + r);
    opts.columns.forEach((c, i) => {
      const v = c.value(row);
      const cell = excelRow.getCell(i + 1);
      cell.value = v instanceof Date ? toWib(v) : (v ?? null);
      if (c.numFmt) cell.numFmt = c.numFmt;
      cell.alignment = { vertical: "top", wrapText: typeof v === "string" && v.length > 40 };
      if (r % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_LIGHT } };
    });
  });

  // Lebar kolom otomatis (batas 10–50 karakter)
  opts.columns.forEach((c, i) => {
    if (c.width) {
      ws.getColumn(i + 1).width = c.width;
      return;
    }
    const lengths = opts.rows.slice(0, 500).map((row) => {
      const v = c.value(row);
      if (v instanceof Date) return 12;
      return String(v ?? "").length;
    });
    ws.getColumn(i + 1).width = Math.min(50, Math.max(10, c.header.length + 2, ...lengths.map((l) => l + 2)));
  });

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + opts.rows.length, column: n } };
}

export function xlsxResponse(buffer: Buffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function todayStamp() {
  return toWib(new Date()).toISOString().slice(0, 10);
}

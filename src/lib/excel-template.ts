import "server-only";
import ExcelJS from "exceljs";
import { FMT } from "./excel";
import { MAX_IMPORT_ROWS } from "./import-types";

const NAVY = "FF0C1436";
const BRAND = "FF7C3AED";

export type TemplateColumn = {
  key: string;
  header: string;
  note: string;
  width: number;
  required?: boolean;
  date?: boolean;
  money?: boolean;
  /** format teks (mis. nomor HP agar tidak jadi notasi ilmiah) */
  text?: boolean;
  /** nama daftar dropdown pada `lists` */
  list?: string;
};

/**
 * Template import .xlsx: sheet data (header berwarna, kolom wajib ungu + catatan, dropdown, format tanggal/Rupiah),
 * sheet "Petunjuk", dan sheet "Pilihan" tersembunyi sebagai sumber dropdown.
 */
export async function buildImportTemplate(opts: {
  sheetName: string;
  columns: readonly TemplateColumn[];
  lists: Record<string, readonly string[]>;
  examples: Record<string, string>;
  /** nama halaman tujuan import, mis. "Master Lead" */
  pageName: string;
}) {
  const { columns, lists } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Pelatihan POSI";

  /* ---------- Sheet 1: Data (diisi) ---------- */
  const ws = wb.addWorksheet(opts.sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.key, width: c.width }));
  const header = ws.getRow(1);
  header.height = 32;
  header.eachCell((cell, i) => {
    const col = columns[i - 1];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col.required ? BRAND : NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.note = col.note;
  });

  // Sheet dibuat sesuai urutan tab: Data, Petunjuk, Pilihan (tersembunyi)
  const guide = wb.addWorksheet("Petunjuk");

  /* ---------- Sheet 3: Pilihan (sumber dropdown, disembunyikan) ---------- */
  const pl = wb.addWorksheet("Pilihan", { state: "hidden" });
  const ranges: Record<string, string> = {};
  Object.entries(lists).forEach(([k, values], i) => {
    const colLetter = pl.getColumn(i + 1).letter;
    pl.getCell(`${colLetter}1`).value = k;
    values.forEach((v, j) => (pl.getCell(`${colLetter}${j + 2}`).value = v));
    ranges[k] = `Pilihan!$${colLetter}$2:$${colLetter}$${Math.max(2, values.length + 1)}`;
  });

  // Format & validasi untuk baris isian.
  // dataValidations.add(range) tersedia di exceljs 4 tapi belum ada di definisi tipenya.
  const validations = (ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations;
  const lastRow = MAX_IMPORT_ROWS + 1;
  columns.forEach((c, i) => {
    const colLetter = ws.getColumn(i + 1).letter;
    const range = `${colLetter}2:${colLetter}${lastRow}`;
    if (c.date) {
      ws.getColumn(i + 1).numFmt = FMT.date;
      validations.add(range, {
        type: "date",
        operator: "greaterThan",
        allowBlank: true,
        formulae: [new Date(Date.UTC(2000, 0, 1))],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Format tanggal",
        error: "Isi dengan tanggal, mis. 26/09/2026",
      });
    }
    if (c.money) ws.getColumn(i + 1).numFmt = FMT.rupiah;
    if (c.text) ws.getColumn(i + 1).numFmt = "@";
    if (c.list && ranges[c.list]) {
      validations.add(range, {
        type: "list",
        allowBlank: true,
        formulae: [ranges[c.list]],
        showErrorMessage: true,
        // "warning" → tetap boleh isi nilai lain (sistem akan memberi peringatan saat import)
        errorStyle: "warning",
        errorTitle: c.header,
        error: "Nilai tidak ada di daftar pilihan. Tetap lanjut?",
      });
    }
  });

  /* ---------- Sheet 2: Petunjuk ---------- */
  guide.columns = [
    { header: "Kolom", key: "a", width: 24 },
    { header: "Wajib?", key: "b", width: 10 },
    { header: "Keterangan", key: "c", width: 60 },
    { header: "Contoh", key: "d", width: 28 },
  ];
  columns.forEach((c) => guide.addRow({ a: c.header, b: c.required ? "Ya" : "", c: c.note, d: opts.examples[c.key] ?? "" }));
  guide.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  });
  guide.addRow({});
  [
    "CARA PAKAI:",
    `1. Isi data di sheet "${opts.sheetName}" mulai baris ke-2 (jangan ubah judul kolom di baris 1).`,
    "2. Kolom bertanda * wajib diisi. Kolom berdropdown sebaiknya dipilih dari daftar.",
    `3. Maksimal ${MAX_IMPORT_ROWS.toLocaleString("id-ID")} baris per file. Baris kosong diabaikan.`,
    `4. Simpan sebagai .xlsx lalu unggah lewat tombol Import di halaman ${opts.pageName}.`,
    "5. Sistem menampilkan pratinjau & alasan jika ada baris yang bermasalah sebelum data disimpan.",
    'Tips: file hasil tombol "Ekspor Excel" juga bisa diimpor kembali dengan format yang sama.',
  ].forEach((t, i) => {
    const r = guide.addRow({ a: t });
    guide.mergeCells(r.number, 1, r.number, 4);
    if (i === 0) r.font = { bold: true, color: { argb: BRAND } };
  });

  wb.views = [{ activeTab: 0, x: 0, y: 0, width: 20000, height: 12000, firstSheet: 0, visibility: "visible" }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

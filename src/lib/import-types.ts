import type { ActionResult } from "./action-result";

/** Tipe bersama untuk fitur import Excel (Master Lead, Data Blast). */

export type RowReport = {
  row: number; // nomor baris di Excel
  nama: string;
  status: "ok" | "warning" | "error" | "duplicate";
  messages: string[];
};

export type ImportSummary<S = Record<string, string | number | null>> = {
  mode: "preview" | "commit";
  fileName: string;
  total: number;
  ready: number;
  warnings: number;
  errors: number;
  duplicates: number;
  inserted?: number;
  skipDuplicates: boolean;
  /** baris yang perlu diperhatikan (error / peringatan / duplikat), maks 200 */
  issues: RowReport[];
  /** contoh beberapa baris yang siap diimpor */
  sample: (S & { row: number })[];
};

export type ImportState<S = Record<string, string | number | null>> = ActionResult & { summary?: ImportSummary<S> };

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** Validasi file unggahan; kembalikan pesan error atau null. */
export function checkImportFile(file: FormDataEntryValue | null): string | null {
  if (!(file instanceof File) || file.size === 0) return "Pilih file Excel (.xlsx) terlebih dahulu.";
  if (!/\.xlsx$/i.test(file.name)) return "Format file harus .xlsx (Excel). File .xls/.csv belum didukung.";
  if (file.size > MAX_IMPORT_BYTES) return "Ukuran file maksimal 10 MB.";
  return null;
}

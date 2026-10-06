import "server-only";
import ExcelJS from "exceljs";
import { BLAST_JENJANG, PROVINSI } from "./constants";
import { normalizePhone } from "./utils";
import { assertSafeXlsx, cellText, headerKey, matchList, type CellVal } from "./xlsx-read";
import { MAX_IMPORT_ROWS, type RowReport } from "./import-types";
import type { TemplateColumn } from "./excel-template";
import { joinLabels } from "./blast-wa-shared";

/** Kolom template import kontak Blast WhatsApp (judul sama dengan Ekspor Excel). */
export const CONTACT_COLUMNS = [
  { key: "nama", header: "Nama", required: true, note: "Nama kontak (dipakai untuk variabel {nama})", width: 28 },
  { key: "noHp", header: "No. WhatsApp", required: true, note: "08xx / 62xx / +62 — diseragamkan otomatis ke 62xx", width: 18, text: true },
  { key: "email", header: "Email", note: "Opsional", width: 26 },
  { key: "jenjang", header: "Jenjang", note: "Pilih dari daftar", width: 11, list: "jenjang" },
  { key: "kelas", header: "Kelas", note: "Mis. 5 / 8 / 11", width: 9 },
  { key: "sekolah", header: "Sekolah", note: "Nama sekolah", width: 28 },
  { key: "kota", header: "Kota", note: "Kota / kabupaten", width: 18 },
  { key: "provinsi", header: "Provinsi", note: "Pilih dari daftar", width: 22, list: "provinsi" },
  { key: "labels", header: "Label", note: "Grup/label, pisahkan dengan koma. Mis. Olimpiade, Alumni COC", width: 24 },
  { key: "catatan", header: "Catatan", note: "Catatan bebas", width: 30 },
] as const satisfies readonly TemplateColumn[];

type Key = (typeof CONTACT_COLUMNS)[number]["key"];

/** judul kolom lain yang juga dikenali (file dari Data Blast / Master Lead / Google Form) */
const ALIASES: Record<Key, string[]> = {
  nama: ["nama", "nama lengkap", "name", "nama siswa", "nama peserta"],
  noHp: ["no. whatsapp", "no whatsapp", "whatsapp", "no. wa", "no wa", "wa", "no. hp", "no hp", "nomor hp", "nomor wa", "no. hp/wa", "hp", "phone", "telepon"],
  email: ["email", "e-mail"],
  jenjang: ["jenjang"],
  kelas: ["kelas"],
  sekolah: ["sekolah", "asal sekolah", "nama sekolah"],
  kota: ["kota", "kota/kabupaten", "kabupaten"],
  provinsi: ["provinsi"],
  labels: ["label", "labels", "grup", "group", "tag"],
  catatan: ["catatan", "keterangan", "note"],
};

export type ParsedContact = {
  nama: string;
  noHp: string;
  email: string | null;
  jenjang: string | null;
  kelas: string | null;
  sekolah: string | null;
  kota: string | null;
  provinsi: string | null;
  labels: string | null;
  catatan: string | null;
};

export async function parseContactWorkbook(buffer: ArrayBuffer, extraLabel: string | null) {
  assertSafeXlsx(buffer);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // cari baris header: memuat kolom nama & nomor WA (dalam 15 baris teratas sheet mana pun)
  let ws: ExcelJS.Worksheet | null = null;
  let headerRow = 0;
  const colIndex = new Map<Key, number>();
  outer: for (const sheet of wb.worksheets) {
    for (let r = 1; r <= Math.min(sheet.rowCount, 15); r++) {
      const map = new Map<Key, number>();
      sheet.getRow(r).eachCell((cell, col) => {
        const t = headerKey(cell.value);
        for (const [k, list] of Object.entries(ALIASES) as [Key, string[]][]) if (!map.has(k) && list.includes(t)) map.set(k, col);
      });
      if (map.has("nama") && map.has("noHp")) {
        ws = sheet;
        headerRow = r;
        map.forEach((v, k) => colIndex.set(k, v));
        break outer;
      }
    }
  }
  if (!ws) return { found: false as const, totalRows: 0, valid: [], reports: [] };

  const valid: { row: number; data: ParsedContact }[] = [];
  const reports: RowReport[] = [];
  const seen = new Map<string, number>();
  let totalRows = 0;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: Key): CellVal => {
      const i = colIndex.get(k);
      return i ? row.getCell(i).value : null;
    };
    const txt = (k: Key) => cellText(get(k));
    const opt = (k: Key, n = 160) => txt(k).slice(0, n) || null;
    if (CONTACT_COLUMNS.every((c) => !txt(c.key))) continue;
    totalRows++;
    if (totalRows > MAX_IMPORT_ROWS) break;

    const msgs: string[] = [];
    let error = false;
    const fail = (m: string) => {
      msgs.push(m);
      error = true;
    };
    const nama = txt("nama").slice(0, 160);
    const noHp = normalizePhone(txt("noHp"));
    if (!noHp) fail("No. WhatsApp kosong");
    else if (noHp.length < 10 || noHp.length > 15) fail(`No. WhatsApp "${txt("noHp")}" tidak valid`);
    if (!nama) msgs.push('Nama kosong → "(tanpa nama)"; di pesan, {nama} memakai teks cadangan');

    let jenjang = opt("jenjang", 30);
    if (jenjang) {
      const baku = matchList(jenjang, BLAST_JENJANG);
      if (baku) jenjang = baku;
      else msgs.push(`Jenjang "${jenjang}" tidak ada di daftar (tetap disimpan)`);
    }
    let provinsi = opt("provinsi", 80);
    if (provinsi) {
      const baku = matchList(provinsi, PROVINSI);
      if (baku) provinsi = baku;
    }
    const email = opt("email")?.toLowerCase() ?? null;
    if (email && !/^\S+@\S+\.\S+$/.test(email)) msgs.push(`Email "${email}" tampak tidak valid`);

    if (noHp && !error) {
      const prev = seen.get(noHp);
      if (prev) {
        msgs.push(`Nomor sama dengan baris ${prev} → dilewati`);
        reports.push({ row: r, nama: nama || noHp, status: "duplicate", messages: msgs });
        continue;
      }
      seen.set(noHp, r);
    }
    reports.push({ row: r, nama: nama || noHp || "(kosong)", status: error ? "error" : msgs.length ? "warning" : "ok", messages: msgs });
    if (error || !noHp) continue;
    const labels = [...txt("labels").split(","), ...(extraLabel ? [extraLabel] : [])];
    valid.push({
      row: r,
      data: {
        nama: nama || "(tanpa nama)",
        noHp,
        email,
        jenjang,
        kelas: opt("kelas", 30),
        sekolah: opt("sekolah"),
        kota: opt("kota", 100),
        provinsi,
        labels: joinLabels(labels),
        catatan: txt("catatan").slice(0, 2000) || null,
      },
    });
  }
  return { found: true as const, totalRows, valid, reports };
}

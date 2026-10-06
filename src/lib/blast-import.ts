import "server-only";
import ExcelJS from "exceljs";
import { BLAST_CHANNELS, BLAST_JENJANG, PROVINSI } from "./constants";
import { normalizePhone } from "./utils";
import { assertSafeXlsx, cellDate, cellText, findHeader, mapColumns, matchList, type CellVal } from "./xlsx-read";
import { MAX_IMPORT_ROWS, type RowReport } from "./import-types";
import type { TemplateColumn } from "./excel-template";

/** Kolom template import Data Blast (judul sama dengan hasil Ekspor Excel, tanpa "Blast ID"). */
export const BLAST_COLUMNS = [
  { key: "tanggal", header: "Tanggal", required: true, note: "Tanggal blast (dd/mm/yyyy). Kosong = hari ini", width: 14, date: true },
  { key: "nama", header: "Nama", required: true, note: "Nama kontak", width: 28 },
  { key: "email", header: "Email", note: "Wajib diisi bila Asal Blast = Email", width: 28 },
  { key: "noHp", header: "No. HP", note: "08xx / 62xx / +62 — diseragamkan otomatis ke 62xx. Wajib bila Asal Blast = WhatsApp", width: 18, text: true },
  { key: "provinsi", header: "Provinsi", note: "Pilih dari daftar", width: 22, list: "provinsi" },
  { key: "kota", header: "Kota", note: "Kota / kabupaten", width: 20 },
  { key: "jenjang", header: "Jenjang", note: "Pilih dari daftar", width: 11, list: "jenjang" },
  { key: "sekolah", header: "Sekolah", note: "Nama sekolah", width: 30 },
  { key: "owner", header: "Owner/Admin", note: "Nama atau email admin yang melakukan blast. Kosong = belum ada owner", width: 18, list: "owner" },
  { key: "asalBlast", header: "Asal Blast", required: true, note: "Email / WhatsApp", width: 13, list: "asal" },
] as const satisfies readonly TemplateColumn[];

export type BlastKey = (typeof BLAST_COLUMNS)[number]["key"];

export function blastLists(ownerNames: string[]) {
  return {
    provinsi: [...PROVINSI],
    jenjang: [...BLAST_JENJANG],
    owner: ownerNames,
    asal: [...BLAST_CHANNELS],
  };
}

const CHANNEL_ALIASES: Record<string, (typeof BLAST_CHANNELS)[number]> = {
  wa: "WhatsApp",
  whatsapp: "WhatsApp",
  "whats app": "WhatsApp",
  "blast wa": "WhatsApp",
  "wa blast": "WhatsApp",
  "blast wa (rfm)": "WhatsApp",
  email: "Email",
  "e-mail": "Email",
  surel: "Email",
  "blast email": "Email",
};

const PROVINSI_ALIASES: Record<string, string> = {
  jakarta: "DKI Jakarta",
  "dki": "DKI Jakarta",
  yogyakarta: "DI Yogyakarta",
  jogja: "DI Yogyakarta",
  diy: "DI Yogyakarta",
  "d.i. yogyakarta": "DI Yogyakarta",
  jabar: "Jawa Barat",
  jateng: "Jawa Tengah",
  jatim: "Jawa Timur",
  sumut: "Sumatera Utara",
  sumbar: "Sumatera Barat",
  sumsel: "Sumatera Selatan",
  "bangka belitung": "Kepulauan Bangka Belitung",
  babel: "Kepulauan Bangka Belitung",
  kepri: "Kepulauan Riau",
  ntb: "Nusa Tenggara Barat",
  ntt: "Nusa Tenggara Timur",
  kalbar: "Kalimantan Barat",
  kalteng: "Kalimantan Tengah",
  kalsel: "Kalimantan Selatan",
  kaltim: "Kalimantan Timur",
  kaltara: "Kalimantan Utara",
  sulut: "Sulawesi Utara",
  sulteng: "Sulawesi Tengah",
  sulsel: "Sulawesi Selatan",
  sultra: "Sulawesi Tenggara",
  sulbar: "Sulawesi Barat",
  "nanggroe aceh darussalam": "Aceh",
};

export function channelOf(value: string) {
  const v = value.trim().toLowerCase();
  return matchList(v, BLAST_CHANNELS) ?? CHANNEL_ALIASES[v] ?? null;
}

/** Kunci duplikat: kontak sesuai kanal blast (WhatsApp → No. HP, Email → email). */
export function blastContactKey(b: { asalBlast: string; noHp: string | null; email: string | null }) {
  const c = b.asalBlast === "Email" ? b.email : b.noHp;
  return c ? `${b.asalBlast}:${c}` : null;
}

export type ParsedBlast = {
  tanggal: Date;
  nama: string;
  email: string | null;
  noHp: string | null;
  provinsi: string | null;
  kota: string | null;
  jenjang: string | null;
  sekolah: string | null;
  ownerId: number | null;
  asalBlast: string;
};

export type BlastParseResult = {
  found: boolean;
  totalRows: number;
  valid: { row: number; data: ParsedBlast }[];
  reports: RowReport[];
  missingHeaders: string[];
};

export async function parseBlastWorkbook(buffer: ArrayBuffer, staff: { id: number; name: string; email: string }[]): Promise<BlastParseResult> {
  assertSafeXlsx(buffer); // tolak zip bomb sebelum dibongkar
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const found = findHeader(wb, ["Nama", "Asal Blast"]);
  if (!found) return { found: false, totalRows: 0, valid: [], reports: [], missingHeaders: ["Nama", "Asal Blast"] };
  const { ws, headerRow } = found;
  const colIndex = mapColumns<BlastKey>(ws, headerRow, BLAST_COLUMNS);
  const missingHeaders = BLAST_COLUMNS.filter((c) => "required" in c && c.required && !colIndex.has(c.key)).map((c) => c.header);

  const valid: BlastParseResult["valid"] = [];
  const reports: RowReport[] = [];
  const seen = new Map<string, number>();
  let totalRows = 0;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: BlastKey): CellVal => {
      const i = colIndex.get(k);
      return i ? row.getCell(i).value : null;
    };
    const txt = (k: BlastKey) => cellText(get(k));
    const opt = (k: BlastKey) => txt(k) || null;

    if (BLAST_COLUMNS.every((c) => !txt(c.key))) continue;
    totalRows++;
    if (totalRows > MAX_IMPORT_ROWS) break;

    const msgs: string[] = [];
    let error = false;
    const warn = (m: string) => msgs.push(m);
    const fail = (m: string) => {
      msgs.push(m);
      error = true;
    };

    const nama = txt("nama");
    const noHp = normalizePhone(txt("noHp"));
    const email = opt("email")?.toLowerCase() ?? null;
    if (!nama && !noHp && !email) fail("Nama, No. HP, dan Email kosong");
    else if (!nama) warn('Nama kosong → "(tanpa nama)"');
    if (txt("noHp") && (!noHp || noHp.length < 10 || noHp.length > 15)) warn(`No. HP "${txt("noHp")}" tampak tidak valid`);
    if (email && !/^\S+@\S+\.\S+$/.test(email)) warn(`Email "${email}" tampak tidak valid`);

    // tanggal
    const d = cellDate(get("tanggal"));
    let tanggal: Date;
    if (d === "invalid") {
      tanggal = new Date();
      warn(`Tanggal "${txt("tanggal")}" tidak dikenali → diisi hari ini`);
    } else if (!d) {
      tanggal = new Date();
      warn("Tanggal kosong → diisi hari ini");
    } else tanggal = d;

    // asal blast (kanal)
    let asalBlast: string | null = null;
    if (txt("asalBlast")) {
      asalBlast = channelOf(txt("asalBlast"));
      if (!asalBlast) fail(`Asal Blast "${txt("asalBlast")}" tidak dikenali (isi Email atau WhatsApp)`);
    } else if (noHp || email) {
      asalBlast = noHp ? "WhatsApp" : "Email";
      warn(`Asal Blast kosong → "${asalBlast}" (ditebak dari kontak yang terisi)`);
    } else fail("Asal Blast kosong");
    if (asalBlast === "WhatsApp" && !noHp) warn("Asal Blast WhatsApp tetapi No. HP kosong");
    if (asalBlast === "Email" && !email) warn("Asal Blast Email tetapi Email kosong");

    // provinsi
    let provinsi = opt("provinsi");
    if (provinsi) {
      const baku = matchList(provinsi, PROVINSI) ?? PROVINSI_ALIASES[provinsi.toLowerCase()] ?? null;
      if (baku) provinsi = baku;
      else warn(`Provinsi "${provinsi}" tidak ada di daftar (tetap disimpan)`);
    }

    // jenjang
    let jenjang = opt("jenjang");
    if (jenjang) {
      const baku = matchList(jenjang, BLAST_JENJANG);
      if (baku) jenjang = baku;
      else warn(`Jenjang "${jenjang}" tidak ada di daftar (tetap disimpan)`);
    }

    // owner
    let ownerId: number | null = null;
    const ownerText = txt("owner");
    if (ownerText) {
      const o = staff.find((s) => s.name.toLowerCase() === ownerText.toLowerCase() || s.email.toLowerCase() === ownerText.toLowerCase());
      if (o) ownerId = o.id;
      else warn(`Admin "${ownerText}" tidak ditemukan → tanpa owner`);
    }

    // duplikat di dalam file
    const key = asalBlast ? blastContactKey({ asalBlast, noHp, email }) : null;
    if (key) {
      const prev = seen.get(key);
      if (prev) warn(`Kontak ${asalBlast} sama dengan baris ${prev} di file ini`);
      else seen.set(key, r);
    }

    reports.push({ row: r, nama: nama || "(tanpa nama)", status: error ? "error" : msgs.length ? "warning" : "ok", messages: msgs });
    if (error || !asalBlast) continue;

    valid.push({
      row: r,
      data: {
        tanggal,
        nama: nama || "(tanpa nama)",
        email,
        noHp,
        provinsi,
        kota: opt("kota"),
        jenjang,
        sekolah: opt("sekolah"),
        ownerId,
        asalBlast,
      },
    });
  }

  return { found: true, totalRows, valid, reports, missingHeaders };
}

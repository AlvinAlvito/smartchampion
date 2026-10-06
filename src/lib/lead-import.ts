import "server-only";
import ExcelJS from "exceljs";
import { FUNNEL_STATUSES, LEAD_CATEGORIES, LEAD_PRODUCTS, LEAD_SOURCES, PAYMENT_STATUSES, TRIAL_OPTIONS } from "./constants";
import { normalizePhone } from "./utils";
import { assertSafeXlsx, cellDate, cellText, findHeader, mapColumns, matchList, type CellVal } from "./xlsx-read";
import { MAX_IMPORT_ROWS, type RowReport } from "./import-types";

/** Kolom template import (urutan & judul sama dengan hasil Ekspor Excel, tanpa "Lead ID"). */
export const IMPORT_COLUMNS = [
  { key: "tanggalMasuk", header: "Tanggal Masuk", required: true, note: "Tanggal (dd/mm/yyyy). Kosong = hari ini", width: 15, date: true },
  { key: "nama", header: "Nama", required: true, note: "Nama lengkap", width: 28 },
  { key: "noWa", header: "No. WA", note: "08xx / 62xx / +62 — diseragamkan otomatis ke 62xx", width: 18, text: true },
  { key: "email", header: "Email", note: "Opsional", width: 28 },
  { key: "sumberLead", header: "Sumber Lead", required: true, note: "Pilih dari daftar", width: 18, list: "sumber" },
  { key: "campaign", header: "Campaign/Halaman", note: "Opsional, mis. hasil-ujian", width: 22 },
  { key: "kategori", header: "Kategori Customer", note: "Pilih dari daftar. Kosong = Calon Customer", width: 18, list: "kategori" },
  { key: "produk", header: "Produk", note: "Pilih dari daftar", width: 16, list: "produk" },
  { key: "paket", header: "Paket/Bidang/Jenjang", note: "mis. 3 bulan / Matematika SMP", width: 24 },
  { key: "owner", header: "Admin yang Melayani", note: "Nama atau email admin. Kosong = belum ada owner", width: 20, list: "owner" },
  { key: "statusFunnel", header: "Status Funnel", note: "Pilih dari daftar. Kosong = Baru", width: 15, list: "status" },
  { key: "trialMimpimu", header: "Trial Mimpi.mu", note: "Sudah / Tidak / Diarahkan", width: 15, list: "trial" },
  { key: "invoiceId", header: "Invoice ID", note: "Opsional", width: 18 },
  { key: "statusBayar", header: "Status Bayar", note: "Belum Ada / Pending / Paid", width: 14, list: "bayar" },
  { key: "nominal", header: "Nominal", note: "Angka saja, mis. 299000", width: 14, money: true },
  { key: "tanggalBayar", header: "Tanggal Bayar", note: "Tanggal. Kosong + status Paid = tanggal masuk", width: 15, date: true },
  { key: "lastContact", header: "Last Contact", note: "Tanggal", width: 15, date: true },
  { key: "nextFollowUp", header: "Next Follow-up", note: "Tanggal", width: 15, date: true },
  { key: "objection", header: "Objection/Kendala", note: "Opsional", width: 30 },
  { key: "nextAction", header: "Next Action", note: "Opsional", width: 30 },
  { key: "catatan", header: "Catatan", note: "Opsional", width: 30 },
] as const;

export type ImportKey = (typeof IMPORT_COLUMNS)[number]["key"];

export { MAX_IMPORT_ROWS };

/** Nilai pilihan untuk dropdown template & validasi import. */
export function importLists(ownerNames: string[]) {
  return {
    sumber: [...LEAD_SOURCES],
    kategori: [...LEAD_CATEGORIES],
    produk: [...LEAD_PRODUCTS],
    status: [...FUNNEL_STATUSES],
    trial: [...TRIAL_OPTIONS],
    bayar: [...PAYMENT_STATUSES],
    owner: ownerNames,
  };
}

// Nama sumber lama / variasi → nama baku
const SOURCE_ALIASES: Record<string, string> = {
  "blast wa (frm)": "Blast WA (RFM)",
  "blast wa": "Blast WA (RFM)",
  "blast telepon (frm)": "Telepon (RFM)",
  "rfm/telepon": "Telepon (RFM)",
  telepon: "Telepon (RFM)",
  "bundling posi pemesanan": "Bundling POSI",
  bundling: "Bundling POSI",
  iklan: "Iklan Web POSI",
  "iklan posi": "Iklan Web POSI",
  email: "Blast Email",
};

export type ParsedLead = {
  tanggalMasuk: Date;
  nama: string;
  noWa: string | null;
  email: string | null;
  sumberLead: string;
  campaign: string | null;
  kategori: string;
  produk: string | null;
  paket: string | null;
  ownerId: number | null;
  statusFunnel: string;
  trialMimpimu: string | null;
  invoiceId: string | null;
  statusBayar: string | null;
  nominal: number | null;
  tanggalBayar: Date | null;
  lastContact: Date | null;
  nextFollowUp: Date | null;
  objection: string | null;
  nextAction: string | null;
  catatan: string | null;
};

export type ParseResult = {
  sheetName: string;
  totalRows: number;
  valid: { row: number; data: ParsedLead }[];
  reports: RowReport[];
  missingHeaders: string[];
};

/**
 * Baca file Excel isian template (atau hasil Ekspor Excel) → data lead tervalidasi + laporan per baris.
 * Header dicari otomatis (baris yang memuat "Nama" & "Sumber Lead"), jadi baris judul di atasnya diabaikan.
 */
export async function parseLeadWorkbook(buffer: ArrayBuffer, staff: { id: number; name: string; email: string }[]): Promise<ParseResult> {
  assertSafeXlsx(buffer); // tolak zip bomb sebelum dibongkar
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const found = findHeader(wb, ["Nama", "Sumber Lead"]);
  if (!found) return { sheetName: "", totalRows: 0, valid: [], reports: [], missingHeaders: ["Nama", "Sumber Lead"] };
  const { ws, headerRow } = found;
  const colIndex = mapColumns<ImportKey>(ws, headerRow, IMPORT_COLUMNS);
  const missingHeaders = IMPORT_COLUMNS.filter((c) => "required" in c && c.required && !colIndex.has(c.key)).map((c) => c.header);

  const lists = importLists(staff.map((s) => s.name));
  const valid: ParseResult["valid"] = [];
  const reports: RowReport[] = [];
  const seenWa = new Map<string, number>();
  let totalRows = 0;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (k: ImportKey): CellVal => {
      const i = colIndex.get(k);
      return i ? row.getCell(i).value : null;
    };
    const txt = (k: ImportKey) => cellText(get(k));
    const opt = (k: ImportKey) => txt(k) || null;

    // lewati baris kosong
    if (IMPORT_COLUMNS.every((c) => !txt(c.key))) continue;
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
    const noWa = normalizePhone(txt("noWa"));
    if (!nama && !noWa) fail("Nama dan No. WA kosong");
    if (txt("noWa") && (!noWa || noWa.length < 10 || noWa.length > 15)) warn(`No. WA "${txt("noWa")}" tampak tidak valid`);

    const dateField = (k: ImportKey, label: string) => {
      const d = cellDate(get(k));
      if (d === "invalid") {
        warn(`${label} "${txt(k)}" tidak dikenali, dikosongkan`);
        return null;
      }
      return d;
    };
    let tanggalMasuk = dateField("tanggalMasuk", "Tanggal Masuk");
    if (!tanggalMasuk) {
      tanggalMasuk = new Date();
      if (!txt("tanggalMasuk")) warn("Tanggal Masuk kosong → diisi hari ini");
    }

    // sumber
    let sumberLead = txt("sumberLead");
    if (!sumberLead) {
      sumberLead = "Lainnya";
      warn('Sumber Lead kosong → "Lainnya"');
    } else {
      const baku = matchList(sumberLead, lists.sumber) ?? SOURCE_ALIASES[sumberLead.toLowerCase()] ?? null;
      if (baku) sumberLead = baku;
      else warn(`Sumber "${sumberLead}" tidak ada di daftar baku (tetap disimpan)`);
    }

    const listField = (k: ImportKey, list: readonly string[], label: string, fallback: string | null) => {
      const v = txt(k);
      if (!v) return fallback;
      const m = matchList(v, list);
      if (m) return m;
      warn(`${label} "${v}" tidak dikenali → ${fallback ?? "dikosongkan"}`);
      return fallback;
    };
    const kategori = listField("kategori", lists.kategori, "Kategori", "Calon Customer")!;
    const produk = txt("produk") ? (matchList(txt("produk"), lists.produk) ?? txt("produk")) : null;
    const statusFunnel = listField("statusFunnel", lists.status, "Status Funnel", "Baru")!;
    const trialMimpimu = listField("trialMimpimu", lists.trial, "Trial Mimpi.mu", null);
    const statusBayar = listField("statusBayar", lists.bayar, "Status Bayar", null);

    // owner
    let ownerId: number | null = null;
    const ownerText = txt("owner");
    if (ownerText) {
      const o = staff.find((s) => s.name.toLowerCase() === ownerText.toLowerCase() || s.email.toLowerCase() === ownerText.toLowerCase());
      if (o) ownerId = o.id;
      else warn(`Admin "${ownerText}" tidak ditemukan → tanpa owner`);
    }

    // nominal
    let nominal: number | null = null;
    const nomRaw = get("nominal");
    if (typeof nomRaw === "number") nominal = Math.round(nomRaw);
    else if (txt("nominal")) {
      const digits = txt("nominal").replace(/[^\d]/g, "");
      nominal = digits ? Number(digits) : null;
      if (nominal == null) warn(`Nominal "${txt("nominal")}" bukan angka, dikosongkan`);
    }

    const lastContact = dateField("lastContact", "Last Contact");
    const nextFollowUp = dateField("nextFollowUp", "Next Follow-up");
    let tanggalBayar = dateField("tanggalBayar", "Tanggal Bayar");
    if (statusFunnel === "Paid" && !tanggalBayar) tanggalBayar = new Date(Math.max(tanggalMasuk.getTime(), lastContact?.getTime() ?? 0));
    if (statusFunnel !== "Paid") tanggalBayar = null;

    const email = opt("email")?.toLowerCase() ?? null;
    if (email && !/^\S+@\S+\.\S+$/.test(email)) warn(`Email "${email}" tampak tidak valid`);

    // duplikat di dalam file
    if (noWa) {
      const prev = seenWa.get(noWa);
      if (prev) warn(`No. WA sama dengan baris ${prev} di file ini`);
      else seenWa.set(noWa, r);
    }

    const report: RowReport = { row: r, nama: nama || "(tanpa nama)", status: error ? "error" : msgs.length ? "warning" : "ok", messages: msgs };
    reports.push(report);
    if (error) continue;

    valid.push({
      row: r,
      data: {
        tanggalMasuk,
        nama: nama || "(tanpa nama)",
        noWa,
        email,
        sumberLead,
        campaign: opt("campaign"),
        kategori,
        produk,
        paket: opt("paket"),
        ownerId,
        statusFunnel,
        trialMimpimu,
        invoiceId: opt("invoiceId"),
        statusBayar,
        nominal,
        tanggalBayar,
        lastContact,
        nextFollowUp,
        objection: opt("objection"),
        nextAction: opt("nextAction"),
        catatan: opt("catatan"),
      },
    });
  }

  return { sheetName: ws.name, totalRows, valid, reports, missingHeaders };
}

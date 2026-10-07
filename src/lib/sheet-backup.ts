import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Backup data penting ke Google Spreadsheet (lewat Google Apps Script web app milik pemilik sheet).
 * - Tiap tabel = 1 sheet, isinya diganti dengan data terbaru (riwayat versi tetap ada di Google Sheets).
 * - Kolom rahasia (password, token pembayaran) TIDAK pernah dikirim.
 * - Berjalan otomatis tiap 6 jam (lihat src/instrumentation.ts) + tombol manual di /admin/backup (Root).
 * Konfigurasi .env: SHEET_BACKUP_URL (URL web app /exec) & SHEET_BACKUP_TOKEN (sama dengan TOKEN di Apps Script).
 */

export const BACKUP_INTERVAL_MS = 6 * 3600_000;
const STATE_FILE = path.join(process.cwd(), "storage", "sheet-backup.json");
/** Batas isi 1 sel Google Sheets = 50.000 karakter */
const MAX_CELL = 45_000;
/** Kolom yang tidak boleh keluar dari server */
const SECRET_FIELD = /^(password|snapToken)$|token|secret/i;

type Delegate = { findMany: (args: { orderBy: { id: "asc" } }) => Promise<Record<string, unknown>[]> };

/** Urutan sheet = urutan di spreadsheet. Sheet 1 = data akun. */
const TABLES: { sheet: string; model: Prisma.ModelName }[] = [
  { sheet: "Akun", model: "User" },
  { sheet: "Master Lead", model: "Lead" },
  { sheet: "Pendaftaran & Transaksi", model: "Registration" },
  { sheet: "Produk", model: "Product" },
  { sheet: "Paket VIP", model: "ProductPackage" },
  { sheet: "Jadwal Pertemuan", model: "ClassSession" },
  { sheet: "Absensi", model: "Attendance" },
  { sheet: "Nilai Pertemuan", model: "MeetingScore" },
  { sheet: "Kelulusan & Rapor", model: "ClassResult" },
  { sheet: "Materi", model: "Material" },
  { sheet: "Tutor", model: "Tutor" },
  { sheet: "Feedback", model: "Feedback" },
  { sheet: "Data Blast", model: "Blast" },
  { sheet: "Kontak Blast WA", model: "BlastContact" },
];

export type BackupState = {
  lastSuccessAt?: string;
  lastAttemptAt?: string;
  lastError?: string | null;
  durationMs?: number;
  sheets?: { name: string; rows: number; status: string }[];
};

export const backupConfigured = () => !!(process.env.SHEET_BACKUP_URL && process.env.SHEET_BACKUP_TOKEN);

export async function readBackupState(): Promise<BackupState> {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as BackupState;
  } catch {
    return {};
  }
}

async function writeBackupState(s: BackupState) {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
}

/** Tanggal → teks WIB "2026-10-07 10:56:00" (mudah dibaca & dipulihkan) */
function wib(d: Date) {
  return new Date(d.getTime() + 7 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
}

function cell(v: unknown): string | number {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return wib(v);
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "bigint") return v.toString();
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > MAX_CELL ? s.slice(0, MAX_CELL) + " …[terpotong]" : s;
}

/** Kolom bantu agar mudah dibaca: id → nama */
async function lookups() {
  const [users, products, sessions] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, email: true } }),
    prisma.product.findMany({ select: { id: true, name: true } }),
    prisma.classSession.findMany({ select: { id: true, title: true } }),
  ]);
  const u = new Map(users.map((x) => [x.id, `${x.name} <${x.email}>`]));
  const p = new Map(products.map((x) => [x.id, x.name]));
  const s = new Map(sessions.map((x) => [x.id, x.title]));
  return {
    userId: { label: "akun", map: u },
    ownerId: { label: "owner", map: u },
    adminId: { label: "admin", map: u },
    productId: { label: "produk", map: p },
    sessionId: { label: "pertemuan", map: s },
  } as Record<string, { label: string; map: Map<number, string> }>;
}

export async function buildBackupSheets() {
  const look = await lookups();
  const out: { name: string; columns: string[]; rows: (string | number)[][] }[] = [];
  for (const t of TABLES) {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === t.model);
    if (!model) continue;
    const fields = model.fields.filter((f) => (f.kind === "scalar" || f.kind === "enum") && !SECRET_FIELD.test(f.name)).map((f) => f.name);
    const extra = fields.filter((f) => look[f]);
    const key = (t.model.charAt(0).toLowerCase() + t.model.slice(1)) as keyof typeof prisma;
    const rows = await (prisma[key] as unknown as Delegate).findMany({ orderBy: { id: "asc" } });
    out.push({
      name: t.sheet,
      columns: [...fields, ...extra.map((f) => `${look[f].label} (dari ${f})`)],
      rows: rows.map((r) => [...fields.map((f) => cell(r[f])), ...extra.map((f) => (r[f] == null ? "" : (look[f].map.get(r[f] as number) ?? "")))]),
    });
  }
  return out;
}

let running = false;

/** Kirim backup sekarang. Mengembalikan ringkasan hasil (dan menyimpannya ke storage/sheet-backup.json). */
export async function runSheetBackup(reason: "jadwal" | "manual"): Promise<BackupState & { ok: boolean }> {
  if (!backupConfigured()) return { ok: false, lastError: "Backup belum dikonfigurasi (SHEET_BACKUP_URL / SHEET_BACKUP_TOKEN)." };
  if (running) return { ok: false, lastError: "Backup sedang berjalan, coba lagi sebentar." };
  running = true;
  const started = Date.now();
  const prev = await readBackupState();
  const state: BackupState = { ...prev, lastAttemptAt: new Date().toISOString() };
  try {
    const sheets = await buildBackupSheets();
    const res = await fetch(process.env.SHEET_BACKUP_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: process.env.SHEET_BACKUP_TOKEN, generatedAt: wib(new Date()) + " WIB", reason, sheets }),
      redirect: "follow",
      signal: AbortSignal.timeout(5 * 60_000),
    });
    const text = await res.text();
    let data: { ok?: boolean; error?: string; sheets?: { name: string; rows: number; status: string }[] } = {};
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Balasan Apps Script bukan JSON (HTTP ${res.status}). Pastikan web app di-deploy "Anyone" & URL berakhiran /exec.`);
    }
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    Object.assign(state, { lastSuccessAt: new Date().toISOString(), lastError: null, durationMs: Date.now() - started, sheets: data.sheets ?? [] });
    await writeBackupState(state);
    return { ...state, ok: true };
  } catch (e) {
    state.lastError = (e as Error).message.slice(0, 500);
    await writeBackupState(state).catch(() => {});
    console.error("[sheet-backup] gagal:", state.lastError);
    return { ...state, ok: false };
  } finally {
    running = false;
  }
}

/** Dipanggil berkala: jalankan bila backup sukses terakhir sudah ≥ 6 jam (atau belum pernah). Gagal → coba lagi 30 menit kemudian. */
export async function backupIfDue() {
  if (!backupConfigured() || running) return;
  const s = await readBackupState();
  const last = s.lastSuccessAt ? Date.parse(s.lastSuccessAt) : 0;
  const lastTry = s.lastAttemptAt ? Date.parse(s.lastAttemptAt) : 0;
  if (Date.now() - last < BACKUP_INTERVAL_MS) return;
  if (s.lastError && Date.now() - lastTry < 30 * 60_000) return;
  await runSheetBackup("jadwal");
}

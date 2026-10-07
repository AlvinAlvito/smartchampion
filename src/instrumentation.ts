/**
 * Dijalankan sekali saat server Next.js menyala.
 * Penjadwal backup ke Google Spreadsheet: cek tiap 10 menit, kirim bila backup terakhir ≥ 6 jam.
 * Hanya aktif bila SHEET_BACKUP_URL & SHEET_BACKUP_TOKEN diisi (di server produksi), jadi lokal tidak ikut mengirim.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.SHEET_BACKUP_URL || !process.env.SHEET_BACKUP_TOKEN) return;
  const { backupIfDue } = await import("./lib/sheet-backup");
  const tick = () => void backupIfDue().catch((e) => console.error("[sheet-backup]", e));
  setTimeout(tick, 2 * 60_000).unref();
  setInterval(tick, 10 * 60_000).unref();
}

import { CircleAlert, CircleCheck, Clock, DatabaseBackup, ExternalLink, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/session";
import { BACKUP_INTERVAL_MS, backupConfigured, buildBackupSheets, readBackupState } from "@/lib/sheet-backup";
import { formatDate } from "@/lib/utils";
import { Badge, PageTitle } from "@/components/ui";
import { BackupNowButton } from "./backup-now";

export const metadata = { title: "Backup Spreadsheet" };
export const dynamic = "force-dynamic";

export default async function BackupPage() {
  await requireUser(["ROOT"]);
  const [state, preview] = await Promise.all([readBackupState(), buildBackupSheets()]);
  const configured = backupConfigured();
  const sheetUrl = process.env.SHEET_BACKUP_SHEET_URL;
  const last = state.lastSuccessAt ? new Date(state.lastSuccessAt) : null;
  const next = last ? new Date(last.getTime() + BACKUP_INTERVAL_MS) : null;
  const sent = new Map((state.sheets ?? []).map((s) => [s.name, s]));

  return (
    <>
      <PageTitle
        icon={DatabaseBackup}
        eyebrow="Keamanan data"
        title="Backup Spreadsheet"
        subtitle="Salinan data penting dikirim otomatis ke Google Spreadsheet setiap 6 jam (tiap tabel = 1 sheet)."
        action={configured ? <BackupNowButton /> : undefined}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-400">Status</p>
          {!configured ? (
            <p className="mt-2 flex items-center gap-2 font-bold text-amber-600">
              <CircleAlert className="h-5 w-5" /> Belum dikonfigurasi
            </p>
          ) : state.lastError ? (
            <p className="mt-2 flex items-center gap-2 font-bold text-rose-600">
              <CircleAlert className="h-5 w-5" /> Percobaan terakhir gagal
            </p>
          ) : last ? (
            <p className="mt-2 flex items-center gap-2 font-bold text-emerald-600">
              <CircleCheck className="h-5 w-5" /> Aktif
            </p>
          ) : (
            <p className="mt-2 flex items-center gap-2 font-bold text-navy-600">
              <Clock className="h-5 w-5" /> Menunggu backup pertama
            </p>
          )}
          {state.lastError && <p className="mt-2 break-words text-xs text-rose-600">{state.lastError}</p>}
        </div>
        <div className="card">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-400">Backup sukses terakhir</p>
          <p className="mt-2 text-lg font-extrabold text-navy-900">{last ? `${formatDate(last, true)} WIB` : "—"}</p>
          {state.durationMs != null && last && <p className="text-xs text-navy-400">selesai dalam {(state.durationMs / 1000).toFixed(1)} detik</p>}
        </div>
        <div className="card">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-400">Jadwal berikutnya</p>
          <p className="mt-2 text-lg font-extrabold text-navy-900">{configured ? (next ? `± ${formatDate(next, true)} WIB` : "± 2 menit setelah server menyala") : "—"}</p>
          {sheetUrl && (
            <a href={sheetUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
              Buka spreadsheet <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-bold text-navy-900">Isi backup</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-navy-400">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">Sheet</th>
              <th className="py-2 pr-3 text-right">Baris di database</th>
              <th className="py-2 pr-3 text-right">Baris di spreadsheet</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((s, i) => {
              const r = sent.get(s.name);
              return (
                <tr key={s.name} className="border-t border-navy-50">
                  <td className="py-2 pr-3 text-navy-400">{i + 1}</td>
                  <td className="py-2 pr-3 font-semibold text-navy-800">{s.name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.rows.length.toLocaleString("id-ID")}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r ? r.rows.toLocaleString("id-ID") : "—"}</td>
                  <td className="py-2">{r ? <Badge tone={r.status === "OK" ? "green" : "red"}>{r.status}</Badge> : <span className="text-xs text-navy-400">belum</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-navy-50/70 p-3 text-xs text-navy-500">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
          Password akun & token pembayaran tidak ikut dikirim. Bila jumlah baris sebuah tabel turun lebih dari setengah dibanding isi spreadsheet, sheet itu DITAHAN (data lama di
          spreadsheet tidak ditimpa) supaya backup tidak ikut rusak bila database bermasalah. Riwayat versi lengkap tetap tersedia di menu File → Riwayat versi pada Google Sheets.
        </p>
      </div>
    </>
  );
}

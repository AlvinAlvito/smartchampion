"use client";

import { useState } from "react";
import { FileDown, FileSpreadsheet, FileText, UserRound } from "lucide-react";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/form-buttons";

type Kind = "excel" | "pdf";

/** Unduh laporan performa (Excel & PDF) sesuai filter periode aktif. */
export function ReportDownload({
  query,
  periodLabel,
  staff,
  endpoint = "/api/admin/performa",
  description = "Excel: data Master Lead & Data Blast · PDF: laporan lengkap dengan grafik",
  defaultOwner = "",
}: {
  query: string;
  periodLabel: string;
  staff?: { id: number; name: string }[];
  /** rute unduhan (…/excel & …/pdf) */
  endpoint?: string;
  description?: string;
  defaultOwner?: string;
}) {
  const [owner, setOwner] = useState(defaultOwner);
  const [busy, setBusy] = useState<Kind | null>(null);
  const toast = useToast();

  const download = async (kind: Kind) => {
    setBusy(kind);
    try {
      const qs = new URLSearchParams(query);
      if (owner) qs.set("owner", owner);
      const res = await fetch(`${endpoint}/${kind}?${qs}`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `laporan-performa.${kind === "pdf" ? "pdf" : "xlsx"}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`Laporan ${kind === "pdf" ? "PDF" : "Excel"} berhasil diunduh.`);
    } catch {
      toast.error("Gagal membuat laporan. Coba lagi.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card mb-7 flex animate-fade-up flex-wrap items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-navy-700 text-white shadow-md">
        <FileDown className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-navy-900">Unduh laporan performa</p>
        <p className="text-xs text-navy-500">
          Periode <b className="text-navy-700">{periodLabel}</b> · {description}
        </p>
      </div>
      {staff && (
        <label className="relative flex items-center">
          <UserRound className="pointer-events-none absolute left-3 h-4 w-4 text-navy-300" />
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className="input py-2! pl-9" aria-label="Laporan untuk">
            <option value="">Semua admin</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => download("excel")} disabled={busy !== null} className="btn-secondary">
          {busy === "excel" ? <Spinner className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4 text-emerald-600" />} Excel
        </button>
        <button onClick={() => download("pdf")} disabled={busy !== null} className="btn-primary">
          {busy === "pdf" ? <Spinner className="h-4 w-4" /> : <FileText className="h-4 w-4" />} {busy === "pdf" ? "Menyusun PDF…" : "PDF + grafik"}
        </button>
      </div>
    </div>
  );
}

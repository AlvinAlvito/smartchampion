"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrainCircuit, ChevronRight, LoaderCircle, Pause, Sparkles } from "lucide-react";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { getJson, postJson } from "./use-poll";

export type BotStats = {
  botId: number | null;
  enabled: boolean;
  hasPersona: boolean;
  total: number;
  analyzed: number;
  pending: number;
  percent: number;
  chats: number;
  chatsPending: number;
  adminMessages: number;
  lastAnalyzedAt: string | null;
  qa: number;
  facts: number;
};

/** "3 menit lalu", "kemarin", "1 minggu lalu" */
export function ago(d: string | null) {
  if (!d) return "belum pernah";
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 90) return "baru saja";
  if (s < 3600) return `${Math.round(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.round(s / 3600)} jam lalu`;
  const days = Math.round(s / 86400);
  if (days === 1) return "kemarin";
  if (days < 7) return `${days} hari lalu`;
  if (days < 30) return `${Math.round(days / 7)} minggu lalu`;
  return `${Math.round(days / 30)} bulan lalu`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Kartu "Analisis chat kamu": AI mempelajari seluruh chat admin ini → klon AI (gaya + pengetahuan) untuk auto-balas & saran jawaban */
export function BotCard({ accountId, readOnly, autoReply }: { accountId: number | null; readOnly: boolean; autoReply: boolean }) {
  const toast = useToast();
  const [stats, setStats] = useState<BotStats | null>(null);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState("");
  const stop = useRef(false);
  const qs = readOnly && accountId ? `?account=${accountId}` : "";

  useEffect(() => {
    let alive = true;
    stop.current = true; // ganti akun → hentikan putaran analisis akun sebelumnya
    void getJson<{ stats: BotStats | null }>(`/api/admin/wa/bot${qs}`)
      .then((r) => alive && setStats(r.stats))
      .catch(() => undefined);
    return () => {
      alive = false;
      stop.current = true;
    };
  }, [qs]);

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setNote("Menyiapkan…");
    let fails = 0;
    let learnedQa = 0;
    let learnedFacts = 0;
    while (!stop.current) {
      const r = await postJson<{ done?: boolean; stats?: BotStats; learned?: { qa: number; facts: number }; retry?: boolean }>("/api/admin/wa/bot", { action: "step" });
      if (stop.current) break;
      if (r.error) {
        // kuota AI gratis terbatas per menit → tunggu lalu lanjut otomatis
        if (++fails > 8) {
          toast.error(`${r.error} Analisis dijeda — klik lanjutkan lagi nanti.`);
          break;
        }
        setNote(`Menunggu kuota AI… (${r.error})`);
        await sleep(12_000);
        continue;
      }
      fails = 0;
      if (r.stats) setStats(r.stats);
      learnedQa += r.learned?.qa ?? 0;
      learnedFacts += r.learned?.facts ?? 0;
      setNote(`Mempelajari chat… +${learnedQa} tanya-jawab, +${learnedFacts} info`);
      if (r.done) {
        toast.success("Analisis selesai — klon AI kamu sudah memakai semua chat terbaru.");
        break;
      }
      await sleep(1500);
    }
    setRunning(false);
    setNote("");
  };

  const toggle = async (enabled: boolean) => {
    const r = await postJson<{ stats?: BotStats }>("/api/admin/wa/bot", { action: "toggle", enabled });
    if (r.error) return toast.error(r.error);
    if (r.stats) setStats(r.stats);
    toast.success(enabled ? "Klon AI dipakai untuk auto-balas & saran jawaban." : "Klon AI dimatikan — auto-balas memakai gaya chatbot umum.");
  };

  if (!stats || !stats.total) return null;
  const fresh = stats.pending === 0 && stats.hasPersona;
  const started = stats.analyzed > 0;

  return (
    <div className="card overflow-hidden p-0!">
      <div className="flex flex-wrap items-center gap-4 bg-linear-to-r from-violet-50 via-white to-brand-50 p-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-violet-500 to-brand-600 text-white shadow-md">
          <BrainCircuit className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-navy-900">
            Klon AI {readOnly ? "admin ini" : "kamu"}
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", fresh ? "bg-emerald-100 text-emerald-700" : started ? "bg-amber-100 text-amber-800" : "bg-navy-100 text-navy-500")}>
              {stats.percent}% chat dianalisis
            </span>
            {started && autoReply && stats.enabled && stats.hasPersona && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-bold text-brand-700">dipakai auto-balas</span>}
          </p>
          <div className="mt-2 h-2 max-w-md overflow-hidden rounded-full bg-navy-100">
            <div className={cn("h-full rounded-full transition-all duration-700", fresh ? "bg-emerald-500" : "bg-linear-to-r from-violet-500 to-brand-500")} style={{ width: `${stats.percent}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-navy-500">
            {running ? (
              <span className="font-semibold text-violet-700">{note}</span>
            ) : (
              <>
                {stats.analyzed.toLocaleString("id-ID")} dari {stats.total.toLocaleString("id-ID")} pesan · terakhir dianalisis {ago(stats.lastAnalyzedAt)}
                {stats.pending > 0 && started && <b className="text-amber-700"> · {stats.pending.toLocaleString("id-ID")} pesan baru belum dipelajari</b>}
                {started && (
                  <>
                    {" "}
                    · {stats.qa} tanya-jawab · {stats.facts} info
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:items-end">
          {!readOnly &&
            (running ? (
              <button className="btn-secondary btn-sm" onClick={() => (stop.current = true)}>
                <Pause className="h-3.5 w-3.5" /> Jeda
              </button>
            ) : (
              <button className="btn-primary btn-sm" onClick={run} disabled={fresh}>
                <Sparkles className="h-3.5 w-3.5" /> {fresh ? "Sudah 100% terbaru" : started ? "Lanjutkan analisis" : "Analisis chat kamu"}
              </button>
            ))}
          {running && <LoaderCircle className="mx-auto h-4 w-4 animate-spin text-violet-600 sm:hidden" />}
          <p className="text-center text-[11px] text-navy-400 sm:text-right">Bikin dirimu versi chat AI</p>
        </div>
      </div>
      {started && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-navy-50 px-4 py-2.5 text-xs">
          {!readOnly && (
            <label className="flex cursor-pointer items-center gap-2 font-semibold text-navy-700">
              <input type="checkbox" checked={stats.enabled} onChange={(e) => void toggle(e.target.checked)} className="h-4 w-4 accent-violet-600" />
              Pakai klon AI untuk auto-balas & saran jawaban
            </label>
          )}
          <Link href={`/admin/chatbot?tab=admin&bot=${accountId ?? ""}`} className="ml-auto inline-flex items-center gap-1 font-bold text-violet-700 hover:underline">
            Lihat isi otak AI <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

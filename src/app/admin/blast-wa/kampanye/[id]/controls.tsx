"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Ban, Copy, Pause, Pencil, Play, RotateCcw, Trash2 } from "lucide-react";
import { campaignControlAction, deleteCampaignAction, duplicateCampaignAction } from "@/app/actions/blast-wa";
import { useToast } from "@/components/toast";
import { ConfirmButton } from "@/components/modal";
import { Spinner } from "@/components/form-buttons";

/** Muat ulang data tiap `ms` selama kampanye berjalan (progres langsung terlihat) */
export function AutoRefresh({ ms }: { ms: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), ms);
    return () => clearInterval(t);
  }, [ms, router]);
  return null;
}

export function CampaignControls({ id, status, failed }: { id: number; status: string; failed: number }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<import("@/lib/action-result").ActionResult>) =>
    start(async () => {
      const r = await fn();
      if (toast.fromResult(r)) {
        if (r.redirectTo) router.push(r.redirectTo);
        else router.refresh();
      }
    });
  const editable = ["DRAFT", "PAUSED", "SCHEDULED"].includes(status);
  return (
    <div className="flex flex-wrap gap-2">
      {pending && <Spinner className="h-5 w-5 self-center text-brand-600" />}
      {status === "DRAFT" && (
        <button className="btn-primary" disabled={pending} onClick={() => run(() => campaignControlAction(id, "start"))}>
          <Play className="h-4 w-4" /> Jalankan
        </button>
      )}
      {status === "PAUSED" && (
        <button className="btn-primary" disabled={pending} onClick={() => run(() => campaignControlAction(id, "resume"))}>
          <Play className="h-4 w-4" /> Lanjutkan
        </button>
      )}
      {(status === "RUNNING" || status === "SCHEDULED") && (
        <button className="btn-secondary" disabled={pending} onClick={() => run(() => campaignControlAction(id, "pause"))}>
          <Pause className="h-4 w-4" /> Jeda
        </button>
      )}
      {failed > 0 && status !== "CANCELLED" && (
        <button className="btn-secondary" disabled={pending} onClick={() => run(() => campaignControlAction(id, "retry"))} title="Kirim ulang yang gagal (kecuali nomor tanpa WhatsApp)">
          <RotateCcw className="h-4 w-4" /> Kirim ulang gagal
        </button>
      )}
      {editable && (
        <Link href={`/admin/blast-wa/kampanye/${id}/edit`} className="btn-secondary">
          <Pencil className="h-4 w-4" /> Ubah
        </Link>
      )}
      <button className="btn-ghost" disabled={pending} onClick={() => run(() => duplicateCampaignAction(id))}>
        <Copy className="h-4 w-4" /> Duplikat
      </button>
      {!["COMPLETED", "CANCELLED"].includes(status) && (
        <ConfirmButton
          className="btn-ghost text-rose-600"
          title="Batalkan kampanye?"
          message="Penerima yang belum dikirimi tidak akan dikirimi. Laporan yang sudah terkirim tetap tersimpan."
          confirmText="Ya, batalkan"
          action={() => campaignControlAction(id, "cancel")}
        >
          <Ban className="h-4 w-4" /> Batalkan
        </ConfirmButton>
      )}
      {status !== "RUNNING" && (
        <ConfirmButton
          className="btn-ghost text-rose-600"
          title="Hapus kampanye?"
          message="Kampanye & laporan penerimanya dihapus permanen. Kontak dan Data Blast tidak ikut terhapus."
          confirmText="Ya, hapus"
          action={() => deleteCampaignAction(id)}
          onDone={(r) => r.redirectTo && router.push(r.redirectTo)}
        >
          <Trash2 className="h-4 w-4" /> Hapus
        </ConfirmButton>
      )}
    </div>
  );
}

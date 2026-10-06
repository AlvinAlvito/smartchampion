"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, PlugZap, Smartphone, TriangleAlert, Unplug } from "lucide-react";
import { setNumberAgeAction } from "@/app/actions/blast-wa";
import { NUMBER_AGE_LABEL } from "@/lib/blast-wa-shared";
import { WA_STATUS_LABEL, WA_STATUS_TONE, formatWaPhone } from "@/lib/wa-shared";
import { useToast } from "@/components/toast";
import { ConfirmButton } from "@/components/modal";
import { Badge } from "@/components/ui";
import { ConnectPanel } from "../chat/connect-panel";
import { getJson, postJson, usePoll } from "../chat/use-poll";

const TIPS = [
  "Pakai nomor KHUSUS blast — jangan nomor CS/Chat WA. Bila nomor blast dibatasi, nomor CS tetap aman.",
  "Lebih aman memakai nomor yang sudah lama aktif & pernah chat normal. Nomor baru wajib warm-up: kuota naik bertahap tiap minggu.",
  "Sebelum kirim, sistem mengecek nomor tujuan terdaftar di WhatsApp; nomor yang berhenti berlangganan (balas STOP) otomatis dilewati.",
  "Pesan dikirim satu per satu dengan jeda acak, istirahat tiap batch, hanya di jam kirim, dan dijeda otomatis bila banyak gagal / WA membatasi.",
  "Personalisasi pesan ({nama}, spintax) dan ajak penerima membalas — balasan tinggi membuat nomor lebih dipercaya.",
];

type Sender = { id: number; status: string; phone: string | null; waName: string | null; lastError: string | null; restricted: boolean; numberAge: string } | null;
type State = { configured: boolean; gatewayUp?: boolean; sender: Omit<NonNullable<Sender>, "numberAge"> | null; qr?: string | null; pairingCode?: string | null };

const WAITING = ["CONNECTING", "QR", "PAIRING", "RECONNECTING"];

export function SenderPanel({ initial, configured, chatConflict }: { initial: Sender; configured: boolean; chatConflict: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<State | null>(null);
  const [polling, setPolling] = useState(!initial || initial.status !== "CONNECTED");
  const [busy, start] = useTransition();
  const live = state?.sender ?? initial;
  const status = live?.status ?? "DISCONNECTED";

  usePoll(
    async () => {
      const s = await getJson<State>("/api/admin/blast-wa/state");
      setState(s);
      if (s.sender?.status === "CONNECTED" && initial?.status !== "CONNECTED") {
        setPolling(false);
        toast.success("Nomor blast tersambung.");
        router.refresh();
      }
    },
    polling ? (WAITING.includes(status) ? 2500 : 8000) : null,
    [polling, status],
  );

  if (!configured)
    return (
      <div className="card flex items-start gap-3 text-sm text-amber-800">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" /> Layanan WhatsApp (wa-gateway) belum dikonfigurasi di server ini.
      </div>
    );

  if (status === "CONNECTED" && live) {
    return (
      <div className="card">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-emerald-400 to-emerald-600 text-white shadow-md">
            <Smartphone className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-navy-400">Nomor blast</p>
            <p className="whitespace-nowrap text-lg font-extrabold text-navy-900">{formatWaPhone(live.phone)}</p>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-navy-500">
              {live.waName ?? "-"} <Badge tone={live.restricted ? "red" : "green"}>{live.restricted ? "Dibatasi WhatsApp" : WA_STATUS_LABEL[status]}</Badge>
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-52 flex-1 text-xs font-semibold text-navy-500">
            Umur nomor WhatsApp (menentukan kuota warm-up)
            <select
              className="input mt-1"
              defaultValue={initial?.numberAge ?? "BARU"}
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value;
                start(async () => {
                  if (toast.fromResult(await setNumberAgeAction(v))) router.refresh();
                });
              }}
            >
              {Object.entries(NUMBER_AGE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <ConfirmButton
            className="btn-ghost text-rose-600"
            title="Putuskan nomor blast?"
            message="Perangkat tertaut dilepas dan kampanye yang berjalan dijeda. Kontak, kampanye, dan Data Blast tetap tersimpan."
            confirmText="Ya, putuskan"
            action={async () => {
              const r = await postJson("/api/admin/blast-wa/disconnect", {});
              if (r.error) return { error: r.error };
              return { ok: "Nomor blast diputus." };
            }}
            onDone={() => {
              setPolling(true);
              router.refresh();
            }}
          >
            <Unplug className="h-4 w-4" /> Putuskan
          </ConfirmButton>
        </div>
        {chatConflict && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-50 p-3 text-xs text-rose-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> Nomor ini sama dengan nomor Chat WA Anda. Sangat disarankan memakai nomor lain khusus blast agar nomor CS tidak ikut dibatasi.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PlugZap className="h-5 w-5 text-brand-600" />
        <p className="font-bold text-navy-900">Hubungkan nomor WhatsApp untuk blast</p>
        {live && <Badge tone={WA_STATUS_TONE[status] ?? "gray"}>{WA_STATUS_LABEL[status] ?? status}</Badge>}
        {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
      </div>
      {state && state.gatewayUp === false && <p className="mb-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">Layanan WhatsApp sedang tidak aktif. Coba lagi sebentar.</p>}
      <ConnectPanel
        status={status}
        qr={state?.qr ?? null}
        pairingCode={state?.pairingCode ?? null}
        lastError={live?.lastError ?? null}
        connectUrl="/api/admin/blast-wa/connect"
        tips={TIPS}
        title="Tautkan nomor WhatsApp khusus blast sebagai perangkat tertaut"
        onChanged={() => {
          setPolling(true);
          void getJson<State>("/api/admin/blast-wa/state").then(setState).catch(() => {});
        }}
      />
    </div>
  );
}

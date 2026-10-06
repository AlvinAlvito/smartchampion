"use client";

import { useState } from "react";
import { KeyRound, LoaderCircle, QrCode, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
import { postJson } from "./use-poll";

const TIPS = [
  "Pakai nomor WhatsApp yang sudah lama aktif & rutin dipakai chat (bukan nomor baru).",
  "Fitur ini hanya untuk MEMBALAS chat customer. Tidak ada broadcast/kirim massal: sistem menolak kirim ke nomor yang belum pernah chat.",
  "Pesan dikirim bertahap (jeda 3–7 detik + indikator “mengetik…”) dan dibatasi per menit/jam/hari.",
  "Hindari mengirim teks yang sama persis ke banyak orang; sapa dengan nama & sesuaikan isinya.",
  "HP tetap boleh dipakai seperti biasa. Untuk berhenti, klik Putuskan atau hapus perangkat di WhatsApp › Perangkat tertaut.",
];

export function ConnectPanel({
  status,
  qr,
  pairingCode,
  lastError,
  onChanged,
  connectUrl = "/api/admin/wa/connect",
  tips = TIPS,
  title = "Tautkan WhatsApp Anda sebagai perangkat tertaut",
}: {
  status: string;
  qr: string | null;
  pairingCode: string | null;
  lastError: string | null;
  onChanged: () => void;
  connectUrl?: string;
  tips?: string[];
  title?: string;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<"qr" | "code">("qr");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const waiting = ["CONNECTING", "QR", "PAIRING", "RECONNECTING"].includes(status);

  const connect = async () => {
    setBusy(true);
    const r = await postJson(connectUrl, mode === "code" ? { phone } : {});
    setBusy(false);
    if (r.error) toast.error(r.error);
    onChanged();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        {!waiting && (
          <>
            <p className="mb-3 text-sm font-semibold text-navy-800">{title}</p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {[
                { v: "qr" as const, l: "Scan QR", d: "Dari HP lain/komputer", icon: QrCode },
                { v: "code" as const, l: "Kode tautan", d: "Masukkan kode 8 digit di HP", icon: KeyRound },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setMode(o.v)}
                  className={cn(
                    "flex items-start gap-2.5 rounded-2xl border p-3 text-left transition",
                    mode === o.v ? "border-brand-400 bg-brand-50 ring-2 ring-brand-100" : "border-navy-100 hover:bg-navy-50/60",
                  )}
                >
                  <o.icon className={cn("mt-0.5 h-5 w-5 shrink-0", mode === o.v ? "text-brand-600" : "text-navy-300")} />
                  <span>
                    <span className="block text-sm font-bold text-navy-900">{o.l}</span>
                    <span className="block text-xs text-navy-500">{o.d}</span>
                  </span>
                </button>
              ))}
            </div>
            {mode === "code" && (
              <div className="mb-4">
                <label className="label" htmlFor="wa-phone">
                  Nomor WhatsApp yang akan ditautkan
                </label>
                <input id="wa-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="08xxxxxxxxxx" className="input" />
              </div>
            )}
            <button className="btn-primary" onClick={connect} disabled={busy || (mode === "code" && phone.replace(/\D/g, "").length < 10)}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />} Hubungkan WhatsApp
            </button>
            {lastError && (
              <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {lastError}
              </p>
            )}
          </>
        )}

        {status === "QR" && qr && (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR WhatsApp" width={220} height={220} className="rounded-2xl bg-white p-2 ring-1 ring-navy-100" />
            <ol className="list-decimal space-y-1 pl-4 text-sm text-navy-600">
              <li>Buka WhatsApp di HP.</li>
              <li>
                Ketuk <b>⋮ / Setelan › Perangkat tertaut</b>.
              </li>
              <li>
                Ketuk <b>Tautkan perangkat</b>, lalu arahkan kamera ke QR ini.
              </li>
              <li className="text-xs text-navy-400">QR berganti otomatis tiap ±20 detik.</li>
            </ol>
          </div>
        )}
        {status === "PAIRING" && pairingCode && (
          <div>
            <p className="text-sm text-navy-600">Masukkan kode ini di HP:</p>
            <p className="my-3 font-mono text-4xl font-extrabold tracking-[0.3em] text-brand-700">{pairingCode.replace(/(.{4})/, "$1-")}</p>
            <ol className="list-decimal space-y-1 pl-4 text-sm text-navy-600">
              <li>
                WhatsApp › <b>Perangkat tertaut › Tautkan perangkat</b>.
              </li>
              <li>
                Pilih <b>Tautkan dengan nomor telepon</b>, lalu ketik kode di atas.
              </li>
            </ol>
          </div>
        )}
        {waiting && !(status === "QR" && qr) && !(status === "PAIRING" && pairingCode) && (
          <p className="flex items-center gap-2 text-sm text-navy-500">
            <LoaderCircle className="h-4 w-4 animate-spin text-brand-600" /> Menghubungkan ke WhatsApp…
          </p>
        )}
      </div>
      <div className="rounded-3xl bg-emerald-50/60 p-4 ring-1 ring-emerald-100">
        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-800">
          <ShieldCheck className="h-4 w-4" /> Agar nomor tetap aman
        </p>
        <ul className="space-y-1.5 text-xs text-emerald-900/80">
          {tips.map((t) => (
            <li key={t} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" /> {t}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-emerald-900/60">
          Catatan: ini koneksi WhatsApp tidak resmi (seperti WhatsApp Web). Risiko pembatasan dari WhatsApp tidak bisa 0%, tetapi pengaman di atas membuat pola
          kirim tetap wajar seperti manusia.
        </p>
      </div>
    </div>
  );
}

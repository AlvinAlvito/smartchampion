"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CreditCard, FlaskConical, RefreshCw, XCircle } from "lucide-react";
import { cancelRegistrationAction, simulatePaymentAction, startPaymentAction, syncPaymentAction } from "@/app/actions/registration";
import { useToast } from "@/components/toast";
import { ConfirmButton } from "@/components/modal";
import { Spinner } from "@/components/form-buttons";

type SnapCallbacks = { onSuccess?: () => void; onPending?: () => void; onError?: () => void; onClose?: () => void };
declare global {
  interface Window {
    snap?: { pay: (token: string, cb?: SnapCallbacks) => void };
  }
}

export function PaymentActions({ code, midtransEnabled, simulation, snapJsUrl, clientKey }: { code: string; midtransEnabled: boolean; simulation: boolean; snapJsUrl: string; clientKey: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const refresh = (silent = false) =>
    startTransition(async () => {
      const r = await syncPaymentAction(code);
      if (!silent || r.ok) toast.fromResult(r);
      router.refresh();
    });

  const pay = () =>
    startTransition(async () => {
      const res = await startPaymentAction(code);
      if (res.error || !res.token) return void toast.error(res.error ?? "Gagal memulai pembayaran.");
      if (!window.snap) return void toast.error("Halaman pembayaran belum termuat. Coba lagi sebentar.");
      window.snap.pay(res.token, {
        onSuccess: () => refresh(),
        onPending: () => {
          toast.info("Selesaikan pembayaran sesuai instruksi. Status akan diperbarui otomatis.");
          refresh(true);
        },
        onClose: () => {
          toast.info("Jendela pembayaran ditutup. Kamu bisa melanjutkannya kapan saja.");
          refresh(true);
        },
        onError: () => toast.error("Pembayaran gagal diproses. Coba metode lain."),
      });
    });

  return (
    <div className="space-y-3">
      {midtransEnabled && <Script src={snapJsUrl} data-client-key={clientKey} strategy="afterInteractive" />}

      {midtransEnabled ? (
        <button onClick={pay} disabled={pending} className="btn-primary w-full py-3.5 text-base">
          {pending ? <Spinner /> : <CreditCard className="h-5 w-5" />}
          {pending ? "Memproses..." : "Bayar Sekarang"}
        </button>
      ) : !simulation ? (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-100">
          Pembayaran online belum dikonfigurasi. Silakan hubungi admin untuk menyelesaikan pembayaran.
        </p>
      ) : (
        <div className="space-y-3 rounded-2xl border border-dashed border-brand-300 bg-brand-50/60 p-4 text-sm text-navy-700">
          <p className="flex gap-2">
            <FlaskConical className="h-5 w-5 shrink-0 text-brand-600" />
            <span>
              <b>Mode simulasi:</b> kunci Midtrans belum diisi di <code>.env</code>. Tombol di bawah menandai pendaftaran ini lunas (khusus lokal).
            </span>
          </p>
          <button
            onClick={() =>
              startTransition(async () => {
                toast.fromResult(await simulatePaymentAction(code));
                router.refresh();
              })
            }
            disabled={pending}
            className="btn-primary w-full py-3"
          >
            {pending && <Spinner />}
            {pending ? "Memproses..." : "Simulasikan Pembayaran Berhasil"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {midtransEnabled && (
          <button onClick={() => refresh()} disabled={pending} className="btn-secondary flex-1">
            <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> Cek status
          </button>
        )}
        <ConfirmButton
          className="btn-ghost flex-1 text-rose-600 hover:bg-rose-50"
          title="Batalkan pendaftaran?"
          message="Pendaftaran ini akan dibatalkan. Kamu bisa mendaftar ulang kapan saja dari halaman kelas."
          confirmText="Ya, batalkan"
          action={() => cancelRegistrationAction(code)}
        >
          <XCircle className="h-4 w-4" /> Batalkan pendaftaran
        </ConfirmButton>
      </div>
    </div>
  );
}

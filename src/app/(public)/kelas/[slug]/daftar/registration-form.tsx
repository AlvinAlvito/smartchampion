"use client";

import { useState, useTransition } from "react";
import { ArrowRight, CircleCheck, Loader2, Mail, Megaphone, Phone, School, TicketPercent, UserRound, Users, X } from "lucide-react";
import { previewVoucherAction } from "@/app/actions/vouchers";
import { formatRupiah } from "@/lib/utils";
import { registerCocAction } from "@/app/actions/registration";
import { REGISTRATION_SOURCES } from "@/lib/constants";
import { Field } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/form-buttons";

type Defaults = { fullName: string; school: string; phone: string; email: string };

function IconInput({ icon: Icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon: typeof Mail }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
      <input {...props} className="input pl-10" />
    </div>
  );
}

type Applied = { code: string; label: string; discount: number; total: number; base: number };

/** Kode voucher (opsional): tombol "Pakai" menampilkan pratinjau potongan; harga final tetap dihitung server saat daftar */
function VoucherField({ productId, packageId, serverError }: { productId: number; packageId?: number; serverError?: string[] }) {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<Applied | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, start] = useTransition();
  const apply = () =>
    start(async () => {
      const r = await previewVoucherAction({ code, productId, packageId });
      if (r.ok) {
        setApplied(r);
        setCode(r.code);
        setError(null);
      } else {
        setApplied(null);
        setError(r.error);
      }
    });
  const clear = () => {
    setCode("");
    setApplied(null);
    setError(null);
  };
  const shownError = error ?? (!applied ? serverError?.[0] : undefined);
  return (
    <div className="rounded-2xl bg-rose-50/50 p-4 ring-1 ring-rose-100 sm:col-span-2">
      <label htmlFor="voucherCode" className="label flex items-center gap-1.5">
        <TicketPercent className="h-4 w-4 text-rose-500" /> Punya kode voucher?
      </label>
      <div className="flex gap-2">
        <input
          id="voucherCode"
          name="voucherCode"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().replace(/\s/g, ""));
            setApplied(null);
            setError(null);
          }}
          onKeyDown={(e) => {
            // Enter di kolom voucher = pakai voucher, bukan kirim formulir
            if (e.key === "Enter") {
              e.preventDefault();
              if (code.trim()) apply();
            }
          }}
          maxLength={40}
          autoComplete="off"
          placeholder="Masukkan kode (opsional)"
          className="input font-mono font-bold uppercase tracking-wider placeholder:font-sans placeholder:font-normal placeholder:normal-case placeholder:tracking-normal"
        />
        {applied ? (
          <button type="button" onClick={clear} className="btn-ghost shrink-0" aria-label="Hapus voucher">
            <X className="h-4 w-4" /> Hapus
          </button>
        ) : (
          <button type="button" onClick={apply} disabled={!code.trim() || checking} className="btn-secondary shrink-0">
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Pakai
          </button>
        )}
      </div>
      {shownError && <p className="mt-1.5 text-xs font-medium text-rose-600">{shownError}</p>}
      {applied && (
        <div className="mt-3 space-y-1 rounded-xl bg-white p-3 text-sm ring-1 ring-emerald-100">
          <p className="flex items-center gap-1.5 font-bold text-emerald-700">
            <CircleCheck className="h-4 w-4" /> Voucher {applied.code} dipakai · diskon {applied.label}
          </p>
          <p className="flex justify-between text-navy-500">
            <span>Harga</span> <span>{formatRupiah(applied.base)}</span>
          </p>
          <p className="flex justify-between text-rose-600">
            <span>Potongan voucher</span> <span>− {formatRupiah(applied.discount)}</span>
          </p>
          <p className="flex justify-between border-t border-navy-50 pt-1 font-extrabold text-navy-900">
            <span>Total bayar</span> <span>{formatRupiah(applied.total)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export function RegistrationForm({ productId, packageId, defaults }: { productId: number; packageId?: number; defaults: Defaults }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(registerCocAction, { refresh: false });

  return (
    <form {...formProps} className="grid gap-5 sm:grid-cols-2">
      <input type="hidden" name="productId" value={productId} />
      {packageId && <input type="hidden" name="packageId" value={packageId} />}
      <Field label="Nama lengkap *" htmlFor="fullName" errors={fe?.fullName} className="sm:col-span-2">
        <IconInput icon={UserRound} id="fullName" name="fullName" defaultValue={defaults.fullName} required />
      </Field>
      <Field label="Asal sekolah *" htmlFor="school" errors={fe?.school} className="sm:col-span-2">
        <IconInput icon={School} id="school" name="school" defaultValue={defaults.school} required />
      </Field>
      <Field label="Nomor WhatsApp *" htmlFor="phone" errors={fe?.phone}>
        <IconInput icon={Phone} id="phone" name="phone" defaultValue={defaults.phone} placeholder="08xxxxxxxxxx" inputMode="tel" required />
      </Field>
      <Field label="Email *" htmlFor="email" errors={fe?.email}>
        <IconInput icon={Mail} id="email" name="email" type="email" defaultValue={defaults.email} required />
      </Field>
      <Field label="No. WhatsApp orang tua" htmlFor="parentPhone" hint="Dianjurkan untuk peserta SD.">
        <IconInput icon={Users} id="parentPhone" name="parentPhone" placeholder="opsional" inputMode="tel" />
      </Field>
      <Field label="Dapat info pelatihan ini dari *" htmlFor="source" errors={fe?.source}>
        <div className="relative">
          <Megaphone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
          <select id="source" name="source" className="input pl-10" required defaultValue="">
            <option value="" disabled>
              Pilih salah satu
            </option>
            {REGISTRATION_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </Field>
      <VoucherField productId={productId} packageId={packageId} serverError={fe?.voucherCode} />
      <div className="pt-2 sm:col-span-2">
        <SubmitButton pending={pending} className="btn-primary w-full py-3.5 text-base sm:w-auto sm:px-8" pendingText="Memproses pendaftaran...">
          Lanjut ke pembayaran <ArrowRight className="h-4 w-4" />
        </SubmitButton>
      </div>
    </form>
  );
}

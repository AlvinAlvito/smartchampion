"use client";

import { ArrowRight, Mail, Megaphone, Phone, School, UserRound, Users } from "lucide-react";
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
      <div className="pt-2 sm:col-span-2">
        <SubmitButton pending={pending} className="btn-primary w-full py-3.5 text-base sm:w-auto sm:px-8" pendingText="Memproses pendaftaran...">
          Lanjut ke pembayaran <ArrowRight className="h-4 w-4" />
        </SubmitButton>
      </div>
    </form>
  );
}

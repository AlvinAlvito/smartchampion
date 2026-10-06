"use client";

import { ArrowRight } from "lucide-react";
import { registerAction } from "@/app/actions/auth";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { PasswordInput } from "@/components/password-input";
import { Field } from "@/components/ui";
import { StudentFields } from "@/components/student-fields";

export function RegisterForm({ next }: { next: string }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(registerAction, { refresh: false });
  return (
    <form {...formProps} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="next" value={next} />
      <Field label="Nama lengkap" htmlFor="name" errors={fe?.name} className="sm:col-span-2">
        <input id="name" name="name" className="input" required />
      </Field>
      <Field label="Email" htmlFor="email" errors={fe?.email} className="sm:col-span-2">
        <input id="email" name="email" type="email" autoComplete="email" className="input" required />
      </Field>
      <Field label="Nomor WhatsApp" htmlFor="phone" errors={fe?.phone}>
        <input id="phone" name="phone" className="input" placeholder="08xxxxxxxxxx" inputMode="tel" required />
      </Field>
      <Field label="Asal sekolah" htmlFor="school" errors={fe?.school}>
        <input id="school" name="school" className="input" required />
      </Field>
      <StudentFields errors={fe} />
      <Field label="Password" htmlFor="password" errors={fe?.password}>
        <PasswordInput id="password" name="password" autoComplete="new-password" required />
      </Field>
      <Field label="Ulangi password" htmlFor="confirm" errors={fe?.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
      </Field>
      <div className="pt-1 sm:col-span-2">
        <SubmitButton pending={pending} className="btn-primary w-full py-3 text-base" pendingText="Membuat akun...">
          Buat akun <ArrowRight className="h-4 w-4" />
        </SubmitButton>
      </div>
    </form>
  );
}

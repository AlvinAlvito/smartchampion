"use client";

import { KeyRound, Save, UserRound } from "lucide-react";
import { changePasswordAction, updateProfileAction } from "@/app/actions/profile";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { PasswordInput } from "@/components/password-input";
import { Field } from "@/components/ui";
import { StudentFields, type StudentDefaults } from "@/components/student-fields";

export function ProfileForm({ defaults }: { defaults: StudentDefaults & { name: string; phone: string; school: string } }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(updateProfileAction);
  return (
    <form {...formProps} className="card animate-fade-up space-y-5 [animation-delay:80ms]">
      <p className="flex items-center gap-2 font-bold text-navy-900">
        <UserRound className="h-5 w-5 text-brand-600" /> Data diri
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama lengkap" htmlFor="name" errors={fe?.name} className="sm:col-span-2">
          <input id="name" name="name" defaultValue={defaults.name} className="input" required />
        </Field>
        <Field label="Nomor WhatsApp" htmlFor="phone" errors={fe?.phone}>
          <input id="phone" name="phone" defaultValue={defaults.phone} className="input" inputMode="tel" required />
        </Field>
        <Field label="Asal sekolah" htmlFor="school">
          <input id="school" name="school" defaultValue={defaults.school} className="input" />
        </Field>
        <StudentFields defaults={defaults} errors={fe} />
      </div>
      <SubmitButton pending={pending}>
        <Save className="h-4 w-4" /> Simpan perubahan
      </SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const { formProps, pending, fieldErrors: fe } = useFormAction(changePasswordAction, { resetOnSuccess: true, refresh: false });
  return (
    <form {...formProps} className="card animate-fade-up space-y-5 [animation-delay:160ms]">
      <p className="flex items-center gap-2 font-bold text-navy-900">
        <KeyRound className="h-5 w-5 text-brand-600" /> Ganti password
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Password saat ini" htmlFor="current" errors={fe?.current}>
          <PasswordInput id="current" name="current" autoComplete="current-password" required />
        </Field>
        <Field label="Password baru" htmlFor="next" errors={fe?.next}>
          <PasswordInput id="next" name="next" autoComplete="new-password" required />
        </Field>
        <Field label="Ulangi password baru" htmlFor="confirm" errors={fe?.confirm}>
          <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
        </Field>
      </div>
      <SubmitButton pending={pending} className="btn-secondary">
        <KeyRound className="h-4 w-4" /> Ganti password
      </SubmitButton>
    </form>
  );
}

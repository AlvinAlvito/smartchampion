"use client";

import { ArrowRight, Mail } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { PasswordInput } from "@/components/password-input";
import { cn } from "@/lib/utils";

export function LoginForm({ next }: { next: string }) {
  const { formProps, pending, state } = useFormAction(loginAction, { refresh: false });
  return (
    <form {...formProps} className={cn("space-y-5", state?.error && "animate-shake")}>
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
          <input id="email" name="email" type="email" autoComplete="email" className="input pl-10" placeholder="nama@email.com" required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <PasswordInput id="password" name="password" autoComplete="current-password" placeholder="••••••••" required />
      </div>
      {state?.error && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ring-1 ring-rose-100">{state.error}</p>}
      <SubmitButton pending={pending} className="btn-primary w-full py-3 text-base" pendingText="Memeriksa...">
        Masuk <ArrowRight className="h-4 w-4" />
      </SubmitButton>
    </form>
  );
}

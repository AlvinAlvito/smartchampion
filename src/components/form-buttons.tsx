"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import type { ActionResult } from "@/lib/action-result";
import { useToast } from "./toast";
import { READ_ONLY_TITLE, useReadOnly } from "./read-only";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <LoaderCircle className={`${className} animate-spin`} />;
}

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText = "Menyimpan...",
  disabled,
  pending: pendingProp,
  form,
  allowReadOnly,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  disabled?: boolean;
  /** status pending dari useFormAction (form yang memakai onSubmit) */
  pending?: boolean;
  /** id form bila tombol berada di luar <form> (mis. footer modal) */
  form?: string;
  /** tetap aktif di mode lihat saja (mis. ganti password akun sendiri) */
  allowReadOnly?: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = formPending || Boolean(pendingProp);
  const locked = useReadOnly() && !allowReadOnly;
  return (
    <button
      type="submit"
      form={form}
      className={className}
      disabled={pending || disabled || locked}
      aria-busy={pending}
      title={locked ? READ_ONLY_TITLE : undefined}
    >
      {pending && <Spinner />}
      {pending ? pendingText : children}
    </button>
  );
}

/**
 * useActionState + notifikasi otomatis.
 * - Setiap hasil (ok / error / fieldErrors) langsung tampil sebagai toast.
 * - Submit lewat onSubmit (bukan prop `action`) agar isian TIDAK terhapus saat validasi gagal.
 */
export function useFormAction(
  action: (prev: ActionResult | undefined, form: FormData) => Promise<ActionResult>,
  opts: { onSuccess?: (r: ActionResult) => void; refresh?: boolean; resetOnSuccess?: boolean } = {},
) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const toast = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  useEffect(() => {
    if (!state) return;
    const ok = toast.fromResult(state);
    if (!ok) return;
    if (optsRef.current.resetOnSuccess) formRef.current?.reset();
    optsRef.current.onSuccess?.(state);
    if (state.redirectTo) router.push(state.redirectTo);
    else if (optsRef.current.refresh !== false) router.refresh();
  }, [state, toast, router]);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      startTransition(() => formAction(fd));
    },
    [formAction],
  );

  return { state, pending, fieldErrors: state?.fieldErrors, formProps: { ref: formRef, onSubmit, noValidate: false } };
}

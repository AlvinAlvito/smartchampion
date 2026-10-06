"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Save } from "lucide-react";
import { changeAccountEmailAction } from "@/app/actions/account-email";
import { Modal } from "@/components/modal";
import { Spinner } from "@/components/form-buttons";
import { useToast } from "@/components/toast";
import { Field } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Tombol + dialog ganti email login akun peserta */
export function ChangeEmailButton({
  userId,
  name,
  email,
  className,
  label = "Ubah email",
}: {
  userId: number;
  name: string;
  email: string;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(email);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const save = () =>
    start(async () => {
      setErr("");
      const r = await changeAccountEmailAction(userId, value);
      if (r.fieldErrors?.email) return setErr(r.fieldErrors.email[0]);
      if (toast.fromResult(r)) {
        setOpen(false);
        router.refresh();
      }
    });
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setValue(email);
          setErr("");
          setOpen(true);
        }}
        className={cn("inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:underline", className)}
        title={`Ganti email login ${name}`}
      >
        <AtSign className="h-3 w-3" /> {label}
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          icon={AtSign}
          title="Ubah email akun"
          description={`Akun peserta ${name}`}
          footer={
            <>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Batal
              </button>
              <button type="button" className="btn-primary" onClick={save} disabled={pending || !value.trim()}>
                {pending ? <Spinner /> : <Save className="h-4 w-4" />} Simpan email
              </button>
            </>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="space-y-3"
          >
            <p className="rounded-2xl bg-navy-50/70 px-3 py-2 text-sm text-navy-600">
              Email sekarang: <b className="break-all text-navy-900">{email}</b>
            </p>
            <Field
              label="Email baru"
              htmlFor="new-email"
              errors={err ? [err] : undefined}
              hint="Peserta login dengan email baru ini; password tidak berubah. Email di Master Lead & pendaftarannya ikut diperbarui."
            >
              <input
                id="new-email"
                type="email"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="input"
                autoFocus
                autoComplete="off"
                maxLength={160}
              />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}

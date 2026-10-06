"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Split, UserPlus } from "lucide-react";
import { splitAccountAction } from "@/app/actions/split-account";
import { Modal } from "@/components/modal";
import { Spinner } from "@/components/form-buttons";
import { useToast } from "@/components/toast";
import { Field } from "@/components/ui";

/** Usulan email: alias Gmail (nama+anak@gmail.com masuk ke kotak masuk yang sama), selain itu dikosongkan */
function suggestEmail(current: string, name: string) {
  const [local, domain] = current.toLowerCase().split("@");
  const first =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z\s]/g, "")
      .trim()
      .split(/\s+/)[0] ?? "";
  if (!local || !first || !/^(gmail|googlemail)\.com$/.test(domain ?? "")) return "";
  return `${local.split("+")[0]}+${first}@${domain}`;
}

/** Pisahkan akun peserta ini dari akun keluarga yang dipakai bersama */
export function SplitAccountButton({ registrationId, name, currentEmail }: { registrationId: number; name: string; currentEmail: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const save = () =>
    start(async () => {
      setErr("");
      const r = await splitAccountAction(registrationId, email);
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
        onClick={() => {
          setEmail(suggestEmail(currentEmail, name));
          setErr("");
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 font-bold text-brand-700 underline-offset-2 hover:underline"
      >
        <Split className="h-3 w-3" /> Pisahkan akun
      </button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          icon={UserPlus}
          title="Pisahkan akun peserta"
          description={name}
          footer={
            <>
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Batal
              </button>
              <button type="button" className="btn-primary" onClick={save} disabled={pending || !email.trim()}>
                {pending ? <Spinner /> : <UserPlus className="h-4 w-4" />} Buat akun sendiri
              </button>
            </>
          }
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <p className="rounded-2xl bg-navy-50/70 px-3 py-2 text-sm text-navy-600">
              <b className="text-navy-900">{name}</b> akan punya akun sendiri. Pendaftaran ini beserta data kelasnya (absensi, worksheet, nilai, rapor &
              sertifikat) pindah ke akun baru. Password sama dengan akun <b className="break-all">{currentEmail}</b>.
            </p>
            <Field
              label="Email login akun baru"
              htmlFor="split-email"
              errors={err ? [err] : undefined}
              hint="Untuk Gmail, alias nama+anak@gmail.com tetap masuk ke kotak masuk orang tua yang sama — atau isi email peserta sendiri."
            >
              <input id="split-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoFocus maxLength={160} />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}

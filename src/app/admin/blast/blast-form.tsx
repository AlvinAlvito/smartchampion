"use client";

import { useState } from "react";
import { Mail, MessageCircle, Save, Send } from "lucide-react";
import { saveBlastAction } from "@/app/actions/blasts";
import { BLAST_CHANNELS, BLAST_JENJANG, PROVINSI } from "@/lib/constants";
import { cn, toDateInput } from "@/lib/utils";
import { Modal } from "@/components/modal";
import { Field } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/form-buttons";

export type BlastRow = {
  id: number;
  tanggal: Date;
  nama: string;
  email: string | null;
  noHp: string | null;
  provinsi: string | null;
  kota: string | null;
  jenjang: string | null;
  sekolah: string | null;
  ownerId: number | null;
  asalBlast: string;
};

/** Opsi baku + nilai lama (kalau data impor punya nilai di luar daftar) */
function withCurrent(list: readonly string[], current: string | null | undefined) {
  return current && !list.includes(current) ? [...list, current] : list;
}

const CHANNEL_ICON = { WhatsApp: MessageCircle, Email: Mail } as const;

const FORM_ID = "blast-form";

export function BlastDialog({
  onClose,
  blast,
  staff,
  defaultOwnerId,
}: {
  onClose: () => void;
  blast: BlastRow | null;
  staff: { id: number; name: string }[];
  defaultOwnerId: number;
}) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveBlastAction, { onSuccess: onClose });
  const v = blast;
  const [asal, setAsal] = useState(v?.asalBlast ?? "WhatsApp");

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={Send}
      title={v ? `Edit data blast · ${v.nama}` : "Tambah data blast"}
      description={v ? `Blast #${v.id}` : "Owner otomatis diisi admin yang menginput (bisa diubah)."}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form={FORM_ID} pending={pending}>
            <Save className="h-4 w-4" /> {v ? "Simpan perubahan" : "Tambah data"}
          </SubmitButton>
        </>
      }
    >
      <form key={v?.id ?? "new"} {...formProps} id={FORM_ID} className="space-y-4">
        {v && <input type="hidden" name="id" value={v.id} />}

        <Field label="Asal blast *" errors={fe?.asalBlast}>
          <div className="grid grid-cols-2 gap-2">
            {BLAST_CHANNELS.map((c) => {
              const Icon = CHANNEL_ICON[c];
              const on = asal === c;
              return (
                <label
                  key={c}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-bold transition",
                    on
                      ? c === "WhatsApp"
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-100"
                        : "border-sky-400 bg-sky-50 text-sky-700 ring-2 ring-sky-100"
                      : "border-navy-100 text-navy-500 hover:bg-navy-50",
                  )}
                >
                  <input type="radio" name="asalBlast" value={c} checked={on} onChange={() => setAsal(c)} className="sr-only" />
                  <Icon className="h-4 w-4" /> {c}
                </label>
              );
            })}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal blast *" htmlFor="tanggal" errors={fe?.tanggal}>
            <input id="tanggal" name="tanggal" type="date" defaultValue={toDateInput(v?.tanggal ?? new Date())} className="input" />
          </Field>
          <Field label="Nama *" htmlFor="nama" errors={fe?.nama}>
            <input id="nama" name="nama" defaultValue={v?.nama} className="input" />
          </Field>
          <Field label={`No. HP${asal === "WhatsApp" ? " *" : ""}`} htmlFor="noHp" errors={fe?.noHp}>
            <input id="noHp" name="noHp" defaultValue={v?.noHp ?? ""} placeholder="08xx / 62xx" className="input" inputMode="tel" />
          </Field>
          <Field label={`Email${asal === "Email" ? " *" : ""}`} htmlFor="email" errors={fe?.email}>
            <input id="email" name="email" type="email" defaultValue={v?.email ?? ""} className="input" />
          </Field>
          <Field label="Provinsi" htmlFor="provinsi">
            <select id="provinsi" name="provinsi" defaultValue={v?.provinsi ?? ""} className="input">
              <option value="">-</option>
              {withCurrent(PROVINSI, v?.provinsi).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Kota / kabupaten" htmlFor="kota">
            <input id="kota" name="kota" defaultValue={v?.kota ?? ""} className="input" />
          </Field>
          <Field label="Jenjang" htmlFor="jenjang">
            <select id="jenjang" name="jenjang" defaultValue={v?.jenjang ?? ""} className="input">
              <option value="">-</option>
              {withCurrent(BLAST_JENJANG, v?.jenjang).map((j) => (
                <option key={j}>{j}</option>
              ))}
            </select>
          </Field>
          <Field label="Sekolah" htmlFor="sekolah">
            <input id="sekolah" name="sekolah" defaultValue={v?.sekolah ?? ""} className="input" />
          </Field>
          <Field label="Owner / admin" htmlFor="ownerId">
            <select id="ownerId" name="ownerId" defaultValue={v ? (v.ownerId ?? "") : defaultOwnerId} className="input">
              <option value="">Belum ada owner</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

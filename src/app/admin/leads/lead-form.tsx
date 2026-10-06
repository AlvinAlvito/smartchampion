"use client";

import { Contact, Save, UserPlus } from "lucide-react";
import { saveLeadAction } from "@/app/actions/leads";
import { FUNNEL_STATUSES, LEAD_CATEGORIES, LEAD_PRODUCTS, LEAD_SOURCES, PAYMENT_STATUSES, TRIAL_OPTIONS } from "@/lib/constants";
import { toDateInput } from "@/lib/utils";
import { Modal } from "@/components/modal";
import { Field } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { SearchableSelect } from "@/components/searchable-select";
import type { ActivationProduct, LeadActivation } from "./activate-dialog";

export type LeadRow = {
  id: number;
  tanggalMasuk: Date;
  nama: string;
  noWa: string | null;
  email: string | null;
  sumberLead: string;
  campaign: string | null;
  kategori: string;
  produk: string | null;
  paket: string | null;
  ownerId: number | null;
  statusFunnel: string;
  trialMimpimu: string | null;
  invoiceId: string | null;
  statusBayar: string | null;
  nominal: number | null;
  tanggalBayar: Date | null;
  lastContact: Date | null;
  nextFollowUp: Date | null;
  objection: string | null;
  nextAction: string | null;
  catatan: string | null;
};

/** Opsi baku + nilai lama (kalau data impor punya nilai di luar daftar) */
export function withCurrent(list: readonly string[], current: string | null | undefined) {
  return current && !list.includes(current) ? [...list, current] : list;
}

export function LeadSelect({ name, value, options, empty }: { name: string; value?: string | null; options: readonly string[]; empty?: string }) {
  return (
    <select id={name} name={name} defaultValue={value ?? ""} className="input">
      {empty !== undefined && <option value="">{empty}</option>}
      {withCurrent(options, value).map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-3xl border border-navy-100 p-4 sm:p-5">
      <legend className="px-2 text-xs font-bold uppercase tracking-wider text-brand-600">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

const FORM_ID = "lead-form";

export function LeadDialog({
  open,
  onClose,
  lead,
  staff,
  products,
  activation,
  defaultOwnerId,
  canAssign = true,
}: {
  open: boolean;
  onClose: () => void;
  lead: LeadRow | null;
  staff: { id: number; name: string }[];
  products: ActivationProduct[];
  activation?: LeadActivation;
  defaultOwnerId: number;
  /** false → owner tidak bisa diubah (Admin SmartChampion) */
  canAssign?: boolean;
}) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveLeadAction, { onSuccess: onClose });
  const v = lead;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon={v ? Contact : UserPlus}
      title={v ? `Edit lead · ${v.nama}` : "Tambah lead baru"}
      description={v ? `Lead #${v.id}` : "Lead baru otomatis dimiliki admin yang menginput (bisa diubah)."}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form={FORM_ID} pending={pending}>
            <Save className="h-4 w-4" /> {v ? "Simpan perubahan" : "Tambah lead"}
          </SubmitButton>
        </>
      }
    >
      <form key={v?.id ?? "new"} {...formProps} id={FORM_ID} className="space-y-5">
        {v && <input type="hidden" name="id" value={v.id} />}
        <Section title="Identitas & sumber">
          <Field label="Nama *" htmlFor="nama" errors={fe?.nama}>
            <input id="nama" name="nama" defaultValue={v?.nama} className="input" />
          </Field>
          <Field label="No. WhatsApp" htmlFor="noWa">
            <input id="noWa" name="noWa" defaultValue={v?.noWa ?? ""} placeholder="08xx / 62xx" className="input" inputMode="tel" />
          </Field>
          <Field label="Email" htmlFor="email">
            <input id="email" name="email" type="email" defaultValue={v?.email ?? ""} className="input" />
          </Field>
          <Field label="Tanggal masuk *" htmlFor="tanggalMasuk" errors={fe?.tanggalMasuk}>
            <input id="tanggalMasuk" name="tanggalMasuk" type="date" defaultValue={toDateInput(v?.tanggalMasuk ?? new Date())} className="input" />
          </Field>
          <Field label="Sumber lead *" htmlFor="sumberLead" errors={fe?.sumberLead}>
            <LeadSelect name="sumberLead" value={v?.sumberLead} options={LEAD_SOURCES} empty="Pilih sumber" />
          </Field>
          <Field label="Campaign / halaman" htmlFor="campaign">
            <input id="campaign" name="campaign" defaultValue={v?.campaign ?? ""} placeholder="mis. hasil-ujian" className="input" />
          </Field>
        </Section>

        <Section title="Kualifikasi & kepemilikan">
          <Field label="Kategori customer" htmlFor="kategori">
            <LeadSelect name="kategori" value={v?.kategori ?? "Calon Customer"} options={LEAD_CATEGORIES} />
          </Field>
          <Field label="Produk" htmlFor="produk">
            <LeadSelect name="produk" value={v?.produk} options={LEAD_PRODUCTS} empty="-" />
          </Field>
          <Field label="Paket / bidang / jenjang" htmlFor="paket">
            <input id="paket" name="paket" defaultValue={v?.paket ?? ""} className="input" />
          </Field>
          {v && (
            <Field
              label="Kelas terdaftar"
              htmlFor="classProductId"
              errors={fe?.classProductId}
              hint="Relasi kelas sebenarnya. Bisa dicari, dipindahkan, atau dilepas; teks paket di atas tetap untuk catatan lead."
            >
              <SearchableSelect
                name="classProductId"
                value={activation?.productId}
                options={products.map((p) => ({ value: String(p.id), label: p.name, keywords: `${p.bidang} ${p.jenjang} ${p.gradeLabel ?? ""} ${p.type}` }))}
                placeholder="Belum terhubung ke kelas"
                searchPlaceholder="Cari nama, bidang, atau jenjang..."
                emptyLabel="Lepaskan dari kelas"
              />
            </Field>
          )}
          <Field label="Owner (admin yang melayani)" htmlFor="ownerId">
            <select
              id="ownerId"
              name="ownerId"
              defaultValue={v ? (v.ownerId ?? "") : canAssign ? defaultOwnerId : ""}
              className="input"
              disabled={!canAssign}
              title={canAssign ? undefined : "Owner diatur oleh tim admin pelatihan"}
            >
              <option value="">Belum ada owner</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status funnel" htmlFor="statusFunnel">
            <LeadSelect name="statusFunnel" value={v?.statusFunnel ?? "Baru"} options={FUNNEL_STATUSES} />
          </Field>
          <Field label="Trial Mimpi.mu" htmlFor="trialMimpimu">
            <LeadSelect name="trialMimpimu" value={v?.trialMimpimu} options={TRIAL_OPTIONS} empty="-" />
          </Field>
        </Section>

        <Section title="Transaksi & follow-up">
          <Field label="Invoice ID" htmlFor="invoiceId">
            <input id="invoiceId" name="invoiceId" defaultValue={v?.invoiceId ?? ""} className="input" />
          </Field>
          <Field label="Status bayar" htmlFor="statusBayar">
            <LeadSelect name="statusBayar" value={v?.statusBayar} options={PAYMENT_STATUSES} empty="-" />
          </Field>
          <Field label="Nominal (Rp)" htmlFor="nominal">
            <input id="nominal" name="nominal" type="number" defaultValue={v?.nominal ?? ""} className="input" />
          </Field>
          <Field label="Tanggal bayar (jika Paid)" htmlFor="tanggalBayar" hint="Kosong + Paid = hari ini">
            <input id="tanggalBayar" name="tanggalBayar" type="date" defaultValue={toDateInput(v?.tanggalBayar)} className="input" />
          </Field>
          <Field label="Last contact" htmlFor="lastContact">
            <input id="lastContact" name="lastContact" type="date" defaultValue={toDateInput(v?.lastContact)} className="input" />
          </Field>
          <Field label="Next follow-up" htmlFor="nextFollowUp">
            <input id="nextFollowUp" name="nextFollowUp" type="date" defaultValue={toDateInput(v?.nextFollowUp)} className="input" />
          </Field>
          <Field label="Objection / kendala" htmlFor="objection">
            <textarea id="objection" name="objection" rows={3} defaultValue={v?.objection ?? ""} className="input" />
          </Field>
          <Field label="Next action" htmlFor="nextAction">
            <textarea id="nextAction" name="nextAction" rows={3} defaultValue={v?.nextAction ?? ""} className="input" />
          </Field>
          <Field label="Catatan" htmlFor="catatan">
            <textarea id="catatan" name="catatan" rows={3} defaultValue={v?.catatan ?? ""} className="input" />
          </Field>
        </Section>
      </form>
    </Modal>
  );
}

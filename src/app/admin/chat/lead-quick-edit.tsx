"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Pencil, Save, X } from "lucide-react";
import { getLeadForEditAction, saveLeadAction } from "@/app/actions/leads";
import { FUNNEL_STATUSES, LEAD_CATEGORIES, LEAD_PRODUCTS, LEAD_SOURCES, PAYMENT_STATUSES, TRIAL_OPTIONS } from "@/lib/constants";
import { toDateInput } from "@/lib/utils";
import { Field } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { LeadSelect } from "../leads/lead-form";

type Loaded = Extract<Awaited<ReturnType<typeof getLeadForEditAction>>, { lead: unknown }>;

/**
 * Edit lead langsung di panel kanan Chat WA (tanpa pindah ke Master Lead).
 * Semua kolom lead ikut dikirim (saveLeadAction menimpa seluruh kolom): yang jarang dipakai ada di "Data lainnya".
 */
export function LeadQuickEdit({ leadId, onClose, onSaved }: { leadId: number; onClose: () => void; onSaved: () => void }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveLeadAction, { onSuccess: onSaved, refresh: false });

  useEffect(() => {
    let alive = true;
    getLeadForEditAction(leadId)
      .then((r) => {
        if (!alive) return;
        if ("error" in r) setError(r.error ?? "Gagal memuat lead.");
        else setData(r);
      })
      .catch(() => alive && setError("Gagal memuat lead."));
    return () => {
      alive = false;
    };
  }, [leadId]);

  if (error) {
    return (
      <div className="space-y-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">
        <p>{error}</p>
        <button className="btn-ghost btn-sm" onClick={onClose}>
          Kembali
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
        <div className="skeleton h-10 w-full" />
      </div>
    );
  }
  const v = data.lead;

  return (
    <form {...formProps} className="space-y-3" aria-label={`Edit lead ${v.nama}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-navy-900">
          <Pencil className="h-4 w-4 text-brand-600" /> Edit data customer
        </p>
        <button type="button" className="btn-icon h-8 w-8" onClick={onClose} aria-label="Tutup form edit" title="Batal">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="-mt-2 text-xs text-navy-400">Lead #{v.id} · tersimpan langsung ke Master Lead</p>
      <input type="hidden" name="id" value={v.id} />

      <Field label="Nama *" htmlFor="nama" errors={fe?.nama}>
        <input id="nama" name="nama" defaultValue={v.nama} className="input" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="No. WhatsApp" htmlFor="noWa">
          <input id="noWa" name="noWa" defaultValue={v.noWa ?? ""} className="input" inputMode="tel" />
        </Field>
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" defaultValue={v.email ?? ""} className="input" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Sumber lead *" htmlFor="sumberLead" errors={fe?.sumberLead}>
          <LeadSelect name="sumberLead" value={v.sumberLead} options={LEAD_SOURCES} empty="Pilih sumber" />
        </Field>
        <Field label="Kategori" htmlFor="kategori">
          <LeadSelect name="kategori" value={v.kategori} options={LEAD_CATEGORIES} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Produk" htmlFor="produk">
          <LeadSelect name="produk" value={v.produk} options={LEAD_PRODUCTS} empty="-" />
        </Field>
        <Field label="Status funnel" htmlFor="statusFunnel">
          <LeadSelect name="statusFunnel" value={v.statusFunnel} options={FUNNEL_STATUSES} />
        </Field>
      </div>
      <Field label="Paket / bidang / jenjang" htmlFor="paket">
        <input id="paket" name="paket" defaultValue={v.paket ?? ""} className="input" placeholder="mis. COC Matematika SMP" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Last contact" htmlFor="lastContact">
          <input id="lastContact" name="lastContact" type="date" defaultValue={toDateInput(v.lastContact)} className="input" />
        </Field>
        <Field label="Next follow-up" htmlFor="nextFollowUp">
          <input id="nextFollowUp" name="nextFollowUp" type="date" defaultValue={toDateInput(v.nextFollowUp)} className="input" />
        </Field>
      </div>
      <Field label="Catatan" htmlFor="catatan">
        <textarea id="catatan" name="catatan" rows={3} defaultValue={v.catatan ?? ""} className="input" />
      </Field>

      {/* kolom lain tetap terkirim walau bagian ini tertutup */}
      <details className="group rounded-2xl border border-navy-100 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-wider text-brand-600 marker:hidden">
          Data lainnya
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tanggal masuk *" htmlFor="tanggalMasuk" errors={fe?.tanggalMasuk}>
              <input id="tanggalMasuk" name="tanggalMasuk" type="date" defaultValue={toDateInput(v.tanggalMasuk)} className="input" />
            </Field>
            <Field label="Campaign" htmlFor="campaign">
              <input id="campaign" name="campaign" defaultValue={v.campaign ?? ""} className="input" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Owner" htmlFor="ownerId">
              <select id="ownerId" name="ownerId" defaultValue={v.ownerId ?? ""} className="input">
                <option value="">Belum ada owner</option>
                {data.staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Trial Mimpi.mu" htmlFor="trialMimpimu">
              <LeadSelect name="trialMimpimu" value={v.trialMimpimu} options={TRIAL_OPTIONS} empty="-" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Invoice ID" htmlFor="invoiceId">
              <input id="invoiceId" name="invoiceId" defaultValue={v.invoiceId ?? ""} className="input" />
            </Field>
            <Field label="Status bayar" htmlFor="statusBayar">
              <LeadSelect name="statusBayar" value={v.statusBayar} options={PAYMENT_STATUSES} empty="-" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Nominal (Rp)" htmlFor="nominal">
              <input id="nominal" name="nominal" type="number" defaultValue={v.nominal ?? ""} className="input" />
            </Field>
            <Field label="Tanggal bayar" htmlFor="tanggalBayar" hint="Kosong + Paid = hari ini">
              <input id="tanggalBayar" name="tanggalBayar" type="date" defaultValue={toDateInput(v.tanggalBayar)} className="input" />
            </Field>
          </div>
          <Field label="Objection / kendala" htmlFor="objection">
            <textarea id="objection" name="objection" rows={2} defaultValue={v.objection ?? ""} className="input" />
          </Field>
          <Field label="Next action" htmlFor="nextAction">
            <textarea id="nextAction" name="nextAction" rows={2} defaultValue={v.nextAction ?? ""} className="input" />
          </Field>
        </div>
      </details>

      <div className="sticky bottom-0 flex gap-2 bg-linear-to-t from-white via-white to-white/0 pb-1 pt-3">
        <button type="button" className="btn-ghost flex-1" onClick={onClose}>
          Batal
        </button>
        <SubmitButton pending={pending} className="btn-primary flex-1">
          <Save className="h-4 w-4" /> Simpan
        </SubmitButton>
      </div>
    </form>
  );
}

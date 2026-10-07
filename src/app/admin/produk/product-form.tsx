"use client";

import { useState } from "react";
import { BookOpen, Crown, Pencil, Plus, Save, Shapes, Users } from "lucide-react";
import { saveProductAction } from "@/app/actions/products";
import { JENJANG_LABEL, PRODUCT_STATUS_LABEL } from "@/lib/constants";
import { cn, toDateInput } from "@/lib/utils";
import { QUOTA_DISPLAY_OPTIONS } from "@/lib/quota";
import { Modal } from "@/components/modal";
import { Field } from "@/components/ui";
import { SubmitButton, useFormAction } from "@/components/form-buttons";

export type ProductValues = {
  id: number;
  name: string;
  slug: string;
  bidang: string;
  jenjang: string;
  level: string;
  gradeLabel: string | null;
  shortDesc: string;
  description: string;
  price: number;
  priceUnit: string;
  minQuota: number;
  maxQuota: number | null;
  scheduleInfo: string | null;
  waGroupUrl: string | null;
  startDate: Date | null;
  status: string;
  type: string;
  quotaDisplay: string;
  sessionCount?: number | null;
};

const FORM_ID = "product-form";

export function ProductDialog({ product, onClose }: { product: ProductValues | null; onClose: () => void }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveProductAction, { onSuccess: onClose });
  const v = product;
  const [type, setType] = useState(v?.type ?? "COC");
  const vip = type === "PRIVATE";
  const other = type === "OTHER";
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={BookOpen}
      title={v ? "Edit produk" : "Tambah produk"}
      description={v ? v.name : "Kelas baru bisa disimpan sebagai Draft dulu sebelum dibuka."}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form={FORM_ID} pending={pending}>
            <Save className="h-4 w-4" /> {v ? "Simpan perubahan" : "Buat kelas"}
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id={FORM_ID} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="label">Jenis produk *</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { v: "COC", l: "Kelas Grup (COC)", d: "Harga per bulan · mulai setelah kuota minimal terpenuhi", icon: Users },
              { v: "PRIVATE", l: "VIP Privat", d: "Harga per pertemuan · peserta membeli paket pertemuan", icon: Crown },
              { v: "OTHER", l: "Lainnya", d: "Sekali bayar · jumlah pertemuan bebas (1x, 2x, 3x, …) · tanpa kuota minimal", icon: Shapes },
            ].map((o) => (
              <label
                key={o.v}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-2xl border p-3 transition",
                  type === o.v ? "border-brand-400 bg-brand-50 ring-2 ring-brand-100" : "border-navy-100 hover:bg-navy-50/60",
                )}
              >
                <input type="radio" name="type" value={o.v} checked={type === o.v} onChange={() => setType(o.v)} className="sr-only" />
                <o.icon className={cn("mt-0.5 h-5 w-5 shrink-0", type === o.v ? "text-brand-600" : "text-navy-300")} />
                <span>
                  <span className="block text-sm font-bold text-navy-900">{o.l}</span>
                  <span className="block text-xs text-navy-500">{o.d}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        {v && <input type="hidden" name="id" value={v.id} />}
        <Field label="Nama kelas *" htmlFor="name" errors={fe?.name} className="sm:col-span-2">
          <input id="name" name="name" defaultValue={v?.name} className="input" placeholder="mis. Matematika SMP Advance (Persiapan Olimpiade)" />
        </Field>
        <Field label="Bidang *" htmlFor="bidang" errors={fe?.bidang}>
          <input id="bidang" name="bidang" defaultValue={v?.bidang} className="input" placeholder="Matematika, Fisika, …" />
        </Field>
        <Field label="Slug URL" htmlFor="slug" hint="Kosongkan agar dibuat otomatis dari nama.">
          <input id="slug" name="slug" defaultValue={v?.slug} className="input" />
        </Field>
        <Field label="Jenjang *" htmlFor="jenjang">
          <select id="jenjang" name="jenjang" defaultValue={v?.jenjang ?? "SMP"} className="input">
            {Object.entries(JENJANG_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Level" htmlFor="level">
            <input id="level" name="level" defaultValue={v?.level ?? "Advance"} className="input" />
          </Field>
          <Field label="Keterangan" htmlFor="gradeLabel">
            <input id="gradeLabel" name="gradeLabel" defaultValue={v?.gradeLabel ?? ""} className="input" placeholder="Kelas 4–6" />
          </Field>
        </div>
        <Field label="Deskripsi singkat *" htmlFor="shortDesc" errors={fe?.shortDesc} className="sm:col-span-2">
          <input id="shortDesc" name="shortDesc" defaultValue={v?.shortDesc} className="input" maxLength={255} />
        </Field>
        <Field label="Deskripsi lengkap" htmlFor="description" hint="Baris diawali • akan tampil sebagai poin keunggulan." className="sm:col-span-2">
          <textarea id="description" name="description" rows={6} defaultValue={v?.description} className="input" />
        </Field>
        {vip ? (
          <Field
            label="Harga per pertemuan (Rp) *"
            htmlFor="price"
            errors={fe?.price}
            hint={v ? "Atur paket pertemuan (mis. 4x, 8x) di halaman detail kelas." : "Paket 1x, 4x & 8x pertemuan dibuat otomatis, bisa diubah setelahnya."}
          >
            <input id="price" name="price" type="number" min={0} defaultValue={v?.type === "PRIVATE" ? v.price : 300000} className="input" />
          </Field>
        ) : other ? (
          <div key="price-other" className="grid grid-cols-2 gap-3">
            <Field label="Harga (Rp) *" htmlFor="price" errors={fe?.price} hint="Sekali bayar untuk seluruh pertemuan">
              <input id="price" name="price" type="number" min={0} defaultValue={v?.type === "OTHER" ? v.price : 150000} className="input" />
            </Field>
            <Field label="Per" htmlFor="priceUnit">
              <input id="priceUnit" name="priceUnit" defaultValue={v?.type === "OTHER" ? v.priceUnit : "paket"} className="input" />
            </Field>
          </div>
        ) : (
          <div key="price-coc" className="grid grid-cols-2 gap-3">
            <Field label="Harga (Rp) *" htmlFor="price" errors={fe?.price}>
              <input id="price" name="price" type="number" min={0} defaultValue={v?.price ?? 299000} className="input" />
            </Field>
            <Field label="Per" htmlFor="priceUnit">
              <input id="priceUnit" name="priceUnit" defaultValue={v?.type === "PRIVATE" || v?.type === "OTHER" ? "bulan" : (v?.priceUnit ?? "bulan")} className="input" />
            </Field>
          </div>
        )}
        {other ? (
          <div key="quota-other" className="grid grid-cols-2 gap-3">
            <Field label="Jumlah pertemuan *" htmlFor="sessionCount" errors={fe?.sessionCount} hint="Bebas: 1x, 2x, 3x, …">
              <input id="sessionCount" name="sessionCount" type="number" min={1} max={100} defaultValue={v?.sessionCount ?? 1} className="input" />
            </Field>
            <Field label="Kapasitas maksimal" htmlFor="maxQuota" hint="Opsional">
              <input id="maxQuota" name="maxQuota" type="number" min={1} defaultValue={v?.maxQuota ?? ""} className="input" placeholder="tanpa batas" />
            </Field>
          </div>
        ) : vip ? (
          <p className="self-end rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-800 ring-1 ring-amber-100">
            VIP Privat tidak memakai kuota minimal peserta — jadwal diatur langsung bersama tutor.
          </p>
        ) : (
          <div key="quota-coc" className="grid grid-cols-2 gap-3">
            <Field label="Kuota minimal" htmlFor="minQuota">
              <input id="minQuota" name="minQuota" type="number" min={1} defaultValue={v?.minQuota ?? 15} className="input" />
            </Field>
            <Field label="Kuota maksimal" htmlFor="maxQuota">
              <input id="maxQuota" name="maxQuota" type="number" min={1} defaultValue={v?.maxQuota ?? ""} className="input" placeholder="opsional" />
            </Field>
          </div>
        )}
        {!vip && !other && (
          <Field
            label="Tampilkan progres kuota di katalog"
            htmlFor="quotaDisplay"
            className="sm:col-span-2"
            hint="Angka peserta yang masih sedikit bisa membuat calon peserta ragu. Saat tampil, kartu kelas diberi kalimat seperti “Ayo daftar, kelas sedikit lagi penuh!” atau “Kelas favorit”."
          >
            <select id="quotaDisplay" name="quotaDisplay" defaultValue={v?.quotaDisplay ?? "AUTO"} className="input">
              {QUOTA_DISPLAY_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Status *" htmlFor="status" errors={fe?.status}>
          <select id="status" name="status" defaultValue={v?.status ?? "DRAFT"} className="input">
            {Object.entries(PRODUCT_STATUS_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target tanggal mulai" htmlFor="startDate">
          <input id="startDate" name="startDate" type="date" defaultValue={toDateInput(v?.startDate)} className="input" />
        </Field>
        <Field label="Info jadwal" htmlFor="scheduleInfo" className="sm:col-span-2">
          <input
            id="scheduleInfo"
            name="scheduleInfo"
            defaultValue={v?.scheduleInfo ?? ""}
            className="input"
            placeholder="mis. Setiap Sabtu 19.00–20.30 WIB via Zoom"
          />
        </Field>
        <Field
          label="Link grup WhatsApp"
          htmlFor="waGroupUrl"
          errors={fe?.waGroupUrl}
          hint="Hanya tampil untuk peserta yang sudah lunas di kelas ini. Kosongkan untuk menghapus."
          className="sm:col-span-2"
        >
          <input
            id="waGroupUrl"
            name="waGroupUrl"
            type="url"
            inputMode="url"
            maxLength={500}
            defaultValue={v?.waGroupUrl ?? ""}
            className="input"
            placeholder="https://chat.whatsapp.com/…"
          />
        </Field>
      </form>
    </Modal>
  );
}

/** Tombol pembuka dialog produk (tambah / edit). */
export function ProductDialogButton({ product, className, label }: { product: ProductValues | null; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className ?? (product ? "btn-secondary" : "btn-primary")}>
        {product ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {label ?? (product ? "Edit kelas" : "Tambah kelas")}
      </button>
      {open && <ProductDialog product={product} onClose={() => setOpen(false)} />}
    </>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { ClipboardList, Contact, ExternalLink, LogIn, MessageCircle, Save } from "lucide-react";
import { updateRegistrationAction } from "@/app/actions/registrations-admin";
import { impersonateAction } from "@/app/actions/impersonate";
import { PRODUCT_TYPE_LABEL, REG_STATUS_LABEL } from "@/lib/constants";
import { formatDate, formatRupiah } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { Badge, Field, statusTone } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { ChangeEmailButton } from "@/components/change-email-button";
import { SplitAccountButton } from "./split-account-button";

export type RegRow = {
  id: number;
  userId: number;
  code: string;
  fullName: string;
  school: string;
  phone: string;
  parentPhone: string | null;
  email: string;
  source: string;
  amount: number;
  status: string;
  paymentType: string | null;
  midtransOrderId: string | null;
  notes: string | null;
  adminId: number | null;
  sessionsBought: number | null;
  sessionsDone: number;
  createdAt: Date;
  paidAt: Date | null;
  product: { id: number; name: string; type: string } | null;
  admin: { name: string } | null;
  user: { name: string; email: string };
  leadId: number | null;
  /** nama peserta lain yang memakai akun yang sama */
  sharedWith: string[];
};

const FORM_ID = "registration-form";

function RegistrationDialog({
  reg,
  staff,
  onClose,
  canAssign,
  canImpersonate,
  canEditEmail,
  products,
}: {
  reg: RegRow;
  staff: { id: number; name: string }[];
  onClose: () => void;
  canAssign: boolean;
  canImpersonate: boolean;
  /** Root, Admin & Admin SmartChampion boleh mengganti email akun peserta */
  canEditEmail: boolean;
  products: { id: number; name: string; type: string; bidang: string; jenjang: string; gradeLabel: string | null }[];
}) {
  const { formProps, pending, fieldErrors } = useFormAction(updateRegistrationAction, { onSuccess: onClose });
  const rows: [string, React.ReactNode][] = [
    [
      "Kelas",
      reg.product ? (
        <Link key="p" href={`/admin/produk/${reg.product.id}`} className="font-semibold text-brand-700 hover:underline">
          {reg.product.name}
        </Link>
      ) : (
        <span key="p" className="text-amber-700">
          Belum ditempatkan
        </span>
      ),
    ],
    ["Jenis produk", reg.product ? (PRODUCT_TYPE_LABEL[reg.product.type] ?? reg.product.type) : "-"],
    ...(reg.sessionsBought ? ([["Paket VIP", `${reg.sessionsBought}x pertemuan`]] as [string, React.ReactNode][]) : []),
    ["Asal sekolah", reg.school],
    [
      "WhatsApp",
      <a
        key="w"
        href={`https://wa.me/${reg.phone}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-semibold text-emerald-600 hover:underline"
      >
        <MessageCircle className="h-3.5 w-3.5" /> {reg.phone}
      </a>,
    ],
    ["WA orang tua", reg.parentPhone ?? "-"],
    ["Email", reg.email],
    [
      "Akun",
      <span key="a" className="flex flex-col items-end gap-0.5">
        <span>
          {reg.user.name} ({reg.user.email})
        </span>
        {canEditEmail && <ChangeEmailButton userId={reg.userId} name={reg.user.name} email={reg.user.email} />}
        {reg.sharedWith.length > 0 && (
          <span className="mt-1 max-w-72 rounded-xl bg-amber-50 px-2 py-1 text-left text-[11px] font-normal text-amber-800 ring-1 ring-amber-200">
            Akun ini dipakai juga oleh <b>{reg.sharedWith.join(", ")}</b>.
            {canEditEmail && (
              <>
                {" "}
                <SplitAccountButton registrationId={reg.id} name={reg.fullName} currentEmail={reg.user.email} />
              </>
            )}
          </span>
        )}
      </span>,
    ],
    ["Dapat info dari", reg.source],
    ["Nominal", formatRupiah(reg.amount)],
    ["Metode bayar", reg.paymentType ?? "-"],
    ["Order ID Midtrans", reg.midtransOrderId ?? "-"],
    ["Tanggal daftar", formatDate(reg.createdAt, true)],
    ["Tanggal lunas", formatDate(reg.paidAt, true)],
  ];

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={ClipboardList}
      title={reg.fullName}
      description={
        <span className="flex items-center gap-2">
          <span className="font-mono">{reg.code}</span> <Badge tone={statusTone(reg.status)}>{REG_STATUS_LABEL[reg.status]}</Badge>
        </span>
      }
      footer={
        <>
          {reg.leadId && (
            <Link href={`/admin/leads?edit=${reg.leadId}`} className="btn-ghost mr-auto">
              <Contact className="h-4 w-4" /> Lihat di Master Lead
            </Link>
          )}
          {canImpersonate && (
            <ConfirmButton
              className="btn-secondary"
              ariaLabel={`Login sebagai ${reg.fullName}`}
              tone="primary"
              title={`Login sebagai ${reg.fullName}?`}
              confirmText="Ya, login"
              message={
                <>
                  Anda akan masuk ke dashboard sebagai peserta <b>{reg.fullName}</b>. Gunakan tombol kembali ke akun admin untuk mengakhiri mode ini.
                </>
              }
              action={() => impersonateAction(reg.userId)}
            >
              <LogIn className="h-4 w-4" /> Login sebagai peserta
            </ConfirmButton>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>
            Tutup
          </button>
          <SubmitButton form={FORM_ID} pending={pending}>
            <Save className="h-4 w-4" /> Simpan
          </SubmitButton>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-5">
        <dl className="divide-y divide-dashed divide-navy-100 rounded-3xl bg-navy-50/50 px-4 text-sm md:col-span-3">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2">
              <dt className="text-navy-400">{k}</dt>
              <dd className="text-right font-medium text-navy-800">{v}</dd>
            </div>
          ))}
        </dl>
        <form {...formProps} id={FORM_ID} className="space-y-4 md:col-span-2">
          <input type="hidden" name="id" value={reg.id} />
          <Field
            label="Kelas terdaftar"
            htmlFor="productId"
            errors={fieldErrors?.productId}
            hint="Cari untuk memindahkan kelas, atau kosongkan untuk melepas tanpa menghapus transaksi."
          >
            <SearchableSelect
              name="productId"
              value={reg.product?.id}
              options={products.map((p) => ({
                value: String(p.id),
                label: p.name,
                keywords: `${p.bidang} ${p.jenjang} ${p.gradeLabel ?? ""} ${PRODUCT_TYPE_LABEL[p.type] ?? p.type}`,
              }))}
              placeholder="Belum ditempatkan ke kelas"
              searchPlaceholder="Cari nama, bidang, atau jenjang..."
              emptyLabel="Lepaskan dari kelas"
            />
          </Field>
          <Field label="Status" htmlFor="status" hint="Ubah ke Lunas hanya untuk pembayaran manual yang sudah diverifikasi.">
            <select id="status" name="status" defaultValue={reg.status} className="input">
              {Object.entries(REG_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          {reg.sessionsBought && (
            <Field label="Pertemuan terlaksana" htmlFor="sessionsDone" hint={`Dari total ${reg.sessionsBought} pertemuan di paket ini.`}>
              <input id="sessionsDone" name="sessionsDone" type="number" min={0} max={reg.sessionsBought} defaultValue={reg.sessionsDone} className="input" />
            </Field>
          )}
          <Field label="Admin penanggung jawab" htmlFor="adminId">
            <select
              id="adminId"
              name="adminId"
              defaultValue={reg.adminId ?? ""}
              className="input"
              disabled={!canAssign}
              title={canAssign ? undefined : "Diatur oleh tim admin pelatihan"}
            >
              <option value="">-</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Catatan internal" htmlFor="notes">
            <textarea id="notes" name="notes" rows={5} defaultValue={reg.notes ?? ""} className="input" />
          </Field>
        </form>
      </div>
    </Modal>
  );
}

export function RegistrationsTable({
  regs,
  staff,
  products,
  initialOpenId,
  canAssign = true,
  canImpersonate = false,
  canEditEmail = false,
}: {
  regs: RegRow[];
  staff: { id: number; name: string }[];
  products: { id: number; name: string; type: string; bidang: string; jenjang: string; gradeLabel: string | null }[];
  initialOpenId?: number;
  canAssign?: boolean;
  canImpersonate?: boolean;
  canEditEmail?: boolean;
}) {
  const [openId, setOpenId] = useState<number | null>(initialOpenId && regs.some((r) => r.id === initialOpenId) ? initialOpenId : null);
  const open = regs.find((r) => r.id === openId);

  return (
    <>
      <div id="tabel" className="card scroll-mt-24 overflow-x-auto p-0!">
        <table className="table min-w-[920px]">
          <thead>
            <tr>
              <th>Kode</th>
              <th>Peserta</th>
              <th>Kelas</th>
              <th>Sumber</th>
              <th>Admin</th>
              <th>Nominal</th>
              <th>Status</th>
              <th>Tanggal</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {regs.map((r, i) => (
              <tr key={r.id} className="animate-fade-in cursor-pointer" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }} onClick={() => setOpenId(r.id)}>
                <td className="font-mono text-xs font-semibold text-brand-700">{r.code}</td>
                <td>
                  <p className="font-bold text-navy-900">{r.fullName}</p>
                  <p className="text-xs text-navy-400">
                    {r.school} · {r.phone}
                  </p>
                </td>
                <td className="max-w-[220px] truncate text-xs font-medium text-navy-700">
                  {r.product ? (
                    <>
                      <Badge tone={r.product.type === "COC" ? "brand" : "yellow"} className="mb-1">
                        {PRODUCT_TYPE_LABEL[r.product.type] ?? r.product.type}
                      </Badge>
                      <span className="block truncate">{r.product.name}</span>
                    </>
                  ) : (
                    <Badge tone="yellow">Belum ditempatkan</Badge>
                  )}
                  {r.sessionsBought ? (
                    <span className="mt-0.5 block font-bold text-amber-700">
                      VIP {r.sessionsDone}/{r.sessionsBought} pertemuan
                    </span>
                  ) : null}
                </td>
                <td className="text-xs text-navy-600">{r.source}</td>
                <td className="text-xs font-semibold text-navy-700">{r.admin?.name ?? "-"}</td>
                <td className="whitespace-nowrap text-xs font-semibold text-navy-800">{formatRupiah(r.amount)}</td>
                <td>
                  <Badge tone={statusTone(r.status)}>{REG_STATUS_LABEL[r.status]}</Badge>
                </td>
                <td className="whitespace-nowrap text-xs text-navy-500">{formatDate(r.createdAt, true)}</td>
                <td>
                  <span className="btn-icon" aria-hidden>
                    <ExternalLink className="h-4 w-4" />
                  </span>
                </td>
              </tr>
            ))}
            {!regs.length && (
              <tr>
                <td colSpan={9} className="py-14 text-center text-navy-400">
                  Belum ada peserta terdaftar yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {open && (
        <RegistrationDialog
          key={open.id}
          reg={open}
          staff={staff}
          products={products}
          canAssign={canAssign}
          canImpersonate={canImpersonate}
          canEditEmail={canEditEmail}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

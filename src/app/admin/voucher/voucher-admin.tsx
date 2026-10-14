"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Pencil, Plus, Save, Search, Shuffle, TicketPercent, Trash2, Users } from "lucide-react";
import { deleteVoucherAction, saveVoucherAction, toggleVoucherAction } from "@/app/actions/vouchers";
import { ConfirmButton, Modal } from "@/components/modal";
import { SubmitButton, useFormAction } from "@/components/form-buttons";
import { Badge, EmptyState, Field } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useReadOnly } from "@/components/read-only";
import { cn, formatDate, formatRupiah, toDateInput } from "@/lib/utils";
import { voucherLabel } from "@/lib/voucher-shared";

export type ProductOption = { id: number; name: string; type: string; typeLabel: string; status: string };
export type VoucherRow = {
  id: number;
  code: string;
  description: string | null;
  type: "PERCENT" | "AMOUNT";
  value: number;
  maxDiscount: number | null;
  minAmount: number | null;
  quota: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  isActive: boolean;
  allProducts: boolean;
  productIds: number[];
  productNames: string[];
  createdBy: string | null;
  paid: number;
  pending: number;
  discountPaid: number;
};

const FORM_ID = "voucher-form";
const DAY_MS = 24 * 3600_000;

/** Kode acak mudah dibaca (tanpa O/0/I/1) */
function randomCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "POSI" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => abc[n % abc.length]).join("");
}

/** Status yang dilihat admin: nonaktif / belum mulai / kedaluwarsa / kuota habis / aktif */
function statusOf(v: VoucherRow, now: number) {
  if (!v.isActive) return { label: "Nonaktif", tone: "gray" as const };
  if (v.validUntil && now >= new Date(v.validUntil).getTime() + DAY_MS) return { label: "Kedaluwarsa", tone: "gray" as const };
  if (v.quota && v.paid + v.pending >= v.quota) return { label: "Kuota habis", tone: "yellow" as const };
  if (v.validFrom && now < new Date(v.validFrom).getTime()) return { label: "Belum mulai", tone: "blue" as const };
  return { label: "Aktif", tone: "green" as const };
}

function VoucherDialog({ voucher: v, products, onClose }: { voucher: VoucherRow | null; products: ProductOption[]; onClose: () => void }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveVoucherAction, { onSuccess: onClose });
  const [type, setType] = useState<"PERCENT" | "AMOUNT">(v?.type ?? "PERCENT");
  const [scope, setScope] = useState(v && !v.allProducts ? "SELECTED" : "ALL");
  const [picked, setPicked] = useState<Set<number>>(new Set(v?.productIds ?? []));
  const [q, setQ] = useState("");
  const [code, setCode] = useState(v?.code ?? "");
  const shown = products.filter((p) => !q.trim() || `${p.name} ${p.typeLabel}`.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: number) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={TicketPercent}
      title={v ? `Edit voucher ${v.code}` : "Buat voucher"}
      description="Peserta memasukkan kode ini di form pendaftaran. Potongan dihitung dari harga yang berlaku (setelah early bird / harga paket VIP)."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form={FORM_ID} pending={pending}>
            <Save className="h-4 w-4" /> {v ? "Simpan perubahan" : "Buat voucher"}
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id={FORM_ID} className="grid gap-4 sm:grid-cols-2">
        {v && <input type="hidden" name="id" value={v.id} />}
        <Field label="Kode voucher *" htmlFor="code" errors={fe?.code} hint="Huruf besar, angka, - atau _. Peserta boleh mengetik huruf kecil.">
          <div className="flex gap-2">
            <input
              id="code"
              name="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
              maxLength={40}
              className="input font-mono font-bold tracking-wider"
              placeholder="mis. HEMAT20"
            />
            <button type="button" className="btn-secondary shrink-0 px-3!" onClick={() => setCode(randomCode())} title="Buat kode acak" aria-label="Buat kode acak">
              <Shuffle className="h-4 w-4" />
            </button>
          </div>
        </Field>
        <Field label="Keterangan (untuk admin)" htmlFor="description">
          <input id="description" name="description" defaultValue={v?.description ?? ""} maxLength={255} className="input" placeholder="mis. Promo HUT POSI" />
        </Field>

        <div className="sm:col-span-2">
          <p className="label">Jenis potongan *</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["PERCENT", "Persentase (%)", "mis. 20% dari harga"],
                ["AMOUNT", "Rupiah (Rp)", "mis. potongan Rp 50.000"],
              ] as const
            ).map(([val, title, desc]) => (
              <label
                key={val}
                className={cn("cursor-pointer rounded-2xl p-3 ring-1 transition", type === val ? "bg-brand-50 ring-2 ring-brand-400" : "ring-navy-100 hover:bg-navy-50/50")}
              >
                <input type="radio" name="type" value={val} checked={type === val} onChange={() => setType(val)} className="sr-only" />
                <span className="block text-sm font-bold text-navy-900">{title}</span>
                <span className="block text-xs text-navy-400">{desc}</span>
              </label>
            ))}
          </div>
        </div>
        <Field label={type === "PERCENT" ? "Besar diskon (%) *" : "Besar potongan (Rp) *"} htmlFor="value" errors={fe?.value}>
          <input
            key={type}
            id="value"
            name="value"
            type="number"
            min={1}
            max={type === "PERCENT" ? 100 : undefined}
            defaultValue={v?.type === type ? v.value : ""}
            className="input"
            placeholder={type === "PERCENT" ? "20" : "50000"}
          />
        </Field>
        {type === "PERCENT" ? (
          <Field label="Potongan maksimal (Rp)" htmlFor="maxDiscount" errors={fe?.maxDiscount} hint="Opsional, mis. 20% maks Rp 50.000">
            <input id="maxDiscount" name="maxDiscount" type="number" min={1} defaultValue={v?.maxDiscount ?? ""} className="input" placeholder="tanpa batas" />
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Field label="Harga minimal (Rp)" htmlFor="minAmount" errors={fe?.minAmount} hint="Opsional: voucher hanya untuk pembelian ≥ nilai ini">
          <input id="minAmount" name="minAmount" type="number" min={0} defaultValue={v?.minAmount ?? ""} className="input" placeholder="tanpa minimal" />
        </Field>
        <Field label="Kuota pemakaian" htmlFor="quota" errors={fe?.quota} hint="Opsional: jumlah peserta yang boleh memakai. Tiap peserta hanya bisa memakai 1x.">
          <input id="quota" name="quota" type="number" min={1} defaultValue={v?.quota ?? ""} className="input" placeholder="tanpa batas" />
        </Field>
        <Field label="Berlaku mulai" htmlFor="validFrom" hint="Kosong = langsung berlaku">
          <input id="validFrom" name="validFrom" type="date" defaultValue={toDateInput(v?.validFrom ?? null)} className="input" />
        </Field>
        <Field label="Berlaku sampai" htmlFor="validUntil" errors={fe?.validUntil} hint="Sampai akhir hari ini (WIB). Kosong = tanpa batas">
          <input id="validUntil" name="validUntil" type="date" defaultValue={toDateInput(v?.validUntil ?? null)} className="input" />
        </Field>

        <div className="sm:col-span-2">
          <p className="label">Berlaku untuk kelas *</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["ALL", "Semua kelas", "Termasuk VIP Privat & produk lainnya"],
                ["SELECTED", "Kelas tertentu", "Centang kelas di bawah"],
              ] as const
            ).map(([val, title, desc]) => (
              <label
                key={val}
                className={cn("cursor-pointer rounded-2xl p-3 ring-1 transition", scope === val ? "bg-brand-50 ring-2 ring-brand-400" : "ring-navy-100 hover:bg-navy-50/50")}
              >
                <input type="radio" name="scope" value={val} checked={scope === val} onChange={() => setScope(val)} className="sr-only" />
                <span className="block text-sm font-bold text-navy-900">{title}</span>
                <span className="block text-xs text-navy-400">{desc}</span>
              </label>
            ))}
          </div>
          {scope === "SELECTED" && (
            <div className="mt-3 rounded-2xl ring-1 ring-navy-100">
              <div className="flex items-center gap-2 border-b border-navy-50 p-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kelas…" aria-label="Cari kelas" className="input py-2! pl-9" />
                </div>
                <span className="shrink-0 px-2 text-xs font-bold text-brand-700">{picked.size} dipilih</span>
              </div>
              <div className="max-h-60 overflow-y-auto p-1">
                {shown.map((p) => (
                  <label key={p.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-navy-50/60", picked.has(p.id) && "bg-brand-50/60")}>
                    <input type="checkbox" name="productIds" value={p.id} checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-brand-600" />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-navy-800">{p.name}</span>
                      <span className="ml-2 text-xs text-navy-400">
                        {p.typeLabel}
                        {p.status === "CLOSED" ? " · ditutup" : p.status === "DRAFT" ? " · draft" : ""}
                      </span>
                    </span>
                  </label>
                ))}
                {!shown.length && <p className="p-3 text-center text-xs text-navy-400">Tidak ada kelas yang cocok.</p>}
              </div>
              {/* kelas yang tersaring tetap ikut terkirim */}
              {[...picked]
                .filter((id) => !shown.some((p) => p.id === id))
                .map((id) => (
                  <input key={id} type="hidden" name="productIds" value={id} />
                ))}
            </div>
          )}
          {fe?.productIds && <p className="mt-1 text-xs font-medium text-rose-600">{fe.productIds[0]}</p>}
        </div>

        <label className="flex items-center gap-2 text-sm font-semibold text-navy-700 sm:col-span-2">
          <input type="checkbox" name="isActive" defaultChecked={v?.isActive ?? true} className="h-4 w-4 accent-brand-600" /> Voucher aktif (bisa dipakai peserta)
        </label>
      </form>
    </Modal>
  );
}

export function VoucherButton({ voucher, products, className }: { voucher: VoucherRow | null; products: ProductOption[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const locked = useReadOnly();
  return (
    <>
      <button
        className={className ?? (voucher ? "btn-icon" : "btn-primary")}
        disabled={locked}
        onClick={() => setOpen(true)}
        aria-label={voucher ? `Edit voucher ${voucher.code}` : undefined}
        title={voucher ? "Edit" : undefined}
      >
        {voucher ? <Pencil className="h-4 w-4" /> : (
          <>
            <Plus className="h-4 w-4" /> Buat voucher
          </>
        )}
      </button>
      {open && <VoucherDialog voucher={voucher} products={products} onClose={() => setOpen(false)} />}
    </>
  );
}

function ActiveSwitch({ v }: { v: VoucherRow }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const locked = useReadOnly();
  return (
    <button
      role="switch"
      aria-checked={v.isActive}
      aria-label={`${v.isActive ? "Nonaktifkan" : "Aktifkan"} voucher ${v.code}`}
      disabled={locked || pending}
      onClick={() =>
        start(async () => {
          if (toast.fromResult(await toggleVoucherAction(v.id, !v.isActive))) router.refresh();
        })
      }
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50", v.isActive ? "bg-brand-600" : "bg-navy-200")}
    >
      <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", v.isActive ? "left-6" : "left-1")} />
    </button>
  );
}

export function VoucherAdmin({ vouchers, products }: { vouchers: VoucherRow[]; products: ProductOption[] }) {
  // waktu sekarang dibekukan saat render pertama (status kedaluwarsa tidak perlu berubah per detik)
  const [now] = useState(() => Date.now());
  const [q, setQ] = useState("");
  const shown = useMemo(
    () => vouchers.filter((v) => !q.trim() || `${v.code} ${v.description ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())),
    [vouchers, q],
  );
  if (!vouchers.length)
    return <EmptyState icon={TicketPercent} title="Belum ada voucher" desc="Buat kode voucher pertama, lalu bagikan ke calon peserta lewat WhatsApp / media sosial." />;

  return (
    <>
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode / keterangan" aria-label="Cari voucher" className="input pl-10" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((v) => {
          const st = statusOf(v, now);
          const used = v.paid + v.pending;
          return (
            <div key={v.id} className={cn("card flex flex-col gap-3", !v.isActive && "opacity-70")}>
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-rose-400 to-rose-600 text-white shadow-md">
                  <TicketPercent className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-lg font-extrabold tracking-wider text-navy-900">{v.code}</p>
                  <p className="text-sm font-bold text-rose-600">Diskon {voucherLabel(v)}</p>
                </div>
                <Badge tone={st.tone}>{st.label}</Badge>
              </div>
              {v.description && <p className="text-sm text-navy-500">{v.description}</p>}
              <ul className="space-y-1 text-xs text-navy-500">
                <li className="flex items-center gap-1.5">
                  <CalendarRange className="h-3.5 w-3.5 shrink-0 text-navy-300" />
                  {v.validFrom || v.validUntil
                    ? `${v.validFrom ? formatDate(v.validFrom) : "sekarang"} – ${v.validUntil ? formatDate(v.validUntil) : "tanpa batas"}`
                    : "Tanpa batas waktu"}
                </li>
                <li className="flex items-start gap-1.5">
                  <TicketPercent className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-300" />
                  <span>
                    {v.allProducts ? "Semua kelas" : `${v.productNames.length} kelas: ${v.productNames.slice(0, 3).join(", ")}${v.productNames.length > 3 ? ", …" : ""}`}
                    {v.minAmount ? ` · min. ${formatRupiah(v.minAmount)}` : ""}
                  </span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 shrink-0 text-navy-300" />
                  Dipakai {used}
                  {v.quota ? `/${v.quota}` : ""} · {v.paid} lunas · {v.pending} menunggu bayar
                  {v.discountPaid ? ` · total potongan ${formatRupiah(v.discountPaid)}` : ""}
                </li>
              </ul>
              {v.quota ? (
                <div className="h-1.5 overflow-hidden rounded-full bg-navy-50">
                  <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.min(100, (used / v.quota) * 100)}%` }} />
                </div>
              ) : null}
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-navy-50 pt-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-navy-500">
                  <ActiveSwitch v={v} /> {v.isActive ? "Aktif" : "Nonaktif"}
                </div>
                <div className="flex items-center gap-1">
                  <VoucherButton voucher={v} products={products} />
                  <ConfirmButton
                    title={used ? "Nonaktifkan voucher?" : "Hapus voucher?"}
                    message={
                      used ? (
                        <>
                          Voucher <b>{v.code}</b> sudah dipakai {used} pendaftaran, jadi tidak dihapus melainkan <b>dinonaktifkan</b> agar riwayat transaksi tetap utuh.
                        </>
                      ) : (
                        <>
                          Voucher <b>{v.code}</b> akan dihapus permanen.
                        </>
                      )
                    }
                    action={() => deleteVoucherAction(v.id)}
                    ariaLabel={`Hapus voucher ${v.code}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmButton>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!shown.length && <p className="py-10 text-center text-sm text-navy-400">Tidak ada voucher yang cocok.</p>}
    </>
  );
}

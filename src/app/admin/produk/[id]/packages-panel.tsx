"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Package, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { deletePackageAction, savePackageAction, togglePackageAction } from "@/app/actions/products";
import { packageSavings, perSession } from "@/lib/packages";
import { cn, formatRupiah } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Spinner, SubmitButton, useFormAction } from "@/components/form-buttons";
import { Badge, EmptyState, Field } from "@/components/ui";

export type PackageRow = { id: number; sessions: number; price: number; label: string | null; isActive: boolean; sold: number };

const FORM_ID = "package-form";

function PackageDialog({ productId, pricePerSession, pkg, onClose }: { productId: number; pricePerSession: number; pkg: PackageRow | null; onClose: () => void }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(savePackageAction, { onSuccess: onClose });
  const [sessions, setSessions] = useState(pkg?.sessions ?? 8);
  const [price, setPrice] = useState(pkg?.price ?? pricePerSession * 8);
  const normal = sessions * pricePerSession;
  const save = packageSavings({ sessions, price }, pricePerSession);

  return (
    <Modal
      open
      onClose={onClose}
      icon={Package}
      title={pkg ? `Edit paket ${pkg.sessions}x pertemuan` : "Tambah paket pertemuan"}
      description={`Harga normal ${formatRupiah(pricePerSession)} per pertemuan.`}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form={FORM_ID} pending={pending}>
            <Save className="h-4 w-4" /> {pkg ? "Simpan" : "Tambah paket"}
          </SubmitButton>
        </>
      }
    >
      <form key={pkg?.id ?? "new"} {...formProps} id={FORM_ID} className="grid gap-4 sm:grid-cols-2">
        {pkg && <input type="hidden" name="id" value={pkg.id} />}
        <input type="hidden" name="productId" value={productId} />
        <Field label="Jumlah pertemuan *" htmlFor="sessions" errors={fe?.sessions}>
          <input
            id="sessions"
            name="sessions"
            type="number"
            min={1}
            max={100}
            value={sessions}
            onChange={(e) => {
              const n = Math.max(1, Number(e.target.value) || 1);
              // harga ikut menyesuaikan bila sebelumnya masih harga normal
              if (price === sessions * pricePerSession) setPrice(n * pricePerSession);
              setSessions(n);
            }}
            className="input"
          />
        </Field>
        <Field label="Harga paket (Rp) *" htmlFor="price" errors={fe?.price} hint={`Normal ${formatRupiah(normal)}${save ? ` · hemat ${save}%` : ""}`}>
          <input id="price" name="price" type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} className="input" />
        </Field>
        <div className="sm:col-span-2">
          <p className="label">Diskon cepat</p>
          <div className="flex flex-wrap gap-2">
            {[0, 5, 10, 15].map((d) => {
              const v = Math.round((normal * (100 - d)) / 100 / 1000) * 1000;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPrice(v)}
                  className={cn("rounded-full px-3 py-1.5 text-sm font-semibold transition", price === v ? "bg-brand-600 text-white" : "bg-navy-50 text-navy-600 hover:bg-brand-50")}
                >
                  {d ? `Hemat ${d}%` : "Harga normal"}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-navy-400">
            Setara {formatRupiah(perSession({ sessions, price }))} per pertemuan.
          </p>
        </div>
        <Field label="Label promosi" htmlFor="label" hint='Opsional, mis. "Terlaris" / "Paling hemat".'>
          <input id="label" name="label" maxLength={40} defaultValue={pkg?.label ?? ""} className="input" />
        </Field>
        <label className="flex cursor-pointer items-center gap-3 self-end rounded-2xl bg-navy-50/60 px-4 py-3 text-sm font-semibold text-navy-700">
          <input type="checkbox" name="isActive" defaultChecked={pkg?.isActive ?? true} className="h-4 w-4 accent-brand-600" /> Tampilkan ke peserta
        </label>
      </form>
    </Modal>
  );
}

function ToggleButton({ pkg }: { pkg: PackageRow }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      className="btn-icon"
      disabled={pending}
      title={pkg.isActive ? "Sembunyikan" : "Tampilkan"}
      aria-label={pkg.isActive ? `Sembunyikan paket ${pkg.sessions}x` : `Tampilkan paket ${pkg.sessions}x`}
      onClick={() => start(async () => void (toast.fromResult(await togglePackageAction(pkg.id)) && router.refresh()))}
    >
      {pending ? <Spinner className="h-4 w-4" /> : pkg.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

export function PackagesPanel({ productId, pricePerSession, packages }: { productId: number; pricePerSession: number; packages: PackageRow[] }) {
  const [dialog, setDialog] = useState<{ open: boolean; pkg: PackageRow | null }>({ open: false, pkg: null });
  return (
    <section className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-navy-900">
          <Package className="h-5 w-5 text-brand-600" /> Paket pertemuan <span className="text-sm font-medium text-navy-400">({packages.length})</span>
        </h2>
        <button className="btn-primary btn-sm" onClick={() => setDialog({ open: true, pkg: null })}>
          <Plus className="h-3.5 w-3.5" /> Tambah paket
        </button>
      </div>
      {packages.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {packages.map((p) => {
            const save = packageSavings(p, pricePerSession);
            return (
              <div key={p.id} className={cn("rounded-3xl p-4 ring-1", p.isActive ? "bg-brand-50/50 ring-brand-100" : "bg-navy-50/50 opacity-60 ring-navy-100")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-extrabold text-navy-900">{p.sessions}x pertemuan</p>
                    <p className="font-bold text-brand-700">{formatRupiah(p.price)}</p>
                    <p className="text-xs text-navy-400">
                      {formatRupiah(perSession(p))}/pertemuan{save ? ` · hemat ${save}%` : ""} · terjual {p.sold}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {p.label && <Badge tone="brand">{p.label}</Badge>}
                    {!p.isActive && <Badge tone="gray">Disembunyikan</Badge>}
                  </div>
                </div>
                <div className="mt-2 flex justify-end gap-1">
                  <ToggleButton pkg={p} />
                  <button className="btn-icon" onClick={() => setDialog({ open: true, pkg: p })} aria-label={`Edit paket ${p.sessions}x`} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <ConfirmButton
                    ariaLabel={`Hapus paket ${p.sessions}x`}
                    title="Hapus paket?"
                    message={
                      <>
                        Paket <b>{p.sessions}x pertemuan</b> dihapus. Pendaftaran yang sudah membeli paket ini tetap menyimpan jumlah pertemuan & nominalnya.
                      </>
                    }
                    action={() => deletePackageAction(p.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmButton>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Package} title="Belum ada paket" desc="Tambahkan paket (mis. 1x, 4x, 8x pertemuan) agar peserta bisa membeli kelas VIP ini." />
      )}
      {dialog.open && <PackageDialog productId={productId} pricePerSession={pricePerSession} pkg={dialog.pkg} onClose={() => setDialog({ open: false, pkg: null })} />}
    </section>
  );
}

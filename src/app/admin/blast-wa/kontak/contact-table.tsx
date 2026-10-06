"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCheck, CircleCheck, MessageCircle, Pencil, Plus, Save, Tag, Tags, Trash2, UserRound, X } from "lucide-react";
import { bulkContactAction, saveContactAction } from "@/app/actions/blast-wa";
import { BLAST_JENJANG, KELAS_BY_JENJANG, PROVINSI } from "@/lib/constants";
import { parseLabels, WA_CONTACT_STATUS_LABEL } from "@/lib/blast-wa-shared";
import { cn, formatDate } from "@/lib/utils";
import { ConfirmButton, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Badge, Field } from "@/components/ui";
import { Spinner, SubmitButton, useFormAction } from "@/components/form-buttons";
import { HeaderCheckbox, RowCheckbox, SelectAllBanner, useBulkSelection, type BulkSelection } from "@/components/bulk-select";

export type ContactRow = {
  id: number;
  nama: string;
  noHp: string;
  email: string | null;
  jenjang: string | null;
  kelas: string | null;
  sekolah: string | null;
  kota: string | null;
  provinsi: string | null;
  labels: string | null;
  catatan: string | null;
  source: string | null;
  optOut: boolean;
  optOutReason: string | null;
  waStatus: string;
  blastCount: number;
  lastBlastAt: Date | null;
  lastReplyAt: Date | null;
  ownerName: string;
};

const FORM_ID = "blast-contact-form";

function ContactDialog({ contact, labels, onClose }: { contact: ContactRow | null; labels: string[]; onClose: () => void }) {
  const { formProps, pending, fieldErrors: fe } = useFormAction(saveContactAction, { onSuccess: onClose });
  const v = contact;
  const [jenjang, setJenjang] = useState(v?.jenjang ?? "");
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      icon={UserRound}
      title={v ? `Edit kontak · ${v.nama}` : "Tambah kontak"}
      description="Kontak otomatis tercatat di Data Blast (asal WhatsApp) dengan owner Anda."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Batal
          </button>
          <SubmitButton form={FORM_ID} pending={pending}>
            <Save className="h-4 w-4" /> {v ? "Simpan perubahan" : "Tambah kontak"}
          </SubmitButton>
        </>
      }
    >
      <form {...formProps} id={FORM_ID} className="grid gap-4 sm:grid-cols-2">
        {v && <input type="hidden" name="id" value={v.id} />}
        <Field label="Nama *" htmlFor="c-nama" errors={fe?.nama}>
          <input id="c-nama" name="nama" defaultValue={v?.nama} className="input" maxLength={160} required />
        </Field>
        <Field label="No. WhatsApp *" htmlFor="c-hp" errors={fe?.noHp} hint="08xx / 62xx — diseragamkan otomatis">
          <input id="c-hp" name="noHp" defaultValue={v?.noHp} className="input" inputMode="tel" required />
        </Field>
        <Field label="Email" htmlFor="c-email" errors={fe?.email}>
          <input id="c-email" name="email" type="email" defaultValue={v?.email ?? ""} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jenjang" htmlFor="c-jenjang">
            <select id="c-jenjang" name="jenjang" value={jenjang} onChange={(e) => setJenjang(e.target.value)} className="input">
              <option value="">-</option>
              {[...BLAST_JENJANG, ...(jenjang && !(BLAST_JENJANG as readonly string[]).includes(jenjang) ? [jenjang] : [])].map((j) => (
                <option key={j}>{j}</option>
              ))}
            </select>
          </Field>
          <Field label="Kelas" htmlFor="c-kelas">
            <input id="c-kelas" name="kelas" defaultValue={v?.kelas ?? ""} className="input" list="c-kelas-list" />
            <datalist id="c-kelas-list">
              {(KELAS_BY_JENJANG[jenjang] ?? []).map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Sekolah" htmlFor="c-sekolah">
          <input id="c-sekolah" name="sekolah" defaultValue={v?.sekolah ?? ""} className="input" />
        </Field>
        <Field label="Kota / kabupaten" htmlFor="c-kota">
          <input id="c-kota" name="kota" defaultValue={v?.kota ?? ""} className="input" />
        </Field>
        <Field label="Provinsi" htmlFor="c-prov">
          <select id="c-prov" name="provinsi" defaultValue={v?.provinsi ?? ""} className="input">
            <option value="">-</option>
            {PROVINSI.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Label / grup" htmlFor="c-labels" hint="Pisahkan dengan koma, mis. Olimpiade, Alumni COC">
          <input id="c-labels" name="labels" defaultValue={parseLabels(v?.labels).join(", ")} className="input" list="c-label-list" />
          <datalist id="c-label-list">
            {labels.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
        <Field label="Catatan" htmlFor="c-catatan" className="sm:col-span-2">
          <textarea id="c-catatan" name="catatan" defaultValue={v?.catatan ?? ""} className="input min-h-20" />
        </Field>
      </form>
    </Modal>
  );
}

function BulkBar({ sel, filterQuery, labels }: { sel: BulkSelection; filterQuery: string; labels: string[] }) {
  const [labelOp, setLabelOp] = useState<"addLabel" | "removeLabel" | null>(null);
  const [label, setLabel] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  if (sel.count === 0) return null;
  const target = () => (sel.allMatching ? { query: filterQuery, expected: sel.total } : { ids: [...sel.selected] });
  const run = (op: Parameters<typeof bulkContactAction>[0], l?: string) =>
    start(async () => {
      if (toast.fromResult(await bulkContactAction(op, target(), l))) {
        sel.clear();
        setLabelOp(null);
        router.refresh();
      }
    });
  const n = sel.count.toLocaleString("id-ID");
  return (
    <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4" role="region" aria-label="Aksi massal">
      <div className="flex animate-slide-up flex-wrap items-center gap-1.5 rounded-3xl bg-navy-900 py-2.5 pl-5 pr-2.5 text-sm text-white shadow-2xl ring-1 ring-white/10">
        <CheckCheck className="h-4 w-4 text-brand-300" />
        <span className="mr-1">
          <b>{n}</b> kontak{sel.allMatching ? " (sesuai filter)" : ""}
        </span>
        {pending && <Spinner />}
        <button disabled={pending} onClick={() => setLabelOp("addLabel")} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 font-semibold hover:bg-white/10">
          <Tag className="h-4 w-4" /> Beri label
        </button>
        <button disabled={pending} onClick={() => setLabelOp("removeLabel")} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 font-semibold hover:bg-white/10">
          <Tags className="h-4 w-4" /> Hapus label
        </button>
        <button disabled={pending} onClick={() => run("optOut")} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 font-semibold hover:bg-white/10" title="Tidak akan dikirimi blast">
          <Ban className="h-4 w-4" /> Stop kirim
        </button>
        <button disabled={pending} onClick={() => run("optIn")} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 font-semibold hover:bg-white/10">
          <CircleCheck className="h-4 w-4" /> Aktifkan
        </button>
        <ConfirmButton
          className="btn-danger btn-sm"
          title={`Hapus ${n} kontak?`}
          confirmText={`Ya, hapus ${n} kontak`}
          message={
            <>
              <b>{n} kontak</b> dihapus dari buku kontak Blast WhatsApp. Riwayat di Data Blast & laporan kampanye tetap tersimpan.
            </>
          }
          action={() => bulkContactAction("delete", target())}
          onDone={sel.clear}
        >
          <Trash2 className="h-4 w-4" /> Hapus
        </ConfirmButton>
        <button onClick={sel.clear} className="inline-flex items-center rounded-xl px-2 py-2 text-navy-200 hover:bg-white/10" aria-label="Batal pilih">
          <X className="h-4 w-4" />
        </button>
      </div>
      <Modal
        open={!!labelOp}
        onClose={() => setLabelOp(null)}
        size="sm"
        icon={Tag}
        title={labelOp === "addLabel" ? `Beri label ke ${n} kontak` : `Hapus label dari ${n} kontak`}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setLabelOp(null)}>
              Batal
            </button>
            <button className="btn-primary" disabled={pending || !label.trim()} onClick={() => labelOp && run(labelOp, label)}>
              {pending && <Spinner />} Simpan
            </button>
          </>
        }
      >
        <input value={label} onChange={(e) => setLabel(e.target.value)} className="input" placeholder="Nama label, mis. Olimpiade 2026" list="bulk-label-list" maxLength={40} />
        <datalist id="bulk-label-list">
          {labels.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      </Modal>
    </div>
  );
}

export function ContactTable({ rows, total, filterQuery, canEdit, showOwner, labels }: { rows: ContactRow[]; total: number; filterQuery: string; canEdit: boolean; showOwner: boolean; labels: string[] }) {
  const [dialog, setDialog] = useState<{ open: boolean; contact: ContactRow | null }>({ open: false, contact: null });
  const sel = useBulkSelection(
    rows.map((r) => r.id),
    total,
  );
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy-500">
          <b className="text-navy-900">{total.toLocaleString("id-ID")}</b> kontak
        </p>
        {canEdit && (
          <button onClick={() => setDialog({ open: true, contact: null })} className="btn-primary">
            <Plus className="h-4 w-4" /> Tambah kontak
          </button>
        )}
      </div>
      {canEdit && <SelectAllBanner sel={sel} noun="kontak" />}
      <div id="tabel" className="card scroll-mt-24 overflow-x-auto p-0!">
        <table className="table min-w-[1050px]">
          <thead>
            <tr>
              {canEdit && (
                <th className="w-10">
                  <HeaderCheckbox sel={sel} label="Pilih semua kontak di halaman ini" />
                </th>
              )}
              <th>Nama / No. WA</th>
              <th>Jenjang / Sekolah</th>
              <th>Lokasi</th>
              <th>Label</th>
              <th>Status</th>
              <th>Riwayat blast</th>
              {showOwner && <th>Owner</th>}
              {canEdit && <th className="text-right">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className={cn(sel.isSelected(c.id) && "bg-brand-50/70")}>
                {canEdit && (
                  <td>
                    <RowCheckbox sel={sel} id={c.id} label={`Pilih ${c.nama}`} />
                  </td>
                )}
                <td>
                  <p className="font-bold text-navy-900">{c.nama}</p>
                  <a href={`https://wa.me/${c.noHp}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-navy-400 hover:text-emerald-600">
                    <MessageCircle className="h-3 w-3" /> {c.noHp}
                  </a>
                  {c.email && <p className="max-w-[200px] truncate text-xs text-navy-400">{c.email}</p>}
                </td>
                <td className="text-xs">
                  <p className="font-semibold text-navy-700">
                    {c.jenjang ?? "-"}
                    {c.kelas ? ` · kelas ${c.kelas}` : ""}
                  </p>
                  {c.sekolah && <p className="max-w-[200px] truncate text-navy-400">{c.sekolah}</p>}
                </td>
                <td className="text-xs">
                  <p className="font-semibold text-navy-700">{c.kota ?? "-"}</p>
                  {c.provinsi && <p className="text-navy-400">{c.provinsi}</p>}
                </td>
                <td className="max-w-[200px]">
                  <div className="flex flex-wrap gap-1">
                    {parseLabels(c.labels).map((l) => (
                      <Badge key={l} tone="brand">
                        {l}
                      </Badge>
                    ))}
                    {!c.labels && <span className="text-xs text-navy-300">-</span>}
                  </div>
                </td>
                <td className="text-xs">
                  {c.optOut ? (
                    <Badge tone="red">Berhenti langganan</Badge>
                  ) : (
                    <Badge tone={c.waStatus === "VALID" ? "green" : c.waStatus === "INVALID" ? "red" : "gray"}>{WA_CONTACT_STATUS_LABEL[c.waStatus] ?? c.waStatus}</Badge>
                  )}
                  {c.optOut && c.optOutReason && <p className="mt-0.5 max-w-[160px] truncate text-navy-400" title={c.optOutReason}>{c.optOutReason}</p>}
                </td>
                <td className="text-xs text-navy-500">
                  {c.blastCount ? (
                    <>
                      <p>
                        {c.blastCount}x · terakhir {formatDate(c.lastBlastAt)}
                      </p>
                      {c.lastReplyAt && <p className="font-semibold text-emerald-600">Membalas {formatDate(c.lastReplyAt)}</p>}
                    </>
                  ) : (
                    <span className="text-navy-300">Belum pernah</span>
                  )}
                  {c.source && <p className="text-[11px] text-navy-300">Sumber: {c.source}</p>}
                </td>
                {showOwner && <td className="text-xs font-semibold text-navy-700">{c.ownerName}</td>}
                {canEdit && (
                  <td>
                    <div className="flex justify-end">
                      <button onClick={() => setDialog({ open: true, contact: c })} className="btn-icon" aria-label={`Edit ${c.nama}`} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="py-14 text-center text-navy-400">
                  Belum ada kontak. Tambah manual, impor Excel, atau ambil dari Data Blast / Master Lead.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {canEdit && <BulkBar sel={sel} filterQuery={filterQuery} labels={labels} />}
      {dialog.open && <ContactDialog contact={dialog.contact} labels={labels} onClose={() => setDialog({ open: false, contact: null })} />}
    </>
  );
}

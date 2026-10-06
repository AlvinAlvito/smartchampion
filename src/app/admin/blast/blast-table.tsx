"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageCircle, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { blastToLeadAction, deleteBlastAction, deleteBlastsAction, deleteBlastsByFilterAction } from "@/app/actions/blasts";
import { cn, formatDate } from "@/lib/utils";
import { ConfirmButton } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/form-buttons";
import { Badge } from "@/components/ui";
import { BulkDeleteBar, HeaderCheckbox, RowCheckbox, SelectAllBanner, useBulkSelection } from "@/components/bulk-select";
import { BlastDialog, type BlastRow } from "./blast-form";

type Staff = { id: number; name: string };

/** Aksi cepat: salin kontak blast ke Master Lead. */
function ToLeadButton({ blast }: { blast: BlastRow }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      onClick={() =>
        start(async () => {
          const r = await blastToLeadAction(blast.id);
          if (toast.fromResult(r)) router.refresh();
        })
      }
      disabled={pending}
      title="Salin kontak ini ke Master Lead"
      className="inline-flex items-center gap-1.5 rounded-xl bg-brand-50 px-2.5 py-1.5 text-xs font-bold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
    >
      {pending ? <Spinner className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />} Jadikan lead
    </button>
  );
}

export function BlastTable({
  rows,
  staff,
  meId,
  initialEditId,
  summary,
  total,
  filterQuery,
}: {
  rows: BlastRow[];
  staff: Staff[];
  meId: number;
  initialEditId?: number;
  summary: React.ReactNode;
  /** jumlah semua data yang cocok dengan filter (untuk "pilih semua sesuai filter") */
  total: number;
  filterQuery: string;
}) {
  const [dialog, setDialog] = useState<{ open: boolean; blast: BlastRow | null }>(() => {
    const b = initialEditId ? rows.find((x) => x.id === initialEditId) : undefined;
    return { open: Boolean(b), blast: b ?? null };
  });
  const ownerName = new Map(staff.map((s) => [s.id, s.name]));
  const sel = useBulkSelection(
    rows.map((b) => b.id),
    total,
  );

  return (
    <>
      <button onClick={() => setDialog({ open: true, blast: null })} className="btn-primary fixed bottom-6 right-6 z-30 h-14 w-14 rounded-full p-0! shadow-2xl lg:hidden" aria-label="Tambah data blast">
        <Plus className="h-6 w-6" />
      </button>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy-500">{summary}</p>
        <button onClick={() => setDialog({ open: true, blast: null })} className="btn-primary hidden lg:inline-flex">
          <Plus className="h-4 w-4" /> Tambah data blast
        </button>
      </div>

      <SelectAllBanner sel={sel} noun="data blast" />

      <div id="tabel" className="card scroll-mt-24 overflow-x-auto p-0!">
        <table className="table min-w-[1100px]">
          <thead>
            <tr>
              <th className="w-10">
                <HeaderCheckbox sel={sel} label="Pilih semua data blast di halaman ini" />
              </th>
              <th>Tanggal</th>
              <th>Nama / Kontak</th>
              <th>Asal blast</th>
              <th>Lokasi</th>
              <th>Jenjang / Sekolah</th>
              <th>Owner</th>
              <th>Aksi cepat</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b, i) => (
              <tr key={b.id} className={cn("animate-fade-in", sel.isSelected(b.id) && "bg-brand-50/70")} style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                <td>
                  <RowCheckbox sel={sel} id={b.id} label={`Pilih ${b.nama}`} />
                </td>
                <td className="whitespace-nowrap text-xs text-navy-500">{formatDate(b.tanggal)}</td>
                <td>
                  <button onClick={() => setDialog({ open: true, blast: b })} className="text-left font-bold text-navy-900 transition hover:text-brand-700">
                    {b.nama}
                  </button>
                  <div className="mt-0.5 space-y-0.5 text-xs text-navy-400">
                    {b.noHp && (
                      <a href={`https://wa.me/${b.noHp}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-emerald-600">
                        <MessageCircle className="h-3 w-3 shrink-0" /> {b.noHp}
                      </a>
                    )}
                    {b.email && (
                      <a href={`mailto:${b.email}`} className="flex max-w-[220px] items-center gap-1 truncate hover:text-sky-600">
                        <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{b.email}</span>
                      </a>
                    )}
                    {!b.noHp && !b.email && "-"}
                  </div>
                </td>
                <td>
                  <Badge tone={b.asalBlast === "Email" ? "blue" : "green"}>
                    {b.asalBlast === "Email" ? <Mail className="mr-1 h-3 w-3" /> : <MessageCircle className="mr-1 h-3 w-3" />}
                    {b.asalBlast}
                  </Badge>
                </td>
                <td className="text-xs">
                  <p className="font-semibold text-navy-700">{b.kota ?? "-"}</p>
                  {b.provinsi && <p className="text-navy-400">{b.provinsi}</p>}
                </td>
                <td className="text-xs">
                  <p className="font-semibold text-navy-700">{b.jenjang ?? "-"}</p>
                  {b.sekolah && <p className="max-w-[200px] truncate text-navy-400">{b.sekolah}</p>}
                </td>
                <td className="text-xs">
                  {b.ownerId ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-navy-700">
                      <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-100 text-[10px] font-bold text-brand-700">{ownerName.get(b.ownerId)?.charAt(0)}</span>
                      {ownerName.get(b.ownerId) ?? "-"}
                    </span>
                  ) : (
                    <span className="font-semibold text-rose-500">Belum ada</span>
                  )}
                </td>
                <td>
                  <ToLeadButton blast={b} />
                </td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setDialog({ open: true, blast: b })} className="btn-icon" aria-label={`Edit ${b.nama}`} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <ConfirmButton
                      ariaLabel={`Hapus ${b.nama}`}
                      title="Hapus data blast?"
                      message={
                        <>
                          Data blast <b>{b.nama}</b> akan dihapus permanen.
                        </>
                      }
                      action={() => deleteBlastAction(b.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="py-14 text-center text-navy-400">
                  Tidak ada data blast yang cocok dengan filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <BulkDeleteBar
        sel={sel}
        noun="data blast"
        pageName="Data Blast"
        note="Lead yang sudah disalin ke Master Lead tidak ikut terhapus."
        deleteSelected={deleteBlastsAction}
        deleteByFilter={() => deleteBlastsByFilterAction(filterQuery, total)}
      />

      {dialog.open && <BlastDialog onClose={() => setDialog({ open: false, blast: null })} blast={dialog.blast} staff={staff} defaultOwnerId={meId} />}
    </>
  );
}

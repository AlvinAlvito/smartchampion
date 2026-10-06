"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, BadgeCheck, Check, GraduationCap, Mail, MessageCircle, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { deleteLeadAction, deleteLeadsAction, deleteLeadsByFilterAction, quickUpdateLeadAction } from "@/app/actions/leads";
import { FUNNEL_STATUSES } from "@/lib/constants";
import { cn, formatDate, formatRupiah } from "@/lib/utils";
import { ConfirmButton } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/form-buttons";
import { BulkDeleteBar, HeaderCheckbox, RowCheckbox, SelectAllBanner, useBulkSelection } from "@/components/bulk-select";
import { ChangeEmailButton } from "@/components/change-email-button";
import { Badge, statusTone } from "@/components/ui";
import { LeadDialog, type LeadRow } from "./lead-form";
import { LeadAccountFlow, type ActivationProduct, type LeadActivation } from "./activate-dialog";

type Staff = { id: number; name: string };

function QuickStatus({ lead }: { lead: LeadRow }) {
  const [value, setValue] = useState(lead.statusFunnel);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const dirty = value !== lead.statusFunnel;
  return (
    <div className="flex items-center gap-1">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-xl border border-navy-100 bg-white px-2 py-1.5 text-xs font-semibold text-navy-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        aria-label="Status"
      >
        {FUNNEL_STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <button
        onClick={() =>
          start(async () => {
            const r = await quickUpdateLeadAction(lead.id, value);
            if (toast.fromResult(r)) router.refresh();
          })
        }
        disabled={pending}
        title="Simpan status & catat kontak hari ini"
        className={cn(
          "grid h-8 w-8 place-items-center rounded-xl transition",
          dirty ? "bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-md" : "bg-navy-50 text-navy-400 hover:bg-brand-50 hover:text-brand-600",
        )}
      >
        {pending ? <Spinner className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" />}
      </button>
    </div>
  );
}

const PILL = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold";

/** Status akun peserta per lead + satu-satunya tempat tombol Buat akun / Daftarkan ke kelas */
function AccountCell({
  lead,
  activation,
  account,
  canRegister,
  canEnroll,
  onRegister,
  onEnroll,
  onEditEmail,
  accountUser,
}: {
  lead: LeadRow;
  activation?: LeadActivation;
  account?: "peserta" | "staf";
  /** akun peserta yang tertaut (untuk Ubah email) */
  accountUser?: { id: number; email: string };
  canRegister: boolean;
  canEnroll: boolean;
  onRegister: () => void;
  onEnroll: () => void;
  onEditEmail: () => void;
}) {
  if (activation) {
    const paid = activation.status === "PAID";
    const placed = activation.productId !== null;
    const badge = (
      <span
        className={cn(PILL, paid && placed ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-amber-50 text-amber-800 ring-1 ring-amber-100")}
        title={`${activation.code} · ${activation.product} · login ${activation.email}`}
      >
        <BadgeCheck className="h-3 w-3" />{" "}
        {!placed
          ? "Akun aktif · belum ada kelas"
          : paid
            ? "Akun & kelas aktif"
            : activation.status === "PENDING"
              ? "Akun · kelas menunggu bayar"
              : "Akun aktif"}
      </span>
    );
    return accountUser ? (
      <div className="flex flex-col items-start gap-1">
        {badge}
        <ChangeEmailButton userId={accountUser.id} name={lead.nama} email={accountUser.email} />
      </div>
    ) : (
      badge
    );
  }
  if (account === "staf") return <span className={cn(PILL, "bg-rose-50 text-rose-600")}>Email dipakai akun staf</span>;
  if (account === "peserta") {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className={cn(PILL, "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100")} title={`Login ${lead.email}`}>
          <BadgeCheck className="h-3 w-3" /> Akun aktif
        </span>
        {accountUser && <ChangeEmailButton userId={accountUser.id} name={lead.nama} email={accountUser.email} />}
        {canEnroll && (
          <button
            onClick={onEnroll}
            className={cn(PILL, "bg-amber-100 text-amber-900 ring-1 ring-amber-300 transition hover:bg-amber-200")}
            title="Lead sudah lunas — daftarkan ke kelas"
          >
            <GraduationCap className="h-3 w-3" /> Daftarkan ke kelas
          </button>
        )}
      </div>
    );
  }
  if (canRegister) {
    return (
      <button
        onClick={onRegister}
        className={cn(PILL, "bg-sky-600 text-white shadow-sm transition hover:bg-sky-700")}
        title="Buat akun peserta dari email lead ini (password awal: smartchampion)"
      >
        <UserPlus className="h-3 w-3" /> Buat akun
      </button>
    );
  }
  return (
    <button
      onClick={onEditEmail}
      className={cn(PILL, "bg-navy-50 text-navy-500 ring-1 ring-navy-100 transition hover:bg-brand-50 hover:text-brand-700")}
      title="Akun butuh email untuk login — isi email lead dulu"
    >
      <Mail className="h-3 w-3" /> Belum ada email · Isi email
    </button>
  );
}

export function LeadsTable({
  leads,
  staff,
  meId,
  endOfToday,
  initialEditId,
  summary,
  total,
  filterQuery,
  products,
  activations,
  accounts,
  accountUsers = {},
  limited = false,
}: {
  /** id & email akun peserta per lead (untuk Ubah email) */
  accountUsers?: Record<number, { id: number; email: string }>;
  /** Admin SmartChampion: tanpa hapus lead & tanpa mengubah owner */
  limited?: boolean;
  products: ActivationProduct[];
  /** lead yang sudah tertaut ke pendaftaran kelas (id lead → pendaftaran) */
  activations: Record<number, LeadActivation>;
  /** email lead sudah dipakai akun: peserta / staf */
  accounts: Record<number, "peserta" | "staf">;
  summary: React.ReactNode;
  /** jumlah semua lead yang cocok dengan filter (untuk "pilih semua sesuai filter") */
  total: number;
  filterQuery: string;
  leads: LeadRow[];
  staff: Staff[];
  meId: number;
  endOfToday: Date;
  initialEditId?: number;
}) {
  const [dialog, setDialog] = useState<{ open: boolean; lead: LeadRow | null }>(() => {
    const l = initialEditId ? leads.find((x) => x.id === initialEditId) : undefined;
    return { open: Boolean(l), lead: l ?? null };
  });
  const ownerName = new Map(staff.map((s) => [s.id, s.name]));
  const [flow, setFlow] = useState<{ lead: LeadRow; mode: "akun" | "kelas" } | null>(null);
  // langkah 1: semua lead yang punya email & belum ada akunnya
  const canRegister = (l: LeadRow) => !!l.email?.trim() && !accounts[l.id] && !activations[l.id];
  // langkah 2: lead lunas produk kelas (bukan Mimpi.mu saja) yang sudah punya akun & belum masuk kelas
  const canEnroll = (l: LeadRow) =>
    accounts[l.id] === "peserta" &&
    !activations[l.id] &&
    l.statusFunnel === "Paid" &&
    (!/mimpi/i.test(l.produk ?? "") || /coc|vip|privat/i.test(l.produk ?? ""));

  // ----- Pilihan (centang) -----
  const sel = useBulkSelection(
    leads.map((l) => l.id),
    total,
  );
  const linkedToWeb = sel.allMatching ? 0 : leads.filter((l) => sel.selected.has(l.id) && l.invoiceId?.startsWith("COC-")).length;

  return (
    <>
      <button
        onClick={() => setDialog({ open: true, lead: null })}
        className="btn-primary fixed bottom-6 right-6 z-30 h-14 w-14 rounded-full p-0! shadow-2xl lg:hidden"
        aria-label="Tambah lead"
      >
        <Plus className="h-6 w-6" />
      </button>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy-500">{summary}</p>
        <button onClick={() => setDialog({ open: true, lead: null })} className="btn-primary hidden lg:inline-flex">
          <Plus className="h-4 w-4" /> Tambah lead
        </button>
      </div>

      <SelectAllBanner sel={sel} noun="lead" />

      <div id="tabel" className="card scroll-mt-24 overflow-x-auto p-0!">
        <table className="table min-w-[1290px]">
          <thead>
            <tr>
              <th className={cn("w-10", limited && "hidden")}>
                <HeaderCheckbox sel={sel} label="Pilih semua lead di halaman ini" />
              </th>
              <th>Masuk</th>
              <th>Nama / Kontak</th>
              <th>Akun peserta</th>
              <th>Sumber</th>
              <th>Produk</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Bayar</th>
              <th>Follow-up</th>
              <th>Update cepat</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l, i) => {
              const overdue = l.nextFollowUp && new Date(l.nextFollowUp) < endOfToday && !["Paid", "Lost"].includes(l.statusFunnel);
              return (
                <tr
                  key={l.id}
                  className={cn("animate-fade-in", sel.isSelected(l.id) && "bg-brand-50/70")}
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <td className={cn(limited && "hidden")}>
                    <RowCheckbox sel={sel} id={l.id} label={`Pilih ${l.nama}`} />
                  </td>
                  <td className="whitespace-nowrap text-xs text-navy-500">{formatDate(l.tanggalMasuk)}</td>
                  <td>
                    <button onClick={() => setDialog({ open: true, lead: l })} className="text-left font-bold text-navy-900 transition hover:text-brand-700">
                      {l.nama}
                    </button>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-navy-400">
                      {l.noWa ? (
                        <a href={`https://wa.me/${l.noWa}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-emerald-600">
                          <MessageCircle className="h-3 w-3" /> {l.noWa}
                        </a>
                      ) : (
                        "-"
                      )}
                    </div>
                    {l.kategori === "Bukan Lead" && (
                      <Badge tone="red" className="mt-1">
                        Bukan lead
                      </Badge>
                    )}
                  </td>
                  <td>
                    <AccountCell
                      lead={l}
                      activation={activations[l.id]}
                      account={accounts[l.id]}
                      canRegister={canRegister(l)}
                      canEnroll={canEnroll(l)}
                      onRegister={() => setFlow({ lead: l, mode: "akun" })}
                      onEnroll={() => setFlow({ lead: l, mode: "kelas" })}
                      onEditEmail={() => setDialog({ open: true, lead: l })}
                      accountUser={accountUsers[l.id]}
                    />
                  </td>
                  <td className="text-xs">
                    <p className="font-semibold text-navy-700">{l.sumberLead}</p>
                    {l.campaign && <p className="max-w-[160px] truncate text-navy-400">{l.campaign}</p>}
                  </td>
                  <td className="text-xs">
                    <p className="font-semibold text-navy-700">{l.produk ?? "-"}</p>
                    {l.paket && <p className="max-w-[160px] truncate text-navy-400">{l.paket}</p>}
                  </td>
                  <td className="text-xs">
                    {l.ownerId ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-navy-700">
                        <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-100 text-[10px] font-bold text-brand-700">
                          {ownerName.get(l.ownerId)?.charAt(0)}
                        </span>
                        {ownerName.get(l.ownerId) ?? "-"}
                      </span>
                    ) : (
                      <span className="font-semibold text-rose-500">Belum ada</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={statusTone(l.statusFunnel)}>{l.statusFunnel}</Badge>
                  </td>
                  <td className="text-xs">
                    <p className="font-semibold text-navy-700">{l.statusBayar ?? "-"}</p>
                    {l.nominal != null && <p className="text-navy-400">{formatRupiah(l.nominal)}</p>}
                    {l.tanggalBayar && <p className="text-navy-400">bayar {formatDate(l.tanggalBayar)}</p>}
                  </td>
                  <td className={cn("whitespace-nowrap text-xs", overdue ? "font-bold text-rose-600" : "text-navy-600")}>
                    <span className="flex items-center gap-1">
                      {overdue && <AlarmClock className="h-3.5 w-3.5" />} {formatDate(l.nextFollowUp)}
                    </span>
                    {l.lastContact && <p className="font-normal text-navy-400">last: {formatDate(l.lastContact)}</p>}
                  </td>
                  <td>
                    <QuickStatus key={`${l.id}-${l.statusFunnel}`} lead={l} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setDialog({ open: true, lead: l })} className="btn-icon" aria-label={`Edit ${l.nama}`} title="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      {!limited && (
                        <ConfirmButton
                          ariaLabel={`Hapus ${l.nama}`}
                          title="Hapus lead?"
                          message={
                            <>
                              Lead <b>{l.nama}</b> akan dihapus permanen dari Master Lead.
                            </>
                          }
                          action={() => deleteLeadAction(l.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </ConfirmButton>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!leads.length && (
              <tr>
                <td colSpan={12} className="py-14 text-center text-navy-400">
                  Tidak ada lead yang cocok dengan filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!limited && (
        <BulkDeleteBar
          sel={sel}
          noun="lead"
          pageName="Master Lead"
          note={
            linkedToWeb
              ? `${linkedToWeb} di antaranya berasal dari pendaftaran web — data pendaftaran & pembayarannya tetap tersimpan di menu Peserta Terdaftar.`
              : null
          }
          deleteSelected={deleteLeadsAction}
          deleteByFilter={() => deleteLeadsByFilterAction(filterQuery, total)}
        />
      )}

      {flow && <LeadAccountFlow key={flow.lead.id} lead={flow.lead} mode={flow.mode} products={products} onClose={() => setFlow(null)} />}
      {dialog.open && (
        <LeadDialog
          open
          onClose={() => setDialog({ open: false, lead: null })}
          lead={dialog.lead}
          staff={staff}
          products={products}
          activation={dialog.lead ? activations[dialog.lead.id] : undefined}
          defaultOwnerId={meId}
          canAssign={!limited}
        />
      )}
    </>
  );
}

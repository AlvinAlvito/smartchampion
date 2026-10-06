"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Contact,
  ExternalLink,
  GraduationCap,
  LoaderCircle,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Receipt,
  RefreshCw,
  School,
  UserPlus,
  UserRound,
  UserSearch,
} from "lucide-react";
import { Badge, statusTone } from "@/components/ui";
import { useToast } from "@/components/toast";
import { REG_STATUS_LABEL } from "@/lib/constants";
import { formatDate, formatRupiah } from "@/lib/utils";
import { formatWaPhone } from "@/lib/wa-shared";
import { getJson, postJson } from "./use-poll";
import { LeadQuickEdit } from "./lead-quick-edit";

type Customer = {
  found: boolean;
  profile: {
    nama: string | null;
    noWa: string | null;
    email: string | null;
    sekolah: string | null;
    jenjang: string | null;
    kelas: string | null;
    wilayah: string | null;
    akunPeserta: { id: number; since: string } | null;
  };
  leads: {
    id: number;
    nama: string;
    noWa: string | null;
    email: string | null;
    sumber: string;
    kategori: string;
    produk: string | null;
    status: string;
    owner: string | null;
    tanggalMasuk: string;
    lastContact: string | null;
    nextFollowUp: string | null;
    match: string;
    weak: boolean;
  }[];
  transactions: { key: string; date: string; title: string; sub: string; status: string; amount: number | null }[];
  totalPaid: number | null;
  canLead: boolean;
  canOpenLead: boolean;
  canEditLead: boolean;
};

const FUNNEL_TONE: Record<string, "gray" | "blue" | "yellow" | "green" | "red" | "brand"> = {
  Baru: "gray",
  Dihubungi: "blue",
  "Follow-up": "brand",
  Trial: "yellow",
  Pending: "yellow",
  Paid: "green",
  Lost: "red",
};

function Row({ icon: Icon, children }: { icon: typeof Phone; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm text-navy-700">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-navy-300" /> <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

export function CustomerPanel({ chatId }: { chatId: number }) {
  const toast = useToast();
  const [data, setData] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  /** lead yang sedang diedit di panel ini (null = tampilan biasa) */
  const [editing, setEditing] = useState<number | null>(null);

  const fetchData = useCallback(
    () =>
      getJson<Customer>(`/api/admin/wa/customer?chat=${chatId}`)
        .then(setData)
        .catch((e) => toast.error((e as Error).message))
        .finally(() => setLoading(false)),
    [chatId, toast],
  );
  const load = () => {
    setLoading(true);
    void fetchData();
  };

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const addLead = async () => {
    setAdding(true);
    const r = await postJson<{ leadId?: number }>("/api/admin/wa/lead", { chatId });
    setAdding(false);
    if (r.error) toast.error(r.error);
    else {
      toast.success("Kontak disimpan ke Master Lead (owner: Anda). Lengkapi datanya di form ini.");
      void load();
      // langsung buka form edit agar nama & data bisa dirapikan saat itu juga
      if (r.leadId) setEditing(r.leadId);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-3 p-4">
        <div className="skeleton h-5 w-40" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
    );
  }
  if (!data) return null;
  const p = data.profile;
  const strong = data.leads.filter((l) => !l.weak);
  const weak = data.leads.filter((l) => l.weak);
  const primary = strong[0];

  if (editing) {
    return (
      <div className="p-4">
        <LeadQuickEdit
          key={editing}
          leadId={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-navy-900">
          <UserSearch className="h-4 w-4 text-brand-600" /> Data customer
        </p>
        <div className="flex items-center gap-1">
          {data.canEditLead && primary && (
            <button className="btn-secondary btn-sm" onClick={() => setEditing(primary.id)} title="Edit data customer di Master Lead">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
          <button className="btn-icon h-8 w-8" onClick={load} aria-label="Muat ulang data customer" title="Muat ulang">
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!data.found ? (
        <div className="rounded-2xl bg-navy-50/70 p-4 text-sm text-navy-500">
          <p className="font-semibold text-navy-700">Belum ada di Master Lead</p>
          <p className="mt-1 text-xs">Tidak ditemukan lead dengan nomor WA atau nama yang mirip.</p>
          {data.canLead && (
            <button className="btn-primary btn-sm mt-3" onClick={addLead} disabled={adding}>
              {adding ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Simpan ke Master Lead
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-navy-100">
          <p className="text-base font-extrabold text-navy-900">{p.nama ?? "-"}</p>
          {p.noWa && <Row icon={Phone}>{formatWaPhone(p.noWa)}</Row>}
          {p.email && <Row icon={Mail}>{p.email}</Row>}
          {p.sekolah && <Row icon={School}>{p.sekolah}</Row>}
          {(p.jenjang || p.kelas) && <Row icon={GraduationCap}>{[p.kelas, p.jenjang && !p.kelas ? p.jenjang : null].filter(Boolean).join(" · ")}</Row>}
          {p.wilayah && <Row icon={MapPin}>{p.wilayah}</Row>}
          {p.akunPeserta && <Row icon={UserRound}>Punya akun peserta sejak {formatDate(p.akunPeserta.since)}</Row>}
        </div>
      )}

      {strong.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-navy-400">
            <Contact className="h-3.5 w-3.5" /> Master Lead ({strong.length})
          </p>
          <ul className="space-y-2">
            {strong.map((l) => (
              <li key={l.id} className="rounded-2xl bg-white p-3 text-xs ring-1 ring-navy-100">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-bold text-navy-900">{l.nama}</p>
                  <Badge tone={FUNNEL_TONE[l.status] ?? "gray"}>{l.status}</Badge>
                </div>
                <p className="mt-1 text-navy-500">{[l.produk, l.sumber, l.kategori].filter(Boolean).join(" · ")}</p>
                <p className="mt-0.5 text-navy-500">
                  Owner: <b className="text-navy-700">{l.owner ?? "belum ada"}</b> · masuk {formatDate(l.tanggalMasuk)}
                </p>
                {l.nextFollowUp && <p className="mt-0.5 text-navy-500">Follow-up: {formatDate(l.nextFollowUp)}</p>}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">{l.match}</span>
                  <span className="flex items-center gap-3">
                    {data.canEditLead && (
                      <button
                        onClick={() => setEditing(l.id)}
                        className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
                        aria-label={`Edit lead ${l.nama}`}
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    )}
                    {data.canOpenLead && (
                      <Link
                        href={`/admin/leads?edit=${l.id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
                      >
                        Buka <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-navy-400">
          <span className="flex items-center gap-2">
            <Receipt className="h-3.5 w-3.5" /> Riwayat transaksi ({data.transactions.length})
          </span>
          {data.totalPaid ? <span className="normal-case tracking-normal text-emerald-700">{formatRupiah(data.totalPaid)}</span> : null}
        </p>
        {data.transactions.length ? (
          <ul className="space-y-2">
            {data.transactions.map((t) => (
              <li key={t.key} className="rounded-2xl bg-white p-3 text-xs ring-1 ring-navy-100">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-bold text-navy-900">{t.title}</p>
                  <Badge tone={statusTone(t.status)}>{REG_STATUS_LABEL[t.status] ?? t.status}</Badge>
                </div>
                <p className="mt-1 text-navy-500">{t.sub}</p>
                <p className="mt-0.5 flex justify-between text-navy-500">
                  <span>{formatDate(t.date)}</span>
                  {t.amount != null && <b className="text-navy-800">{formatRupiah(t.amount)}</b>}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-navy-50/70 p-3 text-xs text-navy-500">Belum ada transaksi tercatat.</p>
        )}
      </div>

      {weak.length > 0 && (
        <div className="rounded-2xl bg-amber-50/70 p-3 text-xs text-amber-900 ring-1 ring-amber-100">
          <p className="font-bold">Kontak sama, nama berbeda</p>
          <p className="mt-0.5 text-amber-800/80">Kemungkinan keluarga yang memakai nomor/email yang sama (tidak dihitung sebagai orang yang sama):</p>
          <ul className="mt-1.5 space-y-0.5">
            {weak.map((l) => (
              <li key={l.id}>
                • {l.nama} ({l.status}
                {l.owner ? `, ${l.owner}` : ""})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { CircleCheck, CircleDollarSign, CircleX, ExternalLink, FileSpreadsheet, Filter, Hourglass, Percent, Receipt, RotateCcw, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { PRODUCT_TYPE_LABEL, REG_STATUS_LABEL } from "@/lib/constants";
import { buildTransactionWhere, paymentLabel, readTransactionFilters, transactionFiltersToQuery, WEB_TRANSACTION } from "@/lib/transaction-filters";
import { cn, formatDate, formatRupiah } from "@/lib/utils";
import { Badge, PageTitle, StatCard, statusTone } from "@/components/ui";
import { Pagination, readPage } from "@/components/pagination";
import { SyncButton } from "./sync-button";

export const metadata = { title: "Transaksi" };
export const dynamic = "force-dynamic";

/**
 * Transaksi murni: pendaftaran dari checkout web yang dibayar lewat Midtrans
 * (tanpa data impor Google Form & aktivasi manual Master Lead).
 */
export default async function TransactionsPage({ searchParams }: PageProps<"/admin/transaksi">) {
  const session = await requirePanel();
  const readOnly = session.role === "SUPERADMIN";
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const f = readTransactionFilters(get);
  const where = buildTransactionWhere(f);
  const { page, skip, take } = readPage(sp);

  const [total, rows, byStatus, methods] = await Promise.all([
    prisma.registration.count({ where }),
    prisma.registration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { product: { select: { id: true, name: true, type: true } }, user: { select: { email: true } } },
    }),
    // ringkasan mengikuti filter (kecuali status, agar semua status terlihat)
    prisma.registration.groupBy({ by: ["status"], where: buildTransactionWhere(f, { ignoreStatus: true }), _count: { _all: true }, _sum: { amount: true } }),
    prisma.registration.findMany({ where: WEB_TRANSACTION, distinct: ["paymentType"], select: { paymentType: true } }),
  ]);
  const stat = (s: string) => byStatus.find((x) => x.status === s);
  const count = (s: string) => stat(s)?._count._all ?? 0;
  const sum = (s: string) => stat(s)?._sum.amount ?? 0;
  const all = byStatus.reduce((n, x) => n + x._count._all, 0);
  const failed = count("FAILED") + count("EXPIRED") + count("CANCELLED");
  const conversion = all ? Math.round((count("PAID") / all) * 100) : 0;
  const query = transactionFiltersToQuery(f);
  const active = Object.values(f).filter((v) => v && v !== "daftar").length;

  return (
    <>
      <PageTitle
        icon={Receipt}
        eyebrow="Keuangan"
        title="Transaksi"
        subtitle="Transaksi murni dari pendaftaran web yang dibayar lewat Midtrans — tanpa data impor Google Form & aktivasi manual Master Lead."
        action={
          <a href={`/api/admin/transaksi/export?${query}`} className="btn-secondary">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Ekspor Excel
          </a>
        }
      />

      <div className="stagger mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total transaksi" value={all} icon={Receipt} tone="navy" />
        <StatCard label="Lunas" value={count("PAID")} hint={formatRupiah(sum("PAID"))} icon={CircleCheck} tone="green" />
        <StatCard label="Menunggu bayar" value={count("PENDING")} hint={formatRupiah(sum("PENDING"))} icon={Hourglass} tone="yellow" />
        <StatCard label="Gagal / kedaluwarsa / batal" value={failed} icon={CircleX} tone="red" />
        <StatCard label="Konversi bayar" value={`${conversion}%`} hint={`Pemasukan ${formatRupiah(sum("PAID"))}`} icon={Percent} tone="blue" />
      </div>

      <form className="card mb-4 animate-fade-up" action="/admin/transaksi">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-700">
          <Filter className="h-4 w-4 text-brand-600" /> Filter
          {active > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] text-white">{active} aktif</span>}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
            <input name="q" defaultValue={f.q} placeholder="Cari nama / kode / Order ID / WA / email" className="input pl-10" />
          </div>
          <select name="status" defaultValue={f.status} className="input" aria-label="Status">
            <option value="">Semua status</option>
            {Object.entries(REG_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select name="type" defaultValue={f.type} className="input" aria-label="Jenis produk">
            <option value="">Semua produk</option>
            {Object.entries(PRODUCT_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select name="method" defaultValue={f.method} className="input" aria-label="Metode bayar">
            <option value="">Semua metode bayar</option>
            {methods
              .filter((m) => m.paymentType)
              .map((m) => (
                <option key={m.paymentType} value={m.paymentType!}>
                  {paymentLabel(m.paymentType)}
                </option>
              ))}
            <option value="none">Belum memilih metode</option>
          </select>
          <select name="tgl" defaultValue={f.tgl} className="input" aria-label="Jenis tanggal">
            <option value="daftar">Tanggal daftar</option>
            <option value="lunas">Tanggal lunas</option>
          </select>
          <label className="flex items-center gap-2 text-xs font-semibold text-navy-500">
            Dari
            <input name="from" type="date" defaultValue={f.from} className="input min-w-0 flex-1" />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-navy-500">
            Sampai
            <input name="to" type="date" defaultValue={f.to} className="input min-w-0 flex-1" />
          </label>
          <div className="flex gap-2 md:col-span-4 md:justify-end">
            <Link href="/admin/transaksi" className="btn-ghost">
              <RotateCcw className="h-4 w-4" /> Reset
            </Link>
            <button className="btn-primary">
              <Filter className="h-4 w-4" /> Terapkan
            </button>
          </div>
        </div>
      </form>

      <div id="tabel" className="card scroll-mt-24 overflow-x-auto p-0!">
        <table className="table min-w-[1080px]">
          <thead>
            <tr>
              <th>Kode / Order ID</th>
              <th>Peserta</th>
              <th>Kelas</th>
              <th className="text-right">Nominal</th>
              <th>Metode</th>
              <th>Status</th>
              <th>Daftar</th>
              <th>Lunas</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <p className="font-mono text-xs font-semibold text-brand-700">{r.code}</p>
                  <p className="max-w-44 truncate font-mono text-[11px] text-navy-400" title={r.midtransOrderId ?? undefined}>
                    {r.midtransOrderId ?? "belum ada order Midtrans"}
                  </p>
                </td>
                <td>
                  <p className="font-bold text-navy-900">{r.fullName}</p>
                  <p className="text-xs text-navy-400">
                    {r.email} · {r.phone}
                  </p>
                </td>
                <td className="max-w-[220px] text-xs">
                  {r.product ? (
                    <>
                      <Badge tone={r.product.type === "COC" ? "brand" : "yellow"}>{PRODUCT_TYPE_LABEL[r.product.type] ?? r.product.type}</Badge>
                      <span className="mt-0.5 block truncate font-medium text-navy-700">{r.product.name}</span>
                      {r.sessionsBought ? <span className="block text-amber-700">Paket {r.sessionsBought}x pertemuan</span> : null}
                    </>
                  ) : (
                    <span className="text-amber-700">Belum ditempatkan</span>
                  )}
                </td>
                <td className="whitespace-nowrap text-right font-bold text-navy-900">{formatRupiah(r.amount)}</td>
                <td className={cn("text-xs", r.paymentType ? "font-semibold text-navy-700" : "text-navy-400")}>{paymentLabel(r.paymentType)}</td>
                <td>
                  <Badge tone={statusTone(r.status)}>{REG_STATUS_LABEL[r.status]}</Badge>
                </td>
                <td className="whitespace-nowrap text-xs text-navy-500">{formatDate(r.createdAt, true)}</td>
                <td className="whitespace-nowrap text-xs text-navy-500">{r.paidAt ? formatDate(r.paidAt, true) : "-"}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    {!readOnly && r.status !== "PAID" && <SyncButton id={r.id} disabled={!r.midtransOrderId} />}
                    <Link href={`/admin/pendaftar?open=${r.id}`} className="btn-icon h-8 w-8" title="Detail pendaftaran" aria-label={`Detail ${r.code}`}>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="py-14 text-center text-navy-400">
                  <CircleDollarSign className="mx-auto mb-2 h-8 w-8 text-navy-200" />
                  Belum ada transaksi Midtrans yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/admin/transaksi" searchParams={sp} page={page} total={total} noun="transaksi" anchor="tabel" />
    </>
  );
}

import Link from "next/link";
import { FileDown, FileSpreadsheet, Filter, Mail, MessageCircle, RotateCcw, Search, Send, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { BLAST_CHANNELS, BLAST_JENJANG, PROVINSI } from "@/lib/constants";
import { blastFiltersToQuery, buildBlastWhere, readBlastFilters } from "@/lib/blast-filters";
import { PageTitle, StatCard } from "@/components/ui";
import { Pagination, readPage } from "@/components/pagination";
import { BlastTable } from "./blast-table";
import { ImportBlastButton } from "./import-button";

export const metadata = { title: "Data Blast" };
export const dynamic = "force-dynamic";

export default async function BlastPage({ searchParams }: PageProps<"/admin/blast">) {
  const session = await requireStaff();
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const filters = readBlastFilters(get);
  const { q, asal, jenjang, provinsi, owner, from, to } = filters;
  const { page, skip, take } = readPage(sp);
  const editId = Number(get("edit")) || undefined;
  const where = buildBlastWhere(filters);

  const [total, rows, byChannel, staff, editRow] = await Promise.all([
    prisma.blast.count({ where }),
    prisma.blast.findMany({ where, orderBy: [{ tanggal: "desc" }, { id: "desc" }], skip, take }),
    prisma.blast.groupBy({ by: ["asalBlast"], where, _count: { _all: true } }),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPERADMIN"] } }, select: { id: true, name: true }, orderBy: { id: "asc" } }),
    editId ? prisma.blast.findUnique({ where: { id: editId } }) : null,
  ]);
  const list = editRow && !rows.some((b) => b.id === editRow.id) ? [editRow, ...rows] : rows;
  const channelCount = (c: string) => byChannel.find((x) => x.asalBlast === c)?._count._all ?? 0;
  const activeFilters = [q, asal, jenjang, provinsi, owner, from || to ? "1" : ""].filter(Boolean).length;
  const query = blastFiltersToQuery(filters);

  return (
    <>
      <PageTitle
        icon={Send}
        eyebrow="Data Master"
        title="Data Blast"
        subtitle="Catatan kontak yang di-blast admin lewat WhatsApp & Email. Klik nama untuk mengedit."
        action={
          <div className="flex flex-wrap gap-2">
            <a href="/api/admin/blast/template" className="btn-ghost" title="Format Excel kosong untuk diisi lalu diimpor">
              <FileDown className="h-4 w-4 text-brand-600" /> Template
            </a>
            <ImportBlastButton />
            <a href={`/api/admin/blast/export?${query}`} className="btn-secondary">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Ekspor Excel
            </a>
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <StatCard label={activeFilters ? "Sesuai filter" : "Total blast"} value={total.toLocaleString("id-ID")} icon={Users} tone="brand" />
        </div>
        <StatCard label="WhatsApp" value={channelCount("WhatsApp").toLocaleString("id-ID")} icon={MessageCircle} tone="green" />
        <StatCard label="Email" value={channelCount("Email").toLocaleString("id-ID")} icon={Mail} tone="blue" />
      </div>

      <form className="card mb-5 animate-fade-up" action="/admin/blast">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-700">
          <Filter className="h-4 w-4 text-brand-600" /> Filter
          {activeFilters > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] text-white">{activeFilters} aktif</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
            <input name="q" defaultValue={q} placeholder="Cari nama / HP / email / sekolah / kota" className="input pl-10" />
          </div>
          <select name="asal" defaultValue={asal} className="input">
            <option value="">Semua asal blast</option>
            {BLAST_CHANNELS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select name="jenjang" defaultValue={jenjang} className="input">
            <option value="">Semua jenjang</option>
            {BLAST_JENJANG.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select name="provinsi" defaultValue={provinsi} className="input">
            <option value="">Semua provinsi</option>
            {PROVINSI.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select name="owner" defaultValue={owner} className="input">
            <option value="">Semua owner</option>
            <option value={String(session.userId)}>Blast saya</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="none">Belum ada owner</option>
          </select>
          <div className="grid min-w-0 grid-cols-2 gap-2 md:col-span-3">
            <label className="flex min-w-0 flex-col gap-1 text-[11px] font-bold uppercase tracking-wide text-navy-400">
              Dari tanggal
              <input type="date" name="from" defaultValue={from} className="input min-w-0" />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-[11px] font-bold uppercase tracking-wide text-navy-400">
              Sampai tanggal
              <input type="date" name="to" defaultValue={to} className="input min-w-0" />
            </label>
          </div>
          <div className="flex gap-2 md:col-span-3 md:items-end md:justify-end">
            <Link href="/admin/blast" className="btn-ghost">
              <RotateCcw className="h-4 w-4" /> Reset
            </Link>
            <button className="btn-primary">
              <Filter className="h-4 w-4" /> Terapkan
            </button>
          </div>
        </div>
      </form>

      <BlastTable
        // key: pilihan (centang) direset saat halaman/filter berganti
        key={`${query}|${page}`}
        total={total}
        filterQuery={query}
        rows={list}
        staff={staff}
        meId={session.userId}
        initialEditId={editId}
        summary={
          <>
            <b className="text-navy-900">{total.toLocaleString("id-ID")}</b> data blast
          </>
        }
      />

      <Pagination basePath="/admin/blast" searchParams={sp} page={page} total={total} noun="data blast" anchor="tabel" />
    </>
  );
}

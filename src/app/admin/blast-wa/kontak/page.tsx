import Link from "next/link";
import { FileDown, FileSpreadsheet, Filter, RotateCcw, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { BLAST_JENJANG, PROVINSI } from "@/lib/constants";
import { canBlast, canSeeAllBlast, contactScope } from "@/lib/blast-wa";
import { buildContactWhere, CONTACT_STATUS_FILTERS, contactFiltersToQuery, readContactFilters } from "@/lib/blast-contact-filters";
import { parseLabels } from "@/lib/blast-wa-shared";
import { Pagination, readPage } from "@/components/pagination";
import { ContactTable } from "./contact-table";
import { ContactTools } from "./contact-tools";

export const metadata = { title: "Kontak Blast WhatsApp" };
export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: PageProps<"/admin/blast-wa/kontak">) {
  const session = await requireStaff();
  const blaster = canBlast(session.role);
  const seeAll = canSeeAllBlast(session.role);
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const f = readContactFilters(get);
  const scope = contactScope(session);
  const where = buildContactWhere(f, scope);
  const { page, skip, take } = readPage(sp);
  const query = contactFiltersToQuery(f);

  const [total, rows, labelRows, owners] = await Promise.all([
    prisma.blastContact.count({ where }),
    prisma.blastContact.findMany({ where, orderBy: { id: "desc" }, skip, take, include: { owner: { select: { name: true } } } }),
    prisma.blastContact.findMany({ where: { ...scope, labels: { not: null } }, distinct: ["labels"], select: { labels: true }, take: 500 }),
    seeAll ? prisma.user.findMany({ where: { blastContacts: { some: {} } }, select: { id: true, name: true } }) : [],
  ]);
  const labels = [...new Set(labelRows.flatMap((r) => parseLabels(r.labels)))].sort((a, b) => a.localeCompare(b, "id"));
  const active = Object.values(f).filter(Boolean).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        {blaster && (
          <>
            <a href="/api/admin/blast-wa/kontak/template" className="btn-ghost" title="Format Excel kosong untuk diisi lalu diimpor">
              <FileDown className="h-4 w-4 text-brand-600" /> Template
            </a>
            <ContactTools />
          </>
        )}
        <a href={`/api/admin/blast-wa/kontak/export?${query}`} className="btn-secondary">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Ekspor Excel
        </a>
      </div>

      <form className="card mb-4 animate-fade-up" action="/admin/blast-wa/kontak">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-700">
          <Filter className="h-4 w-4 text-brand-600" /> Filter
          {active > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] text-white">{active} aktif</span>}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
            <input name="q" defaultValue={f.q} placeholder="Cari nama / nomor / email / sekolah / kota" className="input pl-10" />
          </div>
          <select name="label" defaultValue={f.label} className="input" aria-label="Label">
            <option value="">Semua label</option>
            {labels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <select name="jenjang" defaultValue={f.jenjang} className="input" aria-label="Jenjang">
            <option value="">Semua jenjang</option>
            {BLAST_JENJANG.map((j) => (
              <option key={j}>{j}</option>
            ))}
          </select>
          <select name="provinsi" defaultValue={f.provinsi} className="input" aria-label="Provinsi">
            <option value="">Semua provinsi</option>
            {PROVINSI.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select name="status" defaultValue={f.status} className="input" aria-label="Status kontak">
            <option value="">Semua status</option>
            {Object.entries(CONTACT_STATUS_FILTERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {seeAll && (
            <select name="owner" defaultValue={f.owner} className="input" aria-label="Owner">
              <option value="">Semua owner</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2 md:col-span-6 md:justify-end">
            <Link href="/admin/blast-wa/kontak" className="btn-ghost">
              <RotateCcw className="h-4 w-4" /> Reset
            </Link>
            <button className="btn-primary">
              <Filter className="h-4 w-4" /> Terapkan
            </button>
          </div>
        </div>
      </form>

      <ContactTable
        key={`${query}|${page}`}
        rows={rows.map((r) => ({ ...r, ownerName: r.owner.name }))}
        total={total}
        filterQuery={query}
        canEdit={blaster}
        showOwner={seeAll}
        labels={labels}
      />
      <Pagination basePath="/admin/blast-wa/kontak" searchParams={sp} page={page} total={total} noun="kontak" anchor="tabel" />
    </>
  );
}

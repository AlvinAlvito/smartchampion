import Link from "next/link";
import { CalendarRange, Contact, FileDown, FileSpreadsheet, Filter, RotateCcw, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { FUNNEL_STATUSES, LEAD_SOURCES, LEAD_CATEGORIES } from "@/lib/constants";
import { LEAD_ACCOUNT_FILTERS, LEAD_DATE_FIELDS, LEAD_PRODUCT_FILTERS, endOfTodayWib, leadFiltersToQuery, readLeadFilters } from "@/lib/lead-filters";
import { buildLeadWhereWithAccounts } from "@/lib/lead-filters-server";
import { PageTitle } from "@/components/ui";
import { Pagination, readPage } from "@/components/pagination";
import { LeadsTable } from "./leads-table";
import { ImportLeadsButton } from "./import-dialog";

export const metadata = { title: "Master Lead" };
export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  const session = await requirePanel();
  // Admin SmartChampion: kelola akun peserta (tanpa impor/ekspor, hapus & mengubah owner)
  const limited = session.role === "SMARTCHAMPION";
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const filters = readLeadFilters(get);
  const { q, status, sumber, kategori, produk, owner, akun, due, from, to, tgl } = filters;
  const { page, skip, take } = readPage(sp);
  const editId = Number(get("edit")) || undefined;
  const where = await buildLeadWhereWithAccounts(filters);

  const [total, leads, staff, editLead] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: due ? [{ nextFollowUp: "asc" }] : [{ tanggalMasuk: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPERADMIN"] } }, select: { id: true, name: true }, orderBy: { id: "asc" } }),
    editId ? prisma.lead.findUnique({ where: { id: editId } }) : null,
  ]);
  const rows = editLead && !leads.some((l) => l.id === editLead.id) ? [editLead, ...leads] : leads;
  // aktivasi akun & kelas: daftar kelas + pendaftaran yang sudah tertaut ke lead di halaman ini
  const invoiceIds = rows.map((l) => l.invoiceId).filter((v): v is string => !!v);
  const emails = [...new Set(rows.map((l) => l.email?.trim().toLowerCase()).filter((e): e is string => !!e))];
  const [products, linkedRegs, users] = await Promise.all([
    prisma.product.findMany({
      where: { status: { not: "DRAFT" } },
      select: { id: true, name: true, bidang: true, jenjang: true, gradeLabel: true, type: true, status: true },
      orderBy: [{ jenjang: "asc" }, { name: "asc" }],
    }),
    prisma.registration.findMany({
      where: { OR: [{ sourceLeadId: { in: rows.map((l) => l.id) } }, { code: { in: invoiceIds } }] },
      select: {
        id: true,
        code: true,
        email: true,
        status: true,
        sourceLeadId: true,
        productId: true,
        userId: true,
        user: { select: { email: true, role: true } },
        product: { select: { name: true } },
      },
    }),
    emails.length ? prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true, role: true } }) : [],
  ]);
  const roleByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.role]));
  const userByEmail = new Map(users.filter((u) => u.role === "PESERTA").map((u) => [u.email.toLowerCase(), { id: u.id, email: u.email }]));
  // status akun per lead: peserta (sudah punya akun) / staf (email dipakai admin) / tidak ada
  const accounts: Record<number, "peserta" | "staf"> = {};
  for (const l of rows) {
    const role = l.email ? roleByEmail.get(l.email.trim().toLowerCase()) : undefined;
    if (role) accounts[l.id] = role === "PESERTA" ? "peserta" : "staf";
  }
  const activations: Record<number, { id: number; code: string; productId: number | null; product: string; email: string; status: string }> = {};
  for (const l of rows) {
    const r = linkedRegs.find((x) => x.sourceLeadId === l.id || (l.invoiceId && x.code === l.invoiceId));
    if (r)
      activations[l.id] = { id: r.id, code: r.code, productId: r.productId, product: r.product?.name ?? "Belum ditempatkan", email: r.email, status: r.status };
  }
  const accountUsers: Record<number, { id: number; email: string }> = {};
  for (const l of rows) {
    const r = linkedRegs.find((x) => x.sourceLeadId === l.id || (l.invoiceId && x.code === l.invoiceId));
    if (r?.user.role === "PESERTA") accountUsers[l.id] = { id: r.userId, email: r.user.email };
    else {
      const u = l.email ? userByEmail.get(l.email.trim().toLowerCase()) : undefined;
      if (u) accountUsers[l.id] = u;
    }
  }
  const activeFilters = [q, status, sumber, kategori, produk, owner, akun, due ? "1" : "", from || to ? "1" : ""].filter(Boolean).length;
  const fmtDay = (d: string) =>
    new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const rangeLabel = from || to ? `${tgl === "bayar" ? "dibayar" : "masuk"} ${from ? fmtDay(from) : "awal"} – ${to ? fmtDay(to) : "sekarang"}` : "";

  return (
    <>
      <PageTitle
        icon={Contact}
        eyebrow="Data Master"
        title="Master Lead"
        subtitle="Setiap lead wajib punya Owner agar tidak dihubungi dua kali. Klik nama untuk mengedit."
        action={
          limited ? undefined : (
            <div className="flex flex-wrap gap-2">
              <a href="/api/admin/leads/template" className="btn-ghost" title="Format Excel kosong untuk diisi lalu diimpor">
                <FileDown className="h-4 w-4 text-brand-600" /> Template
              </a>
              <ImportLeadsButton />
              <a href={`/api/admin/leads/export?${leadFiltersToQuery(filters)}`} className="btn-secondary">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Ekspor Excel
              </a>
            </div>
          )
        }
      />

      <form className="card mb-5 animate-fade-up" action="/admin/leads">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-700">
          <Filter className="h-4 w-4 text-brand-600" /> Filter
          {activeFilters > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] text-white">{activeFilters} aktif</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-6">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
            <input name="q" defaultValue={q} placeholder="Cari nama / WA / email / invoice" className="input pl-10" />
          </div>
          <select name="status" defaultValue={status} className="input">
            <option value="">Semua status</option>
            {FUNNEL_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select name="sumber" defaultValue={sumber} className="input">
            <option value="">Semua sumber</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select name="kategori" defaultValue={kategori} className="input">
            <option value="">Semua kategori</option>
            {LEAD_CATEGORIES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select name="owner" defaultValue={owner} className="input">
            <option value="">Semua owner</option>
            <option value={String(session.userId)}>Lead saya</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="none">Belum ada owner</option>
          </select>
          <select
            name="produk"
            defaultValue={produk}
            className="input"
            aria-label="Filter produk"
            title="COC dan Mimpi.mu ikut menampilkan lead bundling Mimpi.mu & COC"
          >
            <option value="">Semua produk</option>
            {LEAD_PRODUCT_FILTERS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
          <select
            name="akun"
            defaultValue={akun}
            className="input"
            aria-label="Filter akun peserta"
            title="Lead lunas yang belum punya akun bisa diaktivasi lewat tombol orang+ di kolom Aksi"
          >
            <option value="">Semua akun peserta</option>
            {LEAD_ACCOUNT_FILTERS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
          {/* rentang tanggal: berdasarkan tanggal masuk atau tanggal bayar (sama dengan grafik penjualan) */}
          <div className="grid grid-cols-1 gap-2 rounded-2xl bg-brand-50/50 p-2 ring-1 ring-brand-100 sm:grid-cols-[auto_1fr_1fr] md:col-span-4">
            <label className="sr-only" htmlFor="tgl">
              Jenis tanggal
            </label>
            <div className="relative">
              <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-600" />
              <select id="tgl" name="tgl" defaultValue={tgl} className="input pl-9" title="Tanggal bayar = dasar grafik penjualan di Dashboard & Performa">
                {LEAD_DATE_FIELDS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-navy-500">
              Dari
              <input name="from" type="date" defaultValue={from} max={to || undefined} className="input min-w-0 flex-1" aria-label="Dari tanggal" />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-navy-500">
              Sampai
              <input name="to" type="date" defaultValue={to} min={from || undefined} className="input min-w-0 flex-1" aria-label="Sampai tanggal" />
            </label>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-2xl bg-navy-50/60 px-3.5 py-2.5 text-sm font-medium text-navy-600 md:col-span-2">
            <input type="checkbox" name="due" value="1" defaultChecked={due} className="h-4 w-4 accent-brand-600" /> Hanya yang jatuh tempo follow-up
          </label>
          <div className="flex gap-2 md:col-span-2 md:justify-end">
            <Link href="/admin/leads" className="btn-ghost">
              <RotateCcw className="h-4 w-4" /> Reset
            </Link>
            <button className="btn-primary">
              <Filter className="h-4 w-4" /> Terapkan
            </button>
          </div>
        </div>
      </form>

      <LeadsTable
        // key: pilihan (centang) direset saat halaman/filter berganti
        key={`${leadFiltersToQuery(filters)}|${page}`}
        total={total}
        filterQuery={leadFiltersToQuery(filters)}
        leads={rows}
        staff={staff}
        meId={session.userId}
        endOfToday={endOfTodayWib()}
        initialEditId={editId}
        products={products}
        activations={activations}
        accounts={accounts}
        accountUsers={session.role === "SUPERADMIN" ? {} : accountUsers}
        limited={limited}
        summary={
          <>
            <b className="text-navy-900">{total}</b> lead{due ? " perlu follow-up (hari ini & terlambat)" : ""}
            {rangeLabel && <span className="text-navy-500"> · {rangeLabel}</span>}
          </>
        }
      />

      <Pagination basePath="/admin/leads" searchParams={sp} page={page} total={total} noun="lead" anchor="tabel" />
    </>
  );
}

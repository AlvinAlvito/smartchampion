import Link from "next/link";
import { FileSpreadsheet, CircleCheck, CircleDollarSign, ClipboardList, Filter, GraduationCap, Hourglass, Percent, RotateCcw, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { statsScope, requirePanel } from "@/lib/session";
import { getRegistrationStats } from "@/lib/stats";
import type { ProductType } from "@prisma/client";
import { JENJANG_LABEL, PRODUCT_TYPE_LABEL, REG_STATUS_LABEL } from "@/lib/constants";
import { cn, formatRupiah } from "@/lib/utils";
import { EmptyState, PageTitle, SectionTitle, StatCard } from "@/components/ui";
import { Pagination, readPage } from "@/components/pagination";
import { buildRegistrationWhere, readRegistrationFilters, registrationFiltersToQuery } from "@/lib/registration-filters";
import { ChartCard, DonutChart, SimpleBarChart, TrendChart } from "@/components/charts";
import { RegistrationsTable } from "./registrations-table";

export const metadata = { title: "Peserta Terdaftar" };
export const dynamic = "force-dynamic";

export default async function PendaftarPage({ searchParams }: PageProps<"/admin/pendaftar">) {
  const session = await requirePanel();
  const scope = statsScope(session);
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = get("q");
  const status = get("status");
  const product = get("product");
  const openId = Number(get("open")) || undefined;
  const { page, skip, take } = readPage(sp);

  const filters = readRegistrationFilters(get);
  const type = (filters.type || undefined) as ProductType | undefined;
  const typeLabel = type ? PRODUCT_TYPE_LABEL[type] : null;
  const where = buildRegistrationWhere(filters);
  const include = {
    product: { select: { id: true, name: true, type: true } },
    admin: { select: { name: true } },
    user: { select: { name: true, email: true } },
  } as const;

  const [stats, total, regs, products, editableProducts, staff, openReg, typeCounts] = await Promise.all([
    getRegistrationStats(scope, type),
    prisma.registration.count({ where }),
    prisma.registration.findMany({ where, include, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.product.findMany({ where: type ? { type } : undefined, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({
      where: { status: { not: "DRAFT" } },
      select: { id: true, name: true, type: true, bidang: true, jenjang: true, gradeLabel: true },
      orderBy: [{ jenjang: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPERADMIN"] } }, select: { id: true, name: true } }),
    openId ? prisma.registration.findUnique({ where: { id: openId }, include }) : null,
    // jumlah pendaftar per jenis produk (untuk tab)
    prisma.product.findMany({ select: { type: true, _count: { select: { registrations: true } } } }),
  ]);
  const countOf = (t?: string) => typeCounts.filter((p) => !t || p.type === t).reduce((n, p) => n + p._count.registrations, 0);
  const tabs = [{ key: "", label: "Semua produk" }, ...Object.entries(PRODUCT_TYPE_LABEL).map(([key, label]) => ({ key, label }))];
  const list = openReg && !regs.some((r) => r.id === openReg.id) ? [openReg, ...regs] : regs;
  const leads = await prisma.lead.findMany({ where: { invoiceId: { in: list.map((r) => r.code) } }, select: { id: true, invoiceId: true } });
  const leadByCode = new Map(leads.map((l) => [l.invoiceId, l.id]));
  // akun yang dipakai beberapa peserta (mis. kakak-adik memakai email orang tua) → tombol "Pisahkan akun"
  const sameAccount = await prisma.registration.findMany({
    where: { userId: { in: [...new Set(list.map((r) => r.userId))] } },
    select: { userId: true, fullName: true },
  });
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const rows = list.map((r) => ({
    ...r,
    leadId: leadByCode.get(r.code) ?? null,
    sharedWith: [...new Set(sameAccount.filter((x) => x.userId === r.userId && norm(x.fullName) !== norm(r.fullName)).map((x) => x.fullName))],
  }));
  const quotaSorted = [...stats.quota].sort((a, b) => b.paid / b.minQuota - a.paid / a.minQuota);

  return (
    <>
      <PageTitle
        icon={ClipboardList}
        eyebrow={typeLabel ?? "Semua produk kelas"}
        title="Peserta Terdaftar"
        action={
          <a href={`/api/admin/pendaftar/export?${registrationFiltersToQuery(filters)}`} className="btn-secondary">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Ekspor Excel
          </a>
        }
        subtitle={
          scope !== undefined
            ? "Peserta terdaftar yang Anda tangani dari semua produk kelas (COC, VIP Privat, dll.): statistik, kuota, dan daftar pendaftar."
            : "Pendaftaran web dari semua produk kelas (COC, VIP Privat, dll.): statistik, progres kuota, dan daftar peserta terdaftar."
        }
      />

      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Jenis produk">
        {tabs.map((t) => {
          const active = filters.type === t.key;
          return (
            <Link
              key={t.key}
              href={t.key ? `/admin/pendaftar?type=${t.key}` : "/admin/pendaftar"}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
                active ? "bg-brand-600 text-white shadow-sm" : "bg-white text-navy-600 ring-1 ring-navy-100 hover:bg-brand-50 hover:text-brand-700",
              )}
            >
              {t.label}
              <span className={cn("rounded-full px-2 py-0.5 text-[11px]", active ? "bg-white/20" : "bg-navy-50 text-navy-500")}>
                {countOf(t.key).toLocaleString("id-ID")}
              </span>
            </Link>
          );
        })}
      </nav>

      <div
        className={`stagger mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 ${session.role === "SMARTCHAMPION" ? "xl:grid-cols-4" : "xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.7fr)]"}`}
      >
        <StatCard label="Total pendaftar" value={stats.total} icon={ClipboardList} tone="navy" />
        <StatCard label="Lunas" value={stats.paid} tone="green" icon={CircleCheck} />
        <StatCard label="Menunggu bayar" value={stats.pending} tone="yellow" icon={Hourglass} />
        <StatCard label="Konversi bayar" value={`${stats.conversion}%`} tone="blue" icon={Percent} />
        {/* data keuangan tidak ditampilkan untuk Admin SmartChampion */}
        {session.role !== "SMARTCHAMPION" && <StatCard label="Pendapatan" value={formatRupiah(stats.revenue)} tone="brand" icon={CircleDollarSign} />}
      </div>

      {stats.total === 0 ? (
        <div className="mb-8">
          <EmptyState
            title={`Belum ada pendaftar ${typeLabel ?? ""}`.trim()}
            desc="Statistik & grafik akan muncul setelah ada pendaftaran dari web untuk produk ini."
          />
        </div>
      ) : (
        <div className={cn("mb-8 grid grid-cols-1 gap-6", type ? "xl:grid-cols-3" : "md:grid-cols-2 2xl:grid-cols-4")}>
          <ChartCard title="Pendaftar harian" subtitle="30 hari terakhir">
            <TrendChart
              data={stats.daily}
              series={[
                { key: "daftar", label: "Daftar" },
                { key: "lunas", label: "Lunas" },
              ]}
            />
          </ChartCard>
          <ChartCard title="Sumber info">
            <DonutChart data={stats.bySource} />
          </ChartCard>
          <ChartCard title="Peserta lunas per jenjang">
            <SimpleBarChart data={stats.byJenjang.map((d) => ({ ...d, name: JENJANG_LABEL[d.name] ?? d.name }))} />
          </ChartCard>
          {!type && (
            <ChartCard title="Peserta lunas per produk">
              <DonutChart data={stats.byType} />
            </ChartCard>
          )}
        </div>
      )}

      {stats.quota.length > 0 && (
        <>
          <SectionTitle
            title="Progres kuota kelas grup (COC)"
            icon={GraduationCap}
            action={
              <span className="text-xs font-semibold text-navy-400">
                {stats.classesReady} dari {stats.quota.length} kelas sudah memenuhi kuota minimal
              </span>
            }
          />
          <div className="card mb-8 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
            {quotaSorted.map((qq, i) => {
              const pct = Math.min(100, Math.round((qq.paid / qq.minQuota) * 100));
              const done = qq.paid >= qq.minQuota;
              return (
                <Link
                  key={qq.id}
                  href={`/admin/pendaftar?type=COC&product=${qq.id}#tabel`}
                  className="group block min-w-0 animate-fade-up"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="mb-1.5 flex justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate font-medium text-navy-700 group-hover:text-brand-700">{qq.name}</span>
                    <span className={`shrink-0 font-bold ${done ? "text-emerald-600" : "text-navy-600"}`}>
                      {qq.paid}/{qq.minQuota}
                      {qq.pending > 0 && (
                        <span className="ml-1 text-xs font-medium text-amber-600" title={`${qq.pending} menunggu pembayaran`}>
                          +{qq.pending}
                          <span className="hidden sm:inline"> pending</span>
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-navy-50">
                    <div
                      className={`h-full rounded-full transition-all duration-700 group-hover:brightness-110 ${done ? "bg-linear-to-r from-emerald-400 to-teal-500" : "bg-linear-to-r from-brand-500 to-navy-600"}`}
                      style={{ width: `${Math.max(pct, 3)}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <form className="card mb-4 grid grid-cols-1 gap-3 md:grid-cols-4" action="/admin/pendaftar">
        {filters.type && <input type="hidden" name="type" value={filters.type} />}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
          <input name="q" defaultValue={q} placeholder="Cari nama / kode / WA / sekolah" className="input pl-10" />
        </div>
        <select name="status" defaultValue={status} className="input">
          <option value="">Semua status</option>
          {Object.entries(REG_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="product" defaultValue={product} className="input">
          <option value="">{typeLabel ? `Semua kelas ${typeLabel}` : "Semua kelas"}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Link href={filters.type ? `/admin/pendaftar?type=${filters.type}` : "/admin/pendaftar"} className="btn-ghost" title="Reset filter">
            <RotateCcw className="h-4 w-4" />
          </Link>
          <button className="btn-primary flex-1">
            <Filter className="h-4 w-4" /> Filter
          </button>
        </div>
      </form>

      <RegistrationsTable
        regs={rows}
        staff={staff}
        products={editableProducts}
        initialOpenId={openId}
        canAssign={session.role !== "SMARTCHAMPION"}
        canImpersonate={session.role === "ROOT" || session.role === "ADMIN"}
        canEditEmail={session.role !== "SUPERADMIN"}
      />
      <Pagination basePath="/admin/pendaftar" searchParams={sp} page={page} total={total} noun="peserta" anchor="tabel" />
    </>
  );
}

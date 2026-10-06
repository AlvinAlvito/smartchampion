import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  CircleCheck,
  CircleDollarSign,
  CircleX,
  ClipboardList,
  Contact,
  GraduationCap,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { statsScope, requirePanel } from "@/lib/session";
import { getLeadStats, getRegistrationStats } from "@/lib/stats";
import { readDateRange } from "@/lib/date-range";
import { getSalesTrend } from "@/lib/sales-trend";
import { RangeFilter } from "@/components/range-filter";
import { SalesTrendSection } from "@/components/sales-trend-section";
import { formatRupiah } from "@/lib/utils";
import { SectionTitle, StatCard } from "@/components/ui";
import { ChartCard, DonutChart, SimpleBarChart, TrendChart } from "@/components/charts";
import { SmartChampionDashboard } from "./smartchampion-dashboard";

export const metadata = { title: "Dashboard Admin" };
export const dynamic = "force-dynamic";

function greeting() {
  const h = new Date(Date.now() + 7 * 3600_000).getUTCHours();
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 19 ? "Selamat sore" : "Selamat malam";
}

export default async function AdminDashboard({ searchParams }: PageProps<"/admin">) {
  const session = await requirePanel();
  // Admin SmartChampion: dashboard khusus peserta & pendaftar (tanpa data lead, keuangan, performa admin)
  if (session.role === "SMARTCHAMPION") {
    const todayLabel = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(
      new Date(),
    );
    return <SmartChampionDashboard name={session.name} today={todayLabel} greeting={greeting()} />;
  }
  // Akun ADMIN hanya melihat statistik lead & pendaftar yang ia tangani
  const scope = statsScope(session);
  const mine = scope !== undefined;
  const sp = await searchParams;
  const range = readDateRange((k) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined));
  const [lead, reg, unowned, trend] = await Promise.all([
    getLeadStats(scope),
    getRegistrationStats(scope),
    // Lead tanpa owner (mis. pendaftar web baru) — ditampilkan ke semua staf agar segera diambil
    prisma.lead.count({ where: { ownerId: null, statusFunnel: { notIn: ["Lost"] }, kategori: { not: "Bukan Lead" } } }),
    getSalesTrend(range, scope),
  ]);
  const leadConv = lead.realLeads ? ((lead.paid / lead.realLeads) * 100).toFixed(1) : "0";
  const today = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(
    new Date(),
  );

  return (
    <>
      {/* Hero sapaan */}
      <section className="relative mb-7 animate-fade-up overflow-hidden rounded-[32px] bg-hero p-6 text-white shadow-xl shadow-navy-900/20 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <div className="pointer-events-none absolute -right-10 -top-20 h-72 w-72 animate-blob rounded-full bg-brand-500/40 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm text-brand-200">{today}</p>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
              {greeting()}, {session.name.split(" ")[0]} 👋
            </h1>
            <p className="mt-1.5 text-sm text-navy-200">
              {mine ? "Ringkasan lead dan peserta terdaftar yang Anda tangani." : "Ringkasan funnel lead dan pendaftaran kelas seluruh tim."}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/leads" className="btn-light">
              <Contact className="h-4 w-4" /> Master Lead
            </Link>
          </div>
        </div>
      </section>

      {unowned > 0 && (
        <Link
          href="/admin/leads?owner=none"
          className="group mb-4 flex animate-fade-up flex-wrap items-center justify-between gap-3 rounded-3xl bg-linear-to-r from-brand-50 to-sky-50 p-4 ring-1 ring-brand-200 transition hover:shadow-lg sm:p-5"
        >
          <span className="flex items-center gap-3 text-sm text-navy-800">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-brand-700 text-white">
              <UserPlus className="h-5 w-5" />
            </span>
            <span>
              <b>{unowned}</b> lead belum punya owner, termasuk pendaftar baru dari web. Ambil lead yang Anda layani agar tidak dihubungi dua kali.
            </span>
          </span>
          <span className="flex items-center gap-1 text-sm font-bold text-brand-700 transition group-hover:gap-2">
            Lihat & ambil <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      {(lead.overdue > 0 || lead.followUpToday > 0) && (
        <Link
          href={`/admin/leads?due=1${mine ? `&owner=${scope}` : ""}`}
          className="group mb-7 flex animate-fade-up flex-wrap items-center justify-between gap-3 rounded-3xl bg-linear-to-r from-amber-50 to-orange-50 p-4 ring-1 ring-amber-200 transition hover:shadow-lg sm:p-5"
        >
          <span className="flex items-center gap-3 text-sm text-amber-900">
            <span className="grid h-10 w-10 shrink-0 animate-pulse place-items-center rounded-2xl bg-amber-400 text-white">
              <AlarmClock className="h-5 w-5" />
            </span>
            <span>
              <b>{lead.followUpToday}</b> lead dijadwalkan follow-up hari ini & <b>{lead.overdue}</b> lead lewat jadwal.
            </span>
          </span>
          <span className="flex items-center gap-1 text-sm font-bold text-amber-800 transition group-hover:gap-2">
            Lihat daftar <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      {/* GRAFIK PENJUALAN (paling utama) */}
      <SectionTitle title={mine ? "Penjualan saya" : "Penjualan"} icon={CircleDollarSign} />
      <RangeFilter
        basePath="/admin"
        range={range}
        salesExport={{ ownerId: scope }}
        note={
          <>
            Periode grafik penjualan: <b className="text-navy-700">{range.label}</b> · lead berstatus Paid dari semua sumber, menurut <i>tanggal bayar</i>.
          </>
        }
      />
      <SalesTrendSection trend={trend} periodLabel={range.label} />

      <SectionTitle title={mine ? "Lead saya" : "Master Lead"} icon={Contact} />
      <div className="stagger mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total lead" value={lead.total} hint={`${lead.realLeads} lead valid`} icon={Users} tone="brand" />
        <StatCard label="Closing (Paid)" value={lead.paid} tone="green" hint={`Konversi ${leadConv}% dari lead valid`} icon={CircleCheck} />
        <StatCard label="Lost" value={lead.lost} tone="red" icon={CircleX} />
        <StatCard label="Follow-up terlambat" value={lead.overdue} tone="yellow" hint="Status belum Paid/Lost" icon={TriangleAlert} />
      </div>
      <div className="mb-10 grid gap-6 xl:grid-cols-3">
        <ChartCard title="Funnel status lead" subtitle="Jumlah lead di tiap tahap">
          <SimpleBarChart data={lead.funnel} />
        </ChartCard>
        <ChartCard title="Sumber lead" subtitle="Kanal yang menghasilkan lead">
          <SimpleBarChart data={lead.bySource} horizontal />
        </ChartCard>
        <ChartCard title="Lead masuk per minggu" subtitle="8 minggu terakhir">
          <TrendChart
            data={lead.weekly}
            series={[
              { key: "lead", label: "Lead" },
              { key: "paid", label: "Paid" },
            ]}
          />
        </ChartCard>
      </div>

      <SectionTitle
        title={mine ? "Peserta terdaftar yang saya tangani" : "Peserta terdaftar (web, semua produk)"}
        icon={ClipboardList}
        action={
          <Link href="/admin/pendaftar" className="flex items-center gap-1 text-sm font-semibold text-brand-600 transition hover:gap-2">
            Statistik lengkap <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />
      <div className="stagger mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pendaftar" value={reg.total} icon={ClipboardList} tone="navy" />
        <StatCard label="Lunas" value={reg.paid} tone="green" hint={`Konversi bayar ${reg.conversion}%`} icon={CircleCheck} />
        <StatCard label="Pendapatan kelas" value={formatRupiah(reg.revenue)} tone="blue" icon={CircleDollarSign} />
        <StatCard
          label="Kelas kuota terpenuhi"
          value={`${reg.classesReady}/${reg.quota.length}`}
          tone="brand"
          hint="Minimal 15 peserta lunas"
          icon={GraduationCap}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Pendaftar harian" subtitle="30 hari terakhir">
          <TrendChart
            data={reg.daily}
            series={[
              { key: "daftar", label: "Daftar" },
              { key: "lunas", label: "Lunas" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Sumber info pendaftar">
          <DonutChart data={reg.bySource} />
        </ChartCard>
      </div>
    </>
  );
}

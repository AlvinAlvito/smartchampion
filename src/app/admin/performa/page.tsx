import Link from "next/link";
import { requirePanel, statsScope } from "@/lib/session";
import { getAdminPerformance } from "@/lib/stats";
import { readDateRange } from "@/lib/date-range";
import { buildSalesTrend } from "@/lib/sales-trend";
import { RangeFilter } from "@/components/range-filter";
import { SalesTrendSection } from "@/components/sales-trend-section";
import { formatRupiah } from "@/lib/utils";
import { BookOpen, Brain, Crown, CircleDollarSign, ShoppingBag, Trophy } from "lucide-react";
import { PageTitle, StatCard } from "@/components/ui";
import { ChartCard, GroupedBarChart } from "@/components/charts";
import { prisma } from "@/lib/prisma";
import { ReportDownload } from "./report-download";
import { OpsPerformance } from "./ops-performance";
import { buildOpsReport, opsStaff } from "@/lib/ops-performance";
import { cn } from "@/lib/utils";

export const metadata = { title: "Performa Admin" };
export const dynamic = "force-dynamic";

export default async function PerformaPage({ searchParams }: PageProps<"/admin/performa">) {
  const session = await requirePanel();
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const monitor = session.role === "ROOT" || session.role === "SUPERADMIN";

  // Admin SmartChampion (operasional) → KPI dari log aktivitas; Root/Superadmin bisa beralih ke tab tim ini
  if (session.role === "SMARTCHAMPION" || (monitor && get("tim") === "ops")) {
    const range = readDateRange(get, "week");
    const staff = monitor ? (await opsStaff()).map((s) => ({ id: s.id, name: s.name })) : [];
    const selected = monitor ? staff.find((s) => s.id === Number(get("admin")))?.id ?? null : session.userId;
    const report = await buildOpsReport(range, selected ? { ownerId: selected, ownerName: staff.find((s) => s.id === selected)?.name ?? session.name } : { ownerName: "Semua Admin SmartChampion" });
    return (
      <OpsPerformance
        report={report}
        range={range}
        monitor={monitor}
        staff={staff}
        selected={monitor ? selected : null}
        group={["kelas", "pertemuan", "tutor", "games"].includes(get("grup") ?? "") ? get("grup")! : ""}
        teamSwitch={monitor ? <TeamSwitch active="ops" /> : undefined}
      />
    );
  }

  // Akun ADMIN hanya melihat statistiknya sendiri; SUPERADMIN melihat semua admin
  const scope = statsScope(session);
  const isAdmin = scope !== undefined;
  const range = readDateRange(get);
  const [{ rows, sales, contactLabel }, staff] = await Promise.all([
    getAdminPerformance(range, scope),
    isAdmin
      ? null
      : prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPERADMIN"] } }, select: { id: true, name: true }, orderBy: [{ role: "asc" }, { id: "asc" }] }),
  ]);
  // Query periode aktif → diteruskan ke unduhan laporan
  const reportQuery = new URLSearchParams(
    range.preset === "custom" ? { ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) } : { preset: range.preset },
  ).toString();

  const coc = sales.products.find((p) => p.key === "COC")!;
  const mimpi = sales.products.find((p) => p.key === "Mimpi.mu")!;
  const vip = sales.products.find((p) => p.key === "VIP Privat")!;
  const other = sales.products.find((p) => p.key === "Lainnya")!;
  const totalUnits = coc.units + vip.units + mimpi.units + other.units;
  const missingNominal = sales.products.reduce((s, p) => s + p.missingNominal, 0);
  const leadsLink = (extra: string) => `/admin/leads?${extra}`;
  const ownerQs = isAdmin ? `&owner=${scope}` : "";

  return (
    <>
      <PageTitle
        icon={Trophy}
        eyebrow="Kinerja"
        title={isAdmin ? "Performa Saya" : "Performa Admin"}
        subtitle={
          isAdmin
            ? "Statistik lead dan penjualan yang Anda tangani."
            : "Dinilai dari berapa chat yang jadi lead, trial, dan transaksi, bukan dari banyaknya chat (Program Kerja §17.2)."
        }
      />

      {!isAdmin && <TeamSwitch active="sales" />}

      {/* FILTER PERIODE */}
      <RangeFilter
        basePath="/admin/performa"
        range={range}
        salesExport={{ ownerId: scope }}
        note={
          <>
            Periode: <b className="text-navy-700">{range.label}</b>. Penjualan dihitung dari <i>tanggal bayar</i>. Jumlah lead &amp; status dihitung dari lead
            yang <i>masuk</i> di periode ini. Follow-up terlambat selalu kondisi saat ini.
          </>
        }
      />

      <ReportDownload query={reportQuery} periodLabel={range.label} staff={staff ?? undefined} />

      {/* GRAFIK PENJUALAN (paling utama) */}
      <SalesTrendSection trend={buildSalesTrend(sales, range)} periodLabel={range.label} />

      {/* PENJUALAN PRODUK */}
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-navy-500">
        <CircleDollarSign className="h-4 w-4 text-brand-500" /> Penjualan produk
      </h2>
      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total terjual"
          value={`${totalUnits} produk`}
          hint={`${sales.transactions} transaksi · ${formatRupiah(sales.revenueTotal)}`}
          tone="brand"
          icon={ShoppingBag}
        />
        <div className="card relative overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-1 bg-linear-to-b from-brand-400 to-brand-700" />
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-navy-400">
            <BookOpen className="h-4 w-4 text-brand-600" /> Champion Online Class (COC)
          </p>
          <p className="mt-1 text-2xl font-bold">
            {coc.units} <span className="text-sm font-normal text-navy-500">terjual</span>
          </p>
          <p className="text-sm font-semibold text-brand-700">{formatRupiah(coc.revenue)}</p>
          {coc.byPaket.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-navy-500">
              {coc.byPaket.slice(0, 3).map((p) => (
                <li key={p.name} className="flex justify-between gap-2">
                  <span className="truncate">{p.name}</span>
                  <b>{p.value}</b>
                </li>
              ))}
              {coc.byPaket.length > 3 && <li className="text-navy-400">+{coc.byPaket.length - 3} kelas/paket lain</li>}
            </ul>
          )}
        </div>
        <div className="card relative overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-1 bg-linear-to-b from-amber-300 to-amber-600" />
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-navy-400">
            <Crown className="h-4 w-4 text-amber-500" /> VIP Privat
          </p>
          <p className="mt-1 text-2xl font-bold">
            {vip.units} <span className="text-sm font-normal text-navy-500">terjual</span>
          </p>
          <p className="text-sm font-semibold text-amber-700">{formatRupiah(vip.revenue)}</p>
          {vip.byPaket.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-navy-500">
              {vip.byPaket.slice(0, 3).map((p) => (
                <li key={p.name} className="flex justify-between gap-2">
                  <span className="truncate">{p.name}</span>
                  <b>{p.value}</b>
                </li>
              ))}
              {vip.byPaket.length > 3 && <li className="text-navy-400">+{vip.byPaket.length - 3} paket lain</li>}
            </ul>
          )}
        </div>
        <div className="card relative overflow-hidden">
          <span className="absolute inset-y-0 left-0 w-1 bg-linear-to-b from-sky-400 to-navy-600" />
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-navy-400">
            <Brain className="h-4 w-4 text-sky-600" /> Mimpi.mu
          </p>
          <p className="mt-1 text-2xl font-bold">
            {mimpi.units} <span className="text-sm font-normal text-navy-500">terjual</span>
          </p>
          <p className="text-sm font-semibold text-sky-700">{formatRupiah(mimpi.revenue)}</p>
          {mimpi.byPaket.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-navy-500">
              {mimpi.byPaket.map((p) => (
                <li key={p.name} className="flex justify-between gap-2">
                  <span>{p.name}</span>
                  <b>{p.value}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mb-3 grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <ChartCard title={isAdmin ? "Produk terjual" : "Produk terjual per admin"} subtitle={range.label}>
            <GroupedBarChart
              data={sales.byAdmin.map((a) => ({
                name: a.name,
                coc: a.COC.units,
                vip: a["VIP Privat"].units,
                mimpi: a["Mimpi.mu"].units,
                ...(other.units ? { lain: a.Lainnya.units } : {}),
              }))}
              series={[
                { key: "coc", label: "COC" },
                { key: "vip", label: "VIP Privat" },
                { key: "mimpi", label: "Mimpi.mu" },
                ...(other.units ? [{ key: "lain", label: "Lainnya" }] : []),
              ]}
            />
          </ChartCard>
        </div>
        <div className="card overflow-x-auto p-0 xl:col-span-3">
          <table className="table min-w-[560px]">
            <thead>
              <tr>
                <th>Admin</th>
                <th className="text-right">COC</th>
                <th className="text-right">VIP</th>
                <th className="text-right">Mimpi.mu</th>
                {other.units > 0 && <th className="text-right">Lainnya</th>}
                <th className="text-right">Total</th>
                {!isAdmin && <th className="text-right">Porsi</th>}
              </tr>
            </thead>
            <tbody>
              {sales.byAdmin.map((a) => (
                <tr key={a.id ?? "none"}>
                  <td className="font-medium">{a.id == null ? <span className="text-rose-600">{a.name}</span> : a.name}</td>
                  <td className="text-right">
                    <b>{a.COC.units}</b>
                    <div className="text-xs text-navy-500">{formatRupiah(a.COC.revenue)}</div>
                  </td>
                  <td className="text-right">
                    <b>{a["VIP Privat"].units}</b>
                    <div className="text-xs text-navy-500">{formatRupiah(a["VIP Privat"].revenue)}</div>
                  </td>
                  <td className="text-right">
                    <b>{a["Mimpi.mu"].units}</b>
                    <div className="text-xs text-navy-500">{formatRupiah(a["Mimpi.mu"].revenue)}</div>
                  </td>
                  {other.units > 0 && (
                    <td className="text-right">
                      <b>{a.Lainnya.units}</b>
                      <div className="text-xs text-navy-500">{formatRupiah(a.Lainnya.revenue)}</div>
                    </td>
                  )}
                  <td className="text-right">
                    <b>{a.units}</b>
                    <div className="text-xs text-navy-500">{formatRupiah(a.revenue)}</div>
                  </td>
                  {!isAdmin && <td className="text-right text-navy-600">{totalUnits ? Math.round((a.units / totalUnits) * 100) : 0}%</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="mb-10 space-y-0.5 text-xs text-navy-500">
        <li>
          • Terjual = lead berstatus <b>Paid</b> di Master Lead, termasuk pendaftaran COC dari web (tercatat otomatis).
        </li>
        <li>
          • Satu orang bisa tercatat lebih dari sekali dengan nama/email berbeda. Sistem mencocokkan <b>no. WA, email, atau nama mirip</b>: penjualan tanpa
          owner dikreditkan ke admin pemilik lead orang yang sama{sales.attributedCount > 0 ? ` (${sales.attributedCount} penjualan di periode ini)` : ""}, dan
          lead yang belum Paid tetapi orangnya sudah membayar ikut dihitung di konversi (angka <span className="text-sky-600">+N</span>). Data Master Lead tidak
          diubah.
        </li>
        <li>• Penjualan Mimpi.mu yang tidak dicatat admin di Master Lead (mis. bundling di checkout POSI) belum terhitung.</li>
        {sales.bundleCount > 0 && (
          <li>• {sales.bundleCount} transaksi berproduk &quot;Mimpi.mu &amp; COC&quot; dihitung di kedua produk; nominalnya hanya masuk ke total.</li>
        )}
        {missingNominal > 0 && (
          <li className="text-amber-700">
            • {missingNominal} penjualan belum diisi nominalnya, sehingga pendapatan di atas lebih kecil dari sebenarnya.{" "}
            <Link href={leadsLink(`status=Paid${ownerQs}`)} className="underline">
              Lengkapi di Master Lead
            </Link>
          </li>
        )}
      </ul>

      {/* KINERJA FOLLOW-UP */}
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-navy-500">
        <Trophy className="h-4 w-4 text-brand-500" /> Kinerja follow-up lead
      </h2>
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <div key={r.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{r.name}</p>
              <span className="badge bg-brand-100 text-brand-700">{r.role === "SUPERADMIN" ? "Team Leader" : "Admin"}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-navy-50 p-2">
                <p className="text-xl font-bold">{r.totalLeads}</p>
                <p className="text-xs text-navy-500">Lead masuk</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-2">
                <p className="text-xl font-bold text-emerald-700">{r.sold}</p>
                <p className="text-xs text-navy-500">Terjual</p>
              </div>
              <div className="rounded-xl bg-brand-50 p-2">
                <p className="text-xl font-bold text-brand-700">{r.conversion}%</p>
                <p className="text-xs text-navy-500">Konversi</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-navy-500">COC / VIP / Mimpi.mu terjual</dt>
              <dd className="text-right font-medium">
                {r.soldCoc} / {r.soldVip} / {r.soldMimpimu}
              </dd>
              <dt className="text-navy-500">Pendapatan</dt>
              <dd className="text-right font-medium">{formatRupiah(r.revenue)}</dd>
              <dt className="text-navy-500">{contactLabel}</dt>
              <dd className="text-right font-medium">{r.contacted}</dd>
              <dt className="text-navy-500">Follow-up terlambat</dt>
              <dd className={`text-right font-medium ${r.overdue ? "text-rose-600" : ""}`}>
                <Link href={leadsLink(`owner=${r.id}&due=1`)} className="hover:underline">
                  {r.overdue}
                </Link>
              </dd>
              {r.paidDetected > 0 && (
                <>
                  <dt className="text-navy-500" title="Status lead belum Paid, tetapi orangnya sudah membayar menurut data lain (no. WA / email / nama mirip)">
                    Paid terdeteksi lintas data
                  </dt>
                  <dd className="text-right font-medium text-sky-700">+{r.paidDetected}</dd>
                </>
              )}
              <dt className="text-navy-500">Pendaftar web ditangani</dt>
              <dd className="text-right font-medium">
                {r.registrationsPaid}/{r.registrations} lunas
              </dd>
            </dl>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <ChartCard title={isAdmin ? "Distribusi status lead saya" : "Distribusi status lead per admin"} subtitle={`Lead yang masuk: ${range.label}`}>
          <GroupedBarChart
            data={rows.map((r) => ({ name: r.name, dihubungi: r.dihubungi, followUp: r.followUp, pending: r.pending, paid: r.paid, lost: r.lost }))}
            series={[
              { key: "dihubungi", label: "Dihubungi" },
              { key: "followUp", label: "Follow-up" },
              { key: "pending", label: "Pending" },
              { key: "paid", label: "Paid" },
              { key: "lost", label: "Lost" },
            ]}
          />
        </ChartCard>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table min-w-[900px]">
          <thead>
            <tr>
              <th>Admin</th>
              <th>Lead</th>
              <th>Valid</th>
              <th>Baru</th>
              <th>Dihubungi</th>
              <th>Follow-up</th>
              <th>Trial</th>
              <th>Pending</th>
              <th>Paid</th>
              <th>Lost</th>
              <th>Konversi</th>
              <th>Terlambat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">
                  <Link href={leadsLink(`owner=${r.id}`)} className="hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td>{r.totalLeads}</td>
                <td>{r.realLeads}</td>
                <td>{r.baru}</td>
                <td>{r.dihubungi}</td>
                <td>{r.followUp}</td>
                <td>{r.trial}</td>
                <td>{r.pending}</td>
                <td className="font-semibold text-emerald-700">
                  {r.paid}
                  {r.paidDetected > 0 && (
                    <span className="ml-1 text-xs font-medium text-sky-600" title="Terdeteksi sudah membayar dari data lain (no. WA / email / nama mirip)">
                      +{r.paidDetected}
                    </span>
                  )}
                </td>
                <td>{r.lost}</td>
                <td>{r.conversion}%</td>
                <td className={r.overdue ? "font-semibold text-rose-600" : ""}>{r.overdue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-navy-500">
        Konversi = lead masuk di periode ini yang sudah Paid ÷ lead valid (bukan &quot;Bukan Lead&quot;) yang masuk di periode ini.
      </p>
    </>
  );
}

/** Root/Superadmin: pilih tim yang dipantau */
function TeamSwitch({ active }: { active: "sales" | "ops" }) {
  return (
    <div className="mb-5 inline-flex gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-navy-100">
      {[
        { k: "sales", label: "Admin Pelatihan (sales)", href: "/admin/performa" },
        { k: "ops", label: "Admin SmartChampion (operasional)", href: "/admin/performa?tim=ops" },
      ].map((t) => (
        <Link
          key={t.k}
          href={t.href}
          className={cn("rounded-xl px-4 py-2 text-sm font-semibold transition", active === t.k ? "bg-brand-600 text-white shadow" : "text-navy-500 hover:bg-navy-50")}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

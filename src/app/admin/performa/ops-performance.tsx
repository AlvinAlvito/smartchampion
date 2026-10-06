import Link from "next/link";
import { Activity, BookOpen, CalendarCheck2, CircleAlert, CircleCheck, CircleMinus, CircleX, Gamepad2, GraduationCap, History, Presentation, ShieldCheck, Trophy } from "lucide-react";
import type { DateRange } from "@/lib/date-range";
import { OPS_RANGE_PRESETS } from "@/lib/date-range";
import type { OpsReport } from "@/lib/ops-performance";
import { GROUP_COLOR, GROUP_LABEL } from "@/lib/activity-shared";
import { cn, formatDate } from "@/lib/utils";
import { PageTitle, StatCard } from "@/components/ui";
import { RangeFilter, rangeQuery } from "@/components/range-filter";
import { ChartCard, StackedBarChart } from "@/components/charts";
import { ReportDownload } from "./report-download";

const GROUP_ICON = { kelas: BookOpen, pertemuan: CalendarCheck2, tutor: Presentation, games: Gamepad2 } as const;
const STATUS = {
  baik: { icon: CircleCheck, cls: "text-emerald-600", bar: "bg-emerald-500", label: "Tercapai" },
  cukup: { icon: CircleAlert, cls: "text-amber-600", bar: "bg-amber-500", label: "Hampir" },
  kurang: { icon: CircleX, cls: "text-rose-600", bar: "bg-rose-500", label: "Perlu perhatian" },
  na: { icon: CircleMinus, cls: "text-navy-300", bar: "bg-navy-200", label: "Belum ada data" },
} as const;

/** Halaman Performa untuk Admin SmartChampion (operasional pelatihan) — juga dipantau Root/Superadmin. */
export function OpsPerformance({
  report,
  range,
  monitor,
  staff,
  selected,
  group,
  teamSwitch,
}: {
  report: OpsReport;
  range: DateRange;
  monitor: boolean;
  staff: { id: number; name: string }[];
  selected: number | null;
  group: string;
  teamSwitch?: React.ReactNode;
}) {
  const base = (over: Record<string, string | number | null>) => {
    const q = new URLSearchParams(rangeQuery(range));
    const all: Record<string, string | number | null> = { tim: monitor ? "ops" : null, admin: selected, grup: group || null, ...over };
    for (const [k, v] of Object.entries(all)) if (v != null && v !== "") q.set(k, String(v));
    return `/admin/performa?${q.toString()}`;
  };
  const reportQuery = new URLSearchParams(rangeQuery(range)).toString();
  const logs = group ? report.logs.filter((l) => l.group === group) : report.logs;
  const scoreTone = report.score >= 85 ? "text-emerald-500" : report.score >= 65 ? "text-amber-500" : "text-rose-500";

  return (
    <>
      <PageTitle
        icon={Trophy}
        eyebrow="Kinerja operasional"
        title={monitor ? "Performa Admin SmartChampion" : "Performa Saya"}
        subtitle="Dihitung dari log aktivitas di menu Tutor, Produk & Materi (kelas, pertemuan, materi, worksheet, absensi, nilai, sertifikat), dan Games — plus kesiapan operasional kelas."
      />
      {teamSwitch}

      <RangeFilter
        basePath="/admin/performa"
        range={range}
        presets={OPS_RANGE_PRESETS}
        extraQuery={{ ...(monitor ? { tim: "ops" } : {}), ...(selected ? { admin: String(selected) } : {}) }}
        note={
          <>
            Periode: <b className="text-navy-700">{report.range.label}</b> · {report.workdays} hari kerja. Volume kerja dihitung dari aktivitas yang tercatat otomatis
            setiap kali data disimpan/diubah/dihapus.
          </>
        }
      />

      {monitor && staff.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-bold uppercase tracking-wide text-navy-400">Admin:</span>
          {[{ id: 0, name: "Semua" }, ...staff].map((s) => (
            <Link
              key={s.id}
              href={base({ admin: s.id || null })}
              scroll={false}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium",
                (selected ?? 0) === s.id ? "bg-navy-900 text-white" : "bg-white text-navy-600 ring-1 ring-navy-100 hover:bg-navy-50",
              )}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

      <ReportDownload
        key={selected ?? 0}
        query={reportQuery}
        periodLabel={report.range.label}
        staff={monitor ? staff : undefined}
        endpoint="/api/admin/performa-ops"
        description="Excel: KPI, rekap harian, per kelas/game & log aktivitas · PDF: laporan lengkap dengan grafik"
        defaultOwner={selected ? String(selected) : ""}
      />

      {/* SKOR + VOLUME */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="card flex flex-col items-center justify-center text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-400">Skor KPI operasional</p>
          <p className={cn("mt-1 text-6xl font-extrabold", scoreTone)}>{report.score}</p>
          <p className="text-xs text-navy-500">rata-rata ketercapaian {report.kpis.filter((k) => k.status !== "na").length} KPI</p>
          <div className="mt-4 grid w-full grid-cols-3 gap-2 text-center">
            {[
              { l: "Aktivitas", v: report.total },
              { l: "Hari aktif", v: `${report.activeDays}/${report.workdays}` },
              { l: "Per hari", v: report.perDay },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl bg-navy-50/70 p-2">
                <p className="text-lg font-extrabold text-navy-900">{x.v}</p>
                <p className="text-[10px] font-semibold uppercase text-navy-400">{x.l}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {report.counts.map((c) => (
            <StatCard key={c.key} label={c.label} value={c.value.toLocaleString("id-ID")} hint={c.hint} icon={GROUP_ICON[c.group]} tone={c.group === "kelas" ? "brand" : c.group === "pertemuan" ? "green" : c.group === "tutor" ? "yellow" : "red"} />
          ))}
        </div>
      </div>

      {/* KPI */}
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-navy-500">
        <ShieldCheck className="h-4 w-4 text-brand-500" /> KPI operasional
      </h2>
      <div className="mb-7 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {report.kpis.map((k) => {
          const st = STATUS[k.status];
          return (
            <div key={k.key} className="card p-4!">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-navy-900">{k.label}</p>
                <span className={cn("flex shrink-0 items-center gap-1 text-xs font-bold", st.cls)}>
                  <st.icon className="h-4 w-4" /> {st.label}
                </span>
              </div>
              <p className="mt-1 text-2xl font-extrabold text-navy-900">
                {k.status === "na" ? "–" : `${k.pct}%`} <span className="text-xs font-semibold text-navy-400">target ≥ {k.target}%</span>
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-navy-50">
                <div className={cn("h-full rounded-full", st.bar)} style={{ width: `${Math.min(100, k.pct)}%` }} />
              </div>
              <p className="mt-2 text-xs text-navy-500">
                {k.value}/{k.total} · {k.basis}
                {k.team && <span className="ml-1 rounded bg-navy-50 px-1 text-[10px] font-semibold text-navy-400">tim</span>}
              </p>
            </div>
          );
        })}
      </div>

      {/* TREN */}
      <div className="mb-7 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard title={report.weekly ? "Aktivitas per pekan" : "Aktivitas per hari"} subtitle={`${report.range.label} · per kelompok menu`} height="h-72">
            <StackedBarChart
              data={report.trend}
              series={(Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[]).map((g) => ({ key: g, label: GROUP_LABEL[g], color: GROUP_COLOR[g] }))}
            />
          </ChartCard>
        </div>
        <div className="card">
          <p className="mb-3 font-bold text-navy-900">Rincian per jenis data</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-navy-400">
                <th className="pb-2">Data</th>
                <th className="pb-2 text-right">Tambah</th>
                <th className="pb-2 text-right">Ubah</th>
                <th className="pb-2 text-right">Hapus</th>
              </tr>
            </thead>
            <tbody>
              {report.byEntity.map((e) => (
                <tr key={e.entity} className="border-t border-navy-50">
                  <td className="py-1.5 font-semibold text-navy-800">{e.label}</td>
                  <td className="py-1.5 text-right">{e.create}</td>
                  <td className="py-1.5 text-right">{e.update}</td>
                  <td className="py-1.5 text-right">{e.del}</td>
                </tr>
              ))}
              {!report.byEntity.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-navy-400">
                    Belum ada aktivitas di periode ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PER ADMIN */}
      {report.perAdmin.length > 0 && (
        <div className="card mb-7 overflow-x-auto p-0!">
          <table className="table min-w-[640px]">
            <thead>
              <tr>
                <th>Admin SmartChampion</th>
                <th className="text-right">Aktivitas</th>
                <th className="text-right">Hari aktif</th>
                <th className="text-right">Kelas</th>
                <th className="text-right">Games</th>
                <th>Terakhir aktif</th>
              </tr>
            </thead>
            <tbody>
              {report.perAdmin.map((a) => (
                <tr key={a.id}>
                  <td className="font-bold text-navy-900">
                    {a.name}
                    {!a.isActive && <span className="ml-1 text-xs text-navy-400">(nonaktif)</span>}
                  </td>
                  <td className="text-right font-semibold">{a.total}</td>
                  <td className="text-right">{a.activeDays}</td>
                  <td className="text-right">{a.kelas}</td>
                  <td className="text-right">{a.games}</td>
                  <td className="text-xs text-navy-500">{a.last ? formatDate(a.last, true) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PER KELAS & GAME */}
      <div className="mb-7 grid gap-6 xl:grid-cols-3">
        <div className="card overflow-x-auto p-0! xl:col-span-2">
          <p className="px-5 pt-4 font-bold text-navy-900">Kelas yang dikelola</p>
          <table className="table min-w-[680px]">
            <thead>
              <tr>
                <th>Kelas</th>
                <th className="text-right">Kelas/paket</th>
                <th className="text-right">Materi</th>
                <th className="text-right">Pertemuan</th>
                <th className="text-right">Worksheet</th>
                <th className="text-right">Absensi/nilai</th>
                <th className="text-right">Kelulusan</th>
              </tr>
            </thead>
            <tbody>
              {report.perKelas.slice(0, 20).map((k) => (
                <tr key={k.id}>
                  <td className="max-w-[240px]">
                    <Link href={`/admin/produk/${k.id}`} className="font-semibold text-navy-900 hover:text-brand-700">
                      {k.name}
                    </Link>
                    <p className="text-[11px] text-navy-400">terakhir {formatDate(k.last, true)}</p>
                  </td>
                  <td className="text-right">{k.kelas}</td>
                  <td className="text-right">{k.materi}</td>
                  <td className="text-right">{k.pertemuan}</td>
                  <td className="text-right">{k.worksheet}</td>
                  <td className="text-right">{k.absensiNilai}</td>
                  <td className="text-right">{k.kelulusan}</td>
                </tr>
              ))}
              {!report.perKelas.length && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-navy-400">
                    Belum ada kelas yang dikelola di periode ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="card">
          <p className="mb-3 font-bold text-navy-900">Games yang dikelola</p>
          <ul className="space-y-2">
            {report.perGame.slice(0, 12).map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/admin/games/${g.id}`} className="min-w-0 truncate font-semibold text-navy-800 hover:text-brand-700">
                  {g.name}
                </Link>
                <span className="shrink-0 text-xs text-navy-500">
                  {g.total} aksi · {g.soal} soal
                </span>
              </li>
            ))}
            {!report.perGame.length && <li className="py-6 text-center text-sm text-navy-400">Belum ada games yang dikelola.</li>}
          </ul>
        </div>
      </div>

      {/* LOG */}
      <div id="log" className="card scroll-mt-24 p-0!">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <p className="flex items-center gap-2 font-bold text-navy-900">
            <History className="h-4 w-4 text-brand-600" /> Log aktivitas
            <span className="text-xs font-medium text-navy-400">
              ({report.logTotal.toLocaleString("id-ID")} aksi{report.logTotal > 500 ? ", 500 terbaru ditampilkan — lengkapnya di Excel" : ""})
            </span>
          </p>
          <div className="flex flex-wrap gap-1">
            {[["", "Semua"], ...Object.entries(GROUP_LABEL)].map(([k, l]) => (
              <Link
                key={k || "all"}
                href={`${base({ grup: k || null })}#log`}
                scroll={false}
                className={cn("rounded-xl px-2.5 py-1 text-xs font-bold", group === k ? "bg-navy-900 text-white" : "bg-navy-50 text-navy-500 hover:bg-navy-100")}
              >
                {l}
              </Link>
            ))}
          </div>
        </div>
        <ul className="mt-3 max-h-[560px] divide-y divide-navy-50 overflow-y-auto">
          {logs.map((l) => {
            const Icon = GROUP_ICON[l.group as keyof typeof GROUP_ICON] ?? Activity;
            return (
              <li key={l.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white" style={{ background: GROUP_COLOR[l.group as keyof typeof GROUP_COLOR] }}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-navy-800">{l.text}</p>
                  <p className="text-[11px] text-navy-400">
                    {formatDate(l.at, true)}
                    {monitor ? ` · ${l.user}` : ""}
                    {l.kelas && !l.text.includes(l.kelas) ? ` · ${l.kelas}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
          {!logs.length && (
            <li className="flex flex-col items-center gap-2 py-12 text-center text-sm text-navy-400">
              <GraduationCap className="h-8 w-8 text-navy-200" /> Belum ada aktivitas tercatat di periode ini.
            </li>
          )}
        </ul>
      </div>
    </>
  );
}

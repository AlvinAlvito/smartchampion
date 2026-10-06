import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { readDateRange } from "@/lib/date-range";
import { buildOpsReport, resolveOpsScope, type Kpi, type OpsReport } from "@/lib/ops-performance";
import { GROUP_LABEL, actionLabel, entityLabel } from "@/lib/activity-shared";
import { buildWorkbookSheets, FMT, sheet, todayStamp, xlsxResponse } from "@/lib/excel";
import { slugify } from "@/lib/utils";
import { guardRoute } from "@/lib/security";
import { blockReadOnlyDownload } from "@/lib/read-only";

const STATUS: Record<Kpi["status"], string> = { baik: "Tercapai", cukup: "Hampir", kurang: "Perlu perhatian", na: "Belum ada data" };

/** Laporan performa Admin SmartChampion (Excel) — mengikuti filter periode halaman Performa. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`report-xlsx:${session.userId}`, 10, 60000);
  if (limited) return limited;
  const params = request.nextUrl.searchParams;
  const scope = await resolveOpsScope(session, params.get("owner"));
  if (!scope) return NextResponse.json({ message: "forbidden" }, { status: 403 });
  const range = readDateRange((k) => params.get(k) ?? undefined, "week");
  const r = await buildOpsReport(range, scope, { logLimit: 20_000 });
  const sub = `${scope.ownerName} · ${r.range.label} · dibuat ${todayStamp()} oleh ${session.name}`;

  type Row = { a: string; b: string | number; c?: string | number; d?: string };
  const summary: Row[] = [
    { a: "Skor KPI operasional", b: r.score, d: "rata-rata ketercapaian KPI (maks 100)" },
    { a: "Total aktivitas", b: r.total },
    { a: "Hari aktif", b: `${r.activeDays}/${r.workdays}`, d: "hari kerja Senin–Sabtu" },
    { a: "Rata-rata aktivitas / hari kerja", b: r.perDay },
    ...r.counts.map((c) => ({ a: c.label, b: c.value, d: c.hint ?? "" })),
  ];
  const buffer = await buildWorkbookSheets([
    sheet<Row>({
      sheetName: "Ringkasan",
      title: "Laporan Performa Admin SmartChampion — Pelatihan POSI",
      subtitle: sub,
      columns: [
        { header: "Indikator", value: (x) => x.a, width: 36 },
        { header: "Nilai", value: (x) => x.b, width: 14 },
        { header: "Keterangan", value: (x) => x.d, width: 50 },
      ],
      rows: summary,
    }),
    sheet<Kpi>({
      sheetName: "KPI",
      title: "KPI operasional",
      subtitle: sub,
      columns: [
        { header: "KPI", value: (k) => k.label, width: 36 },
        { header: "Capaian (%)", value: (k) => (k.status === "na" ? null : k.pct) },
        { header: "Target (%)", value: (k) => k.target },
        { header: "Tercapai", value: (k) => k.value },
        { header: "Dari", value: (k) => k.total },
        { header: "Status", value: (k) => STATUS[k.status] },
        { header: "Lingkup", value: (k) => (k.team ? "Tim operasional" : "Admin") },
        { header: "Cara hitung", value: (k) => k.basis, width: 60 },
      ],
      rows: r.kpis,
    }),
    sheet<OpsReport["trend"][number]>({
      sheetName: r.weekly ? "Rekap Pekanan" : "Rekap Harian",
      title: r.weekly ? "Aktivitas per pekan" : "Aktivitas per hari",
      subtitle: sub,
      columns: [
        { header: r.weekly ? "Pekan" : "Tanggal", value: (t) => String(t.label), width: 18 },
        ...(Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[]).map((g) => ({ header: GROUP_LABEL[g], value: (t: OpsReport["trend"][number]) => Number(t[g]) })),
        { header: "Total", value: (t) => (Object.keys(GROUP_LABEL) as string[]).reduce((n, g) => n + Number(t[g]), 0) },
      ],
      rows: r.trend,
    }),
    sheet<OpsReport["perKelas"][number]>({
      sheetName: "Per Kelas",
      title: "Kelas yang dikelola",
      subtitle: sub,
      columns: [
        { header: "Kelas", value: (k) => k.name, width: 40 },
        { header: "Total aksi", value: (k) => k.total },
        { header: "Kelas/paket", value: (k) => k.kelas },
        { header: "Materi", value: (k) => k.materi },
        { header: "Pertemuan", value: (k) => k.pertemuan },
        { header: "Worksheet", value: (k) => k.worksheet },
        { header: "Absensi/nilai", value: (k) => k.absensiNilai },
        { header: "Kelulusan", value: (k) => k.kelulusan },
        { header: "Terakhir", value: (k) => k.last, numFmt: FMT.dateTime },
      ],
      rows: r.perKelas,
    }),
    sheet<OpsReport["perGame"][number]>({
      sheetName: "Per Game",
      title: "Games yang dikelola",
      subtitle: sub,
      columns: [
        { header: "Game", value: (g) => g.name, width: 40 },
        { header: "Total aksi", value: (g) => g.total },
        { header: "Soal ditambah/diubah", value: (g) => g.soal },
        { header: "Terakhir", value: (g) => g.last, numFmt: FMT.dateTime },
      ],
      rows: r.perGame,
    }),
    ...(r.perAdmin.length
      ? [
          sheet<OpsReport["perAdmin"][number]>({
            sheetName: "Per Admin",
            title: "Aktivitas per Admin SmartChampion",
            subtitle: sub,
            columns: [
              { header: "Admin", value: (a) => a.name, width: 28 },
              { header: "Aktivitas", value: (a) => a.total },
              { header: "Hari aktif", value: (a) => a.activeDays },
              { header: "Kelas", value: (a) => a.kelas },
              { header: "Games", value: (a) => a.games },
              { header: "Terakhir aktif", value: (a) => a.last, numFmt: FMT.dateTime },
            ],
            rows: r.perAdmin,
          }),
        ]
      : []),
    sheet<OpsReport["logs"][number]>({
      sheetName: "Log Aktivitas",
      title: "Log aktivitas",
      subtitle: `${sub} · ${r.logs.length} aksi`,
      columns: [
        { header: "Waktu", value: (l) => l.at, numFmt: FMT.dateTime },
        { header: "Admin", value: (l) => l.user },
        { header: "Menu", value: (l) => GROUP_LABEL[l.group as keyof typeof GROUP_LABEL] ?? l.group },
        { header: "Data", value: (l) => entityLabel(l.entity) },
        { header: "Aksi", value: (l) => actionLabel(l.action) },
        { header: "Rincian", value: (l) => l.text, width: 60 },
        { header: "Kelas", value: (l) => l.kelas, width: 30 },
        { header: "Game", value: (l) => l.game, width: 26 },
      ],
      rows: r.logs,
    }),
  ]);
  return xlsxResponse(buffer, `laporan-performa-${slugify(scope.ownerName)}-${todayStamp()}.xlsx`);
}

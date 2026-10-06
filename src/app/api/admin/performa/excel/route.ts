import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isStaff } from "@/lib/session";
import { buildWorkbookSheets, sheet, todayStamp, xlsxResponse, type ExcelColumn } from "@/lib/excel";
import { blastExportColumns, leadExportColumns, type LeadExportRow } from "@/lib/export-columns";
import { inReportRange, readReportRange, reportBlastWhere, reportLeadWhere, resolveReportScope } from "@/lib/performance-report";
import { slugify } from "@/lib/utils";
import { guardRoute } from "@/lib/security";
import { blockReadOnlyDownload } from "@/lib/read-only";

/** Laporan performa (Excel): sheet 1 Master Lead, sheet 2 Data Blast — mengikuti filter periode halaman Performa. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  // Superadmin = mode lihat saja: tidak boleh mengunduh
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session || !isStaff(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`report-xlsx:${session.userId}`, 10, 60000);
  if (limited) return limited;
  const params = request.nextUrl.searchParams;
  const scope = await resolveReportScope(session, params.get("owner"));
  if (!scope) return NextResponse.json({ message: "owner tidak valid" }, { status: 400 });
  const range = readReportRange(params);

  const [leads, blasts] = await Promise.all([
    prisma.lead.findMany({
      where: reportLeadWhere(range, scope),
      include: { owner: { select: { name: true } } },
      orderBy: [{ tanggalMasuk: "asc" }, { id: "asc" }],
    }),
    prisma.blast.findMany({
      where: reportBlastWhere(range, scope),
      include: { owner: { select: { name: true } } },
      orderBy: [{ tanggal: "asc" }, { id: "asc" }],
    }),
  ]);

  // Kolom penanda: kenapa lead ini masuk laporan (masuk di periode / dibayar di periode)
  const hasRange = Boolean(range.start || range.end);
  const periodCol: ExcelColumn<LeadExportRow> = {
    header: "Periode",
    width: 18,
    value: (l) => {
      if (!hasRange) return "Semua waktu";
      const masuk = inReportRange(l.tanggalMasuk, range);
      const bayar = l.statusFunnel === "Paid" && inReportRange(l.tanggalBayar, range);
      return masuk && bayar ? "Masuk & bayar" : bayar ? "Bayar (masuk sebelumnya)" : "Masuk";
    },
  };
  const subtitle = (n: number, noun: string) => `${scope.ownerName} · Periode: ${range.label} · ${n} ${noun} · diunduh ${todayStamp()} oleh ${session.name}`;

  const buffer = await buildWorkbookSheets([
    sheet({
      sheetName: "Master Lead",
      title: `Master Lead — Laporan Performa ${scope.ownerName}`,
      subtitle: subtitle(leads.length, "lead (masuk atau dibayar di periode ini)"),
      columns: [...leadExportColumns, periodCol],
      rows: leads,
    }),
    sheet({
      sheetName: "Data Blast",
      title: `Data Blast — Laporan Performa ${scope.ownerName}`,
      subtitle: subtitle(blasts.length, "data blast"),
      columns: blastExportColumns,
      rows: blasts,
    }),
  ]);
  const periode = range.from || range.to ? `${range.from || "awal"}_${range.to || "sekarang"}` : range.preset;
  return xlsxResponse(buffer, `laporan-performa-${slugify(scope.ownerName)}-${periode}.xlsx`);
}

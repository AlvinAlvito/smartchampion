import { NextResponse, type NextRequest } from "next/server";
import { getSession, isStaff } from "@/lib/session";
import { buildPerformanceReport, readReportRange, resolveReportScope } from "@/lib/performance-report";
import { renderPerformancePdf } from "@/lib/pdf/performance-report-pdf";
import { slugify } from "@/lib/utils";
import { guardRoute } from "@/lib/security";
import { blockReadOnlyDownload } from "@/lib/read-only";

export const runtime = "nodejs";

/** Laporan performa (PDF) lengkap dengan grafik — mengikuti filter periode halaman Performa. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  // Superadmin = mode lihat saja: tidak boleh mengunduh
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session || !isStaff(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`report-pdf:${session.userId}`, 6, 60000);
  if (limited) return limited;
  const params = request.nextUrl.searchParams;
  const scope = await resolveReportScope(session, params.get("owner"));
  if (!scope) return NextResponse.json({ message: "owner tidak valid" }, { status: 400 });
  const range = readReportRange(params);

  const report = await buildPerformanceReport(range, scope, session.name);
  const pdf = await renderPerformancePdf(report);
  const periode = range.from || range.to ? `${range.from || "awal"}_${range.to || "sekarang"}` : range.preset;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="laporan-performa-${slugify(scope.ownerName)}-${periode}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

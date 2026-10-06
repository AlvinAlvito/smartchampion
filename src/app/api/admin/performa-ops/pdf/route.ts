import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { readDateRange } from "@/lib/date-range";
import { buildOpsReport, resolveOpsScope } from "@/lib/ops-performance";
import { renderOpsPdf } from "@/lib/pdf/ops-report-pdf";
import { slugify } from "@/lib/utils";
import { guardRoute } from "@/lib/security";
import { blockReadOnlyDownload } from "@/lib/read-only";

export const runtime = "nodejs";

/** Laporan performa Admin SmartChampion (PDF + grafik) — mengikuti filter periode halaman Performa. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`report-pdf:${session.userId}`, 6, 60000);
  if (limited) return limited;
  const params = request.nextUrl.searchParams;
  const scope = await resolveOpsScope(session, params.get("owner"));
  if (!scope) return NextResponse.json({ message: "forbidden" }, { status: 403 });
  const range = readDateRange((k) => params.get(k) ?? undefined, "week");
  const report = await buildOpsReport(range, scope);
  const pdf = await renderOpsPdf(report, session.name);
  const periode = range.from || range.to ? `${range.from || "awal"}_${range.to || "sekarang"}` : range.preset;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="laporan-performa-${slugify(scope.ownerName)}-${periode}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

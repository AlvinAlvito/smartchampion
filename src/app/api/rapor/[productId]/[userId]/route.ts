import { NextResponse, type NextRequest } from "next/server";
import { getSession, isPanel } from "@/lib/session";
import { getStudentReport } from "@/lib/class-report";
import { renderReportCardPdf } from "@/lib/pdf/report-card-pdf";
import { guardRoute } from "@/lib/security";
import { slugify } from "@/lib/utils";
import { blockReadOnlyDownload } from "@/lib/read-only";

export const runtime = "nodejs";

/** Rapor PDF. Peserta: hanya rapornya sendiri & setelah admin menerbitkan rapor kelas. Staf panel: semua peserta. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/rapor/[productId]/[userId]">) {
  const session = await getSession();
  // Superadmin = mode lihat saja: tidak boleh mengunduh
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`report-card:${session.userId}`, 30, 60_000);
  if (limited) return limited;
  const { productId, userId } = await ctx.params;
  const uid = Number(userId) || 0;
  const staff = isPanel(session.role);
  if (!staff && uid !== session.userId) return NextResponse.json({ message: "forbidden" }, { status: 403 });

  const report = await getStudentReport(Number(productId) || 0, uid);
  if (!report) return NextResponse.json({ message: "Rapor tidak ditemukan." }, { status: 404 });
  if (!staff && !report.product.reportPublished) return NextResponse.json({ message: "Rapor belum diterbitkan." }, { status: 403 });
  const pdf = await renderReportCardPdf(report);
  const file = `rapor-${slugify(report.student.name)}-${slugify(report.product.name)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${request.nextUrl.searchParams.get("dl") === "1" ? "attachment" : "inline"}; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

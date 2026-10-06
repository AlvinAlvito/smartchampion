import { NextResponse, type NextRequest } from "next/server";
import { getSession, isPanel } from "@/lib/session";
import { certificateContent } from "@/lib/graduation";
import { renderCertificatePdf } from "@/lib/pdf/certificate-pdf";
import { guardRoute } from "@/lib/security";
import { slugify } from "@/lib/utils";
import { blockReadOnlyDownload } from "@/lib/read-only";

export const runtime = "nodejs";

/**
 * Sertifikat PDF. Peserta: hanya miliknya & sudah diterbitkan. Staf panel: semua, plus `?preview=1` (userId 0)
 * untuk melihat contoh tata letak sebelum diterbitkan. `?dl=1` = unduh.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/sertifikat/[productId]/[userId]">) {
  const session = await getSession();
  // Superadmin = mode lihat saja: tidak boleh mengunduh
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`cert-pdf:${session.userId}`, 30, 60_000);
  if (limited) return limited;
  const { productId, userId } = await ctx.params;
  const pid = Number(productId) || 0;
  const uid = Number(userId) || 0;
  const staff = isPanel(session.role);
  const preview = request.nextUrl.searchParams.get("preview") === "1";
  if ((preview && !staff) || (!staff && uid !== session.userId)) return NextResponse.json({ message: "forbidden" }, { status: 403 });

  const content = await certificateContent(pid, uid, preview);
  if (!content) return NextResponse.json({ message: "Sertifikat belum diterbitkan." }, { status: 404 });
  const pdf = await renderCertificatePdf(content.config, content.data, content.background);
  const file = `sertifikat-${slugify(content.data.name)}-${slugify(content.product.name)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${request.nextUrl.searchParams.get("dl") === "1" ? "attachment" : "inline"}; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

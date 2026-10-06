import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { blockReadOnlyDownload } from "@/lib/read-only";
import { guardRoute } from "@/lib/security";
import { buildWorksheetPdf, worksheetPdfGate } from "@/lib/worksheet-pdf-data";

export const dynamic = "force-dynamic";

/** PDF Soal & Pembahasan worksheet satu pertemuan (?dl=1 = unduh) */
export async function GET(request: Request, ctx: RouteContext<"/api/worksheet-pdf/[sessionId]">) {
  const session = await getSession();
  // Superadmin = mode lihat saja: tidak boleh mengunduh
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`wspdf:${session.userId}`, 20, 60_000);
  if (limited) return limited;
  const { sessionId } = await ctx.params;
  const id = Number(sessionId) || 0;
  const gate = await worksheetPdfGate(session, id);
  if (!gate.ok) return NextResponse.json({ message: gate.reason }, { status: gate.status });
  const pdf = await buildWorksheetPdf(id);
  if (!pdf) return NextResponse.json({ message: "not found" }, { status: 404 });
  const dl = new URL(request.url).searchParams.get("dl") === "1";
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${pdf.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

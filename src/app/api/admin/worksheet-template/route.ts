import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isPanel } from "@/lib/session";
import { blockReadOnlyDownload } from "@/lib/read-only";
import { guardRoute } from "@/lib/security";
import { buildWorksheetTemplate } from "@/lib/worksheet-template";

export const dynamic = "force-dynamic";

/** Template Word impor soal worksheet (?session=<id> mengisi nama kelas & pertemuan di judul) */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session || !isPanel(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`wstpl:${session.userId}`, 20, 60_000);
  if (limited) return limited;
  const sid = Number(request.nextUrl.searchParams.get("session")) || 0;
  const s = sid ? await prisma.classSession.findUnique({ where: { id: sid }, select: { title: true, product: { select: { name: true } } } }) : null;
  const buf = await buildWorksheetTemplate({ className: s?.product.name, meetingTitle: s?.title });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="Template-Soal-Worksheet.docx"',
      "Cache-Control": "no-store",
    },
  });
}

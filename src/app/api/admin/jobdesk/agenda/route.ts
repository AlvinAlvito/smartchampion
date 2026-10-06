import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { blockReadOnlyDownload } from "@/lib/read-only";
import { guardRoute } from "@/lib/security";
import { jobdeskAccess, jobdeskRoleTitle, loadJobWeek } from "@/lib/jobdesk";
import { isoWeekOf, todayWib } from "@/lib/jobdesk-shared";
import { agendaFileName, buildAgendaDocx } from "@/lib/agenda-docx";

export const dynamic = "force-dynamic";

/** Unduh Agenda Pekanan (.docx, format AP_weekNN) — admin miliknya sendiri, root untuk admin mana pun */
export async function GET(request: NextRequest) {
  const session = await getSession();
  // Superadmin = mode lihat saja: tidak boleh mengunduh
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`agenda:${session.userId}`, 20, 60_000);
  if (limited) return limited;
  const sp = request.nextUrl.searchParams;
  const access = await jobdeskAccess(session, Number(sp.get("user")) || null);
  if (!access?.canDownload || !access.ownerId) return NextResponse.json({ message: "forbidden" }, { status: 403 });
  // ADMIN hanya boleh mengunduh miliknya (jobdeskAccess sudah memaksa ownerId = dirinya)
  const now = isoWeekOf(todayWib());
  const year = Number(sp.get("year")) || now.year;
  const week = Number(sp.get("week")) || now.week;
  if (year < 2020 || year > 2100 || week < 1 || week > 53) return NextResponse.json({ message: "pekan tidak valid" }, { status: 400 });

  const data = await loadJobWeek(access.ownerId, year, week);
  const buffer = await buildAgendaDocx({ ownerName: access.ownerName, year, week, data, roleTitle: jobdeskRoleTitle(access.ownerRole) });
  const name = agendaFileName(week, access.ownerName);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

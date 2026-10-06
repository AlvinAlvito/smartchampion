import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isStaff } from "@/lib/session";
import { buildBlastWhere, readBlastFilters } from "@/lib/blast-filters";
import { buildWorkbook, todayStamp, xlsxResponse } from "@/lib/excel";
import { blastExportColumns } from "@/lib/export-columns";
import { guardRoute } from "@/lib/security";
import { blockReadOnlyDownload } from "@/lib/read-only";

export async function GET(request: NextRequest) {
  const session = await getSession();
  // Superadmin = mode lihat saja: tidak boleh mengunduh
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session || !isStaff(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`export:${session.userId}`, 20, 60000);
  if (limited) return limited;

  const filters = readBlastFilters((k) => request.nextUrl.searchParams.get(k));
  const rows = await prisma.blast.findMany({
    where: buildBlastWhere(filters),
    include: { owner: { select: { name: true } } },
    orderBy: [{ tanggal: "asc" }, { id: "asc" }],
  });
  const columns = blastExportColumns;

  const active = Object.entries(filters).filter(([, v]) => v !== "");
  const buffer = await buildWorkbook({
    sheetName: "Data Blast",
    title: "Data Blast — Pelatihan POSI",
    subtitle: `Diekspor ${todayStamp()} oleh ${session.name} · ${rows.length} data${active.length ? ` · filter: ${active.map(([k, v]) => `${k}=${v}`).join(", ")}` : ""}`,
    columns,
    rows,
  });
  return xlsxResponse(buffer, `data-blast-${todayStamp()}.xlsx`);
}

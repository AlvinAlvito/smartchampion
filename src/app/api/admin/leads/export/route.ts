import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isStaff } from "@/lib/session";
import { readLeadFilters } from "@/lib/lead-filters";
import { buildLeadWhereWithAccounts } from "@/lib/lead-filters-server";
import { buildWorkbook, todayStamp, xlsxResponse } from "@/lib/excel";
import { leadExportColumns } from "@/lib/export-columns";
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

  const filters = readLeadFilters((k) => request.nextUrl.searchParams.get(k));
  const leads = await prisma.lead.findMany({
    where: await buildLeadWhereWithAccounts(filters),
    include: { owner: { select: { name: true } } },
    orderBy: { id: "asc" },
  });
  const columns = leadExportColumns;

  const { from, to, tgl, ...rest } = filters;
  const active = Object.entries(rest)
    .filter(([, v]) => v !== "" && v !== false)
    .map(([k, v]) => `${k}=${v}`);
  if (from || to) active.unshift(`tanggal ${tgl === "bayar" ? "bayar" : "masuk"} ${from || "awal"} s.d. ${to || "sekarang"}`);
  const buffer = await buildWorkbook({
    sheetName: "Master Lead",
    title: "Data Master Lead — Pelatihan POSI",
    subtitle: `Diekspor ${todayStamp()} oleh ${session.name} · ${leads.length} lead${active.length ? ` · filter: ${active.join(", ")}` : ""}`,
    columns,
    rows: leads,
  });
  return xlsxResponse(buffer, `master-lead-${from || to ? `${tgl}-${from || "awal"}_${to || "sekarang"}` : todayStamp()}.xlsx`);
}

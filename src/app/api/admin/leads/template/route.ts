import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isStaff } from "@/lib/session";
import { xlsxResponse } from "@/lib/excel";
import { buildImportTemplate } from "@/lib/excel-template";
import { IMPORT_COLUMNS, importLists } from "@/lib/lead-import";
import { guardRoute } from "@/lib/security";
import { blockReadOnlyDownload } from "@/lib/read-only";

export async function GET() {
  const session = await getSession();
  // Superadmin = mode lihat saja: tidak boleh mengunduh
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session || !isStaff(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`template:${session.userId}`, 30, 60000);
  if (limited) return limited;

  const staff = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SUPERADMIN"] }, isActive: true },
    select: { name: true },
    orderBy: { id: "asc" },
  });

  const buffer = await buildImportTemplate({
    sheetName: "Data Lead",
    pageName: "Master Lead",
    columns: IMPORT_COLUMNS,
    lists: importLists(staff.map((s) => s.name)),
    examples: {
      tanggalMasuk: "26/09/2026",
      nama: "Budi Santoso",
      noWa: "081234567890",
      email: "budi@gmail.com",
      sumberLead: "Iklan Web POSI",
      campaign: "hasil-ujian",
      kategori: "Calon Customer",
      produk: "Mimpi.mu",
      paket: "3 bulan",
      owner: staff[1]?.name ?? staff[0]?.name ?? "",
      statusFunnel: "Dihubungi",
      trialMimpimu: "Diarahkan",
      statusBayar: "Belum Ada",
      nominal: "99000",
      lastContact: "26/09/2026",
      nextFollowUp: "28/09/2026",
      objection: "Masih pikir-pikir",
      nextAction: "Follow-up H+2",
    },
  });
  return xlsxResponse(buffer, "template-import-master-lead.xlsx");
}

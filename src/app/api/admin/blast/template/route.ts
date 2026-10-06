import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isStaff } from "@/lib/session";
import { xlsxResponse } from "@/lib/excel";
import { buildImportTemplate } from "@/lib/excel-template";
import { BLAST_COLUMNS, blastLists } from "@/lib/blast-import";
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
    sheetName: "Data Blast",
    pageName: "Data Blast",
    columns: BLAST_COLUMNS,
    lists: blastLists(staff.map((s) => s.name)),
    examples: {
      tanggal: "26/09/2026",
      nama: "Siti Aminah",
      email: "siti@gmail.com",
      noHp: "081234567890",
      provinsi: "Jawa Barat",
      kota: "Bandung",
      jenjang: "SMP",
      sekolah: "SMPN 5 Bandung",
      owner: staff[1]?.name ?? staff[0]?.name ?? "",
      asalBlast: "WhatsApp",
    },
  });
  return xlsxResponse(buffer, "template-import-data-blast.xlsx");
}

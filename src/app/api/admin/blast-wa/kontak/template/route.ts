import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { xlsxResponse } from "@/lib/excel";
import { buildImportTemplate } from "@/lib/excel-template";
import { BLAST_JENJANG, PROVINSI } from "@/lib/constants";
import { CONTACT_COLUMNS } from "@/lib/blast-contact-import";
import { canBlast } from "@/lib/blast-wa";
import { guardRoute } from "@/lib/security";

export async function GET() {
  const session = await getSession();
  if (!session || !canBlast(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`template:${session.userId}`, 30, 60000);
  if (limited) return limited;
  const buffer = await buildImportTemplate({
    sheetName: "Kontak Blast WA",
    pageName: "Blast WhatsApp › Kontak",
    columns: CONTACT_COLUMNS,
    lists: { jenjang: [...BLAST_JENJANG], provinsi: [...PROVINSI] },
    examples: {
      nama: "Siti Aminah",
      noHp: "081234567890",
      email: "siti@gmail.com",
      jenjang: "SMP",
      kelas: "8",
      sekolah: "SMPN 5 Bandung",
      kota: "Bandung",
      provinsi: "Jawa Barat",
      labels: "Olimpiade, Alumni COC",
      catatan: "Ikut try out Mei",
    },
  });
  return xlsxResponse(buffer, "template-kontak-blast-wa.xlsx");
}

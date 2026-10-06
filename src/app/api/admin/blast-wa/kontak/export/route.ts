import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isStaff } from "@/lib/session";
import { buildWorkbook, FMT, todayStamp, xlsxResponse } from "@/lib/excel";
import { guardRoute } from "@/lib/security";
import { blockReadOnlyDownload } from "@/lib/read-only";
import { contactScope } from "@/lib/blast-wa";
import { buildContactWhere, readContactFilters } from "@/lib/blast-contact-filters";
import { parseLabels, WA_CONTACT_STATUS_LABEL } from "@/lib/blast-wa-shared";

/** Ekspor kontak Blast WhatsApp (sesuai filter); bisa diimpor ulang */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session || !isStaff(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`export:${session.userId}`, 20, 60000);
  if (limited) return limited;
  const f = readContactFilters((k) => request.nextUrl.searchParams.get(k));
  const rows = await prisma.blastContact.findMany({ where: buildContactWhere(f, contactScope(session)), orderBy: { id: "asc" }, include: { owner: { select: { name: true } } }, take: 50000 });
  type R = (typeof rows)[number];
  const buffer = await buildWorkbook<R>({
    sheetName: "Kontak Blast WA",
    title: "Kontak Blast WhatsApp — Pelatihan POSI",
    subtitle: `Diekspor ${todayStamp()} oleh ${session.name} · ${rows.length} kontak`,
    columns: [
      { header: "Nama", value: (r) => r.nama },
      { header: "No. WhatsApp", value: (r) => r.noHp },
      { header: "Email", value: (r) => r.email },
      { header: "Jenjang", value: (r) => r.jenjang },
      { header: "Kelas", value: (r) => r.kelas },
      { header: "Sekolah", value: (r) => r.sekolah, width: 28 },
      { header: "Kota", value: (r) => r.kota },
      { header: "Provinsi", value: (r) => r.provinsi },
      { header: "Label", value: (r) => parseLabels(r.labels).join(", ") },
      { header: "Catatan", value: (r) => r.catatan, width: 30 },
      { header: "Status WA", value: (r) => (r.optOut ? "Berhenti langganan" : WA_CONTACT_STATUS_LABEL[r.waStatus]) },
      { header: "Jumlah Blast", value: (r) => r.blastCount },
      { header: "Blast Terakhir", value: (r) => r.lastBlastAt, numFmt: FMT.dateTime },
      { header: "Balasan Terakhir", value: (r) => r.lastReplyAt, numFmt: FMT.dateTime },
      { header: "Sumber", value: (r) => r.source },
      { header: "Owner", value: (r) => r.owner.name },
    ],
    rows,
  });
  return xlsxResponse(buffer, `kontak-blast-wa-${todayStamp()}.xlsx`);
}

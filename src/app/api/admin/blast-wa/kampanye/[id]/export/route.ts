import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isStaff } from "@/lib/session";
import { buildWorkbook, FMT, todayStamp, xlsxResponse } from "@/lib/excel";
import { guardRoute } from "@/lib/security";
import { blockReadOnlyDownload } from "@/lib/read-only";
import { campaignScope } from "@/lib/blast-wa";
import { RECIPIENT_STATUS_LABEL } from "@/lib/blast-wa-shared";

/** Laporan per penerima satu kampanye */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/admin/blast-wa/kampanye/[id]/export">) {
  const session = await getSession();
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session || !isStaff(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`export:${session.userId}`, 20, 60000);
  if (limited) return limited;
  const { id } = await ctx.params;
  const c = await prisma.blastCampaign.findFirst({ where: { id: Number(id) || 0, ...campaignScope(session) } });
  if (!c) return NextResponse.json({ message: "not found" }, { status: 404 });
  const rows = await prisma.blastRecipient.findMany({ where: { campaignId: c.id }, orderBy: { id: "asc" }, include: { contact: { select: { sekolah: true, jenjang: true, kota: true } } } });
  type R = (typeof rows)[number];
  const buffer = await buildWorkbook<R>({
    sheetName: "Laporan Kampanye",
    title: `Laporan Blast WhatsApp — ${c.name}`,
    subtitle: `Diekspor ${todayStamp()} oleh ${session.name} · ${rows.length} penerima · ${c.audienceNote ?? ""}`,
    columns: [
      { header: "Nama", value: (r) => r.nama },
      { header: "No. WhatsApp", value: (r) => r.noHp },
      { header: "Jenjang", value: (r) => r.contact?.jenjang },
      { header: "Sekolah", value: (r) => r.contact?.sekolah, width: 26 },
      { header: "Kota", value: (r) => r.contact?.kota },
      { header: "Status", value: (r) => RECIPIENT_STATUS_LABEL[r.status] ?? r.status },
      { header: "Keterangan", value: (r) => r.error, width: 30 },
      { header: "Waktu Kirim", value: (r) => r.sentAt, numFmt: FMT.dateTime },
      { header: "Dibalas", value: (r) => r.repliedAt, numFmt: FMT.dateTime },
      { header: "Isi Balasan", value: (r) => r.replyText, width: 30 },
      { header: "Pesan Terkirim", value: (r) => r.text, width: 50 },
    ],
    rows,
  });
  return xlsxResponse(buffer, `laporan-blast-${c.id}-${todayStamp()}.xlsx`);
}

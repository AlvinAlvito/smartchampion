import { NextResponse } from "next/server";
import { getSession, isPanel } from "@/lib/session";
import { getClassRecap, type ClassRecap } from "@/lib/class-recap";
import { buildWorkbookSheets, sheet, todayStamp, xlsxResponse, type ExcelColumn } from "@/lib/excel";
import { ATTENDANCE_LABEL } from "@/lib/worksheet-shared";
import { guardRoute } from "@/lib/security";
import { slugify } from "@/lib/utils";
import { blockReadOnlyDownload } from "@/lib/read-only";

type Row = ClassRecap["rows"][number];

/** Excel rekap kelas: sheet Nilai (per pertemuan + rata-rata + grade) & sheet Absensi */
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/rekap/[productId]">) {
  const session = await getSession();
  // Superadmin = mode lihat saja: tidak boleh mengunduh
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session || !isPanel(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`export:${session.userId}`, 20, 60_000);
  if (limited) return limited;
  const { productId } = await ctx.params;
  const recap = await getClassRecap(Number(productId) || 0);
  if (!recap) return NextResponse.json({ message: "not found" }, { status: 404 });
  const { product, meetings, rows, startedCount } = recap;

  const base: ExcelColumn<Row>[] = [
    { header: "Nama Peserta", value: (r) => r.name },
    { header: "Asal Sekolah", value: (r) => r.school },
    { header: "No. WA", value: (r) => r.phone },
  ];
  const scoreCols: ExcelColumn<Row>[] = [
    ...base,
    ...meetings.map((m, i) => ({
      header: `P${m.number} ${m.title}`.slice(0, 40),
      value: (r: Row) => (r.cells[i].score != null ? (r.cells[i].manual ? `${r.cells[i].score} (manual)` : r.cells[i].score) : m.graded ? "-" : ""),
    })),
    { header: "Try Out Mimpi.mu", value: (r) => r.tryout },
    { header: "Worksheet Dikerjakan", value: (r) => r.worksheetsDone },
    { header: "Rata-rata", value: (r) => r.average },
    { header: "Grade", value: (r) => r.grade },
  ];
  const attCols: ExcelColumn<Row>[] = [
    ...base,
    ...meetings.map((m, i) => ({
      header: `P${m.number} ${m.title}`.slice(0, 40),
      value: (r: Row) => (r.cells[i].attendance ? ATTENDANCE_LABEL[r.cells[i].attendance!] : m.started ? "-" : ""),
    })),
    { header: "Jumlah Hadir", value: (r) => r.present },
    { header: "Kehadiran (%)", value: (r) => r.attendanceRate },
  ];
  const sub = `Diekspor ${todayStamp()} oleh ${session.name} · ${rows.length} peserta · ${meetings.length} pertemuan (${startedCount} sudah dimulai)`;
  const buffer = await buildWorkbookSheets([
    sheet({
      sheetName: "Nilai",
      title: `Rekap Nilai — ${product.name}`,
      subtitle: `${sub} · tidak mengumpulkan sampai batas waktu = 0 · (manual) = nilai diisi tutor/admin · rata-rata = nilai pertemuan + Try Out`,
      columns: scoreCols,
      rows,
    }),
    sheet({ sheetName: "Absensi", title: `Rekap Absensi — ${product.name}`, subtitle: sub, columns: attCols, rows }),
  ]);
  return xlsxResponse(buffer, `rekap-${slugify(product.name)}-${todayStamp()}.xlsx`);
}

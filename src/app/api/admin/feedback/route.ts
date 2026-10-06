import { NextResponse, type NextRequest } from "next/server";
import { getSession, isPanel } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { listFeedback, type FeedbackRow } from "@/lib/feedback";
import { FEEDBACK_ASPECTS, feedbackScore } from "@/lib/feedback-shared";
import { buildWorkbook, FMT, todayStamp, xlsxResponse, type ExcelColumn } from "@/lib/excel";
import { guardRoute } from "@/lib/security";
import { slugify } from "@/lib/utils";
import { blockReadOnlyDownload } from "@/lib/read-only";

/** Excel feedback peserta (semua kelas atau `?produk=<id>`) */
export async function GET(request: NextRequest) {
  const session = await getSession();
  // Superadmin = mode lihat saja: tidak boleh mengunduh
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session || !isPanel(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`export:${session.userId}`, 20, 60_000);
  if (limited) return limited;
  const productId = Number(request.nextUrl.searchParams.get("produk")) || undefined;
  const product = productId ? await prisma.product.findUnique({ where: { id: productId }, select: { name: true } }) : null;
  const rows = await listFeedback(productId, 10_000);
  // satu kolom per pertanyaan (urut bank pertanyaan; pertanyaan yang sudah dihapus di akhir)
  const bank = await prisma.feedbackQuestion.findMany({ select: { id: true, order: true }, orderBy: [{ order: "asc" }, { id: "asc" }] });
  const rank = new Map(bank.map((q, i) => [q.id, i]));
  const keyOf = (a: FeedbackRow["answers"][number]) => (a.questionId ? `q${a.questionId}` : `t:${a.questionText}`);
  const qcols = new Map<string, { text: string; rank: number }>();
  for (const r of rows)
    for (const a of r.answers)
      if (!qcols.has(keyOf(a))) qcols.set(keyOf(a), { text: a.questionText, rank: a.questionId ? (rank.get(a.questionId) ?? 9999) : 10000 });
  const questionCols: ExcelColumn<FeedbackRow>[] = [...qcols.entries()]
    .sort((a, b) => a[1].rank - b[1].rank)
    .map(([key, q]) => ({
      header: q.text.slice(0, 60),
      value: (r: FeedbackRow) => {
        const a = r.answers.find((x) => keyOf(x) === key);
        return a ? (a.type === "RATING" ? a.rating : a.text) : "";
      },
    }));
  const columns: ExcelColumn<FeedbackRow>[] = [
    { header: "Tanggal", value: (r) => r.updatedAt, numFmt: FMT.dateTime },
    { header: "Kelas", value: (r) => r.product.name },
    { header: "Nama Peserta", value: (r) => r.name },
    { header: "Asal Sekolah", value: (r) => r.school },
    ...FEEDBACK_ASPECTS.map((a) => ({ header: a.label, value: (r: FeedbackRow) => r[a.key] })),
    { header: "Rata-rata", value: (r) => feedbackScore(r) },
    ...questionCols,
  ];
  const buffer = await buildWorkbook({
    sheetName: "Feedback",
    title: `Feedback Peserta — ${product?.name ?? "Semua kelas"}`,
    subtitle: `Diekspor ${todayStamp()} oleh ${session.name} · ${rows.length} feedback · rating 1–5`,
    columns,
    rows,
  });
  return xlsxResponse(buffer, `feedback-${product ? slugify(product.name) : "semua-kelas"}-${todayStamp()}.xlsx`);
}

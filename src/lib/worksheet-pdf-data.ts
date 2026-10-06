import "server-only";
import { prisma } from "./prisma";
import { isPanel, type SessionPayload } from "./session";
import { readWorksheetPdfConfig } from "./worksheet-pdf-config";
import { readWorksheetPdfBackground } from "./storage";
import { renderWorksheetPdf } from "./pdf/worksheet-pdf";

export type PdfGate = { ok: true } | { ok: false; reason: string; status: number };

/**
 * Siapa boleh mengunduh PDF Soal & Pembahasan:
 * - staf panel: kapan saja
 * - peserta lunas: worksheet terbit & berisi soal, dan ia sudah mengumpulkan ATAU batas waktu sudah lewat
 *   (sama dengan kapan pembahasan tampil di web — kunci jawaban tidak bocor sebelum dikerjakan)
 */
export async function worksheetPdfGate(user: SessionPayload, sessionId: number): Promise<PdfGate> {
  const s = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: { productId: true, worksheetPublished: true, worksheetDueAt: true, _count: { select: { worksheetQuestions: true } } },
  });
  if (!s) return { ok: false, reason: "Pertemuan tidak ditemukan.", status: 404 };
  if (isPanel(user.role)) return { ok: true };
  const paid = await prisma.registration.count({ where: { userId: user.userId, productId: s.productId, status: "PAID" } });
  if (!paid) return { ok: false, reason: "Kamu belum terdaftar lunas di kelas ini.", status: 403 };
  if (!s.worksheetPublished || !s._count.worksheetQuestions) return { ok: false, reason: "Worksheet pertemuan ini belum tersedia.", status: 404 };
  const done = await prisma.worksheetAttempt.count({ where: { sessionId, userId: user.userId } });
  const closed = s.worksheetDueAt != null && s.worksheetDueAt.getTime() <= Date.now();
  if (!done && !closed) return { ok: false, reason: "Soal & pembahasan bisa diunduh setelah kamu mengumpulkan worksheet.", status: 403 };
  return { ok: true };
}

/** PDF satu pertemuan (preview = contoh desain bila worksheet masih kosong) */
export async function buildWorksheetPdf(sessionId: number) {
  const s = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: {
      product: { select: { id: true, name: true, worksheetPdfBg: true, worksheetPdfConfig: true } },
      worksheetQuestions: { orderBy: [{ order: "asc" }, { id: "asc" }] },
    },
  });
  if (!s) return null;
  const all = await prisma.classSession.findMany({ where: { productId: s.productId }, orderBy: [{ startAt: "asc" }, { id: "asc" }], select: { id: true } });
  const number = all.findIndex((x) => x.id === s.id) + 1;
  const background = await readWorksheetPdfBackground(s.product.worksheetPdfBg);
  const dateText = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(s.startAt);
  const title = s.title.replace(/^Pertemuan\s*\d+\s*[:.-]?\s*/i, "") || s.title;
  const buffer = await renderWorksheetPdf(
    {
      className: s.product.name,
      meetingNumber: number,
      meetingTitle: title,
      dateText,
      questions: s.worksheetQuestions.map((q) => ({
        text: q.text,
        imageUrl: q.imageUrl,
        options: Array.isArray(q.options) ? (q.options as string[]) : [],
        answerIndex: q.answerIndex,
        points: q.points,
        explanation: q.explanation,
      })),
    },
    readWorksheetPdfConfig(s.product.worksheetPdfConfig),
    background,
  );
  const safe = (v: string) =>
    v
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);
  return { buffer, fileName: `Soal-Pembahasan-P${number}-${safe(s.product.name) || "kelas"}.pdf` };
}

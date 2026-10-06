import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { readOptions, type FeedbackCategoryKey, type FeedbackQuestionDTO, type FeedbackTypeKey } from "./feedback-shared";

export type FeedbackGate = { open: true } | { open: false; reason: string };

/**
 * Feedback terbuka untuk peserta bila: terdaftar lunas, semua pertemuan kelas sudah selesai,
 * dan rapor sudah diterbitkan admin.
 */
export async function feedbackGate(productId: number, userId: number): Promise<FeedbackGate> {
  const [product, paid, sessions] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { reportPublished: true } }),
    prisma.registration.count({ where: { productId, userId, status: "PAID" } }),
    prisma.classSession.findMany({ where: { productId }, select: { startAt: true, endAt: true } }),
  ]);
  if (!product || !paid) return { open: false, reason: "Kamu belum terdaftar lunas di kelas ini." };
  const now = Date.now();
  if (sessions.some((s) => (s.endAt ?? s.startAt).getTime() > now)) return { open: false, reason: "Feedback dibuka setelah semua pertemuan selesai." };
  if (!product.reportPublished) return { open: false, reason: "Feedback dibuka setelah rapor diterbitkan." };
  return { open: true };
}

type QuestionRow = { id: number; text: string; description: string | null; category: string; type: string; options: Prisma.JsonValue; required: boolean };
export const toQuestionDTO = (q: QuestionRow): FeedbackQuestionDTO => ({
  id: q.id,
  text: q.text,
  description: q.description,
  category: q.category as FeedbackCategoryKey,
  type: q.type as FeedbackTypeKey,
  options: readOptions(q.options),
  required: q.required,
});

/** Pertanyaan aktif sesuai urutan (yang tampil di form peserta) */
export async function activeQuestions() {
  const rows = await prisma.feedbackQuestion.findMany({ where: { isActive: true }, orderBy: [{ order: "asc" }, { id: "asc" }] });
  return rows.map(toQuestionDTO);
}

/** Daftar feedback (terbaru dulu) beserta jawabannya, opsional per kelas — untuk halaman admin & ekspor Excel */
export async function listFeedback(productId?: number, take = 1000) {
  const rows = await prisma.feedback.findMany({
    where: productId ? { productId } : {},
    orderBy: { updatedAt: "desc" },
    take,
    include: {
      product: { select: { id: true, name: true } },
      user: { select: { name: true } },
      answers: { orderBy: { id: "asc" }, select: { questionId: true, questionText: true, category: true, type: true, rating: true, text: true } },
    },
  });
  // nama peserta sesuai data pendaftaran (fallback nama akun)
  const regs = !rows.length
    ? []
    : await prisma.registration.findMany({
        where: { status: "PAID", OR: rows.map((r) => ({ productId: r.productId, userId: r.userId })) },
        select: { productId: true, userId: true, fullName: true, school: true },
      });
  const reg = new Map(regs.map((r) => [`${r.productId}:${r.userId}`, r]));
  return rows.map((r) => {
    const g = reg.get(`${r.productId}:${r.userId}`);
    return { ...r, name: g?.fullName || r.user.name, school: g?.school ?? "" };
  });
}
export type FeedbackRow = Awaited<ReturnType<typeof listFeedback>>[number];

export type QuestionSummary = {
  key: string;
  text: string;
  category: FeedbackCategoryKey;
  type: FeedbackTypeKey;
  count: number;
  average: number | null;
  /** RATING: jumlah per bintang 1–5; CHOICE: jumlah per pilihan */
  counts: { label: string; n: number }[];
  /** TEXT: jawaban terbaru */
  texts: { name: string; text: string }[];
};

/** Rekap jawaban per pertanyaan (urut sesuai bank pertanyaan; pertanyaan yang sudah dihapus di akhir) */
export function summarizeQuestions(rows: FeedbackRow[], questions: { id: number; order: number; options: string[] }[]): QuestionSummary[] {
  const qOrder = new Map(questions.map((q) => [q.id, q]));
  const map = new Map<string, QuestionSummary & { sum: number; tally: Map<string, number> }>();
  for (const r of rows) {
    for (const a of r.answers) {
      const key = a.questionId ? `q${a.questionId}` : `t:${a.questionText}`;
      let s = map.get(key);
      if (!s) {
        s = { key, text: a.questionText, category: a.category, type: a.type, count: 0, average: null, counts: [], texts: [], sum: 0, tally: new Map() };
        map.set(key, s);
      }
      if (a.type === "RATING" && a.rating) {
        s.count++;
        s.sum += a.rating;
        s.tally.set(String(a.rating), (s.tally.get(String(a.rating)) ?? 0) + 1);
      } else if (a.type === "CHOICE" && a.text) {
        s.count++;
        s.tally.set(a.text, (s.tally.get(a.text) ?? 0) + 1);
      } else if (a.type === "TEXT" && a.text) {
        s.count++;
        if (s.texts.length < 100) s.texts.push({ name: r.name, text: a.text });
      }
    }
  }
  const out = [...map.values()].map(({ sum, tally, ...s }) => {
    const qid = s.key.startsWith("q") ? Number(s.key.slice(1)) : 0;
    let counts: { label: string; n: number }[] = [];
    if (s.type === "RATING") counts = [5, 4, 3, 2, 1].map((n) => ({ label: String(n), n: tally.get(String(n)) ?? 0 }));
    else if (s.type === "CHOICE") {
      const opts = qOrder.get(qid)?.options ?? [];
      const labels = [...opts, ...[...tally.keys()].filter((k) => !opts.includes(k))];
      counts = labels.map((label) => ({ label, n: tally.get(label) ?? 0 }));
    }
    return { ...s, counts, average: s.type === "RATING" && s.count ? Math.round((sum / s.count) * 10) / 10 : null };
  });
  const rank = (s: QuestionSummary) => (s.key.startsWith("q") ? (qOrder.get(Number(s.key.slice(1)))?.order ?? 9999) : 10000);
  return out.sort((a, b) => rank(a) - rank(b));
}

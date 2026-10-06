"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePanel, requireUser } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { activeQuestions, feedbackGate } from "@/lib/feedback";
import { avgRating, FEEDBACK_ASPECTS, OPTIONS_MAX, TEXT_MAX, type FeedbackCategoryKey, type FeedbackTypeKey } from "@/lib/feedback-shared";
import { optInt, str } from "@/lib/utils";

function revalidate(productId?: number, slug?: string) {
  revalidatePath("/admin/feedback");
  if (productId) revalidatePath(`/admin/produk/${productId}/kelulusan`);
  if (slug) revalidatePath(`/dashboard/kelas/${slug}`, "layout");
}

/* ======================= Peserta ======================= */

/** Peserta mengisi / mengubah feedback kelasnya (hanya setelah pertemuan selesai & rapor terbit) */
export async function submitFeedbackAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const me = await requireUser(["PESERTA"]);
  const productId = optInt(form, "productId") ?? 0;
  const gate = await feedbackGate(productId, me.userId);
  if (!gate.open) return { error: gate.reason };
  const questions = await activeQuestions();
  if (!questions.length) return { error: "Belum ada pertanyaan feedback." };

  const answers: Prisma.FeedbackAnswerCreateManyFeedbackInput[] = [];
  const fieldErrors: Record<string, string[]> = {};
  for (const q of questions) {
    const raw = str(form, `q_${q.id}`);
    const base = { questionId: q.id, questionText: q.text, category: q.category, type: q.type };
    if (q.type === "RATING") {
      const n = Number(raw);
      if (Number.isInteger(n) && n >= 1 && n <= 5) answers.push({ ...base, rating: n });
      else if (q.required) fieldErrors[`q_${q.id}`] = ["Beri rating 1–5 bintang."];
    } else if (q.type === "CHOICE") {
      if (raw && q.options.includes(raw)) answers.push({ ...base, text: raw });
      else if (q.required) fieldErrors[`q_${q.id}`] = ["Pilih salah satu jawaban."];
    } else {
      const t = raw.slice(0, TEXT_MAX);
      if (t) answers.push({ ...base, text: t });
      else if (q.required) fieldErrors[`q_${q.id}`] = ["Wajib diisi."];
    }
  }
  if (Object.keys(fieldErrors).length) return { error: "Lengkapi pertanyaan yang wajib diisi.", fieldErrors };

  // rata-rata per aspek (cache untuk ringkasan admin)
  const aspects = Object.fromEntries(
    FEEDBACK_ASPECTS.map((a) => [a.key, avgRating(answers.filter((x) => x.category === a.category && x.type === "RATING").map((x) => x.rating))]),
  ) as Record<(typeof FEEDBACK_ASPECTS)[number]["key"], number | null>;

  const existed = await prisma.feedback.findUnique({ where: { productId_userId: { productId, userId: me.userId } }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    const f = await tx.feedback.upsert({
      where: { productId_userId: { productId, userId: me.userId } },
      create: { productId, userId: me.userId, ...aspects },
      update: { ...aspects },
      select: { id: true },
    });
    await tx.feedbackAnswer.deleteMany({ where: { feedbackId: f.id } });
    await tx.feedbackAnswer.createMany({ data: answers.map((a) => ({ ...a, feedbackId: f.id })) });
  });
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { slug: true } });
  revalidate(productId, p?.slug);
  return { ok: existed ? "Feedback diperbarui. Terima kasih!" : "Terima kasih! Feedback-mu sudah terkirim." };
}

/* ======================= Admin: jawaban ======================= */

export async function deleteFeedbackAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const f = await prisma.feedback
    .delete({ where: { id: Number(id) || 0 }, select: { productId: true, product: { select: { slug: true } } } })
    .catch(() => null);
  if (!f) return { error: "Feedback tidak ditemukan." };
  revalidate(f.productId, f.product.slug);
  return { ok: "Feedback dihapus. Peserta bisa mengisinya lagi." };
}

/* ======================= Admin: bank pertanyaan ======================= */

const CATEGORIES: FeedbackCategoryKey[] = ["TUTOR", "ADMIN", "MATERI", "KESELURUHAN", "UMUM"];
const TYPES: FeedbackTypeKey[] = ["RATING", "CHOICE", "TEXT"];

/** Tambah / ubah pertanyaan feedback */
export async function saveFeedbackQuestionAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const id = optInt(form, "id");
  const text = str(form, "text").slice(0, 300);
  const description = str(form, "description").slice(0, 300) || null;
  const category = str(form, "category") as FeedbackCategoryKey;
  const type = str(form, "type") as FeedbackTypeKey;
  const required = form.get("required") === "1";
  const fieldErrors: Record<string, string[]> = {};
  if (text.length < 3) fieldErrors.text = ["Tulis pertanyaannya (min. 3 karakter)."];
  if (!CATEGORIES.includes(category)) fieldErrors.category = ["Pilih aspek."];
  if (!TYPES.includes(type)) fieldErrors.type = ["Pilih jenis jawaban."];
  const options = [
    ...new Set(
      str(form, "options")
        .split("\n")
        .map((o) => o.trim().slice(0, 120))
        .filter(Boolean),
    ),
  ].slice(0, OPTIONS_MAX);
  if (type === "CHOICE" && options.length < 2) fieldErrors.options = ["Pilihan ganda butuh minimal 2 pilihan (satu per baris)."];
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const data = { text, description, category, type, required, options: type === "CHOICE" ? (options as Prisma.InputJsonValue) : Prisma.DbNull };
  if (id) {
    const q = await prisma.feedbackQuestion.update({ where: { id }, data }).catch(() => null);
    if (!q) return { error: "Pertanyaan tidak ditemukan." };
  } else {
    const max = await prisma.feedbackQuestion.aggregate({ _max: { order: true } });
    await prisma.feedbackQuestion.create({ data: { ...data, order: (max._max.order ?? 0) + 1 } });
  }
  revalidate();
  return { ok: id ? "Pertanyaan diperbarui." : "Pertanyaan ditambahkan." };
}

export async function setFeedbackQuestionActiveAction(id: number, active: boolean): Promise<ActionResult> {
  await requirePanel();
  const q = await prisma.feedbackQuestion.update({ where: { id: Number(id) || 0 }, data: { isActive: !!active } }).catch(() => null);
  if (!q) return { error: "Pertanyaan tidak ditemukan." };
  revalidate();
  return { ok: active ? "Pertanyaan ditampilkan ke peserta." : "Pertanyaan disembunyikan dari peserta." };
}

export async function moveFeedbackQuestionAction(id: number, dir: "up" | "down"): Promise<ActionResult> {
  await requirePanel();
  const all = await prisma.feedbackQuestion.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true } });
  const i = all.findIndex((q) => q.id === Number(id));
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= all.length) return { ok: "" };
  [all[i], all[j]] = [all[j], all[i]];
  await prisma.$transaction(all.map((q, k) => prisma.feedbackQuestion.update({ where: { id: q.id }, data: { order: k + 1 } })));
  revalidate();
  return { ok: "" };
}

/** Hapus pertanyaan — jawaban lama tetap tersimpan (teks pertanyaan disalin di jawaban) */
export async function deleteFeedbackQuestionAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const q = await prisma.feedbackQuestion.delete({ where: { id: Number(id) || 0 } }).catch(() => null);
  if (!q) return { error: "Pertanyaan tidak ditemukan." };
  revalidate();
  return { ok: "Pertanyaan dihapus. Jawaban yang sudah masuk tetap tersimpan." };
}

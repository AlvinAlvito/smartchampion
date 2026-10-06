"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { GroqError, groqConfigured } from "@/lib/groq";
import { AI_MAX_QUESTIONS, DIFFICULTIES, generateExplanations, generateQuestions, type Difficulty, type GeneratedQuestion } from "@/lib/ai-questions";
import { limitAction } from "@/lib/security";
import { latexErrors } from "@/lib/latex";
import { logActivity } from "@/lib/activity";

export type AiGenerateInput = { gameId: number; count: number; optionCount: number; difficulty: string; instructions: string };
export type AiGenerateResult = ActionResult & { questions?: GeneratedQuestion[]; rejected?: number };

/** Generate soal oleh AI → hanya pratinjau (belum disimpan). */
export async function generateQuestionsAction(input: AiGenerateInput): Promise<AiGenerateResult> {
  const session = await requirePanel();
  const limited = await limitAction("ai-generate", session.userId, 15, 10 * 60_000);
  if (limited) return { error: limited };
  if (!groqConfigured()) return { error: "Fitur AI belum aktif: GROQ_API_KEY belum diisi di .env." };
  const game = await prisma.game.findUnique({
    where: { id: Number(input.gameId) || 0 },
    include: { questions: { select: { text: true }, orderBy: { order: "desc" }, take: 60 } },
  });
  if (!game) return { error: "Game tidak ditemukan." };

  const count = Math.min(AI_MAX_QUESTIONS, Math.max(1, Math.round(Number(input.count) || 10)));
  const optionCount = Math.min(5, Math.max(3, Math.round(Number(input.optionCount) || 4)));
  const difficulty = (input.difficulty in DIFFICULTIES ? input.difficulty : "campuran") as Difficulty;
  const instructions = String(input.instructions ?? "")
    .trim()
    .slice(0, 1000);

  const started = Date.now();
  try {
    const { questions, rejected } = await generateQuestions({
      title: game.title,
      subject: game.subject,
      jenjang: game.jenjang,
      description: game.description,
      secondsPerQuestion: game.secondsPerQuestion,
      count,
      optionCount,
      difficulty,
      instructions,
      existing: game.questions.map((q) => q.text),
    });
    console.info(`[ai-games] ${session.name} generate ${questions.length}/${count} soal untuk game #${game.id} (${Date.now() - started} ms)`);
    if (!questions.length) return { error: "AI tidak menghasilkan soal yang valid. Coba ubah instruksi lalu generate ulang." };
    const note = questions.length < count ? ` (${count - questions.length} soal disaring karena tidak valid/duplikat)` : "";
    return { ok: `${questions.length} soal siap ditinjau${note}.`, questions, rejected };
  } catch (e) {
    if (e instanceof GroqError) return { error: e.message };
    console.error("[ai-games]", e);
    return { error: "Gagal membuat soal dengan AI. Coba lagi." };
  }
}

/** Simpan soal hasil AI yang dipilih admin ke akhir daftar soal game. */
export async function saveGeneratedQuestionsAction(
  gameId: number,
  questions: { text: string; options: string[]; answerIndex: number; explanation?: string }[],
  points: number,
): Promise<ActionResult> {
  await requirePanel();
  const game = await prisma.game.findUnique({ where: { id: Number(gameId) || 0 }, select: { id: true, title: true } });
  if (!game) return { error: "Game tidak ditemukan." };
  const pts = Math.min(1000, Math.max(10, Math.round(Number(points) || 100)));
  const clean = (Array.isArray(questions) ? questions : [])
    .slice(0, AI_MAX_QUESTIONS)
    .map((q) => ({
      text: String(q.text ?? "")
        .trim()
        .slice(0, 500),
      options: (q.options ?? [])
        .map((o) => String(o).trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 5),
      answerIndex: Number(q.answerIndex),
      explanation:
        String(q.explanation ?? "")
          .trim()
          .slice(0, 2000) || null,
    }))
    .filter((q) => q.text && q.options.length >= 2 && Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.options.length);
  if (!clean.length) return { error: "Pilih minimal satu soal untuk disimpan." };

  const last = await prisma.gameQuestion.findFirst({ where: { gameId: game.id }, orderBy: { order: "desc" }, select: { order: true } });
  await prisma.gameQuestion.createMany({
    data: clean.map((q, i) => ({
      gameId: game.id,
      text: q.text,
      options: q.options,
      answerIndex: q.answerIndex,
      explanation: q.explanation && !latexErrors(q.explanation).length ? q.explanation : null,
      points: pts,
      order: (last?.order ?? 0) + i + 1,
    })),
  });
  await logActivity({ entity: "GAME_QUESTION", action: "GENERATE", gameId: game.id, label: game.title, count: clean.length });
  revalidatePath(`/admin/games/${game.id}`);
  revalidatePath("/admin/games");
  revalidatePath("/games");
  return { ok: `${clean.length} soal dari AI ditambahkan ke game.` };
}

/** Lengkapi pembahasan (AI) untuk soal game yang belum punya pembahasan — maks. 15 soal per klik. */
export async function fillExplanationsAction(gameId: number): Promise<ActionResult> {
  const session = await requirePanel();
  const limited = await limitAction("ai-explain", session.userId, 15, 10 * 60_000);
  if (limited) return { error: limited };
  if (!groqConfigured()) return { error: "Fitur AI belum aktif: GROQ_API_KEY belum diisi di .env." };
  const game = await prisma.game.findUnique({
    where: { id: Number(gameId) || 0 },
    select: {
      id: true,
      title: true,
      subject: true,
      jenjang: true,
      questions: {
        where: { OR: [{ explanation: null }, { explanation: "" }] },
        orderBy: { order: "asc" },
        select: { id: true, text: true, options: true, answerIndex: true },
      },
    },
  });
  if (!game) return { error: "Game tidak ditemukan." };
  if (!game.questions.length) return { ok: "Semua soal sudah punya pembahasan." };
  const batch = game.questions.slice(0, 15).map((q) => ({ ...q, options: (q.options as string[]) ?? [] }));
  try {
    const result = await generateExplanations({ subject: game.subject, jenjang: game.jenjang, questions: batch });
    await prisma.$transaction([...result].map(([id, explanation]) => prisma.gameQuestion.update({ where: { id }, data: { explanation } })));
    if (result.size) await logActivity({ entity: "GAME_QUESTION", action: "UPDATE", gameId: game.id, label: game.title, count: result.size, detail: "pembahasan AI" });
    revalidatePath(`/admin/games/${game.id}`);
    const rest = game.questions.length - result.size;
    if (!result.size) return { error: "AI belum berhasil membuat pembahasan. Coba lagi." };
    return { ok: `${result.size} pembahasan ditambahkan${rest ? ` · ${rest} soal lagi belum punya pembahasan (klik lagi)` : ""}. Periksa & edit bila perlu.` };
  } catch (e) {
    if (e instanceof GroqError) return { error: e.message };
    console.error("[ai-explain]", e);
    return { error: "Gagal membuat pembahasan dengan AI. Coba lagi." };
  }
}

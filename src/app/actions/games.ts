"use server";

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSession, isPanel } from "@/lib/session";
import { createPlay, endPlay, getPlay } from "@/lib/game-play";
import { limitAction } from "@/lib/security";
import { getUserRank } from "@/lib/queries";
import { GAME_HINTS } from "@/lib/game-rules";

/** Skor per soal: poin penuh jika dijawab instan, minimal 50% jika benar di detik terakhir. */
function pointsFor(base: number, secondsLimit: number, elapsedMs: number) {
  const limitMs = secondsLimit * 1000;
  const remaining = Math.max(0, limitMs - Math.min(elapsedMs, limitMs));
  return Math.round(base * (0.5 + 0.5 * (remaining / limitMs)));
}

/** Mulai sesi bermain: server mencatat soal, waktu tampil, dan jawaban (anti-curang). */
export async function startPlayAction(gameId: number): Promise<{ token?: string; error?: string }> {
  const limited = await limitAction("game-start", null, 40, 10 * 60_000);
  if (limited) return { error: limited };
  const session = await getSession();
  const game = await prisma.game.findUnique({
    where: { id: Number(gameId) || 0 },
    select: { id: true, isPublished: true, questions: { select: { id: true } } },
  });
  // game draft hanya bisa dicoba staf (preview)
  if (!game || (!game.isPublished && !isPanel(session?.role))) return { error: "Game tidak ditemukan." };
  return {
    token: createPlay(
      game.id,
      session?.userId ?? null,
      game.questions.map((q) => q.id),
    ),
  };
}

/** Dipanggil saat soal tampil di layar → dasar pengukuran waktu jawab di server. */
export async function questionShownAction(token: string, questionId: number) {
  const play = getPlay(token);
  if (play && play.questionIds.has(questionId) && !play.answers.has(questionId) && !play.shownAt.has(questionId)) play.shownAt.set(questionId, Date.now());
}

/**
 * Petunjuk 50:50: sembunyikan opsi salah sampai tersisa 2 (jawaban benar + 1 pengecoh acak).
 * Jatah dihitung di server (maks. GAME_HINTS per permainan); soal yang sama tidak memotong jatah dua kali.
 */
export async function takeHintAction(token: string, questionId: number): Promise<{ removed?: number[]; left?: number; error?: string }> {
  const play = getPlay(token);
  if (!play || !play.questionIds.has(questionId)) return { error: "Sesi game berakhir. Mulai ulang game." };
  const done = play.hints.get(questionId);
  if (done) return { removed: done, left: GAME_HINTS - play.hints.size };
  if (play.answers.has(questionId)) return { error: "Soal ini sudah dijawab." };
  if (play.hints.size >= GAME_HINTS) return { error: "Jatah petunjuk sudah habis.", left: 0 };
  const q = await prisma.gameQuestion.findUnique({ where: { id: questionId }, select: { options: true, answerIndex: true } });
  const count = Array.isArray(q?.options) ? q.options.length : 0;
  if (!q || count <= 2) return { error: "Soal ini hanya punya 2 pilihan." };
  const wrong = Array.from({ length: count }, (_, i) => i).filter((i) => i !== q.answerIndex);
  const keep = wrong[crypto.randomInt(wrong.length)];
  const removed = wrong.filter((i) => i !== keep);
  play.hints.set(questionId, removed);
  return { removed, left: GAME_HINTS - play.hints.size };
}

/** Cek satu jawaban. Kunci jawaban & pembahasan hanya dibuka setelah menjawab, sekali per soal, dalam sesi yang sah. */
export async function checkAnswerAction(
  token: string,
  questionId: number,
  choice: number,
  clientElapsedMs: number,
): Promise<{ correct: boolean; answerIndex: number; explanation?: string | null; error?: string }> {
  const play = getPlay(token);
  if (!play || !play.questionIds.has(questionId)) return { correct: false, answerIndex: -1, error: "Sesi game berakhir. Mulai ulang game." };
  const prev = play.answers.get(questionId);
  const q = await prisma.gameQuestion.findUnique({
    where: { id: questionId },
    select: { answerIndex: true, explanation: true, game: { select: { secondsPerQuestion: true } } },
  });
  if (!q) return { correct: false, answerIndex: -1 };
  if (prev) return { correct: prev.correct, answerIndex: q.answerIndex, explanation: q.explanation }; // jawaban pertama yang berlaku

  const limitMs = q.game.secondsPerQuestion * 1000;
  const shown = play.shownAt.get(questionId);
  // waktu menurut server (dikurangi toleransi jaringan); tanpa catatan tampil → dianggap waktu penuh
  const serverElapsed = shown ? Date.now() - shown - 400 : limitMs;
  const elapsedMs = Math.min(limitMs, Math.max(0, Number(clientElapsedMs) || 0, serverElapsed));
  const pick = Number.isInteger(choice) ? choice : -1;
  const correct = pick >= 0 && q.answerIndex === pick;
  play.answers.set(questionId, { choice: pick, correct, elapsedMs });
  return { correct, answerIndex: q.answerIndex, explanation: q.explanation };
}

/** Skor dihitung dari catatan sesi di server, lalu disimpan untuk peserta. */
export async function submitScoreAction(token: string): Promise<ScoreResult | { error: string }> {
  const play = getPlay(token);
  if (!play) return { error: "Sesi game berakhir atau tidak valid. Silakan main ulang." };
  endPlay(token); // satu sesi = satu kali simpan skor
  const game = await prisma.game.findUnique({ where: { id: play.gameId }, include: { questions: true } });
  if (!game) return { error: "Game tidak ditemukan" };

  let score = 0;
  let correct = 0;
  let duration = 0;
  for (const q of game.questions) {
    const a = play.answers.get(q.id);
    if (!a) continue;
    duration += a.elapsedMs;
    if (a.correct) {
      correct++;
      score += pointsFor(q.points, game.secondsPerQuestion, a.elapsedMs);
    }
  }

  const total = game.questions.length;
  const ratio = total ? correct / total : 0;
  const base: ScoreResult = {
    score,
    correct,
    total,
    saved: false,
    tier: tierOf(ratio, correct === total && total > 0, null),
    rank: null,
    players: null,
    previousBest: null,
    personalBest: false,
  };

  const session = await getSession();
  if (!session || session.role !== "PESERTA" || !game.isPublished || session.userId !== play.userId) return base;
  const gameId = game.id;

  const prev = await prisma.gameScore.findFirst({ where: { gameId, userId: session.userId }, orderBy: { score: "desc" }, select: { score: true } });
  await prisma.gameScore.create({
    data: { gameId, userId: session.userId, score, correctCount: correct, totalQuestions: total, durationMs: duration },
  });
  const rank = await getUserRank(gameId, session.userId);
  const personalBest = !prev || score > prev.score;
  return {
    ...base,
    saved: true,
    rank: rank?.rank ?? null,
    players: rank?.total ?? null,
    previousBest: prev?.score ?? null,
    personalBest,
    // "tertinggi" = sempurna, atau skor ini membawa peserta ke peringkat 1
    tier: tierOf(ratio, correct === total && total > 0, personalBest && rank?.rank === 1 ? 1 : null),
  };
}

export type ScoreTier = "rendah" | "normal" | "tinggi" | "tertinggi";
export type ScoreResult = {
  score: number;
  correct: number;
  total: number;
  saved: boolean;
  tier: ScoreTier;
  rank: number | null;
  players: number | null;
  previousBest: number | null;
  personalBest: boolean;
};

/**
 * Tingkat hasil:
 * - tertinggi: semua benar, ATAU menjadi peringkat #1 dengan skor tinggi (≥70% benar)
 * - tinggi ≥70% · normal ≥40% · rendah <40%
 * (Peringkat #1 saja tidak cukup — di leaderboard yang masih sepi skor 0 pun bisa #1.)
 */
function tierOf(ratio: number, perfect: boolean, rank: number | null): ScoreTier {
  if (perfect || (rank === 1 && ratio >= 0.7)) return "tertinggi";
  if (ratio >= 0.7) return "tinggi";
  if (ratio >= 0.4) return "normal";
  return "rendah";
}

"use server";

import { revalidatePath } from "next/cache";
import type { Jenjang } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { optInt, slugify, str } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { latexErrors } from "@/lib/latex";
import { logActivity } from "@/lib/activity";

const gameTitle = async (id: number) => (await prisma.game.findUnique({ where: { id }, select: { title: true } }))?.title ?? null;

function revalidateGame(id?: number) {
  revalidatePath("/admin/games");
  if (id) revalidatePath(`/admin/games/${id}`);
  revalidatePath("/games");
}

export async function saveGameAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const id = optInt(form, "id");
  const title = str(form, "title");
  if (title.length < 3) return { fieldErrors: { title: ["Judul minimal 3 karakter"] } };
  const jenjang = (["SD", "SMP", "SMA", "UMUM"].includes(str(form, "jenjang")) ? str(form, "jenjang") : "UMUM") as Jenjang;

  let slug = slugify(str(form, "slug") || title);
  if (await prisma.game.findFirst({ where: { slug, ...(id ? { NOT: { id } } : {}) } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const data = {
    title,
    slug,
    description: str(form, "description"),
    subject: str(form, "subject") || "Umum",
    jenjang,
    emoji: str(form, "emoji") || "🎯",
    secondsPerQuestion: Math.min(120, Math.max(5, optInt(form, "secondsPerQuestion") ?? 20)),
  };
  const game = id ? await prisma.game.update({ where: { id }, data }) : await prisma.game.create({ data });
  await logActivity({ entity: "GAME", action: id ? "UPDATE" : "CREATE", entityId: game.id, gameId: game.id, label: game.title });
  revalidateGame(game.id);
  return id
    ? { ok: `Game "${game.title}" diperbarui.`, id: game.id }
    : { ok: `Game "${game.title}" dibuat. Tambahkan soal lalu rilis!`, id: game.id, redirectTo: `/admin/games/${game.id}` };
}

export async function togglePublishGameAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const game = await prisma.game.findUnique({ where: { id }, include: { _count: { select: { questions: true } } } });
  if (!game) return { error: "Game tidak ditemukan." };
  if (!game.isPublished && game._count.questions === 0) return { error: "Tambahkan minimal 1 soal sebelum merilis game." };
  await prisma.game.update({
    where: { id },
    data: { isPublished: !game.isPublished, launchedAt: !game.isPublished ? (game.launchedAt ?? new Date()) : game.launchedAt },
  });
  await logActivity({ entity: "GAME", action: game.isPublished ? "UNPUBLISH" : "PUBLISH", entityId: id, gameId: id, label: game.title });
  revalidateGame(id);
  return { ok: game.isPublished ? `"${game.title}" ditarik dari publik.` : `🚀 "${game.title}" resmi dirilis! Peserta sudah bisa bermain.` };
}

export async function deleteGameAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const g = await prisma.game.delete({ where: { id } }).catch(() => null);
  if (!g) return { error: "Game tidak ditemukan." };
  await logActivity({ entity: "GAME", action: "DELETE", entityId: g.id, gameId: g.id, label: g.title });
  revalidateGame();
  return { ok: `Game "${g.title}" dihapus.`, redirectTo: "/admin/games" };
}

export async function resetScoresAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const r = await prisma.gameScore.deleteMany({ where: { gameId: id } });
  await logActivity({ entity: "GAME", action: "RESET", entityId: id, gameId: id, label: await gameTitle(id), detail: `${r.count} skor leaderboard` });
  revalidateGame(id);
  return { ok: `${r.count} skor direset. Leaderboard kembali kosong.` };
}

export async function saveQuestionAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const gameId = optInt(form, "gameId");
  const id = optInt(form, "id");
  const text = str(form, "text");
  const rawOptions = [0, 1, 2, 3, 4].map((i) => str(form, `option${i}`));
  const answerIndex = optInt(form, "answerIndex") ?? 0;
  if (!gameId) return { error: "Game tidak valid." };
  if (!text) return { fieldErrors: { text: ["Pertanyaan wajib diisi"] } };
  if (!rawOptions[answerIndex]) return { fieldErrors: { answerIndex: ["Jawaban benar harus pada opsi yang terisi"] } };
  // buang opsi kosong sambil menjaga posisi jawaban benar
  const options = rawOptions.filter(Boolean);
  const newAnswer = rawOptions.slice(0, answerIndex).filter(Boolean).length;
  if (options.length < 2) return { fieldErrors: { option1: ["Minimal 2 opsi jawaban"] } };
  const bad = [text, ...options].flatMap((t) => latexErrors(t));
  if (bad.length) return { fieldErrors: { text: [`Rumus LaTeX belum benar: ${bad[0]}`] } };
  const explanation = str(form, "explanation").slice(0, 2000) || null;
  const badExp = explanation ? latexErrors(explanation) : [];
  if (badExp.length) return { fieldErrors: { explanation: [`Rumus LaTeX belum benar: ${badExp[0]}`] } };

  const data = { gameId, text, options, answerIndex: newAnswer, explanation, points: Math.max(10, optInt(form, "points") ?? 100) };
  if (id) await prisma.gameQuestion.update({ where: { id }, data });
  else {
    const last = await prisma.gameQuestion.findFirst({ where: { gameId }, orderBy: { order: "desc" } });
    await prisma.gameQuestion.create({ data: { ...data, order: (last?.order ?? 0) + 1 } });
  }
  await logActivity({ entity: "GAME_QUESTION", action: id ? "UPDATE" : "CREATE", entityId: id, gameId, label: await gameTitle(gameId) });
  revalidateGame(gameId);
  return { ok: id ? "Soal diperbarui." : "Soal baru ditambahkan." };
}

export async function deleteQuestionAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const q = await prisma.gameQuestion.delete({ where: { id } }).catch(() => null);
  if (!q) return { error: "Soal tidak ditemukan." };
  await logActivity({ entity: "GAME_QUESTION", action: "DELETE", entityId: q.id, gameId: q.gameId, label: await gameTitle(q.gameId) });
  revalidateGame(q.gameId);
  return { ok: "Soal dihapus." };
}

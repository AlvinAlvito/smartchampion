import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/** Jumlah peserta lunas per produk (dipakai untuk progres kuota) */
export async function paidCountByProduct(productIds?: number[]) {
  const rows = await prisma.registration.groupBy({
    by: ["productId"],
    where: { status: "PAID", ...(productIds ? { productId: { in: productIds } } : {}) },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.productId, r._count._all]));
}

export async function getCatalog(where: Prisma.ProductWhereInput = {}) {
  const products = await prisma.product.findMany({
    where: { status: { in: ["OPEN", "RUNNING"] }, ...where },
    orderBy: [{ jenjang: "asc" }, { name: "asc" }],
  });
  const counts = await paidCountByProduct(products.map((p) => p.id));
  return products.map((p) => ({ ...p, paidCount: counts.get(p.id) ?? 0 }));
}

/**
 * Leaderboard satu game — hanya dari skor asli akun peserta aktif.
 * Peserta boleh bermain berkali-kali; yang dihitung adalah percobaan TERBAIK-nya:
 * skor tertinggi → bila sama, waktu tercepat → bila masih sama, yang lebih dulu mencapainya.
 */
export async function getLeaderboard(gameId: number, take = 10) {
  const scores = await prisma.gameScore.findMany({
    where: { gameId, user: { role: "PESERTA", isActive: true } },
    select: { userId: true, score: true, durationMs: true, createdAt: true, correctCount: true, totalQuestions: true, user: { select: { name: true, school: true } } },
    orderBy: [{ score: "desc" }, { durationMs: "asc" }, { createdAt: "asc" }],
  });
  const best = new Map<number, (typeof scores)[number]>();
  const plays = new Map<number, number>();
  for (const s of scores) {
    plays.set(s.userId, (plays.get(s.userId) ?? 0) + 1);
    if (!best.has(s.userId)) best.set(s.userId, s); // urutan query sudah "terbaik dulu"
  }
  return [...best.values()].slice(0, take).map((b, i) => ({
    rank: i + 1,
    userId: b.userId,
    name: b.user.name,
    school: b.user.school ?? "",
    score: b.score,
    correct: b.correctCount,
    total: b.totalQuestions,
    durationMs: b.durationMs,
    plays: plays.get(b.userId) ?? 1,
  }));
}

/** Peringkat seorang peserta di leaderboard (null jika belum pernah bermain). */
export async function getUserRank(gameId: number, userId: number) {
  const board = await getLeaderboard(gameId, 100000);
  const row = board.find((r) => r.userId === userId);
  return row ? { rank: row.rank, total: board.length, best: row.score } : null;
}

import "server-only";
import crypto from "node:crypto";

/**
 * Sesi bermain di sisi server (anti-curang): waktu jawab diukur server, setiap soal hanya bisa dijawab sekali,
 * dan skor dihitung dari catatan server — bukan dari angka yang dikirim browser.
 */

export type PlayAnswer = { choice: number; correct: boolean; elapsedMs: number };
export type PlaySession = {
  gameId: number;
  userId: number | null;
  questionIds: Set<number>;
  shownAt: Map<number, number>;
  answers: Map<number, PlayAnswer>;
  /** petunjuk 50:50 yang sudah dipakai: questionId → indeks opsi yang disembunyikan */
  hints: Map<number, number[]>;
  createdAt: number;
};

const TTL = 2 * 3600_000;
const MAX_SESSIONS = 20_000;
const sessions = new Map<string, PlaySession>();

function sweep() {
  const now = Date.now();
  if (sessions.size < MAX_SESSIONS / 2) {
    for (const [k, v] of sessions) if (now - v.createdAt > TTL) sessions.delete(k);
    return;
  }
  // terlalu banyak sesi (serangan?) → buang yang kedaluwarsa, lalu yang tertua
  for (const [k, v] of sessions) if (now - v.createdAt > TTL || sessions.size > MAX_SESSIONS / 2) sessions.delete(k);
}

export function createPlay(gameId: number, userId: number | null, questionIds: number[]) {
  sweep();
  const token = crypto.randomUUID();
  sessions.set(token, { gameId, userId, questionIds: new Set(questionIds), shownAt: new Map(), answers: new Map(), hints: new Map(), createdAt: Date.now() });
  return token;
}

export function getPlay(token: string) {
  if (typeof token !== "string" || token.length !== 36) return null;
  const s = sessions.get(token);
  if (!s || Date.now() - s.createdAt > TTL) return null;
  return s;
}

export function endPlay(token: string) {
  sessions.delete(token);
}

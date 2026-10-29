import "server-only";
import crypto from "node:crypto";

/**
 * Sesi bermain di sisi server (anti-curang): waktu jawab diukur server, setiap soal hanya bisa dijawab sekali,
 * dan skor dihitung dari catatan server — bukan dari angka yang dikirim browser.
 */

export type PlayAnswer = { choice: number; correct: boolean; elapsedMs: number };
/** Bintang mode petualangan: posisi dibuat server; seg = jeda antar lantai (0 = tanah → lantai 1) */
export type PlayStar = { id: string; seg: number; x: number; y: number; taken: boolean };
export type PlaySession = {
  gameId: number;
  userId: number | null;
  questionIds: Set<number>;
  shownAt: Map<number, number>;
  answers: Map<number, PlayAnswer>;
  /** petunjuk 50:50 yang sudah dipakai: questionId → indeks opsi yang disembunyikan */
  hints: Map<number, number[]>;
  /** bonus pungut (bintang petualangan / ikan lari lintasan): poin per item & jeda minimal antar ambil */
  stars: Map<string, PlayStar>;
  starPoints: number;
  starGapMs: number;
  lastStarAt: number;
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

export type { PlayMode } from "@/lib/game-rules";
import type { PlayMode } from "@/lib/game-rules";

/** Poin tambahan per bintang (mode petualangan) */
export const STAR_POINTS = 10;
/** Poin per ikan (mode lari lintasan): 4 ikan × 5 = 20 poin per segmen, sama dengan 2 bintang × 10 di petualangan */
export const FISH_POINTS = 5;
const FISH_PER_SEG = 4;

/** Dunia petualangan (harus sama dengan adventure-player.tsx): jarak antar lantai & tinggi pijakan tengah */
const GAP = 210;
const STEP_RISE = 105;
const W = 360;

/**
 * 2 bintang acak per jeda antar lantai: satu di atas pijakan tengah, satu melayang di atas lantai.
 * Semuanya dalam jangkauan lompatan (±120 unit) dari pijakan di bawahnya.
 */
function makeStars(floors: number) {
  const rnd = (a: number, b: number) => a + (crypto.randomInt(1_000_000) / 1_000_000) * (b - a);
  const stars: PlayStar[] = [];
  for (let seg = 0; seg <= floors; seg++) {
    const base = seg * GAP;
    const left = seg % 2 === 0; // pijakan tengah zig-zag kiri/kanan (sama dengan buildWorld)
    const [sx1, sx2] = left ? [22, 134] : [226, 338];
    stars.push({ id: crypto.randomBytes(6).toString("hex"), seg, x: Math.round(rnd(sx1 + 14, sx2 - 14)), y: Math.round(base + STEP_RISE + rnd(55, 95)), taken: false });
    // bintang lantai: di sisi yang berlawanan dengan pijakan agar perlu sedikit usaha
    const [fx1, fx2] = left ? [W / 2, W - 24] : [24, W / 2];
    stars.push({ id: crypto.randomBytes(6).toString("hex"), seg, x: Math.round(rnd(fx1, fx2)), y: Math.round(base + rnd(84, 100)), taken: false });
  }
  return stars;
}

/** Ikan lari lintasan: posisinya diatur browser (jalur & jarak), server hanya mencatat id & segmennya */
function makeFish(questions: number) {
  const fish: PlayStar[] = [];
  for (let seg = 0; seg <= questions; seg++)
    for (let i = 0; i < FISH_PER_SEG; i++) fish.push({ id: crypto.randomBytes(6).toString("hex"), seg, x: 0, y: 0, taken: false });
  return fish;
}

export function createPlay(gameId: number, userId: number | null, questionIds: number[], opts: { mode?: PlayMode } = {}) {
  sweep();
  const token = crypto.randomUUID();
  const runner = opts.mode === "runner";
  const stars = opts.mode === "adventure" ? makeStars(questionIds.length) : runner ? makeFish(questionIds.length) : [];
  sessions.set(token, {
    gameId,
    userId,
    questionIds: new Set(questionIds),
    shownAt: new Map(),
    answers: new Map(),
    hints: new Map(),
    stars: new Map(stars.map((s) => [s.id, s])),
    starPoints: runner ? FISH_POINTS : STAR_POINTS,
    // ikan berderet di satu jalur & bisa dipungut cepat beruntun saat "gas" → jeda lebih pendek
    starGapMs: runner ? 40 : 120,
    lastStarAt: 0,
    createdAt: Date.now(),
  });
  return { token, stars: stars.map(({ id, seg, x, y }) => ({ id, seg, x, y })) };
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

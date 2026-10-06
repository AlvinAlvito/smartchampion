/** Aturan game yang dipakai bersama server & browser. */

/** Jatah petunjuk 50:50 per permainan (sisakan 2 opsi: jawaban benar + 1 pengecoh). */
export const GAME_HINTS = 3;

/** Suasana hati maskot kucing menurut jawaban beruntun (benar / salah) */
export type CatMood = "netral" | "senyum" | "tertawa" | "girang" | "sedih" | "berkaca" | "menangis";

export function catMood(correctStreak: number, wrongStreak: number): CatMood {
  if (correctStreak >= 5) return "girang";
  if (correctStreak >= 3) return "tertawa";
  if (correctStreak >= 1) return "senyum";
  if (wrongStreak >= 5) return "menangis";
  if (wrongStreak >= 3) return "berkaca";
  if (wrongStreak >= 1) return "sedih";
  return "netral";
}

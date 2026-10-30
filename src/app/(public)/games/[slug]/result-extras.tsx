"use client";

import { createContext, useContext } from "react";

/**
 * Alur Arena Game (/games → pilih mode → pilih soal → Main): leaderboard disembunyikan selama bermain dan baru
 * tampil di bawah layar hasil skor; tombol kembali menuju daftar soal mode tersebut.
 */
export const ResultExtras = createContext<{ leaderboard: React.ReactNode; backHref: string } | null>(null);

export const useResultExtras = () => useContext(ResultExtras);

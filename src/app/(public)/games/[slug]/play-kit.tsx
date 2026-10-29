"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Lightbulb,
  LogIn,
  LogOut,
  Maximize,
  Minimize,
} from "lucide-react";
import {
  checkAnswerAction,
  questionShownAction,
  startPlayAction,
  submitScoreAction,
  takeHintAction,
  type ScoreResult,
} from "@/app/actions/games";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/form-buttons";
import { GameCat } from "@/components/game-cat";
import { MathText } from "@/components/math-text";
import { gameAudio } from "@/lib/game-audio";
import type { CatMood, PlayMode } from "@/lib/game-rules";
import { cn } from "@/lib/utils";

/**
 * Perlengkapan bersama mode Ular Tangga, Kafe Kucing & Memancing: sesi server (anti-curang), timer soal,
 * bingkai layar penuh, layar siap & kotak pembahasan. Skor semua mode ini = skor klasik dari server.
 */

export type Question = {
  id: number;
  text: string;
  options: string[];
  points: number;
};
export type Feedback = {
  choice: number;
  correct: boolean;
  answerIndex: number;
  explanation: string | null;
  points: number;
};
export type PlayerProps = {
  gameId: number;
  secondsPerQuestion: number;
  questions: Question[];
  loggedIn: boolean;
  canSave: boolean;
  loginHref: string;
  onExit: () => void;
  onPlayingChange?: (playing: boolean) => void;
};

export const LETTERS = ["A", "B", "C", "D", "E"];
export const OPTION_COLORS = [
  "#1a6f9f",
  "#0ea5e9",
  "#eab308",
  "#2563eb",
  "#14b8a6",
];
export const optionCount = (q: Question) => Math.min(5, q.options.length);

/** Skor per soal sama dengan server: poin penuh bila instan, minimal 50% setelah batas waktu */
export function pointsFor(
  base: number,
  secondsLimit: number,
  elapsedMs: number,
) {
  const limitMs = secondsLimit * 1000;
  const remaining = Math.max(0, limitMs - Math.min(elapsedMs, limitMs));
  return Math.round(base * (0.5 + 0.5 * (remaining / limitMs)));
}

/**
 * Sesi bermain di server. Setiap `start()` membuat sesi baru; balasan dari sesi lama (pemain keluar lalu main ulang)
 * dikembalikan sebagai `null` agar diabaikan pemanggil.
 */
export function useQuizSession(gameId: number, mode: PlayMode) {
  const toast = useToast();
  const router = useRouter();
  const token = useRef<string | null>(null);
  const run = useRef(0);

  const start = useCallback(async () => {
    const id = ++run.current;
    token.current = null;
    try {
      const r = await startPlayAction(gameId, mode);
      if (run.current !== id) return false;
      if (r.token) {
        token.current = r.token;
        return true;
      }
      toast.error(r.error ?? "Gagal memulai game.");
    } catch {
      if (run.current !== id) return false;
      toast.error("Koneksi terputus. Coba mulai lagi.");
    }
    return false;
  }, [gameId, mode, toast]);

  const stop = useCallback(() => {
    run.current++;
    token.current = null;
  }, []);

  const shown = useCallback((questionId: number) => {
    if (token.current) void questionShownAction(token.current, questionId);
  }, []);

  /** cek jawaban; koneksi putus → dianggap salah tanpa kunci (answerIndex −1) */
  const check = useCallback(
    async (questionId: number, choice: number, elapsedMs: number) => {
      const id = run.current;
      try {
        const res = await checkAnswerAction(
          token.current ?? "",
          questionId,
          choice,
          elapsedMs,
        );
        if (run.current !== id) return null;
        if ("error" in res && res.error) toast.error(res.error);
        return {
          correct: res.correct,
          answerIndex: res.answerIndex,
          explanation: res.explanation ?? null,
        };
      } catch {
        if (run.current !== id) return null;
        toast.error(
          "Koneksi terputus saat mengecek jawaban — lanjut ke soal berikutnya.",
        );
        return { correct: false, answerIndex: -1, explanation: null };
      }
    },
    [toast],
  );

  const hint = useCallback(
    async (questionId: number) => {
      const id = run.current;
      try {
        const res = await takeHintAction(token.current ?? "", questionId);
        if (run.current !== id) return null;
        if (res.error) toast.error(res.error);
        return res;
      } catch {
        if (run.current === id)
          toast.error("Koneksi terputus saat mengambil petunjuk.");
        return null;
      }
    },
    [toast],
  );

  /** kirim skor; null = gagal / sesi lama */
  const submit = useCallback(async (): Promise<ScoreResult | null> => {
    const id = run.current;
    try {
      const res = await submitScoreAction(token.current ?? "");
      if (run.current !== id) return null;
      token.current = null;
      if ("error" in res) {
        toast.error(res.error ?? "Gagal menyimpan skor.");
        return null;
      }
      if (res.saved)
        toast.success(
          res.personalBest
            ? `Rekor baru ${res.score} poin tersimpan ke leaderboard 🏆`
            : `Skor ${res.score} tersimpan. Skor terbaikmu tetap ${res.previousBest}.`,
        );
      router.refresh();
      return res;
    } catch {
      if (run.current === id)
        toast.error("Gagal mengirim skor. Periksa koneksi lalu coba lagi.");
      return null;
    }
  }, [router, toast]);

  return useMemo(
    () => ({ start, stop, shown, check, hint, submit }),
    [start, stop, shown, check, hint, submit],
  );
}

/**
 * Timer soal: berjalan selama `key` bukan null (biasanya indeks soal). Detak di 5 detik terakhir,
 * `onTimeout` dipanggil sekali saat waktu habis. `elapsed()` = ms sejak soal tampil.
 */
export function useQuestionTimer(
  key: number | null,
  seconds: number,
  onTimeout: () => void,
) {
  const [timeLeft, setTimeLeft] = useState(seconds);
  const startedAt = useRef(0);
  const cb = useRef(onTimeout);
  useEffect(() => {
    cb.current = onTimeout;
  });
  useEffect(() => {
    if (key === null) return;
    startedAt.current = performance.now();
    let lastTick = 0;
    gameAudio().setIntensity(false);
    const t = setInterval(() => {
      const left = seconds - (performance.now() - startedAt.current) / 1000;
      setTimeLeft(Math.max(0, left));
      const sec = Math.ceil(left);
      if (left > 0 && sec <= 5 && sec !== lastTick) {
        lastTick = sec;
        gameAudio().tick();
        gameAudio().setIntensity(true);
      }
      if (left <= 0) {
        clearInterval(t);
        gameAudio().setIntensity(false);
        cb.current();
      }
    }, 100);
    return () => {
      clearInterval(t);
      setTimeLeft(seconds);
    };
  }, [key, seconds]);
  const elapsed = useCallback(
    () => Math.round(performance.now() - startedAt.current),
    [],
  );
  return { timeLeft, elapsed };
}

/** Hitung mundur 3-2-1 lalu `onGo` */
export function useCountdown(active: boolean, onGo: () => void) {
  const [count, setCount] = useState(3);
  const cb = useRef(onGo);
  useEffect(() => {
    cb.current = onGo;
  });
  useEffect(() => {
    if (!active) return;
    gameAudio().countdown(count === 0);
    const t = setTimeout(
      () => (count === 0 ? cb.current() : setCount((c) => c - 1)),
      count === 0 ? 350 : 650,
    );
    return () => clearTimeout(t);
  }, [active, count]);
  const reset = useCallback(() => setCount(3), []);
  return { count, reset };
}

/** layar penuh di HP saat mulai bermain */
export function requestMobileFullscreen() {
  if (
    window.matchMedia("(pointer: coarse)").matches &&
    !document.fullscreenElement
  )
    void document.documentElement
      .requestFullscreen?.({ navigationUI: "hide" })
      .catch(() => undefined);
}

export function ReadyCard(props: {
  title: string;
  subtitle: string;
  mood?: CatMood;
  bullets: {
    text: React.ReactNode;
    tone?: "brand" | "amber" | "emerald" | "rose";
    wide?: boolean;
  }[];
  loggedIn: boolean;
  loginHref: string;
  onBack: () => void;
  onStart: () => void;
  startLabel: string;
  startIcon: React.ReactNode;
}) {
  const tones = {
    brand: "bg-brand-50",
    amber: "bg-amber-50",
    emerald: "bg-emerald-50",
    rose: "bg-rose-50",
  };
  return (
    <div className="card animate-fade-up space-y-5 p-6 sm:p-8">
      <div className="flex items-center gap-4">
        <GameCat mood={props.mood ?? "girang"} className="h-24 w-24 shrink-0" />
        <div>
          <h2 className="text-xl font-extrabold text-navy-900">
            {props.title}
          </h2>
          <p className="text-sm text-navy-500">{props.subtitle}</p>
        </div>
      </div>
      <ul className="grid grid-cols-1 gap-2 text-sm text-navy-700 sm:grid-cols-2">
        {props.bullets.map((b, i) => (
          <li
            key={i}
            className={cn(
              "rounded-2xl p-3",
              tones[b.tone ?? "brand"],
              b.wide && "sm:col-span-2",
            )}
          >
            {b.text}
          </li>
        ))}
      </ul>
      {!props.loggedIn && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-100">
          Kamu belum masuk, jadi skor tidak tersimpan ke leaderboard.
          <Link
            href={props.loginHref}
            className="inline-flex items-center gap-1 font-bold underline"
          >
            <LogIn className="h-4 w-4" /> Masuk dulu
          </Link>
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={props.onBack} className="btn-ghost">
          <ArrowLeft className="h-4 w-4" /> Pilih mode lain
        </button>
        <button
          type="button"
          onClick={props.onStart}
          className="btn-primary flex-1 py-4 text-base"
        >
          {props.startIcon} {props.startLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * Bingkai arena layar penuh (portal ke body agar menutupi header & tombol chat): bilah atas dengan label,
 * tombol 50:50, Keluar (konfirmasi) & layar penuh. Halaman belakang tidak ikut tergulir.
 */
export function ArenaFrame(props: {
  label: React.ReactNode;
  extra?: React.ReactNode;
  hint?: {
    left: number;
    disabled: boolean;
    busy: boolean;
    onClick: () => void;
  } | null;
  onExit: () => void;
  children: React.ReactNode;
}) {
  const [confirmExit, setConfirmExit] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const on = () => setFullscreen(!!document.fullscreenElement);
    on();
    document.addEventListener("fullscreenchange", on);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("fullscreenchange", on);
      if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => undefined);
    };
  }, []);
  useEffect(() => {
    if (!confirmExit) return;
    const t = setTimeout(() => setConfirmExit(false), 3000);
    return () => clearTimeout(t);
  }, [confirmExit]);
  const toggleFullscreen = () => {
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => undefined);
    else
      void document.documentElement
        .requestFullscreen?.({ navigationUI: "hide" })
        .catch(() => undefined);
  };
  return createPortal(
    <div className="fixed inset-0 z-[99] flex flex-col bg-navy-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden bg-white sm:my-3 sm:rounded-3xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-navy-100 px-3 py-2">
          <span className="shrink-0 whitespace-nowrap rounded-full bg-navy-900 px-2.5 py-1 text-xs font-bold text-white">
            {props.label}
          </span>
          {props.extra}
          <div className="ml-auto flex items-center gap-1.5">
            {props.hint && (
              <button
                type="button"
                onClick={props.hint.onClick}
                disabled={props.hint.disabled || props.hint.busy}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-sun-400 px-2.5 py-1 text-xs font-bold text-navy-900 disabled:opacity-40"
              >
                {props.hint.busy ? (
                  <Spinner />
                ) : (
                  <Lightbulb className="h-3.5 w-3.5" />
                )}{" "}
                50:50 ({props.hint.left})
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (!confirmExit) return setConfirmExit(true);
                gameAudio().stopMusic(0.1);
                props.onExit();
              }}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold",
                confirmExit
                  ? "bg-rose-500 text-white"
                  : "bg-navy-50 text-navy-600",
              )}
            >
              <LogOut className="h-3.5 w-3.5" />{" "}
              {confirmExit ? "Yakin keluar?" : "Keluar"}
            </button>
            {typeof document !== "undefined" && document.fullscreenEnabled && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-600"
                aria-label={
                  fullscreen ? "Keluar dari layar penuh" : "Layar penuh"
                }
                title={fullscreen ? "Keluar dari layar penuh" : "Layar penuh"}
              >
                {fullscreen ? (
                  <Minimize className="h-3.5 w-3.5" />
                ) : (
                  <Maximize className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
        {props.children}
      </div>
    </div>,
    document.body,
  );
}

/** Lencana sisa waktu soal */
export function TimeChip({ left }: { left: number }) {
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black",
        left < 5
          ? "animate-pulse bg-rose-100 text-rose-600"
          : "bg-amber-100 text-amber-700",
      )}
    >
      ⏱ {Math.ceil(left)} dtk
    </span>
  );
}

/** Hasil jawaban + pembahasan (bisa dibuka) + tombol lanjut */
export function FeedbackBox({
  feedback,
  message,
  onNext,
  nextLabel,
}: {
  feedback: Feedback;
  message?: React.ReactNode;
  onNext?: () => void;
  nextLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "animate-scale-in rounded-2xl p-3 text-sm ring-1",
        feedback.correct
          ? "bg-emerald-50 ring-emerald-100"
          : "bg-rose-50 ring-rose-100",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={cn(
            "font-bold",
            feedback.correct ? "text-emerald-700" : "text-rose-600",
          )}
        >
          {feedback.correct
            ? `Benar! +${feedback.points} poin 😺`
            : feedback.choice === -1
              ? `Waktu habis — jawabannya ${LETTERS[feedback.answerIndex] ?? "-"}.`
              : `Kurang tepat — jawabannya ${LETTERS[feedback.answerIndex] ?? "-"}.`}{" "}
          {message && (
            <span className="font-semibold text-navy-600">{message}</span>
          )}
        </p>
        {onNext && (
          <button type="button" onClick={onNext} className="btn-primary py-2">
            {nextLabel ?? "Lanjut"}
          </button>
        )}
      </div>
      {feedback.explanation && (
        <>
          <button
            type="button"
            className="mt-1 text-xs font-bold text-navy-600 underline"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Sembunyikan pembahasan" : "Lihat pembahasan"}
          </button>
          {open && (
            <MathText
              as="p"
              text={feedback.explanation}
              className="mt-1 whitespace-pre-line text-navy-700"
            />
          )}
        </>
      )}
    </div>
  );
}

/** Lapisan hitung mundur & "Menghitung skor…" di atas arena */
export function ArenaOverlay({
  phase,
  count,
}: {
  phase: string;
  count: number;
}) {
  if (phase === "countdown")
    return (
      <div className="absolute inset-0 z-20 grid place-items-center bg-navy-950/40">
        <span
          key={count}
          className="animate-pop text-7xl font-black text-white drop-shadow-lg"
        >
          {count || "GO!"}
        </span>
      </div>
    );
  if (phase === "finishing")
    return (
      <div className="absolute inset-0 z-20 grid place-items-center bg-navy-950/55 text-white">
        <p className="flex items-center gap-2 text-lg font-bold">
          <Spinner /> Menghitung skor…
        </p>
      </div>
    );
  return null;
}

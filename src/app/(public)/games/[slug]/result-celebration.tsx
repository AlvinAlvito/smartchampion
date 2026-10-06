"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Crown, Medal, RotateCcw, Sparkles, Star, ThumbsUp, TrendingUp, Trophy } from "lucide-react";
import type { ScoreResult, ScoreTier } from "@/app/actions/games";
import { Confetti } from "@/components/confetti";
import { cn } from "@/lib/utils";

const TIER: Record<
  ScoreTier,
  { title: string; message: string; stars: number; bg: string; accent: string }
> = {
  rendah: {
    title: "Jangan menyerah!",
    message: "Setiap juara pernah memulai dari sini. Pelajari lagi soalnya, lalu coba sekali lagi 💪",
    stars: 0,
    bg: "from-slate-600 via-navy-800 to-navy-950",
    accent: "text-sky-200",
  },
  normal: {
    title: "Lumayan bagus!",
    message: "Kamu sudah di jalur yang benar. Sedikit lebih cepat & teliti, skormu pasti naik 🚀",
    stars: 1,
    bg: "from-navy-700 via-brand-800 to-navy-950",
    accent: "text-brand-200",
  },
  tinggi: {
    title: "Keren banget!",
    message: "Skor tinggi! Kamu makin dekat ke puncak leaderboard 🔥",
    stars: 2,
    bg: "from-brand-600 via-brand-800 to-navy-900",
    accent: "text-sun-200",
  },
  tertinggi: {
    title: "Luar biasa, sang juara!",
    message: "Performa terbaik! Kamu layak berada di puncak 👑",
    stars: 3,
    bg: "from-amber-500 via-brand-700 to-navy-900",
    accent: "text-amber-100",
  },
};

function useCountUp(target: number, duration = 1400) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return n;
}

function TierVisual({ tier }: { tier: ScoreTier }) {
  if (tier === "rendah") {
    return (
      <div className="relative mx-auto h-28 w-32">
        <div className="absolute inset-x-0 top-0 mx-auto flex animate-[wobble_2.5s_ease-in-out_infinite] justify-center text-7xl drop-shadow-lg">☁️</div>
        {[18, 38, 58, 78, 48, 28].map((x, i) => (
          <span
            key={i}
            className="absolute top-14 h-3 w-1 rounded-full bg-sky-300/80"
            style={{ left: `${x}%`, animation: `rain-drop 1.1s linear ${i * 0.18}s infinite` }}
          />
        ))}
      </div>
    );
  }
  if (tier === "normal") {
    return (
      <div className="mx-auto grid h-28 w-28 animate-pop place-items-center rounded-full bg-white/10 ring-4 ring-white/15">
        <ThumbsUp className="h-14 w-14 animate-[wobble_1.2s_ease-in-out_2] text-brand-200" />
      </div>
    );
  }
  if (tier === "tinggi") {
    return (
      <div className="relative mx-auto grid h-28 w-28 place-items-center">
        {[
          [-8, 10],
          [95, 20],
          [10, 85],
          [88, 80],
        ].map(([x, y], i) => (
          <Sparkles
            key={i}
            className="absolute h-5 w-5 text-sun-200"
            style={{ left: `${x}%`, top: `${y}%`, animation: `sparkle 1.4s ease-in-out ${i * 0.3}s infinite` }}
          />
        ))}
        <div className="grid h-28 w-28 animate-pop place-items-center rounded-full bg-linear-to-br from-sun-300 to-brand-600 shadow-[0_0_40px_rgba(249,208,20,0.55)]">
          <Trophy className="h-14 w-14 text-white" />
        </div>
      </div>
    );
  }
  // tertinggi
  return (
    <div className="relative mx-auto grid h-36 w-36 place-items-center">
      <div
        className="absolute inset-[-40%] rounded-full opacity-60"
        style={{
          background: "repeating-conic-gradient(from 0deg, rgba(253,224,71,0.55) 0deg 10deg, transparent 10deg 30deg)",
          animation: "rays-spin 9s linear infinite",
          maskImage: "radial-gradient(circle, black 30%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(circle, black 30%, transparent 70%)",
        }}
      />
      <div className="relative grid h-28 w-28 place-items-center rounded-full bg-linear-to-br from-amber-300 via-amber-400 to-orange-500 shadow-[0_0_60px_rgba(251,191,36,0.8)] ring-4 ring-amber-200/60">
        <Crown className="h-16 w-16 text-white drop-shadow" style={{ animation: "crown-drop 0.9s cubic-bezier(0.22,1,0.36,1) both" }} />
      </div>
    </div>
  );
}

export function ResultCelebration({ result, onReplay, canSave }: { result: ScoreResult; onReplay: () => void; canSave: boolean }) {
  const t = TIER[result.tier];
  const score = useCountUp(result.score);
  const accuracy = result.total ? Math.round((result.correct / result.total) * 100) : 0;

  return (
    <div className="card relative overflow-hidden p-0!">
      {(result.tier === "tinggi" || result.tier === "tertinggi") && <Confetti count={result.tier === "tertinggi" ? 90 : 40} />}
      <div className={cn("relative overflow-hidden bg-linear-to-br px-6 pb-8 pt-9 text-center text-white", t.bg)}>
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
        <div className="relative">
          <TierVisual tier={result.tier} />

          {/* Bintang */}
          <div className="mt-5 flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <Star
                key={i}
                className={cn("h-8 w-8", i < t.stars ? "fill-amber-300 text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,0.8)]" : "text-white/25")}
                style={i < t.stars ? { animation: `star-in 0.5s cubic-bezier(0.34,1.56,0.64,1) ${0.5 + i * 0.25}s both` } : undefined}
              />
            ))}
          </div>

          <p className={cn("mt-4 text-sm font-semibold uppercase tracking-[0.2em]", t.accent)}>Skor kamu</p>
          <p className="text-6xl font-extrabold tabular-nums tracking-tight">{score}</p>
          <h2 className="mt-3 text-xl font-extrabold">{t.title}</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-white/75">{t.message}</p>

          {(result.personalBest && result.previousBest != null) || result.rank ? (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {result.personalBest && result.previousBest != null && (
                <span className="inline-flex animate-pop items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/20 [animation-delay:1.2s]">
                  <TrendingUp className="h-3.5 w-3.5" /> Rekor baru! (sebelumnya {result.previousBest})
                </span>
              )}
              {result.rank && (
                <span className="inline-flex animate-pop items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/20 [animation-delay:1.4s]">
                  <Medal className="h-3.5 w-3.5" /> Peringkat #{result.rank} dari {result.players} pemain
                </span>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-navy-50 border-b border-navy-50 text-center">
        <div className="p-4">
          <p className="text-2xl font-extrabold text-emerald-600">{result.correct}</p>
          <p className="text-xs text-navy-400">Benar</p>
        </div>
        <div className="p-4">
          <p className="text-2xl font-extrabold text-rose-500">{result.total - result.correct}</p>
          <p className="text-xs text-navy-400">Salah</p>
        </div>
        <div className="p-4">
          <p className="text-2xl font-extrabold text-brand-700">{accuracy}%</p>
          <p className="text-xs text-navy-400">Akurasi</p>
        </div>
      </div>
      {!result.saved && (
        <p className="border-b border-navy-50 bg-amber-50 px-5 py-3 text-center text-xs text-amber-800">
          {canSave ? "Skor tidak tersimpan." : "Skor tidak masuk leaderboard (hanya akun peserta pada game yang sudah rilis)."}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2 p-5">
        <button onClick={onReplay} className="btn-primary">
          <RotateCcw className="h-4 w-4" /> Main lagi
        </button>
        <Link href="/games" className="btn-secondary">
          Game lainnya
        </Link>
      </div>
    </div>
  );
}

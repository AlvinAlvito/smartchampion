"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { QuizPlayer } from "./quiz-player";

type QuizProps = Omit<React.ComponentProps<typeof QuizPlayer>, "onPlayingChange">;

/**
 * Tata letak halaman game. Saat sedang bermain, leaderboard disembunyikan
 * dan kartu kuis dipusatkan agar peserta fokus.
 */
export function GameStage({ quiz, leaderboard }: { quiz: QuizProps; leaderboard: React.ReactNode }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className={cn("container-page relative z-10 -mt-16 grid gap-6 pb-10", !playing && "lg:grid-cols-3")}>
      <div id="quiz-area" className={cn("scroll-mt-20", playing ? "mx-auto w-full max-w-3xl" : "lg:col-span-2")}>
        <QuizPlayer {...quiz} onPlayingChange={setPlaying} />
      </div>
      {!playing && <div className="animate-fade-up">{leaderboard}</div>}
    </div>
  );
}

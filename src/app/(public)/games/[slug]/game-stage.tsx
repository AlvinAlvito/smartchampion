"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { QuizPlayer } from "./quiz-player";
import { AdventurePlayer } from "./adventure-player";
import { RunnerPlayer } from "./runner-player";
import { DuelPlayer } from "./duel-player";
import { MazePlayer } from "./maze-player";
import { BoardPlayer } from "./board-player";
import { CafePlayer } from "./cafe-player";
import { FishingPlayer } from "./fishing-player";
import { PenaltyPlayer } from "./penalty-player";
import { KartPlayer } from "./kart-player";

type QuizProps = Omit<React.ComponentProps<typeof QuizPlayer>, "onPlayingChange" | "onAdventure" | "onRunner" | "onDuel" | "onMaze" | "onBoard" | "onCafe" | "onFishing" | "onPenalty" | "onKart">;

/**
 * Tata letak halaman game. Saat sedang bermain, leaderboard disembunyikan
 * dan kartu kuis dipusatkan agar peserta fokus.
 */
export function GameStage({ quiz, leaderboard }: { quiz: QuizProps; leaderboard: React.ReactNode }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className={cn("container-page relative z-10 -mt-16 grid gap-6 pb-10", !playing && "lg:grid-cols-3")}>
      <div id="quiz-area" className={cn("scroll-mt-20", playing ? "mx-auto w-full max-w-3xl" : "lg:col-span-2")}>
        <ModeSwitch quiz={quiz} onPlayingChange={setPlaying} />
      </div>
      {!playing && <div className="animate-fade-up">{leaderboard}</div>}
    </div>
  );
}

/**
 * Mode bermain: klasik, petualangan (lompat ke atas), lari lintasan (ganti jalur), duel (pertarungan bergiliran), labirin, ular tangga, kafe kucing, memancing, adu penalti, balap gokart — soal & skor sama.
 * Status mode sengaja disimpan di sini, bukan di GameStage: ganti mode tidak merender ulang leaderboard
 * (elemen milik Server Component) — React DevTools 8 melempar "The children should not have changed…" bila itu terjadi.
 */
function ModeSwitch({ quiz, onPlayingChange }: { quiz: QuizProps; onPlayingChange: (playing: boolean) => void }) {
  const [mode, setMode] = useState<"classic" | "adventure" | "runner" | "duel" | "maze" | "board" | "cafe" | "fishing" | "penalty" | "kart">("classic");
  const common = {
    gameId: quiz.gameId,
    secondsPerQuestion: quiz.secondsPerQuestion,
    questions: quiz.questions,
    loggedIn: quiz.loggedIn,
    canSave: quiz.canSave,
    loginHref: quiz.loginHref,
    onPlayingChange,
    onExit: () => {
      setMode("classic");
      onPlayingChange(false);
    },
  };
  if (mode === "adventure") return <AdventurePlayer {...common} />;
  if (mode === "runner") return <RunnerPlayer {...common} />;
  if (mode === "duel") return <DuelPlayer {...common} />;
  if (mode === "maze") return <MazePlayer {...common} />;
  if (mode === "board") return <BoardPlayer {...common} />;
  if (mode === "cafe") return <CafePlayer {...common} />;
  if (mode === "fishing") return <FishingPlayer {...common} />;
  if (mode === "penalty") return <PenaltyPlayer {...common} />;
  if (mode === "kart") return <KartPlayer {...common} />;
  return (
    <QuizPlayer
      {...quiz}
      onPlayingChange={onPlayingChange}
      onAdventure={() => setMode("adventure")}
      onRunner={() => setMode("runner")}
      onDuel={() => setMode("duel")}
      onMaze={() => setMode("maze")}
      onBoard={() => setMode("board")}
      onCafe={() => setMode("cafe")}
      onFishing={() => setMode("fishing")}
      onPenalty={() => setMode("penalty")}
      onKart={() => setMode("kart")}
    />
  );
}

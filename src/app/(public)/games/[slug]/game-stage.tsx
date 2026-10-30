"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ResultExtras } from "./result-extras";
import type { PlayMode } from "@/lib/game-rules";
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
import { StationPlayer } from "./station-player";
import { PlatformPlayer } from "./platform-player";

type QuizProps = Omit<React.ComponentProps<typeof QuizPlayer>, "onPlayingChange" | "onAdventure" | "onRunner" | "onDuel" | "onMaze" | "onBoard" | "onCafe" | "onFishing" | "onPenalty" | "onKart" | "onStation" | "onPlatform">;

/**
 * Tata letak halaman game. Saat sedang bermain, leaderboard disembunyikan
 * dan kartu kuis dipusatkan agar peserta fokus.
 */
export function GameStage({ quiz, leaderboard, initialMode }: { quiz: QuizProps; leaderboard: React.ReactNode; initialMode?: PlayMode }) {
  const [playing, setPlaying] = useState(false);
  // dari Arena Game: langsung bermain, leaderboard baru tampil di layar hasil
  if (initialMode)
    return (
      <ResultExtras.Provider value={{ leaderboard, backHref: `/games?mode=${initialMode}#pilih-soal` }}>
        <div className="container-page relative z-10 -mt-16 pb-10">
          <div id="quiz-area" className="mx-auto w-full max-w-3xl scroll-mt-20">
            <ModeSwitch quiz={quiz} onPlayingChange={setPlaying} initialMode={initialMode} />
          </div>
        </div>
      </ResultExtras.Provider>
    );
  return (
    <div className={cn("container-page relative z-10 -mt-16 grid gap-6 pb-10", !playing && "lg:grid-cols-3")}>
      <div id="quiz-area" className={cn("scroll-mt-20", playing ? "mx-auto w-full max-w-3xl" : "lg:col-span-2")}>
        <ModeSwitch quiz={quiz} onPlayingChange={setPlaying} initialMode={initialMode} />
      </div>
      {!playing && <div className="animate-fade-up">{leaderboard}</div>}
    </div>
  );
}

/**
 * Mode bermain: klasik, petualangan (lompat ke atas), lari lintasan (ganti jalur), duel (pertarungan bergiliran), labirin, ular tangga, kafe kucing, memancing, adu penalti, balap gokart, stasiun luar angkasa, platformer lembah pixel — soal & skor sama.
 * Status mode sengaja disimpan di sini, bukan di GameStage: ganti mode tidak merender ulang leaderboard
 * (elemen milik Server Component) — React DevTools 8 melempar "The children should not have changed…" bila itu terjadi.
 */
/** `initialMode` = mode yang dipilih di Arena Game (/games?mode=…); klasik dari sana tampil tanpa pemilih mode */
function ModeSwitch({ quiz, onPlayingChange, initialMode }: { quiz: QuizProps; onPlayingChange: (playing: boolean) => void; initialMode?: PlayMode }) {
  const [mode, setMode] = useState<"classic" | "adventure" | "runner" | "duel" | "maze" | "board" | "cafe" | "fishing" | "penalty" | "kart" | "station" | "platform">(initialMode ?? "classic");
  const router = useRouter();
  const common = {
    gameId: quiz.gameId,
    secondsPerQuestion: quiz.secondsPerQuestion,
    questions: quiz.questions,
    loggedIn: quiz.loggedIn,
    canSave: quiz.canSave,
    loginHref: quiz.loginHref,
    onPlayingChange,
    // dari Arena Game: langsung mulai; keluar = kembali ke daftar soal mode tersebut
    autoStart: !!initialMode && mode === initialMode,
    onExit: () => {
      if (initialMode) return router.push(`/games?mode=${initialMode}#pilih-soal`);
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
  if (mode === "station") return <StationPlayer {...common} />;
  if (mode === "platform") return <PlatformPlayer {...common} />;
  if (initialMode === "classic") return <QuizPlayer {...quiz} onPlayingChange={onPlayingChange} autoStart />;
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
      onStation={() => setMode("station")}
      onPlatform={() => setMode("platform")}
    />
  );
}

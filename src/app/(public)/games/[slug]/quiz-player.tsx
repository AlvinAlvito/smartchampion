"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, Check, Flame, Lightbulb, ListChecks, LogIn, Play, Timer, Volume2, VolumeX, X, Zap } from "lucide-react";
import { checkAnswerAction, questionShownAction, startPlayAction, submitScoreAction, takeHintAction, type ScoreResult } from "@/app/actions/games";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/form-buttons";
import { gameAudio } from "@/lib/game-audio";
import { ResultCelebration } from "./result-celebration";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/math-text";
import { GameCat } from "@/components/game-cat";
import { catMood, GAME_HINTS, type CatMood } from "@/lib/game-rules";

type Question = { id: number; text: string; options: string[]; points: number };
type Phase = "intro" | "countdown" | "question" | "feedback" | "finishing" | "result";

/** Tombol suara on/off (status disimpan di localStorage oleh gameAudio). */
function SoundToggle({ dark = false }: { dark?: boolean }) {
  const audio = gameAudio();
  const muted = useSyncExternalStore(
    audio.subscribe,
    () => audio.muted,
    () => false,
  );
  return (
    <button
      type="button"
      onClick={() => {
        audio.unlock();
        audio.setMuted(!muted);
      }}
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-xl transition active:scale-90",
        dark ? "bg-white/10 text-white hover:bg-white/20" : "bg-navy-50 text-navy-500 hover:bg-brand-50 hover:text-brand-600",
      )}
      aria-label={muted ? "Nyalakan suara" : "Matikan suara"}
      title={muted ? "Nyalakan suara" : "Matikan suara"}
    >
      {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
    </button>
  );
}

/** Ucapan maskot per suasana hati */
function catLine(mood: CatMood, streak: number, wrongStreak: number, hintsLeft: number) {
  switch (mood) {
    case "senyum":
      return "Benar! Aku ikut senang 😺";
    case "tertawa":
      return `Hebat! ${streak} benar beruntun! 😹`;
    case "girang":
      return `Luar biasa!! ${streak} beruntun — kamu jago banget! 🎉`;
    case "sedih":
      return "Yah… tidak apa-apa, baca pembahasannya ya.";
    case "berkaca":
      return `Hiks… ${wrongStreak}x meleset. Pelan-pelan saja, kamu pasti bisa.`;
    case "menangis":
      return hintsLeft > 0 ? "Huaaa… 😿 pakai petunjuk yuk, biar pilihannya tinggal 2!" : "Huaaa… 😿 tidak apa-apa, ayo bangkit lagi!";
    default:
      return "Halo! Aku menemanimu main. Ayo jawab yang benar! 😸";
  }
}

const OPTION_STYLES = [
  { bg: "from-brand-500 to-brand-700", key: "A" },
  { bg: "from-sky-500 to-navy-600", key: "B" },
  { bg: "from-sun-500 to-sun-700", key: "C" },
  { bg: "from-sky-500 to-navy-800", key: "D" },
  { bg: "from-brand-400 to-navy-700", key: "E" },
];

export function QuizPlayer(props: {
  gameId: number;
  description: string;
  secondsPerQuestion: number;
  questions: Question[];
  loggedIn: boolean;
  canSave: boolean;
  loginHref: string;
  bestScore: number | null;
  /** Dipanggil saat mulai/selesai bermain (untuk menyembunyikan leaderboard). */
  onPlayingChange?: (playing: boolean) => void;
}) {
  const { gameId, questions, secondsPerQuestion } = props;
  const router = useRouter();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("intro");
  const [count, setCount] = useState(3);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(secondsPerQuestion);
  const [streak, setStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [hintsLeft, setHintsLeft] = useState(GAME_HINTS);
  const [hidden, setHidden] = useState<number[]>([]); // opsi yang disembunyikan petunjuk 50:50
  const [hinting, setHinting] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [correctSoFar, setCorrectSoFar] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const startedAt = useRef(0);
  const playToken = useRef<string | null>(null); // sesi bermain di server (anti-curang)
  const locked = useRef(false);
  const lastTick = useRef(0);
  const onPlayingChange = props.onPlayingChange;
  const playing = phase === "countdown" || phase === "question" || phase === "feedback" || phase === "finishing";

  // Beri tahu halaman (sembunyikan leaderboard selama bermain)
  useEffect(() => {
    onPlayingChange?.(playing);
  }, [playing, onPlayingChange]);

  // Hentikan musik bila halaman ditinggalkan
  useEffect(() => () => gameAudio().stopMusic(0.1), []);

  const q = questions[index];
  const streakRef = useRef(0);
  useEffect(() => {
    streakRef.current = streak;
  }, [streak]);

  const startQuestion = useCallback(() => {
    setPicked(null);
    setCorrectIndex(null);
    setHidden([]);
    setExplanation(null);
    setTimeLeft(secondsPerQuestion);
    startedAt.current = performance.now();
    locked.current = false;
    lastTick.current = 0;
    gameAudio().setIntensity(false);
    setPhase("question");
  }, [secondsPerQuestion]);

  const answer = useCallback(
    async (choice: number) => {
      if (locked.current || !q) return;
      locked.current = true;
      const elapsedMs = Math.round(performance.now() - startedAt.current);
      setPicked(choice);
      setChecking(true);
      try {
        const res = await checkAnswerAction(playToken.current ?? "", q.id, choice, elapsedMs);
        if ("error" in res && res.error) toast.error(res.error);
        setCorrectIndex(res.answerIndex);
        setExplanation(res.explanation ?? null);
        setStreak((s) => (res.correct ? s + 1 : 0));
        setWrongStreak((s) => (res.correct ? 0 : s + 1));
        if (res.correct) setCorrectSoFar((c) => c + 1);
        const audio = gameAudio();
        audio.setIntensity(false);
        if (choice === -1) audio.timeout();
        else if (res.correct) audio.correct(streakRef.current + 1);
        else audio.wrong();
      } catch {
        toast.error("Koneksi terputus saat mengecek jawaban.");
      } finally {
        setChecking(false);
        setPhase("feedback");
      }
    },
    [q, toast],
  );

  // Soal tampil → catat di server (dasar waktu jawab)
  useEffect(() => {
    if (phase !== "question" || !q || !playToken.current) return;
    void questionShownAction(playToken.current, q.id);
  }, [phase, q]);

  // Hitung mundur 3-2-1
  useEffect(() => {
    if (phase !== "countdown") return;
    gameAudio().countdown(count === 0);
    const t = setTimeout(() => (count === 0 ? startQuestion() : setCount((c) => c - 1)), count === 0 ? 350 : 650);
    return () => clearTimeout(t);
  }, [phase, count, startQuestion]);

  // Saat mulai / ganti soal / hasil: pastikan area kuis terlihat (kartu intro lebih tinggi dari kartu soal)
  useEffect(() => {
    if (phase === "intro" || phase === "feedback") return;
    const el = document.getElementById("quiz-area");
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top < 72 || top > window.innerHeight * 0.4) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [phase, index]);

  // Timer soal
  useEffect(() => {
    if (phase !== "question") return;
    const t = setInterval(() => {
      const left = secondsPerQuestion - (performance.now() - startedAt.current) / 1000;
      setTimeLeft(Math.max(0, left));
      // detak & musik lebih cepat di 5 detik terakhir
      const sec = Math.ceil(left);
      if (left > 0 && sec <= 5 && sec !== lastTick.current) {
        lastTick.current = sec;
        gameAudio().tick();
        gameAudio().setIntensity(true);
      }
      if (left <= 0) {
        clearInterval(t);
        void answer(-1);
      }
    }, 100);
    return () => clearInterval(t);
  }, [phase, secondsPerQuestion, answer]);

  const begin = () => {
    const audio = gameAudio();
    audio.unlock();
    audio.click();
    audio.startMusic();
    setIndex(0);
    setStreak(0);
    setWrongStreak(0);
    setHintsLeft(GAME_HINTS);
    setCorrectSoFar(0);
    setResult(null);
    setCount(3);
    setPhase("countdown");
    playToken.current = null;
    // sesi dibuat selama hitung mundur (3 detik) sehingga tidak menambah waktu tunggu
    startPlayAction(gameId)
      .then((r) => {
        if (r.token) playToken.current = r.token;
        else {
          toast.error(r.error ?? "Gagal memulai game.");
          gameAudio().stopMusic(0.1);
          setPhase("intro");
        }
      })
      .catch(() => {
        toast.error("Koneksi terputus. Coba mulai lagi.");
        setPhase("intro");
      });
  };

  // Petunjuk 50:50 — jatah & opsi yang dibuang ditentukan server
  const takeHint = async () => {
    if (!q || phase !== "question" || hinting || locked.current || hintsLeft <= 0 || hidden.length) return;
    setHinting(true);
    gameAudio().click();
    try {
      const res = await takeHintAction(playToken.current ?? "", q.id);
      if (res.error) toast.error(res.error);
      if (typeof res.left === "number") setHintsLeft(res.left);
      // jawaban mungkin sudah dikirim selama menunggu → abaikan
      if (res.removed && !locked.current) setHidden(res.removed);
    } catch {
      toast.error("Koneksi terputus saat mengambil petunjuk.");
    } finally {
      setHinting(false);
    }
  };

  // Pembahasan muncul → pastikan terlihat (terutama di HP)
  useEffect(() => {
    if (phase !== "feedback") return;
    const t = setTimeout(() => document.getElementById("quiz-feedback")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 120);
    return () => clearTimeout(t);
  }, [phase]);

  const next = async () => {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      startQuestion();
      return;
    }
    setPhase("finishing");
    gameAudio().stopMusic();
    try {
      const res = await submitScoreAction(playToken.current ?? "");
      playToken.current = null;
      if ("error" in res) {
        toast.error(res.error ?? "Gagal menyimpan skor.");
        setPhase("intro");
        return;
      }
      setResult(res);
      setPhase("result");
      gameAudio().result(res.tier);
      if (res.saved)
        toast.success(
          res.personalBest
            ? `Rekor baru ${res.score} poin tersimpan ke leaderboard 🏆`
            : `Skor ${res.score} tersimpan. Skor terbaikmu tetap ${res.previousBest}.`,
        );
      router.refresh();
    } catch {
      toast.error("Gagal mengirim skor. Periksa koneksi lalu coba lagi.");
      setPhase("intro");
    }
  };

  if (!questions.length) return <div className="card text-sm text-navy-400">Game ini belum memiliki soal.</div>;

  /* -------- Intro -------- */
  if (phase === "intro") {
    return (
      <div className="card animate-fade-up space-y-6 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <p className="leading-relaxed text-navy-600">{props.description}</p>
          <SoundToggle />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ListChecks, t: `${questions.length} soal` },
            { icon: Timer, t: `${secondsPerQuestion} detik / soal` },
            { icon: Zap, t: "Makin cepat, skor makin besar" },
            { icon: Lightbulb, t: `${GAME_HINTS}x petunjuk 50:50` },
          ].map((f) => (
            <div key={f.t} className="flex items-center gap-3 rounded-2xl bg-linear-to-br from-brand-50 to-navy-50 p-4 text-sm font-semibold text-navy-700">
              <f.icon className="h-5 w-5 shrink-0 text-brand-600" /> {f.t}
            </div>
          ))}
        </div>
        {!props.loggedIn && (
          <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-100">
            Kamu belum masuk, jadi skor tidak tersimpan ke leaderboard.
            <Link href={props.loginHref} className="inline-flex items-center gap-1 font-bold underline">
              <LogIn className="h-4 w-4" /> Masuk dulu
            </Link>
          </p>
        )}
        <button onClick={begin} className="btn-primary w-full py-4 text-base">
          <Play className="h-5 w-5 fill-current" /> Mulai main
        </button>
      </div>
    );
  }

  /* -------- Hitung mundur -------- */
  if (phase === "countdown") {
    return (
      <div className="card grid min-h-[360px] place-items-center bg-linear-to-br from-navy-900 to-brand-900 text-white">
        <div className="text-center">
          <p key={count} className="animate-pop text-8xl font-extrabold">
            {count || "Go!"}
          </p>
          <p className="mt-2 text-brand-200">Bersiap…</p>
          <div className="mt-6 flex justify-center">
            <SoundToggle dark />
          </div>
        </div>
      </div>
    );
  }

  /* -------- Hasil -------- */
  if (phase === "result" || phase === "finishing") {
    if (phase === "finishing" || !result) {
      return (
        <div className="card grid min-h-90 place-items-center text-navy-400">
          <div className="flex flex-col items-center gap-3">
            <Spinner className="h-8 w-8 text-brand-600" />
            Menghitung skor…
          </div>
        </div>
      );
    }
    return <ResultCelebration result={result} onReplay={begin} canSave={props.canSave} />;
  }

  /* -------- Soal -------- */
  const pct = (timeLeft / secondsPerQuestion) * 100;
  const danger = timeLeft < 5;
  const isRight = phase === "feedback" && picked === correctIndex;
  const mood = catMood(streak, wrongStreak);
  const happy = mood === "senyum" || mood === "tertawa" || mood === "girang";
  const canHint = phase === "question" && hintsLeft > 0 && !hidden.length && q.options.length > 2;
  return (
    <div className="card space-y-5 p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-navy-900 px-3 py-1.5 text-xs font-bold text-white">
            {index + 1} / {questions.length}
          </span>
          <span className="flex items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700">
            <Check className="h-3.5 w-3.5" /> {correctSoFar}
          </span>
          {streak >= 2 && (
            <span
              key={streak}
              className="flex animate-pop items-center gap-1 rounded-xl bg-linear-to-r from-orange-400 to-rose-500 px-2.5 py-1.5 text-xs font-bold text-white"
            >
              <Flame className="h-3.5 w-3.5" /> {streak}x
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <SoundToggle />
          {/* Timer lingkaran */}
          <div className="relative h-12 w-12">
            <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#d8eef9" strokeWidth="3.5" />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke={danger ? "#f43f5e" : "#1a6f9f"}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * 97.4} 97.4`}
                className="transition-[stroke-dasharray] duration-100"
              />
            </svg>
            <span className={cn("absolute inset-0 grid place-items-center text-sm font-extrabold", danger ? "animate-pulse text-rose-600" : "text-navy-800")}>
              {Math.ceil(timeLeft)}
            </span>
          </div>
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-navy-50">
        <div
          className="h-full rounded-full bg-linear-to-r from-brand-500 to-navy-600 transition-all duration-500"
          style={{ width: `${(index / questions.length) * 100}%` }}
        />
      </div>

      {/* Maskot kucing: ekspresi mengikuti jawaban beruntun */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-2 sm:gap-3">
          <div key={mood} className="h-20 w-20 shrink-0 animate-pop sm:h-28 sm:w-28">
            <GameCat mood={mood} className="h-full w-full" />
          </div>
          <p
            key={`${mood}-${streak}-${wrongStreak}`}
            className={cn(
              "min-w-0 animate-scale-in rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm font-semibold leading-snug shadow-sm ring-1",
              mood === "netral"
                ? "bg-brand-50 text-brand-800 ring-brand-100"
                : happy
                  ? "bg-sun-50 text-amber-800 ring-sun-200"
                  : "bg-sky-50 text-navy-700 ring-sky-100",
            )}
          >
            {catLine(mood, streak, wrongStreak, hintsLeft)}
          </p>
        </div>
        <button
          type="button"
          onClick={takeHint}
          disabled={!canHint || hinting}
          title={q.options.length <= 2 ? "Soal ini hanya punya 2 pilihan" : hintsLeft ? "Sisakan 2 pilihan jawaban" : "Jatah petunjuk habis"}
          className={cn(
            "ml-auto inline-flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-bold transition",
            canHint
              ? "bg-linear-to-br from-sun-300 to-sun-500 text-brand-900 shadow-lg shadow-sun-200 hover:-translate-y-0.5 hover:brightness-105 active:scale-95"
              : "bg-navy-50 text-navy-300",
            mood === "menangis" && canHint && "animate-pulse",
          )}
        >
          {hinting ? <Spinner /> : <Lightbulb className="h-4 w-4" />}
          Petunjuk 50:50
          <span className="flex gap-0.5" aria-label={`sisa ${hintsLeft} petunjuk`}>
            {Array.from({ length: GAME_HINTS }, (_, i) => (
              <span key={i} className={cn("h-2 w-2 rounded-full", i < hintsLeft ? (canHint ? "bg-brand-900" : "bg-navy-300") : "bg-navy-200/60")} />
            ))}
          </span>
        </button>
      </div>

      <MathText key={q.id} as="p" text={q.text} className="animate-fade-up text-lg font-bold leading-snug text-navy-900 sm:text-xl" />

      <div key={`opts-${q.id}`} className="stagger grid gap-3 sm:grid-cols-2">
        {q.options.map((opt, i) => {
          const style = OPTION_STYLES[i % OPTION_STYLES.length];
          const isCorrect = phase === "feedback" && i === correctIndex;
          const isWrongPick = phase === "feedback" && i === picked && i !== correctIndex;
          const isPicking = checking && i === picked;
          const isHidden = hidden.includes(i) && !isCorrect;
          return (
            <button
              key={i}
              disabled={phase !== "question" || isHidden}
              aria-hidden={isHidden || undefined}
              onClick={() => answer(i)}
              className={cn(
                "group relative flex min-h-[64px] items-center gap-3 rounded-2xl bg-linear-to-br px-4 py-3.5 text-left font-semibold text-white shadow-lg transition duration-200",
                style.bg,
                phase === "question" && !isHidden && "hover:-translate-y-0.5 hover:shadow-xl hover:brightness-110 active:scale-[0.98]",
                isHidden && "scale-95 opacity-15 shadow-none grayscale",
                phase === "feedback" && !isCorrect && !isWrongPick && "opacity-35 saturate-50",
                isCorrect && "animate-pop ring-4 ring-emerald-300",
                isWrongPick && "animate-shake ring-4 ring-rose-300",
                isPicking && "ring-4 ring-white/60",
              )}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/20 text-sm font-extrabold">
                {isPicking ? <Spinner /> : isCorrect ? <Check className="h-4 w-4" /> : isWrongPick ? <X className="h-4 w-4" /> : style.key}
              </span>
              <MathText text={opt} className={cn("min-w-0", isHidden && "line-through")} />
            </button>
          );
        })}
      </div>

      {phase === "feedback" && (
        <div
          id="quiz-feedback"
          className={cn(
            "animate-scale-in scroll-mb-4 overflow-hidden rounded-2xl ring-1",
            isRight ? "bg-emerald-50 ring-emerald-100" : "bg-rose-50 ring-rose-100",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className={cn("flex items-center gap-2 font-bold", isRight ? "text-emerald-700" : "text-rose-600")}>
              {isRight ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
              {picked === -1 ? "Waktu habis!" : isRight ? (streak >= 3 ? `Benar! ${streak} beruntun 🔥` : "Benar! 🎉") : "Kurang tepat"}
            </p>
            <button onClick={next} className="btn-primary">
              {index + 1 < questions.length ? "Soal berikutnya" : "Lihat skor"} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          {(explanation || (!isRight && correctIndex != null && correctIndex >= 0)) && (
            <div className="space-y-2.5 border-t border-white bg-white/70 px-4 py-3.5 text-sm leading-relaxed text-navy-700">
              {!isRight && correctIndex != null && correctIndex >= 0 && (
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-navy-500">Jawaban benar:</span>
                  <span className="rounded-lg bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                    {OPTION_STYLES[correctIndex % OPTION_STYLES.length].key}. <MathText text={q.options[correctIndex] ?? ""} />
                  </span>
                </p>
              )}
              {explanation && (
                <div className="flex gap-2.5">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-sun-100 text-amber-600">
                    <Lightbulb className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-navy-400">Pembahasan</p>
                    <MathText as="p" text={explanation} className="mt-0.5" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

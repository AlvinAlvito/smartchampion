"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coffee } from "lucide-react";
import type { ScoreResult } from "@/app/actions/games";
import { Spinner } from "@/components/form-buttons";
import { GameCat } from "@/components/game-cat";
import { MathText } from "@/components/math-text";
import { gameAudio } from "@/lib/game-audio";
import { catMood, GAME_HINTS } from "@/lib/game-rules";
import { cn } from "@/lib/utils";
import { ResultCelebration } from "./result-celebration";
import {
  ArenaFrame,
  ArenaOverlay,
  FeedbackBox,
  LETTERS,
  optionCount,
  pointsFor,
  ReadyCard,
  requestMobileFullscreen,
  TimeChip,
  useCountdown,
  useQuestionTimer,
  useQuizSession,
  type Feedback,
  type PlayerProps,
} from "./play-kit";

/**
 * Mode Kafe Kucing: soal yang sama dengan mode klasik, dimainkan sebagai kafe.
 * Tiap soal = satu pelanggan hewan; pilihan jawaban = hidangan di meja saji. Sajikan hidangan yang benar.
 * Kesabaran pelanggan = waktu soal. Benar → pelanggan senang & membayar koin (= poin), cepat = tip kilat;
 * salah / waktu habis → pelanggan cemberut & pergi. Tiap 3 jawaban benar kafe naik level (dekorasi baru).
 * Koin, rating & dekorasi hanya tampilan — skor = skor klasik dari server.
 */

type Phase = "ready" | "countdown" | "playing" | "finishing" | "result";
/** enter = pelanggan masuk · question · checking · react = pelanggan bereaksi · feedback */
type Stage = "enter" | "question" | "checking" | "react" | "feedback";

const CUSTOMERS = [
  "🐶",
  "🐰",
  "🐻",
  "🐼",
  "🦊",
  "🐸",
  "🐨",
  "🐯",
  "🐷",
  "🐮",
  "🐵",
  "🦁",
  "🐹",
  "🐧",
];
const NAMES = [
  "Doni",
  "Rara",
  "Beri",
  "Pandu",
  "Fifi",
  "Kiki",
  "Lala",
  "Tigo",
  "Pipi",
  "Momo",
  "Ucok",
  "Leo",
  "Hamzi",
  "Pingo",
];
const DISHES = ["🍰", "🍜", "🍕", "🍣", "🍩"];
const DISH_BG = [
  "from-pink-100 to-rose-200",
  "from-amber-100 to-orange-200",
  "from-red-100 to-orange-200",
  "from-sky-100 to-cyan-200",
  "from-violet-100 to-fuchsia-200",
];
const DECOR = [
  { icon: "🪴", name: "Tanaman hijau" },
  { icon: "💡", name: "Lampu gantung" },
  { icon: "🖼️", name: "Lukisan kucing" },
  { icon: "🎶", name: "Musik santai" },
  { icon: "🌸", name: "Vas bunga" },
  { icon: "🏆", name: "Piala kafe terbaik" },
];
const ENTER_MS = 900;
const REACT_MS = 1300;
/** tip kilat bila dijawab benar dalam 40% awal waktu */
const TIP_REMAIN = 0.6;

export function CafePlayer(props: PlayerProps) {
  const { gameId, questions, secondsPerQuestion, onPlayingChange } = props;
  const session = useQuizSession(gameId, "cafe");
  const [phase, setPhase] = useState<Phase>("ready");
  const [stage, setStage] = useState<Stage>("enter");
  const [level, setLevel] = useState(0);
  const [guest, setGuest] = useState(0);
  const [served, setServed] = useState<number | null>(null);
  const [mood, setMood] = useState<"wait" | "happy" | "sad" | "angry">("wait");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [hintsLeft, setHintsLeft] = useState(GAME_HINTS);
  const [hinting, setHinting] = useState(false);
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [happy, setHappy] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [floatText, setFloatText] = useState<{
    text: string;
    key: number;
    good: boolean;
  } | null>(null);
  const [banner, setBanner] = useState<{ text: string; key: number } | null>(
    null,
  );
  const [result, setResult] = useState<ScoreResult | null>(null);
  const run = useRef(0);
  const order = useRef<number[]>([]);
  const happyRef = useRef(0);

  useEffect(() => {
    onPlayingChange?.(phase !== "ready");
  }, [phase, onPlayingChange]);
  useEffect(() => () => gameAudio().stopMusic(0.1), []);

  const later = useCallback((ms: number, fn: () => void) => {
    const id = run.current;
    setTimeout(() => {
      if (run.current === id) fn();
    }, ms);
  }, []);

  const q = questions[level];
  const decor = Math.min(DECOR.length, Math.floor(happy / 3));
  const rating =
    level === 0 && !feedback
      ? 5
      : Math.max(
          1,
          Math.round((happy / Math.max(1, level + (feedback ? 1 : 0))) * 5),
        );

  /** pelanggan ke-i masuk, lalu soal tampil (waktu soal mulai) */
  const nextGuest = useCallback(
    (i: number) => {
      setLevel(i);
      setGuest(order.current[i % order.current.length] ?? 0);
      setFeedback(null);
      setServed(null);
      setHidden([]);
      setMood("wait");
      setStage("enter");
      gameAudio().whoosh();
      later(ENTER_MS, () => {
        setStage("question");
        session.shown(questions[i].id);
      });
    },
    [later, questions, session],
  );

  const answerRef = useRef<(k: number) => void>(() => undefined);
  const timer = useQuestionTimer(
    phase === "playing" && stage === "question" ? level : null,
    secondsPerQuestion,
    () => answerRef.current(-1),
  );

  const answer = useCallback(
    async (k: number) => {
      if (stage !== "question") return;
      const elapsed = timer.elapsed();
      setServed(k);
      setStage("checking");
      if (k >= 0) gameAudio().press();
      const res = await session.check(q.id, k, elapsed);
      if (!res) return;
      const pts = res.correct
        ? pointsFor(q.points, secondsPerQuestion, elapsed)
        : 0;
      setFeedback({
        choice: k,
        correct: res.correct,
        answerIndex: res.answerIndex,
        explanation: res.explanation,
        points: pts,
      });
      setScore((s) => s + pts);
      const audio = gameAudio();
      setStage("react");
      if (res.correct) {
        const tip =
          1 -
            Math.min(elapsed, secondsPerQuestion * 1000) /
              (secondsPerQuestion * 1000) >=
          TIP_REMAIN;
        setMood("happy");
        setStreak((s) => {
          audio.correct(s + 1);
          return s + 1;
        });
        setWrongStreak(0);
        setCoins((c) => c + pts);
        setFloatText({
          text: `+${pts} 🪙${tip ? "  Tip kilat! ⚡" : ""}`,
          key: Date.now(),
          good: true,
        });
        later(400, () => audio.coin());
        const nh = ++happyRef.current;
        setHappy(nh);
        if (nh % 3 === 0 && nh / 3 <= DECOR.length)
          later(900, () => {
            setBanner({
              text: `🎉 Kafe naik level! ${DECOR[nh / 3 - 1].icon} ${DECOR[nh / 3 - 1].name}`,
              key: Date.now(),
            });
            audio.heal();
          });
      } else {
        setMood(k === -1 ? "angry" : "sad");
        setStreak(0);
        setWrongStreak((s) => s + 1);
        if (k === -1) audio.timeout();
        else audio.wrong();
        setFloatText({
          text: k === -1 ? "Kelamaan… 😤" : "Bukan ini pesananku! 😖",
          key: Date.now(),
          good: false,
        });
      }
      later(REACT_MS, () => setStage("feedback"));
    },
    [stage, q, session, secondsPerQuestion, timer, later],
  );
  useEffect(() => {
    answerRef.current = (k) => void answer(k);
  });

  const next = useCallback(async () => {
    if (stage !== "feedback") return;
    gameAudio().click();
    if (level + 1 < questions.length) return nextGuest(level + 1);
    setPhase("finishing");
    gameAudio().stopMusic();
    const res = await session.submit();
    if (!res) return setPhase("ready");
    setResult(res);
    setPhase("result");
    gameAudio().result(res.tier);
  }, [stage, level, questions.length, nextGuest, session]);

  const takeHint = async () => {
    if (stage !== "question" || hinting || hintsLeft <= 0 || hidden.length)
      return;
    setHinting(true);
    gameAudio().click();
    const i = level;
    const res = await session.hint(q.id);
    setHinting(false);
    if (!res) return;
    if (typeof res.left === "number") setHintsLeft(res.left);
    if (res.removed && i === level) setHidden(res.removed);
  };

  const cd = useCountdown(phase === "countdown", () => setPhase("playing"));
  const begin = async () => {
    requestMobileFullscreen();
    const audio = gameAudio();
    audio.unlock();
    audio.click();
    audio.startMusic();
    run.current++;
    order.current = CUSTOMERS.map((_, i) => i).sort(() => Math.random() - 0.5);
    setScore(0);
    setCoins(0);
    setHappy(0);
    happyRef.current = 0;
    setStreak(0);
    setWrongStreak(0);
    setHintsLeft(GAME_HINTS);
    setResult(null);
    setBanner(null);
    setFloatText(null);
    setFeedback(null);
    setLevel(0);
    setStage("enter");
    cd.reset();
    setPhase("countdown");
    const id = run.current;
    const ok = await session.start();
    if (run.current !== id) return;
    if (!ok) {
      gameAudio().stopMusic(0.1);
      setPhase("ready");
    }
  };
  const started = useRef(-1);
  useEffect(() => {
    if (phase === "playing" && started.current !== run.current) {
      started.current = run.current;
      nextGuest(0);
    }
  }, [phase, nextGuest]);

  const exit = () => {
    run.current++;
    session.stop();
    setPhase("ready");
  };

  // keyboard: 1–5 / A–E sajikan · Enter lanjut
  const keys = useRef({ answer, next, stage, hidden, n: 0 });
  useEffect(() => {
    keys.current = { answer, next, stage, hidden, n: q ? optionCount(q) : 0 };
  });
  useEffect(() => {
    if (phase !== "playing") return;
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = keys.current;
      const key = e.key.toLowerCase();
      if (k.stage === "question") {
        let idx = "12345".indexOf(key);
        if (idx < 0) idx = "abcde".indexOf(key);
        if (idx >= 0 && idx < k.n && !k.hidden.includes(idx)) {
          e.preventDefault();
          void k.answer(idx);
        }
      } else if (k.stage === "feedback" && key === "enter") {
        e.preventDefault();
        void k.next();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [phase]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __cafe: unknown }).__cafe = {
      phase,
      stage,
      level,
      score,
      coins,
      happy,
      mood,
      served,
    };
  });

  // dari Arena Game (tombol Main): langsung mulai tanpa layar siap
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!props.autoStart || autoStarted.current) return;
    // penanda diset saat benar-benar mulai (StrictMode memasang efek dua kali & membatalkan timer pertama)
    const t = setTimeout(() => {
      autoStarted.current = true;
      void begin();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!questions.length)
    return (
      <div className="card text-sm text-navy-400">
        Game ini belum memiliki soal.
      </div>
    );
  if (phase === "result" && result)
    return (
      <div className="space-y-4">
        <div className="card flex flex-wrap items-center justify-center gap-x-5 gap-y-1 p-4 text-sm font-bold text-navy-700">
          <span>
            😋 Pelanggan puas: {happy}/{questions.length}
          </span>
          <span>🪙 {coins} koin</span>
          <span>
            {"⭐".repeat(
              Math.max(1, Math.round((happy / questions.length) * 5)),
            )}{" "}
            rating kafe
          </span>
          {decor > 0 && (
            <span>
              Dekorasi:{" "}
              {DECOR.slice(0, decor)
                .map((d) => d.icon)
                .join(" ")}
            </span>
          )}
        </div>
        <ResultCelebration
          result={result}
          onReplay={() => setPhase("ready")}
          canSave={props.canSave}
        />
      </div>
    );
  if (phase === "ready")
    return (
      <ReadyCard
        title="Mode Kafe Kucing"
        subtitle="Si kucing membuka kafe! Setiap pelanggan membawa pesanan berupa soal — sajikan hidangan jawaban yang benar."
        bullets={[
          {
            text: "🍽️ Pilihan jawaban = hidangan di meja saji. Ketuk hidangan untuk menyajikannya (atau tekan 1–4 / A–D).",
          },
          {
            text: "😊 Kesabaran pelanggan = waktu soal. Sajikan cepat untuk tip kilat ⚡!",
          },
          {
            text: "😋 Benar → pelanggan senang & membayar koin. 😖 Salah → pelanggan cemberut & pergi.",
          },
          {
            text: "🎉 Setiap 3 pelanggan puas, kafe naik level & dapat dekorasi baru.",
          },
          {
            text: `🧠 ${secondsPerQuestion} detik per soal seperti mode klasik; pembahasan bisa dibaca sebelum pelanggan berikutnya. Skor sama dengan mode klasik.`,
            tone: "emerald",
            wide: true,
          },
        ]}
        loggedIn={props.loggedIn}
        loginHref={props.loginHref}
        onBack={props.onExit}
        onStart={() => void begin()}
        startLabel="Buka kafe"
        startIcon={<Coffee className="h-5 w-5" />}
      />
    );

  const n = optionCount(q);
  const patience =
    stage === "question"
      ? timer.timeLeft / secondsPerQuestion
      : stage === "enter"
        ? 1
        : 0;
  const face =
    mood === "happy"
      ? "😋"
      : mood === "sad"
        ? "😖"
        : mood === "angry"
          ? "😤"
          : patience > 0.6
            ? "😊"
            : patience > 0.3
              ? "😐"
              : "😠";
  const leaving = stage === "feedback" && mood !== "happy";
  return (
    <ArenaFrame
      label={`Pelanggan ${level + 1}/${questions.length}`}
      extra={
        <>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-700">
            🪙 {score}
          </span>
          {stage === "question" && <TimeChip left={timer.timeLeft} />}
        </>
      }
      hint={{
        left: hintsLeft,
        busy: hinting,
        disabled:
          stage !== "question" || hintsLeft <= 0 || hidden.length > 0 || n <= 2,
        onClick: () => void takeHint(),
      }}
      onExit={exit}
    >
      {/* ruang kafe */}
      <div className="relative h-[34svh] min-h-48 shrink-0 select-none overflow-hidden bg-linear-to-b from-rose-100 via-amber-50 to-amber-100">
        {/* dinding: jendela, papan menu, dekorasi */}
        <div className="absolute left-[38%] top-[8%] h-[34%] w-[24%] rounded-t-full border-4 border-amber-800/60 bg-linear-to-b from-sky-300 to-sky-100">
          <div className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 bg-amber-800/60" />
        </div>
        <div className="absolute left-[4%] top-[8%] rounded-lg bg-emerald-900 px-2 py-1 text-[10px] font-bold leading-tight text-emerald-50 shadow sm:text-xs">
          ☕ KAFE KUCING
          <div className="font-normal text-emerald-200">
            {"⭐".repeat(rating)}
          </div>
        </div>
        <div className="absolute right-[3%] top-[6%] flex gap-1 text-2xl sm:text-3xl">
          {DECOR.slice(0, decor).map((d) => (
            <span key={d.icon} className="animate-pop" title={d.name}>
              {d.icon}
            </span>
          ))}
        </div>
        {/* lantai & meja */}
        <div className="absolute inset-x-0 bottom-0 h-[22%] bg-[repeating-linear-gradient(90deg,#b45309_0_24px,#c2410c_24px_48px)] opacity-80" />
        <div className="absolute bottom-[14%] left-0 h-[16%] w-[56%] rounded-r-2xl bg-linear-to-b from-amber-700 to-amber-900 shadow-lg" />
        {/* kucing koki di balik meja */}
        <div className="absolute bottom-[22%] left-[8%] w-[26%] max-w-32">
          <div className="absolute -top-[22%] left-1/2 z-10 -translate-x-1/2 text-3xl sm:text-4xl">
            👨‍🍳
          </div>
          <GameCat
            mood={
              mood === "happy"
                ? "girang"
                : mood === "wait"
                  ? catMood(streak, wrongStreak)
                  : "sedih"
            }
            className="aspect-square w-full"
          />
        </div>
        {/* hidangan melayang ke pelanggan */}
        {served !== null &&
          served >= 0 &&
          (stage === "checking" || stage === "react") && (
            <div
              className="duel-dash pointer-events-none absolute bottom-[34%] left-[34%] z-20 text-4xl"
              style={{ ["--dash" as string]: "min(30vw, 220px)" }}
            >
              {DISHES[served]}
            </div>
          )}
        {/* pelanggan */}
        <div
          key={`${level}-${leaving ? "out" : "in"}`}
          className={cn(
            "absolute bottom-[14%] right-[6%] flex w-[30%] max-w-40 flex-col items-center",
            stage === "enter"
              ? "duel-enter"
              : leaving
                ? "duel-flee"
                : "duel-idle",
          )}
        >
          <div className="mb-1 w-full rounded-2xl bg-white/95 px-2 py-1 text-center text-[11px] font-bold text-navy-700 shadow ring-1 ring-navy-100 sm:text-xs">
            {NAMES[guest]} · {face}
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-navy-100">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-200",
                  patience > 0.6
                    ? "bg-emerald-400"
                    : patience > 0.3
                      ? "bg-amber-400"
                      : "bg-rose-500",
                )}
                style={{ width: `${patience * 100}%` }}
              />
            </div>
          </div>
          <span
            className={cn(
              "leading-none drop-shadow-lg",
              mood === "happy" && "animate-pop",
            )}
            style={{ fontSize: "min(17vw, 96px)" }}
          >
            {CUSTOMERS[guest]}
          </span>
          {mood === "happy" && stage !== "enter" && (
            <span className="absolute -top-2 right-0 animate-pop text-2xl">
              💕
            </span>
          )}
        </div>
        {floatText && (
          <span
            key={floatText.key}
            className="duel-float pointer-events-none absolute top-[30%] z-20 whitespace-nowrap text-lg font-black drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] sm:text-xl"
            style={{
              left: "70%",
              color: floatText.good ? "#facc15" : "#fb7185",
            }}
          >
            {floatText.text}
          </span>
        )}
        {banner && (
          <div
            key={banner.key}
            className="duel-banner pointer-events-none absolute inset-x-0 top-[38%] z-20 text-center"
          >
            <span className="inline-block rounded-2xl bg-navy-950/80 px-4 py-2 text-sm font-black text-white shadow-xl sm:text-base">
              {banner.text}
            </span>
          </div>
        )}
        {streak >= 2 && (
          <div className="pointer-events-none absolute bottom-2 left-2 z-10 animate-pop rounded-2xl bg-orange-500/90 px-2.5 py-1 text-sm font-black text-white shadow-lg">
            🔥 x{streak}
          </div>
        )}
        <ArenaOverlay phase={phase} count={cd.count} />
      </div>

      {/* pesanan & meja saji */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {phase === "playing" && stage !== "enter" ? (
          <>
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-rose-500">
              🧾 Pesanan {NAMES[guest]}
            </p>
            <MathText
              key={q.id}
              as="p"
              text={q.text}
              className="mb-2 animate-fade-up font-bold leading-snug text-navy-900 sm:text-lg"
            />
            <div className={cn("grid gap-2", n > 2 && "grid-cols-2")}>
              {q.options.slice(0, 5).map((o, k) => {
                const isRight = feedback && k === feedback.answerIndex;
                const isWrong =
                  feedback && k === feedback.choice && !feedback.correct;
                const off = !feedback && hidden.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={stage !== "question" || off}
                    onClick={() => void answer(k)}
                    className={cn(
                      "flex min-h-12 items-center gap-2 rounded-2xl bg-linear-to-br px-2.5 py-2 text-left text-sm font-semibold text-navy-900 shadow-md ring-1 ring-black/5 transition sm:text-base",
                      DISH_BG[k],
                      stage === "question" &&
                        !off &&
                        "hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]",
                      off && "opacity-20 grayscale",
                      feedback &&
                        !isRight &&
                        !isWrong &&
                        "opacity-40 saturate-50",
                      isRight && "ring-4 ring-emerald-400",
                      isWrong && "animate-shake ring-4 ring-rose-400",
                    )}
                  >
                    <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-2xl shadow-inner">
                      {stage === "checking" && served === k ? (
                        <Spinner />
                      ) : (
                        DISHES[k]
                      )}
                      <span className="absolute -bottom-1 -right-1 grid h-4.5 w-4.5 place-items-center rounded-full bg-navy-900 text-[9px] font-black text-white">
                        {LETTERS[k]}
                      </span>
                    </span>
                    <MathText
                      text={o}
                      className={cn(
                        "min-w-0 wrap-break-word",
                        off && "line-through",
                      )}
                    />
                  </button>
                );
              })}
            </div>
            {feedback && stage === "feedback" && (
              <div className="mt-3">
                <FeedbackBox
                  key={level}
                  feedback={feedback}
                  message={
                    feedback.correct
                      ? `${NAMES[guest]} puas sekali!`
                      : `${NAMES[guest]} pergi dengan kecewa…`
                  }
                  onNext={() => void next()}
                  nextLabel={
                    level + 1 < questions.length
                      ? "Pelanggan berikutnya"
                      : "Tutup kafe & lihat hasil"
                  }
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm font-semibold text-navy-600">
            {phase === "countdown"
              ? "Kafe segera dibuka… ☕"
              : "Pelanggan datang… 🔔"}
          </p>
        )}
        <p className="mt-2 hidden text-[11px] text-navy-400 pointer-fine:block">
          1–{n} / A–{LETTERS[n - 1]}: sajikan hidangan · Enter: pelanggan
          berikutnya
        </p>
      </div>
    </ArenaFrame>
  );
}

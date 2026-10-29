"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  OPTION_COLORS,
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
 * Mode Adu Penalti: soal yang sama dengan mode klasik, dimainkan sebagai tendangan penalti.
 * Pilihan jawaban = titik bidikan di gawang (A kiri-atas, B kanan-atas, …). Benar → pasti GOL (kiper babi salah arah);
 * salah → ditangkis kiper atau meleset (melambung / melebar); waktu habis → tendangan lemah ditangkap kiper.
 * Papan skor Kucing FC vs Babi FC hanya tampilan — skor = skor klasik dari server.
 */

type Phase = "ready" | "countdown" | "playing" | "finishing" | "result";
/** setup = bola disiapkan · question · kick = ancang-ancang & tendangan · result = GOL / DITANGKIS · feedback */
type Stage = "setup" | "question" | "kick" | "result" | "feedback";
type Outcome = "goal" | "save" | "miss";
type Pt = { x: number; y: number };

/** titik bidikan (persen dari arena) per jumlah pilihan; gawang: x 14–86 %, y 20–60 % */
const ZONES: Record<number, Pt[]> = {
  2: [
    { x: 30, y: 38 },
    { x: 70, y: 38 },
  ],
  3: [
    { x: 26, y: 46 },
    { x: 50, y: 28 },
    { x: 74, y: 46 },
  ],
  4: [
    { x: 27, y: 30 },
    { x: 73, y: 30 },
    { x: 27, y: 50 },
    { x: 73, y: 50 },
  ],
  5: [
    { x: 25, y: 29 },
    { x: 75, y: 29 },
    { x: 50, y: 34 },
    { x: 25, y: 51 },
    { x: 75, y: 51 },
  ],
};
const BALL_HOME: Pt = { x: 50, y: 86 };
const KEEPER_HOME: Pt = { x: 50, y: 46 };

export function PenaltyPlayer(props: PlayerProps) {
  const { gameId, questions, secondsPerQuestion, onPlayingChange } = props;
  const session = useQuizSession(gameId, "penalty");
  const [phase, setPhase] = useState<Phase>("ready");
  const [stage, setStage] = useState<Stage>("setup");
  const [level, setLevel] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [ball, setBall] = useState<Pt & { s: number; spin: number }>({
    ...BALL_HOME,
    s: 1,
    spin: 0,
  });
  const [keeper, setKeeper] = useState<Pt & { rot: number; hold: boolean }>({
    ...KEEPER_HOME,
    rot: 0,
    hold: false,
  });
  const [runUp, setRunUp] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [goals, setGoals] = useState(0);
  const [saves, setSaves] = useState(0);
  const [kicks, setKicks] = useState<Outcome[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [hintsLeft, setHintsLeft] = useState(GAME_HINTS);
  const [hinting, setHinting] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const run = useRef(0);

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
  const n = q ? Math.max(2, optionCount(q)) : 4;
  const zones = ZONES[n] ?? ZONES[4];

  /** tendangan ke-i: bola & kiper kembali ke posisi awal, lalu soal tampil */
  const setup = useCallback(
    (i: number) => {
      setLevel(i);
      setFeedback(null);
      setPicked(null);
      setHidden([]);
      setOutcome(null);
      setRunUp(false);
      setBall({ ...BALL_HOME, s: 1, spin: 0 });
      setKeeper({ ...KEEPER_HOME, rot: 0, hold: false });
      setStage("setup");
      later(700, () => {
        setStage("question");
        gameAudio().countdown(true);
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

  const kick = useCallback(
    async (k: number) => {
      if (stage !== "question") return;
      const elapsed = timer.elapsed();
      setPicked(k);
      setStage("kick");
      setRunUp(true);
      const audio = gameAudio();
      const res = await session.check(q.id, k, elapsed);
      if (!res) return;
      const pts = res.correct
        ? pointsFor(q.points, secondsPerQuestion, elapsed)
        : 0;
      // hasil tendangan: benar = gol; salah = ditangkis / meleset; waktu habis = tendangan lemah ditangkap
      const out: Outcome = res.correct
        ? "goal"
        : k >= 0 && Math.random() < 0.4
          ? "miss"
          : "save";
      const aim = k >= 0 ? zones[k] : { x: KEEPER_HOME.x, y: 52 };
      let target: Pt = aim;
      if (out === "miss")
        target =
          Math.random() < 0.5 || aim.y > 40
            ? { x: aim.x < 50 ? 6 : 94, y: aim.y }
            : { x: aim.x, y: 9 };
      // kiper: gol → melompat ke sisi lain; tangkis → ke arah bola; meleset → menebak acak
      const other = zones.filter((_, j) => j !== k);
      const dive =
        out === "save"
          ? aim
          : out === "goal"
            ? (other[Math.floor(Math.random() * other.length)] ?? {
                x: 50,
                y: 30,
              })
            : zones[Math.floor(Math.random() * zones.length)];
      later(320, () => {
        audio.bump();
        setBall({
          x: target.x,
          y: out === "save" ? aim.y + 2 : target.y,
          s: 0.55,
          spin: 720,
        });
        const dx = dive.x - KEEPER_HOME.x;
        setKeeper({
          x: k === -1 ? KEEPER_HOME.x : KEEPER_HOME.x + dx * 0.85,
          y: dive.y + 2,
          rot: k === -1 ? 0 : Math.sign(dx) * (dive.y < 40 ? 62 : 80),
          hold: out === "save",
        });
        later(650, () => {
          setOutcome(out);
          setStage("result");
          setFeedback({
            choice: k,
            correct: res.correct,
            answerIndex: res.answerIndex,
            explanation: res.explanation,
            points: pts,
          });
          setScore((s) => s + pts);
          setKicks((list) => [...list, out]);
          if (out === "goal") {
            setGoals((g) => g + 1);
            setStreak((s) => {
              audio.correct(s + 1);
              return s + 1;
            });
            setWrongStreak(0);
            audio.coin();
          } else {
            setSaves((s) => s + 1);
            setStreak(0);
            setWrongStreak((s) => s + 1);
            if (out === "save") audio.clang();
            else audio.whoosh();
            if (k === -1) audio.timeout();
            else audio.wrong();
          }
          later(1300, () => setStage("feedback"));
        });
      });
    },
    [stage, timer, session, q, secondsPerQuestion, zones, later],
  );
  useEffect(() => {
    answerRef.current = (k) => void kick(k);
  });

  const next = useCallback(async () => {
    if (stage !== "feedback") return;
    gameAudio().click();
    if (level + 1 < questions.length) return setup(level + 1);
    setPhase("finishing");
    gameAudio().stopMusic();
    const res = await session.submit();
    if (!res) return setPhase("ready");
    setResult(res);
    setPhase("result");
    gameAudio().result(res.tier);
  }, [stage, level, questions.length, setup, session]);

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
    setScore(0);
    setGoals(0);
    setSaves(0);
    setKicks([]);
    setStreak(0);
    setWrongStreak(0);
    setHintsLeft(GAME_HINTS);
    setResult(null);
    setFeedback(null);
    setOutcome(null);
    setLevel(0);
    setStage("setup");
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
      setup(0);
    }
  }, [phase, setup]);

  const exit = () => {
    run.current++;
    session.stop();
    setPhase("ready");
  };

  // keyboard: 1–5 / A–E tendang · Enter lanjut
  const keys = useRef({ next, stage, hidden, n: 0 });
  useEffect(() => {
    keys.current = { next, stage, hidden, n: q ? optionCount(q) : 0 };
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
          answerRef.current(idx);
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
    (window as unknown as { __penalty: unknown }).__penalty = {
      phase,
      stage,
      level,
      score,
      goals,
      saves,
      outcome,
      ball,
      keeper,
    };
  });

  if (!questions.length)
    return (
      <div className="card text-sm text-navy-400">
        Game ini belum memiliki soal.
      </div>
    );
  if (phase === "result" && result)
    return (
      <div className="space-y-4">
        <div className="card p-4 text-center text-sm font-bold text-navy-700">
          <p className="text-base">
            🐱 Kucing FC{" "}
            <span className="mx-1 rounded-lg bg-navy-900 px-2 py-0.5 font-mono text-white">
              {goals} – {saves}
            </span>{" "}
            Babi FC 🐷
          </p>
          <p className="mt-1 text-xl tracking-wider">
            {kicks
              .map((k) => (k === "goal" ? "⚽" : k === "save" ? "🧤" : "❌"))
              .join(" ")}
          </p>
          <p className="mt-1 text-xs text-navy-500">
            {goals > saves
              ? "🏆 Kucing FC menang adu penalti!"
              : goals === saves
                ? "🤝 Imbang!"
                : "Babi FC menang kali ini — ayo revans!"}
          </p>
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
        title="Mode Adu Penalti"
        subtitle="Kucing FC melawan kiper Babi FC! Setiap soal = satu tendangan penalti."
        bullets={[
          {
            text: "🎯 Pilihan jawaban = titik bidikan di gawang. Ketuk titik jawabanmu (atau tombol / 1–4 / A–D).",
          },
          {
            text: "⚽ Jawaban benar → tendangan pasti GOL! Kiper babi salah arah.",
          },
          {
            text: "🧤 Jawaban salah → bola ditangkis kiper atau meleset dari gawang.",
          },
          {
            text: "⏱️ Waktu habis → tendangan lemah, langsung ditangkap kiper.",
          },
          {
            text: `🧠 ${secondsPerQuestion} detik per soal seperti mode klasik. Skor sama dengan mode klasik.`,
            tone: "emerald",
            wide: true,
          },
        ]}
        loggedIn={props.loggedIn}
        loginHref={props.loginHref}
        onBack={props.onExit}
        onStart={() => void begin()}
        startLabel="Mulai adu penalti"
        startIcon={<span className="text-lg">⚽</span>}
      />
    );

  const mood =
    outcome === "goal"
      ? "girang"
      : outcome
        ? "sedih"
        : catMood(streak, wrongStreak);
  const aiming = stage === "question";
  return (
    <ArenaFrame
      label={`Tendangan ${level + 1}/${questions.length}`}
      extra={
        <>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
            ⭐ {score}
          </span>
          {stage === "question" && <TimeChip left={timer.timeLeft} />}
        </>
      }
      hint={{
        left: hintsLeft,
        busy: hinting,
        disabled:
          stage !== "question" ||
          hintsLeft <= 0 ||
          hidden.length > 0 ||
          optionCount(q) <= 2,
        onClick: () => void takeHint(),
      }}
      onExit={exit}
    >
      {/* stadion */}
      <div className="relative h-[42svh] min-h-60 shrink-0 select-none overflow-hidden bg-emerald-600">
        {/* tribun penonton */}
        <div className="absolute inset-x-0 top-0 h-[22%] bg-[radial-gradient(circle,#f87171_2px,transparent_3px),radial-gradient(circle,#60a5fa_2px,transparent_3px),radial-gradient(circle,#facc15_2px,transparent_3px)] bg-slate-700 bg-size-[14px_12px,18px_14px,22px_16px] bg-position-[0_0,7px_5px,3px_9px]" />
        {/* papan skor */}
        <div className="absolute left-1/2 top-1.5 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-navy-950/90 px-2.5 py-1 text-[11px] font-black text-white shadow-lg sm:text-xs">
          🐱 KUCING{" "}
          <span className="mx-1 rounded bg-amber-400 px-1.5 font-mono text-navy-950">
            {goals} – {saves}
          </span>{" "}
          BABI 🐷
        </div>
        {/* lapangan bergaris */}
        <div className="absolute inset-x-0 bottom-0 top-[22%] bg-[repeating-linear-gradient(180deg,#16a34a_0_22px,#15803d_22px_44px)]" />
        <div className="absolute bottom-[4%] left-1/2 h-[30%] w-[70%] -translate-x-1/2 rounded-t-[50%] border-2 border-b-0 border-white/60" />
        {/* gawang */}
        <div className="absolute left-[14%] right-[14%] top-[20%] h-[40%] border-[6px] border-b-0 border-white bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.28)_0_2px,transparent_2px_12px),repeating-linear-gradient(-45deg,rgba(255,255,255,0.28)_0_2px,transparent_2px_12px)] bg-slate-900/25 shadow-[0_6px_0_rgba(0,0,0,0.15)]" />
        {/* titik bidikan = pilihan jawaban */}
        {q &&
          zones.slice(0, optionCount(q)).map((z, k) => {
            const off = hidden.includes(k);
            const isRight = feedback && k === feedback.answerIndex;
            return (
              <button
                key={k}
                type="button"
                aria-label={`Tendang ke ${LETTERS[k]}`}
                disabled={!aiming || off}
                onClick={() => answerRef.current(k)}
                className={cn(
                  "absolute z-10 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-dashed text-lg font-black text-white shadow-lg transition sm:h-12 sm:w-12",
                  aiming && !off
                    ? "animate-pulse hover:scale-110"
                    : "opacity-0",
                  off && "opacity-0",
                  isRight &&
                    stage === "feedback" &&
                    "animate-none opacity-100 ring-4 ring-emerald-300",
                  picked === k && stage === "kick" && "opacity-100",
                )}
                style={{
                  left: `${z.x}%`,
                  top: `${z.y}%`,
                  background: `${OPTION_COLORS[k]}cc`,
                  borderColor: "white",
                }}
              >
                {LETTERS[k]}
              </button>
            );
          })}
        {/* kiper babi */}
        <div
          className={cn(
            "absolute z-[5] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition-all ease-out",
            stage === "kick" || stage === "result"
              ? "duration-500"
              : "duration-300",
            (stage === "setup" || aiming) && "duel-idle",
          )}
          style={{
            left: `${keeper.x}%`,
            top: `${keeper.y}%`,
            transform: `translate(-50%, -50%) rotate(${keeper.rot}deg)`,
          }}
        >
          <div
            className="relative"
            style={{ fontSize: "min(11vw, 64px)", lineHeight: 1 }}
          >
            <span className="absolute -left-[55%] top-[55%] text-[50%]">
              🧤
            </span>
            🐷
            <span className="absolute -right-[55%] top-[55%] text-[50%]">
              🧤
            </span>
          </div>
          <div className="-mt-1 h-[min(6vw,34px)] w-[min(10vw,56px)] rounded-b-xl rounded-t-md bg-linear-to-b from-pink-500 to-rose-600 text-center text-[10px] font-black text-white">
            1
          </div>
        </div>
        {/* bola */}
        <div
          className={cn(
            "absolute z-[6] -translate-x-1/2 -translate-y-1/2 transition-all",
            stage === "kick" || stage === "result"
              ? "duration-[650ms] ease-out"
              : "duration-300",
          )}
          style={{
            left: `${ball.x}%`,
            top: `${ball.y}%`,
            fontSize: `calc(min(9vw, 46px) * ${ball.s})`,
            lineHeight: 1,
            transform: `translate(-50%, -50%) rotate(${ball.spin}deg)`,
          }}
        >
          ⚽
        </div>
        {/* kucing penendang */}
        <div
          className="absolute z-[7] w-[min(22vw,120px)] transition-all duration-300 ease-in"
          style={{
            left: runUp ? "38%" : "26%",
            top: runUp ? "66%" : "62%",
            transform: runUp ? "rotate(-8deg)" : "none",
          }}
        >
          <GameCat mood={mood} className="aspect-square w-full" />
        </div>
        {/* hasil */}
        {outcome && stage === "result" && (
          <div className="duel-banner pointer-events-none absolute inset-x-0 top-[26%] z-20 text-center">
            <span
              className={cn(
                "inline-block rounded-2xl px-5 py-2 text-3xl font-black italic text-white shadow-2xl sm:text-4xl",
                outcome === "goal"
                  ? "bg-emerald-500"
                  : outcome === "save"
                    ? "bg-rose-500"
                    : "bg-slate-700",
              )}
            >
              {outcome === "goal"
                ? "GOOOL! ⚽"
                : outcome === "save"
                  ? "DITANGKIS! 🧤"
                  : "MELESET! 😱"}
            </span>
          </div>
        )}
        {outcome === "goal" && stage === "result" && (
          <div className="pointer-events-none absolute inset-0 z-10">
            {["🎉", "✨", "🎊", "⭐", "🎉", "✨"].map((c, i) => (
              <span
                key={i}
                className="duel-pop absolute text-3xl"
                style={{
                  left: `${12 + i * 15}%`,
                  top: `${14 + (i % 3) * 10}%`,
                  animationDelay: `${i * 60}ms`,
                }}
              >
                {c}
              </span>
            ))}
          </div>
        )}
        {streak >= 2 && (
          <div className="pointer-events-none absolute bottom-2 right-2 z-10 animate-pop rounded-2xl bg-orange-500/90 px-2.5 py-1 text-sm font-black text-white shadow-lg">
            🔥 x{streak}
          </div>
        )}
        <ArenaOverlay phase={phase} count={cd.count} />
      </div>

      {/* soal & jawaban */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {phase === "playing" && stage !== "setup" ? (
          <>
            <MathText
              key={q.id}
              as="p"
              text={q.text}
              className="mb-2 animate-fade-up font-bold leading-snug text-navy-900 sm:text-lg"
            />
            <div
              className={cn("grid gap-2", optionCount(q) > 2 && "grid-cols-2")}
            >
              {q.options.slice(0, 5).map((o, k) => {
                const isRight = feedback && k === feedback.answerIndex;
                const isWrong =
                  feedback && k === feedback.choice && !feedback.correct;
                const off = !feedback && hidden.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={!aiming || off}
                    onClick={() => answerRef.current(k)}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-semibold text-white shadow-md transition sm:text-base",
                      aiming &&
                        !off &&
                        "hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]",
                      off && "opacity-15 grayscale",
                      feedback &&
                        !isRight &&
                        !isWrong &&
                        "opacity-35 saturate-50",
                      isRight && "ring-4 ring-emerald-300",
                      isWrong && "animate-shake ring-4 ring-rose-300",
                    )}
                    style={{ background: OPTION_COLORS[k] }}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/20 text-xs font-extrabold">
                      {stage === "kick" && picked === k && !feedback ? (
                        <Spinner />
                      ) : (
                        LETTERS[k]
                      )}
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
            {aiming && (
              <p className="mt-2 text-xs font-semibold text-navy-500">
                Ketuk titik jawabanmu di gawang (atau tombol di atas) untuk
                menendang!
              </p>
            )}
            {feedback && stage === "feedback" && (
              <div className="mt-3">
                <FeedbackBox
                  key={level}
                  feedback={feedback}
                  message={
                    outcome === "goal"
                      ? "Bola bersarang di gawang!"
                      : outcome === "save"
                        ? "Kiper babi menangkis!"
                        : "Bola melenceng dari gawang!"
                  }
                  onNext={() => void next()}
                  nextLabel={
                    level + 1 < questions.length
                      ? "Tendangan berikutnya"
                      : "Lihat hasil"
                  }
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm font-semibold text-navy-600">
            {phase === "countdown"
              ? "Wasit bersiap meniup peluit… 📣"
              : "Bola diletakkan di titik penalti… ⚽"}
          </p>
        )}
        <p className="mt-2 hidden text-[11px] text-navy-400 pointer-fine:block">
          Klik titik di gawang · 1–{optionCount(q)} / A–
          {LETTERS[optionCount(q) - 1]}: tendang · Enter: lanjut
        </p>
      </div>
    </ArenaFrame>
  );
}

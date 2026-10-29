"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Flag } from "lucide-react";
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
 * Mode Balap Gokart: soal yang sama dengan mode klasik, dimainkan sebagai balapan 4 gokart.
 * Tiap soal = satu putaran: semua pembalap melaju. Kucing: benar → melaju kencang (cepat = NITRO), salah → tergelincir
 * kulit pisang, waktu habis → mesin mogok. Lawan melaju dengan kecepatan sendiri (sedikit acak).
 * Semua jawaban benar ≈ juara 1. Posisi & podium hanya tampilan — skor = skor klasik dari server.
 */

type Phase = "ready" | "countdown" | "playing" | "finishing" | "result";
/** grid = bersiap · question · race = semua melaju · feedback */
type Stage = "grid" | "question" | "race" | "feedback";
type Event = "nitro" | "fast" | "slip" | "stall" | null;

const RACERS = [
  { name: "Kucing", face: "", color: "#f59e0b", dark: "#b45309" },
  { name: "Dodo", face: "🐶", color: "#ef4444", dark: "#991b1b" },
  { name: "Rara", face: "🐰", color: "#3b82f6", dark: "#1e3a8a" },
  { name: "Popo", face: "🐷", color: "#ec4899", dark: "#9d174d" },
];
/** kecepatan rata-rata lawan per putaran (kucing benar = 1,1–1,5) */
const RIVAL_SPEED = [0, 1.05, 0.95, 0.85];
/** urutan jalur dari atas: Dodo, Rara, Kucing, Popo */
const LANE_OF = [2, 0, 1, 3];
const RACE_MS = 1700;
/** NITRO bila dijawab benar dalam 40% awal waktu */
const NITRO_REMAIN = 0.6;

export function KartPlayer(props: PlayerProps) {
  const { gameId, questions, secondsPerQuestion, onPlayingChange } = props;
  const session = useQuizSession(gameId, "kart");
  const [phase, setPhase] = useState<Phase>("ready");
  const [stage, setStage] = useState<Stage>("grid");
  const [level, setLevel] = useState(0);
  const [dist, setDist] = useState([0, 0, 0, 0]);
  const [event, setEvent] = useState<Event>(null);
  const [lap, setLap] = useState(0);
  const [news, setNews] = useState<{ text: string; key: number } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [hintsLeft, setHintsLeft] = useState(GAME_HINTS);
  const [hinting, setHinting] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const run = useRef(0);
  const distRef = useRef([0, 0, 0, 0]);

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
  const trackLen = Math.max(3, questions.length * 1.2);
  const rankOf = (d: number[]) => {
    const order = d
      .map((v, i) => ({ v, i }))
      .sort((a, b) => b.v - a.v || a.i - b.i);
    const rank = [0, 0, 0, 0];
    order.forEach((o, r) => (rank[o.i] = r + 1));
    return rank;
  };
  const ranks = rankOf(dist);

  const showQuestion = useCallback(
    (i: number) => {
      setLevel(i);
      setFeedback(null);
      setPicked(null);
      setHidden([]);
      setEvent(null);
      setStage("question");
      session.shown(questions[i].id);
    },
    [questions, session],
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
      setPicked(k);
      setStage("race");
      const res = await session.check(q.id, k, elapsed);
      if (!res) return;
      const pts = res.correct
        ? pointsFor(q.points, secondsPerQuestion, elapsed)
        : 0;
      const remain =
        1 -
        Math.min(elapsed, secondsPerQuestion * 1000) /
          (secondsPerQuestion * 1000);
      const ev: Event = res.correct
        ? remain >= NITRO_REMAIN
          ? "nitro"
          : "fast"
        : k === -1
          ? "stall"
          : "slip";
      const before = rankOf(distRef.current);
      const gain = [
        ev === "nitro" || ev === "fast"
          ? 1.1 + 0.4 * remain
          : ev === "slip"
            ? 0.3
            : 0.15,
        ...[1, 2, 3].map((i) => RIVAL_SPEED[i] * (0.85 + Math.random() * 0.3)),
      ];
      const nd = distRef.current.map((d, i) => d + gain[i]);
      distRef.current = nd;
      const after = rankOf(nd);
      setEvent(ev);
      setDist(nd);
      setLap((l) => l + 1);
      setFeedback({
        choice: k,
        correct: res.correct,
        answerIndex: res.answerIndex,
        explanation: res.explanation,
        points: pts,
      });
      setScore((s) => s + pts);
      const audio = gameAudio();
      if (res.correct) {
        setStreak((s) => {
          audio.correct(s + 1);
          return s + 1;
        });
        setWrongStreak(0);
        audio.boost();
      } else {
        setStreak(0);
        setWrongStreak((s) => s + 1);
        if (k === -1) audio.timeout();
        else {
          audio.wrong();
          audio.whoosh();
        }
      }
      // kabar balapan: menyalip / disalip
      const passed = [1, 2, 3]
        .filter((i) => before[i] < before[0] && after[i] > after[0])
        .map((i) => RACERS[i].name);
      const lost = [1, 2, 3]
        .filter((i) => before[i] > before[0] && after[i] < after[0])
        .map((i) => RACERS[i].name);
      const last = level + 1 >= questions.length;
      later(RACE_MS - 300, () => {
        const text = last
          ? `🏁 FINISH! Kucing juara ${after[0]}`
          : passed.length
            ? `Menyalip ${passed.join(" & ")}! Posisi ${after[0]} 🎉`
            : lost.length
              ? `Disalip ${lost.join(" & ")}… posisi ${after[0]} 😿`
              : ev === "nitro"
                ? "NITRO! 🔥"
                : ev === "slip"
                  ? "Licin! Kulit pisang 🍌"
                  : ev === "stall"
                    ? "Mesin mogok… 💨"
                    : `Posisi ${after[0]}`;
        setNews({ text, key: Date.now() });
        if (last)
          audio.result(
            after[0] === 1 ? "tertinggi" : after[0] === 2 ? "tinggi" : "normal",
          );
      });
      later(RACE_MS + 500, () => setStage("feedback"));
    },
    // rankOf hanya fungsi murni
     
    [
      stage,
      timer,
      session,
      q,
      secondsPerQuestion,
      level,
      questions.length,
      later,
    ],
  );
  useEffect(() => {
    answerRef.current = (k) => void answer(k);
  });

  const next = useCallback(async () => {
    if (stage !== "feedback") return;
    gameAudio().click();
    if (level + 1 < questions.length) return showQuestion(level + 1);
    setPhase("finishing");
    gameAudio().stopMusic();
    const res = await session.submit();
    if (!res) return setPhase("ready");
    setResult(res);
    setPhase("result");
    gameAudio().result(res.tier);
  }, [stage, level, questions.length, showQuestion, session]);

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
    distRef.current = [0, 0, 0, 0];
    setDist([0, 0, 0, 0]);
    setLap(0);
    setEvent(null);
    setNews(null);
    setScore(0);
    setStreak(0);
    setWrongStreak(0);
    setHintsLeft(GAME_HINTS);
    setResult(null);
    setFeedback(null);
    setLevel(0);
    setStage("grid");
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
      later(200, () => showQuestion(0));
    }
  }, [phase, later, showQuestion]);

  const exit = () => {
    run.current++;
    session.stop();
    setPhase("ready");
  };

  // keyboard: 1–5 / A–E jawab · Enter lanjut
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
    (window as unknown as { __kart: unknown }).__kart = {
      phase,
      stage,
      level,
      score,
      dist,
      ranks,
      event,
    };
  });

  if (!questions.length)
    return (
      <div className="card text-sm text-navy-400">
        Game ini belum memiliki soal.
      </div>
    );
  if (phase === "result" && result) {
    const podium = [0, 1, 2, 3].sort((a, b) => ranks[a] - ranks[b]);
    return (
      <div className="space-y-4">
        <div className="card p-4 text-center">
          <p className="text-sm font-bold text-navy-700">
            🏁 Hasil Balap Gokart
          </p>
          <div className="mt-3 flex items-end justify-center gap-2">
            {[podium[1], podium[0], podium[2]].map((i, col) => (
              <div key={i} className="flex w-20 flex-col items-center">
                <span className="text-3xl">
                  {i === 0 ? "🐱" : RACERS[i].face}
                </span>
                <span
                  className={cn(
                    "text-xs font-bold",
                    i === 0 ? "text-amber-600" : "text-navy-600",
                  )}
                >
                  {RACERS[i].name}
                </span>
                <div
                  className={cn(
                    "mt-1 grid w-full place-items-center rounded-t-xl text-lg font-black",
                    col === 1
                      ? "h-16 bg-linear-to-t from-amber-500 to-amber-300 text-amber-900"
                      : col === 0
                        ? "h-12 bg-linear-to-t from-slate-400 to-slate-200 text-slate-700"
                        : "h-9 bg-linear-to-t from-orange-700 to-orange-400 text-orange-50",
                  )}
                >
                  {col === 1 ? "🥇" : col === 0 ? "🥈" : "🥉"}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold text-navy-500">
            {ranks[0] === 1
              ? "🏆 Kucing juara 1! Luar biasa!"
              : ranks[0] === 4
                ? "Kucing finis ke-4 — ayo balapan lagi!"
                : `Kucing finis ke-${ranks[0]}.`}
          </p>
        </div>
        <ResultCelebration
          result={result}
          onReplay={() => setPhase("ready")}
          canSave={props.canSave}
        />
      </div>
    );
  }
  if (phase === "ready")
    return (
      <ReadyCard
        title="Mode Balap Gokart"
        subtitle="Kucing balapan melawan Dodo 🐶, Rara 🐰 & Popo 🐷! Setiap soal = satu putaran."
        bullets={[
          { text: "🏎️ Jawab benar → gokart melaju kencang & menyalip lawan." },
          { text: "🔥 Jawab cepat → NITRO, makin jauh melesat!" },
          {
            text: "🍌 Salah → tergelincir kulit pisang. ⏱️ Waktu habis → mesin mogok.",
          },
          { text: "🏁 Setelah soal terakhir: FINISH & podium juara 1–2–3." },
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
        startLabel="Mulai balapan"
        startIcon={<Flag className="h-5 w-5" />}
      />
    );

  const racing = stage === "race";
  const mood =
    event === "slip" || event === "stall"
      ? "sedih"
      : event === "nitro"
        ? "girang"
        : catMood(streak, wrongStreak);
  const n = optionCount(q);
  return (
    <ArenaFrame
      label={`Putaran ${level + 1}/${questions.length}`}
      extra={
        <>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-700">
            ⭐ {score}
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
      {/* sirkuit */}
      <div className="relative h-[38svh] min-h-56 shrink-0 select-none overflow-hidden bg-emerald-500">
        {/* tribun & bendera */}
        <div
          className={cn(
            "absolute inset-x-0 top-0 h-[16%] bg-[repeating-linear-gradient(90deg,#f87171_0_8px,#facc15_8px_16px,#60a5fa_16px_24px,#34d399_24px_32px)] opacity-80",
            racing && "kart-road",
          )}
        />
        {/* rumput bergerak */}
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 top-[16%] bg-[repeating-linear-gradient(90deg,#22c55e_0_24px,#16a34a_24px_48px)]",
            racing ? "kart-road" : "kart-road-slow",
          )}
        />
        {/* aspal 4 jalur */}
        <div className="absolute inset-x-0 bottom-[6%] top-[22%] border-y-4 border-white bg-slate-600">
          <div
            className={cn(
              "absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent_0_8px,rgba(255,255,255,0.05)_8px_48px)]",
              racing && "kart-road",
            )}
          />
          {[1, 2, 3].map((l) => (
            <div
              key={l}
              className={cn(
                "absolute inset-x-0 h-0.5 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.7)_0_24px,transparent_24px_48px)]",
                racing && "kart-road",
              )}
              style={{ top: `${l * 25}%` }}
            />
          ))}
          {/* garis start & finish */}
          <div className="absolute inset-y-0 left-[7%] w-1 bg-white/80" />
          <div className="absolute inset-y-0 right-[3%] w-3 bg-[repeating-conic-gradient(#fff_0_25%,#111_0_50%)] bg-size-[12px_12px]" />
          {/* gokart */}
          {RACERS.map((r, i) => {
            const lane = LANE_OF[i];
            const x = 7 + Math.min(1, dist[i] / trackLen) * 82;
            const me = i === 0;
            return (
              <div
                key={r.name}
                className="absolute z-10 flex -translate-y-1/2 items-center transition-[left] ease-in-out"
                style={{
                  left: `${x}%`,
                  top: `${lane * 25 + 12.5}%`,
                  transitionDuration: `${RACE_MS}ms`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {me && racing && event === "nitro" && (
                  <span className="kart-flame mr-[-4px] origin-right text-xl">
                    🔥
                  </span>
                )}
                {me && racing && event === "stall" && (
                  <span className="mr-1 animate-pulse text-lg">💨</span>
                )}
                <div
                  className={cn("relative", !racing && "kart-idle")}
                  style={{
                    transition:
                      me && racing && event === "slip"
                        ? "transform 1.2s ease-in-out"
                        : undefined,
                    transform:
                      me && racing && event === "slip"
                        ? "rotate(720deg)"
                        : "none",
                  }}
                >
                  {/* pengemudi */}
                  <div className="absolute -top-[85%] left-1/2 h-[min(9vw,40px)] w-[min(9vw,40px)] -translate-x-1/2">
                    {me ? (
                      <GameCat mood={mood} className="h-full w-full" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-[min(7vw,30px)] leading-none">
                        {r.face}
                      </span>
                    )}
                  </div>
                  {/* badan gokart */}
                  <div
                    className="relative h-[min(4.5vw,22px)] w-[min(14vw,64px)] rounded-lg shadow-md"
                    style={{
                      background: `linear-gradient(180deg, ${r.color}, ${r.dark})`,
                    }}
                  >
                    <span className="absolute -bottom-1 left-1 h-2.5 w-2.5 rounded-full bg-slate-900 ring-2 ring-slate-500" />
                    <span className="absolute -bottom-1 right-1 h-2.5 w-2.5 rounded-full bg-slate-900 ring-2 ring-slate-500" />
                    <span className="absolute right-0.5 top-0.5 text-[8px] font-black text-white/90">
                      {i === 0 ? "K" : r.name[0]}
                    </span>
                  </div>
                  {/* posisi */}
                  <span
                    className={cn(
                      "absolute -right-3 -top-[60%] grid h-5 w-5 place-items-center rounded-full text-[10px] font-black shadow",
                      ranks[i] === 1
                        ? "bg-amber-400 text-navy-950"
                        : "bg-white text-navy-700",
                      me && "ring-2 ring-amber-500",
                    )}
                  >
                    {ranks[i]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {/* posisi kucing */}
        <div className="absolute left-2 top-[3%] z-20 rounded-xl bg-navy-950/80 px-2.5 py-1 text-xs font-black text-white shadow">
          🐱 Posisi {ranks[0]}/4 · Putaran {lap}/{questions.length}
        </div>
        {news && (
          <div
            key={news.key}
            className="duel-banner pointer-events-none absolute inset-x-0 top-[38%] z-20 text-center"
          >
            <span className="inline-block rounded-2xl bg-navy-950/85 px-4 py-2 text-base font-black text-white shadow-xl sm:text-lg">
              {news.text}
            </span>
          </div>
        )}
        {streak >= 2 && (
          <div className="pointer-events-none absolute right-2 top-[3%] z-20 animate-pop rounded-xl bg-orange-500/90 px-2.5 py-1 text-xs font-black text-white shadow-lg">
            🔥 x{streak}
          </div>
        )}
        <ArenaOverlay phase={phase} count={cd.count} />
      </div>

      {/* soal & jawaban */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {phase === "playing" && stage !== "grid" ? (
          <>
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
                    onClick={() => answerRef.current(k)}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-semibold text-white shadow-md transition sm:text-base",
                      stage === "question" &&
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
                      {racing && picked === k && !feedback ? (
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
            {stage === "question" && (
              <p className="mt-2 text-xs font-semibold text-navy-500">
                Jawab untuk menginjak gas! Makin cepat & benar, makin kencang 🏎️
              </p>
            )}
            {feedback && stage === "feedback" && (
              <div className="mt-3">
                <FeedbackBox
                  key={level}
                  feedback={feedback}
                  message={`Posisi ${ranks[0]} dari 4.`}
                  onNext={() => void next()}
                  nextLabel={
                    level + 1 < questions.length
                      ? "Putaran berikutnya"
                      : "Lihat podium"
                  }
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm font-semibold text-navy-600">
            {phase === "countdown"
              ? "Mesin dinyalakan… 🏁"
              : "Para pembalap di garis start…"}
          </p>
        )}
        <p className="mt-2 hidden text-[11px] text-navy-400 pointer-fine:block">
          1–{n} / A–{LETTERS[n - 1]}: jawab · Enter: lanjut
        </p>
      </div>
    </ArenaFrame>
  );
}

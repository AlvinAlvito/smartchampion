"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dices, Play } from "lucide-react";
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
 * Mode Ular Tangga Pintar: soal yang sama dengan mode klasik, dimainkan di papan ular tangga.
 * Jawab benar → lempar dadu 1–6 (beruntun ≥3 = +1); salah / waktu habis → dadu kecil 1–2.
 * Papan dibuat acak tiap main dan ukurannya menyesuaikan jumlah soal (semua benar ≈ sampai FINISH).
 * Petak spesial: 🪜 tangga, 🐍 ular, ⭐ bonus +2, ❓ misteri (+3 / −2 / 🛡️ perisai ular).
 * Dadu & papan hanya tampilan — skor = skor klasik dari server.
 */

type Phase = "ready" | "countdown" | "playing" | "finishing" | "result";
/** question = soal tampil · checking · roll = siap lempar dadu · rolling · moving · next = giliran selesai */
type Stage = "question" | "checking" | "roll" | "rolling" | "moving" | "next";
type Special = "star" | "mystery";
type Board = {
  cols: number;
  rows: number;
  size: number;
  jumps: Map<number, number>;
  specials: Map<number, Special>;
};

const HOP_MS = 260;

function buildBoard(questions: number): Board {
  const cols = questions <= 10 ? 6 : 8;
  const rows = Math.max(4, Math.ceil((questions * 3.6 + 6) / cols));
  const size = Math.min(100, rows * cols);
  const used = new Set<number>([1, size]);
  const rowOf = (c: number) => Math.floor((c - 1) / cols);
  const pick = (min: number, max: number) => {
    for (let t = 0; t < 200; t++) {
      const c = min + Math.floor(Math.random() * (max - min + 1));
      if (c > 1 && c < size && !used.has(c)) return c;
    }
    return 0;
  };
  const jumps = new Map<number, number>();
  const pairs = Math.max(2, Math.round(size / 12));
  // tangga: naik 1–2 baris; ular: turun 1–2 baris (tidak dari baris terbawah / ke baris teratas)
  for (let i = 0; i < pairs; i++) {
    const from = pick(2, size - cols - 1);
    if (!from) continue;
    used.add(from);
    const to = pick(
      (rowOf(from) + 1) * cols + 1,
      Math.min(size - 1, (rowOf(from) + 2) * cols + cols),
    );
    if (!to) {
      used.delete(from);
      continue;
    }
    used.add(to);
    jumps.set(from, to);
  }
  for (let i = 0; i < pairs; i++) {
    const from = pick(cols + 1, size - 1);
    if (!from) continue;
    used.add(from);
    const to = pick(
      Math.max(2, (rowOf(from) - 2) * cols + 1),
      rowOf(from) * cols,
    );
    if (!to) {
      used.delete(from);
      continue;
    }
    used.add(to);
    jumps.set(from, to);
  }
  const specials = new Map<number, Special>();
  for (let i = 0; i < Math.max(2, Math.round(size / 12)); i++) {
    const c = pick(2, size - 1);
    if (c) {
      used.add(c);
      specials.set(c, "star");
    }
  }
  for (let i = 0; i < Math.max(1, Math.round(size / 16)); i++) {
    const c = pick(2, size - 1);
    if (c) {
      used.add(c);
      specials.set(c, "mystery");
    }
  }
  return { cols, rows, size, jumps, specials };
}

const DICE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export function BoardPlayer(props: PlayerProps) {
  const { gameId, questions, secondsPerQuestion, onPlayingChange } = props;
  const session = useQuizSession(gameId, "board");
  const [phase, setPhase] = useState<Phase>("ready");
  const [stage, setStage] = useState<Stage>("question");
  const [level, setLevel] = useState(0);
  const [board, setBoard] = useState<Board>(() => ({
    cols: 6,
    rows: 4,
    size: 24,
    jumps: new Map(),
    specials: new Map(),
  }));
  const [pos, setPos] = useState(1);
  const [hop, setHop] = useState(0);
  const [dice, setDice] = useState<{
    face: number;
    small: boolean;
    bonus: number;
  } | null>(null);
  const [shield, setShield] = useState(false);
  const [crowns, setCrowns] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [hintsLeft, setHintsLeft] = useState(GAME_HINTS);
  const [hinting, setHinting] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [toastText, setToastText] = useState<{
    text: string;
    key: number;
  } | null>(null);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [cell, setCell] = useState(40);
  const boardWrap = useRef<HTMLDivElement>(null);
  const run = useRef(0);
  const live = useRef({ pos: 1, shield: false, streak: 0 });

  useEffect(() => {
    onPlayingChange?.(phase !== "ready");
  }, [phase, onPlayingChange]);
  useEffect(() => () => gameAudio().stopMusic(0.1), []);

  /** jalankan fn setelah ms, hanya bila masih di permainan yang sama */
  const later = useCallback((ms: number, fn: () => void) => {
    const id = run.current;
    setTimeout(() => {
      if (run.current === id) fn();
    }, ms);
  }, []);
  const say = (text: string) => setToastText({ text, key: Date.now() });
  const movePos = (p: number) => {
    live.current.pos = p;
    setPos(p);
    setHop((h) => h + 1);
  };

  const q = questions[level];
  const showQuestion = useCallback(
    (i: number) => {
      setLevel(i);
      setFeedback(null);
      setPicked(null);
      setHidden([]);
      setDice(null);
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
      setStage("checking");
      setPicked(k);
      const elapsed = timer.elapsed();
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
      if (res.correct) {
        live.current.streak++;
        setStreak(live.current.streak);
        setWrongStreak(0);
        audio.correct(live.current.streak);
      } else {
        live.current.streak = 0;
        setStreak(0);
        setWrongStreak((s) => s + 1);
        if (k === -1) audio.timeout();
        else audio.wrong();
      }
      // sudah di FINISH: tidak perlu dadu, jawaban benar = mahkota
      if (live.current.pos >= board.size) {
        if (res.correct) {
          setCrowns((c) => c + 1);
          say("👑 +1 mahkota!");
        }
        setStage("next");
      } else setStage("roll");
    },
    [stage, q, session, secondsPerQuestion, board.size, timer],
  );
  useEffect(() => {
    answerRef.current = (k) => void answer(k);
  });

  /** efek petak setelah berhenti: tangga / ular / bintang / misteri */
  function land(p: number) {
    {
      const audio = gameAudio();
      const to = board.jumps.get(p);
      const end = () => setStage("next");
      if (to && to > p) {
        say("Naik tangga! 🪜");
        audio.unlockUp();
        later(350, () => {
          movePos(to);
          later(600, end);
        });
        return;
      }
      if (to && to < p) {
        if (live.current.shield) {
          live.current.shield = false;
          setShield(false);
          say("🛡️ Perisai menahan gigitan ular!");
          audio.clang();
          return end();
        }
        say("Digigit ular! 🐍");
        audio.bump();
        later(350, () => {
          movePos(to);
          later(600, end);
        });
        return;
      }
      const sp = board.specials.get(p);
      if (sp === "star") {
        say("⭐ Bonus maju 2 petak!");
        audio.coin();
        later(400, () => walk(p, Math.min(board.size, p + 2), false));
        return;
      }
      if (sp === "mystery") {
        const r = Math.random();
        if (r < 0.4) {
          say("❓ Misteri: maju 3 petak!");
          audio.coin();
          later(400, () => walk(p, Math.min(board.size, p + 3), false));
        } else if (r < 0.7) {
          say("❓ Misteri: dapat 🛡️ perisai ular!");
          live.current.shield = true;
          setShield(true);
          audio.heal();
          end();
        } else {
          say("❓ Misteri: mundur 2 petak…");
          audio.bump();
          later(400, () => walk(p, Math.max(1, p - 2), false));
        }
        return;
      }
      if (p >= board.size) {
        say("🏁 Sampai FINISH! Hebat!");
        audio.result("tertinggi");
      }
      end();
    }
  }

  /** kucing melompat petak demi petak dari → ke, lalu efek petak tujuan */
  function walk(from: number, to: number, withEffects = true) {
    setStage("moving");
    const dir = to > from ? 1 : -1;
    let p = from;
    const hopOnce = () => {
      if (p === to) {
        if (withEffects || board.jumps.has(p) || board.specials.has(p)) land(p);
        else setStage("next");
        return;
      }
      p += dir;
      movePos(p);
      gameAudio().jump();
      later(HOP_MS, hopOnce);
    };
    later(80, hopOnce);
  }

  const roll = () => {
    if (stage !== "roll" || !feedback) return;
    setStage("rolling");
    const small = !feedback.correct;
    const bonus = feedback.correct && live.current.streak >= 3 ? 1 : 0;
    const face = small
      ? 1 + Math.floor(Math.random() * 2)
      : 1 + Math.floor(Math.random() * 6);
    gameAudio().whoosh();
    let spins = 0;
    const spin = () => {
      spins++;
      if (spins < 9) {
        setDice({
          face: 1 + Math.floor(Math.random() * (small ? 2 : 6)),
          small,
          bonus: 0,
        });
        gameAudio().click();
        later(80, spin);
        return;
      }
      setDice({ face, small, bonus });
      const from = live.current.pos;
      later(450, () => walk(from, Math.min(board.size, from + face + bonus)));
    };
    spin();
  };

  const next = useCallback(async () => {
    if (stage !== "next") return;
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
    const b = buildBoard(questions.length);
    setBoard(b);
    live.current = { pos: 1, shield: false, streak: 0 };
    setPos(1);
    setShield(false);
    setCrowns(0);
    setDice(null);
    setScore(0);
    setStreak(0);
    setWrongStreak(0);
    setHintsLeft(GAME_HINTS);
    setResult(null);
    setToastText(null);
    setLevel(0);
    setFeedback(null);
    setStage("checking");
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
  // soal pertama tampil setelah hitung mundur
  const started = useRef(-1);
  useEffect(() => {
    if (phase === "playing" && started.current !== run.current) {
      started.current = run.current;
      later(150, () => showQuestion(0));
    }
  }, [phase, later, showQuestion]);

  const exit = () => {
    run.current++;
    session.stop();
    setPhase("ready");
  };

  // ukuran petak mengikuti ruang arena
  useEffect(() => {
    if (phase === "ready" || phase === "result") return;
    const el = boardWrap.current;
    if (!el) return;
    const fit = () =>
      setCell(
        Math.max(
          22,
          Math.floor(
            Math.min(
              (el.clientWidth - 12) / board.cols,
              (el.clientHeight - 12) / board.rows,
            ),
          ),
        ),
      );
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase, board.cols, board.rows]);

  // keyboard: 1–5 / A–E jawab · spasi / Enter lempar dadu · Enter lanjut
  const keys = useRef({ answer, roll, next, stage, hidden, n: 0 });
  useEffect(() => {
    keys.current = {
      answer,
      roll,
      next,
      stage,
      hidden,
      n: q ? optionCount(q) : 0,
    };
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
      } else if (k.stage === "roll" && (key === " " || key === "enter")) {
        e.preventDefault();
        k.roll();
      } else if (k.stage === "next" && key === "enter") {
        e.preventDefault();
        void k.next();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [phase]);

  // keadaan untuk uji otomatis (hanya saat development)
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __board: unknown }).__board = {
      phase,
      stage,
      level,
      pos,
      board,
      shield,
      crowns,
      score,
      dice,
    };
  });

  /** posisi tengah petak (px) di dalam papan; baris 0 = bawah, zig-zag */
  const center = useMemo(
    () => (c: number) => {
      const r = Math.floor((c - 1) / board.cols);
      const i = (c - 1) % board.cols;
      const col = r % 2 === 0 ? i : board.cols - 1 - i;
      return { x: (col + 0.5) * cell, y: (board.rows - 1 - r + 0.5) * cell };
    },
    [board.cols, board.rows, cell],
  );

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
            {pos >= board.size
              ? "🏁 Kucing sampai FINISH!"
              : `🎲 Kucing berhenti di petak ${pos} dari ${board.size}`}
          </span>
          {crowns > 0 && <span>👑 {crowns} mahkota</span>}
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
        title="Mode Ular Tangga Pintar"
        subtitle="Jawab soal untuk melempar dadu! Bawa kucing sampai FINISH sebelum soal habis."
        bullets={[
          {
            text: "✅ Jawab benar → lempar dadu 1–6. Benar 3x beruntun = bonus +1 langkah.",
          },
          { text: "❌ Salah / waktu habis → hanya dadu kecil 1–2." },
          {
            text: "🪜 Tangga membawa naik, 🐍 ular membuat turun — kecuali punya 🛡️ perisai.",
          },
          {
            text: "⭐ Bonus maju 2 petak · ❓ petak misteri (bisa untung, bisa buntung!).",
          },
          {
            text: `🧠 Santai: ${secondsPerQuestion} detik per soal seperti mode klasik. Papan berbeda setiap main — skor sama dengan mode klasik.`,
            tone: "emerald",
            wide: true,
          },
        ]}
        loggedIn={props.loggedIn}
        loginHref={props.loginHref}
        onBack={props.onExit}
        onStart={() => void begin()}
        startLabel="Mulai main"
        startIcon={<Play className="h-5 w-5 fill-current" />}
      />
    );

  const n = optionCount(q);
  const mood = catMood(streak, wrongStreak);
  const catPos = center(pos);
  const W = board.cols * cell;
  const H = board.rows * cell;
  return (
    <ArenaFrame
      label={`Soal ${level + 1}/${questions.length}`}
      extra={
        <>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-brand-50 px-2.5 py-1 text-xs font-extrabold text-brand-700">
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
      {/* papan */}
      <div
        ref={boardWrap}
        className="relative grid min-h-40 flex-1 place-items-center overflow-hidden bg-linear-to-b from-sky-200 to-emerald-200 p-1.5"
      >
        <div
          className="relative rounded-xl shadow-xl ring-4 ring-amber-700/70"
          style={{ width: W, height: H }}
        >
          {Array.from({ length: board.size }, (_, k) => {
            const c = k + 1;
            const { x, y } = center(c);
            const sp = board.specials.get(c);
            const odd = (Math.floor((c - 1) / board.cols) + c) % 2;
            return (
              <div
                key={c}
                className={cn(
                  "absolute grid place-items-center border border-white/40 text-[10px] font-bold text-navy-900/50 sm:text-xs",
                  c === board.size
                    ? "bg-sun-300"
                    : c === 1
                      ? "bg-emerald-300"
                      : odd
                        ? "bg-amber-50"
                        : "bg-orange-100",
                )}
                style={{
                  left: x - cell / 2,
                  top: y - cell / 2,
                  width: cell,
                  height: cell,
                }}
              >
                <span className="absolute left-0.5 top-0 leading-none">
                  {c}
                </span>
                {c === board.size && (
                  <span style={{ fontSize: cell * 0.45 }}>🏁</span>
                )}
                {c === 1 && (
                  <span className="text-[9px] font-black text-emerald-800">
                    MULAI
                  </span>
                )}
                {sp && (
                  <span style={{ fontSize: cell * 0.42 }}>
                    {sp === "star" ? "⭐" : "❓"}
                  </span>
                )}
              </div>
            );
          })}
          {/* tangga & ular */}
          <svg
            className="pointer-events-none absolute inset-0"
            width={W}
            height={H}
          >
            {[...board.jumps].map(([from, to]) => {
              const a = center(from);
              const b = center(to);
              if (to > from) {
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.hypot(dx, dy);
                const nx = (-dy / len) * cell * 0.16;
                const ny = (dx / len) * cell * 0.16;
                const rungs = Math.max(2, Math.round(len / (cell * 0.35)));
                return (
                  <g
                    key={from}
                    stroke="#92400e"
                    strokeWidth={Math.max(2, cell * 0.07)}
                    strokeLinecap="round"
                    opacity="0.92"
                  >
                    <line
                      x1={a.x + nx}
                      y1={a.y + ny}
                      x2={b.x + nx}
                      y2={b.y + ny}
                    />
                    <line
                      x1={a.x - nx}
                      y1={a.y - ny}
                      x2={b.x - nx}
                      y2={b.y - ny}
                    />
                    {Array.from({ length: rungs - 1 }, (_, r) => {
                      const t = (r + 1) / rungs;
                      return (
                        <line
                          key={r}
                          x1={a.x + dx * t + nx}
                          y1={a.y + dy * t + ny}
                          x2={a.x + dx * t - nx}
                          y2={a.y + dy * t - ny}
                          strokeWidth={Math.max(1.5, cell * 0.05)}
                        />
                      );
                    })}
                  </g>
                );
              }
              const mx = (a.x + b.x) / 2;
              const off = cell * 0.9 * (from % 2 ? 1 : -1);
              const color = ["#16a34a", "#dc2626", "#7c3aed", "#0891b2"][
                from % 4
              ];
              return (
                <g key={from} opacity="0.9">
                  <path
                    d={`M${a.x} ${a.y} C ${mx + off} ${a.y}, ${mx - off} ${b.y}, ${b.x} ${b.y}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={Math.max(4, cell * 0.2)}
                    strokeLinecap="round"
                  />
                  <path
                    d={`M${a.x} ${a.y} C ${mx + off} ${a.y}, ${mx - off} ${b.y}, ${b.x} ${b.y}`}
                    fill="none"
                    stroke="#fef08a"
                    strokeWidth={Math.max(1, cell * 0.05)}
                    strokeDasharray={`${cell * 0.12} ${cell * 0.2}`}
                  />
                  <circle cx={a.x} cy={a.y} r={cell * 0.2} fill={color} />
                  <circle
                    cx={a.x - cell * 0.07}
                    cy={a.y - cell * 0.05}
                    r={cell * 0.045}
                    fill="white"
                  />
                  <circle
                    cx={a.x + cell * 0.07}
                    cy={a.y - cell * 0.05}
                    r={cell * 0.045}
                    fill="white"
                  />
                  <path
                    d={`M${a.x} ${a.y + cell * 0.18} l ${-cell * 0.05} ${cell * 0.1} M${a.x} ${a.y + cell * 0.18} l ${cell * 0.05} ${cell * 0.1}`}
                    stroke="#ef4444"
                    strokeWidth={Math.max(1, cell * 0.03)}
                  />
                </g>
              );
            })}
          </svg>
          {/* kucing */}
          <div
            className="pointer-events-none absolute transition-[left,top] duration-200 ease-out"
            style={{
              left: catPos.x - cell * 0.5,
              top: catPos.y - cell * 0.78,
              width: cell,
              height: cell,
            }}
          >
            <div key={hop} className="h-full w-full animate-pop">
              {shield && (
                <div className="absolute inset-[-6%] rounded-full bg-sky-300/30 ring-2 ring-sky-300" />
              )}
              <GameCat
                mood={pos >= board.size ? "girang" : mood}
                className="relative h-full w-full"
              />
            </div>
          </div>
        </div>
        {toastText && (
          <div
            key={toastText.key}
            className="duel-banner pointer-events-none absolute inset-x-0 top-3 z-10 text-center"
          >
            <span className="inline-block rounded-2xl bg-navy-950/80 px-4 py-2 text-sm font-black text-white shadow-xl sm:text-base">
              {toastText.text}
            </span>
          </div>
        )}
        {dice && (stage === "rolling" || stage === "moving") && (
          <div className="pointer-events-none absolute right-3 top-3 z-10 grid place-items-center rounded-2xl bg-white/95 px-3 py-1 text-center shadow-xl ring-2 ring-amber-300">
            <span
              className={cn(
                "leading-none",
                dice.small
                  ? "text-4xl text-rose-500"
                  : "text-5xl text-navy-900",
              )}
            >
              {DICE[dice.face - 1]}
            </span>
            <span className="text-[10px] font-black text-navy-600">
              {dice.small ? "dadu kecil" : `maju ${dice.face}`}
              {dice.bonus ? " +1 🔥" : ""}
            </span>
          </div>
        )}
        {streak >= 2 && (
          <div className="pointer-events-none absolute left-2 top-2 z-10 animate-pop rounded-2xl bg-orange-500/90 px-2.5 py-1 text-sm font-black text-white shadow-lg">
            🔥 x{streak}
          </div>
        )}
        <ArenaOverlay phase={phase} count={cd.count} />
      </div>

      {/* soal & jawaban */}
      <div className="max-h-[48svh] shrink-0 overflow-y-auto border-t border-navy-100 p-3 sm:p-4">
        {q && (phase === "playing" || phase === "finishing") ? (
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
                    onClick={() => void answer(k)}
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
                      {stage === "checking" && picked === k ? (
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
            {feedback && (
              <div className="mt-3 space-y-2">
                <FeedbackBox
                  key={level}
                  feedback={feedback}
                  message={
                    stage === "roll"
                      ? feedback.correct
                        ? "Lempar dadunya!"
                        : "Hanya dadu kecil…"
                      : stage === "next" &&
                          pos >= board.size &&
                          level + 1 < questions.length
                        ? "Sudah di FINISH — kumpulkan 👑 dari sisa soal!"
                        : undefined
                  }
                  onNext={stage === "next" ? () => void next() : undefined}
                  nextLabel={
                    level + 1 < questions.length
                      ? "Soal berikutnya"
                      : "Lihat hasil"
                  }
                />
                {(stage === "roll" ||
                  stage === "rolling" ||
                  stage === "moving") && (
                  <button
                    type="button"
                    onClick={roll}
                    disabled={stage !== "roll"}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-base font-black shadow-lg transition disabled:opacity-60",
                      feedback.correct
                        ? "bg-linear-to-r from-sun-300 to-sun-500 text-navy-950"
                        : "bg-navy-100 text-navy-700",
                      stage === "roll" && "animate-pulse",
                    )}
                  >
                    <Dices className="h-5 w-5" />{" "}
                    {stage === "roll"
                      ? feedback.correct
                        ? "Lempar dadu!"
                        : "Lempar dadu kecil"
                      : "Kucing melangkah…"}
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm font-semibold text-navy-600">
            Bersiap… papan disiapkan! 🎲
          </p>
        )}
        <p className="mt-2 hidden text-[11px] text-navy-400 pointer-fine:block">
          1–{n} / A–{LETTERS[n - 1]}: jawab · spasi / Enter: lempar dadu ·
          Enter: lanjut
        </p>
      </div>
    </ArenaFrame>
  );
}

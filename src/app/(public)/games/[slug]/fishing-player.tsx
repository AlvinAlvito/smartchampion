"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Fish as FishIcon } from "lucide-react";
import type { ScoreResult } from "@/app/actions/games";
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
 * Mode Memancing: soal yang sama dengan mode klasik, dimainkan di danau.
 * Ikan berlabel A/B/C/D berenang pelan; ketuk ikan jawabanmu (atau tombol / 1–4) → kail dilempar & ikan ditarik.
 * Benar → ikan masuk akuarium (cepat = ikan langka ✨); salah → ikan lepas & kembali ke air, ikan yang benar bersinar.
 * Waktu habis → ikan-ikan kabur. Akuarium hanya koleksi — skor = skor klasik dari server.
 */

type Phase = "ready" | "countdown" | "playing" | "finishing" | "result";
/** question · casting = kail dilempar & ditarik · react = hasil · feedback */
type Stage = "enter" | "question" | "casting" | "react" | "feedback";
type Swimmer = {
  k: number;
  x: number;
  y: number;
  vx: number;
  size: number;
  phase: number;
  state: "swim" | "hooked" | "caught" | "escape" | "gone";
  glow: number;
  alpha: number;
};
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  grav: number;
};
type FloatText = {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
};
type Line = {
  k: number;
  phase: "cast" | "reel" | "hold";
  t: number;
  x: number;
  y: number;
};
type CheckResult = {
  correct: boolean;
  answerIndex: number;
  explanation: string | null;
};

const CAST_S = 0.45;
const REEL_S = 0.8;
/** ikan langka bila dijawab benar dalam 40% awal waktu */
const RARE_REMAIN = 0.6;
const DECO_COLORS = ["#fda4af", "#fdba74", "#a7f3d0"];

function makeWorld() {
  return {
    W: 360,
    H: 300,
    fish: [] as Swimmer[],
    deco: [] as Swimmer[],
    line: null as Line | null,
    result: null as CheckResult | null,
    particles: [] as Particle[],
    floats: [] as FloatText[],
    bubbles: [] as { x: number; y: number; r: number; v: number }[],
    stage: "enter" as Stage,
    elapsed: 0,
  };
}
type World = ReturnType<typeof makeWorld>;

/** posisi penting di layar: permukaan air, ujung joran, batas kedalaman ikan */
function geoOf(w: World) {
  const { W, H } = w;
  return {
    water: H * 0.26,
    tipX: Math.min(W * 0.34, 190),
    tipY: H * 0.08,
    top: H * 0.38,
    bottom: H * 0.9,
  };
}

/** ikan (semua / pilihan tertentu) berenang kabur */
function scare(w: World, ks: number[] | null, speed: number) {
  for (const f of w.fish)
    if (!ks || ks.includes(f.k)) {
      f.state = "escape";
      f.vx = Math.sign(f.vx || 1) * w.W * speed;
    }
}

/** efek hasil di danau: ikan tertangkap / lepas, ikan yang benar bersinar */
function showCatch(
  w: World,
  k: number,
  res: CheckResult,
  rare: boolean,
  pts: number,
) {
  const { tipX, tipY, water } = geoOf(w);
  const hooked = w.fish.find((f) => f.k === k);
  if (res.correct && hooked) {
    hooked.state = "caught";
    burst(w, tipX, tipY + 20, "good");
    w.floats.push({
      x: tipX,
      y: tipY + 10,
      text: rare ? `Ikan langka! ✨ +${pts}` : `Dapat! +${pts}`,
      color: rare ? "#fde047" : "#4ade80",
      life: 1.6,
    });
  } else {
    if (k === -1)
      w.floats.push({
        x: w.W / 2,
        y: water + 30,
        text: "Ikan-ikan kabur! 💨",
        color: "#e2e8f0",
        life: 1.6,
      });
    else {
      if (hooked) {
        // ikan lepas dari kail & jatuh kembali ke air
        hooked.state = "escape";
        hooked.y = water + 10;
        hooked.x = tipX;
        hooked.vx = w.W * 0.5;
        burst(w, tipX, water, "water");
      }
      w.floats.push({
        x: tipX,
        y: water - 10,
        text: "Lepas! Bukan ikan itu 😿",
        color: "#fca5a5",
        life: 1.6,
      });
    }
    const right = w.fish.find((f) => f.k === res.answerIndex);
    if (right) {
      right.glow = 2.5;
      if (right.state !== "swim") {
        right.state = "swim";
        right.alpha = 1;
      }
    }
  }
  w.line = null;
}

/** percikan partikel: bintang warna-warni (dapat ikan) / air */
function burst(w: World, x: number, y: number, kind: "good" | "water") {
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 60 + Math.random() * 160;
    w.particles.push(
      kind === "good"
        ? {
            x,
            y,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 100,
            life: 0.9,
            max: 0.9,
            color: ["#facc15", "#4ade80", "#f472b6", "#38bdf8"][i % 4],
            size: 2 + Math.random() * 3,
            grav: 380,
          }
        : {
            x: x - 20 + Math.random() * 40,
            y,
            vx: (Math.random() - 0.5) * 120,
            vy: -120 - Math.random() * 160,
            life: 0.9,
            max: 0.9,
            color: i % 3 ? "#38bdf8" : "#e0f2fe",
            size: 2 + Math.random() * 2.5,
            grav: 600,
          },
    );
  }
}

export function FishingPlayer(props: PlayerProps) {
  const { gameId, questions, secondsPerQuestion, onPlayingChange } = props;
  const session = useQuizSession(gameId, "fishing");
  const [phase, setPhase] = useState<Phase>("ready");
  const [stage, setStage] = useState<Stage>("enter");
  const [level, setLevel] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [hintsLeft, setHintsLeft] = useState(GAME_HINTS);
  const [hinting, setHinting] = useState(false);
  const [score, setScore] = useState(0);
  const [tank, setTank] = useState<string[]>([]);
  const [streak, setStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const run = useRef(0);
  const world = useRef(makeWorld());

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
  const go = (s: Stage) => {
    world.current.stage = s;
    setStage(s);
  };

  const q = questions[level];
  const geo = () => geoOf(world.current);

  /** ikan baru untuk soal ke-i: satu per pilihan di kedalaman berbeda, ditambah ikan hias kecil */
  const spawn = (i: number) => {
    const w = world.current;
    const { top, bottom } = geo();
    const n = optionCount(questions[i]);
    const lanes = Array.from({ length: n }, (_, k) => k).sort(
      () => Math.random() - 0.5,
    );
    w.fish = lanes.map((lane, k) => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      return {
        k,
        x: w.W * (0.15 + Math.random() * 0.7),
        y: top + ((bottom - top) * (lane + 0.5)) / n,
        vx: dir * w.W * (0.05 + Math.random() * 0.05),
        size: Math.max(24, Math.min(40, w.W / 14)),
        phase: Math.random() * 6,
        state: "swim",
        glow: 0,
        alpha: 0,
      };
    });
    if (!w.deco.length)
      w.deco = DECO_COLORS.map((_, k) => ({
        k,
        x: Math.random() * w.W,
        y: top + Math.random() * (bottom - top),
        vx: (Math.random() < 0.5 ? 1 : -1) * w.W * 0.08,
        size: 10,
        phase: Math.random() * 6,
        state: "swim",
        glow: 0,
        alpha: 0.7,
      }));
  };

  const showQuestion = useCallback(
    (i: number) => {
      setLevel(i);
      setFeedback(null);
      setHidden([]);
      world.current.line = null;
      world.current.result = null;
      spawn(i);
      go("enter");
      gameAudio().splash();
      later(700, () => {
        go("question");
        session.shown(questions[i].id);
      });
    },
    // spawn & go hanya memakai ref / setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [later, questions, session],
  );

  const answerRef = useRef<(k: number) => void>(() => undefined);
  const settleRef = useRef<(k: number, res: CheckResult) => void>(() => undefined);
  const timer = useQuestionTimer(
    phase === "playing" && stage === "question" ? level : null,
    secondsPerQuestion,
    () => answerRef.current(-1),
  );

  /** pilih ikan k (−1 = waktu habis): lempar kail, cek ke server bersamaan */
  const cast = useCallback(
    async (k: number) => {
      const w = world.current;
      if (w.stage !== "question") return;
      const target = w.fish.find((f) => f.k === k && f.state === "swim");
      if (k >= 0 && !target) return;
      w.elapsed = timer.elapsed();
      go("casting");
      if (k >= 0) {
        w.line = { k, phase: "cast", t: 0, x: geo().tipX, y: geo().tipY };
        gameAudio().whoosh();
      } else {
        // waktu habis: ikan-ikan kabur
        scare(w, null, 0.6);
      }
      const res = await session.check(q.id, k, w.elapsed);
      if (!res) return;
      w.result = res;
      if (k < 0) settleRef.current(-1, res);
    },
    // geo / go / settle hanya memakai ref / setter
     
    [timer, session, q],
  );
  useEffect(() => {
    answerRef.current = (k) => void cast(k);
  });

  /** kail selesai ditarik & jawaban server tiba → tampilkan hasil */
  const settle = (k: number, res: CheckResult) => {
    const w = world.current;
    const elapsed = w.elapsed;
    const pts = res.correct
      ? pointsFor(q.points, secondsPerQuestion, elapsed)
      : 0;
    const rare =
      res.correct &&
      1 -
        Math.min(elapsed, secondsPerQuestion * 1000) /
          (secondsPerQuestion * 1000) >=
        RARE_REMAIN;
    setFeedback({
      choice: k,
      correct: res.correct,
      answerIndex: res.answerIndex,
      explanation: res.explanation,
      points: pts,
    });
    setScore((s) => s + pts);
    const audio = gameAudio();
    const caught = res.correct && w.fish.some((f) => f.k === k);
    showCatch(w, k, res, rare, pts);
    if (caught) {
      setTank((t) => [...t, rare ? "🐠" : "🐟"]);
      setStreak((s) => {
        audio.correct(s + 1);
        return s + 1;
      });
      setWrongStreak(0);
      audio.coin();
    } else {
      setStreak(0);
      setWrongStreak((s) => s + 1);
      if (k === -1) audio.timeout();
      else {
        audio.wrong();
        audio.splash();
      }
    }
    go("react");
    later(1200, () => go("feedback"));
  };
  useEffect(() => {
    settleRef.current = settle;
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
    if (res.removed && i === level && world.current.stage === "question") {
      setHidden(res.removed);
      // ikan yang dibuang berenang pergi
      scare(world.current, res.removed, 0.5);
    }
  };

  const cd = useCountdown(phase === "countdown", () => setPhase("playing"));
  const begin = async () => {
    requestMobileFullscreen();
    const audio = gameAudio();
    audio.unlock();
    audio.click();
    audio.startMusic();
    run.current++;
    const w = world.current;
    w.fish = [];
    w.deco = [];
    w.line = null;
    w.result = null;
    w.particles = [];
    w.floats = [];
    setScore(0);
    setTank([]);
    setStreak(0);
    setWrongStreak(0);
    setHintsLeft(GAME_HINTS);
    setResult(null);
    setFeedback(null);
    setLevel(0);
    go("enter");
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
      showQuestion(0);
    }
  }, [phase, showQuestion]);

  const exit = () => {
    run.current++;
    session.stop();
    world.current.stage = "enter";
    setPhase("ready");
  };

  // ketuk ikan di danau
  const onCanvasDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = world.current;
    let best: Swimmer | null = null;
    let bestD = Infinity;
    for (const f of w.fish) {
      if (f.state !== "swim") continue;
      const d = Math.hypot((x - f.x) / 1.6, y - f.y);
      if (d < f.size * 1.3 && d < bestD) {
        best = f;
        bestD = d;
      }
    }
    if (best) answerRef.current(best.k);
  };

  // keyboard: 1–5 / A–E pancing · Enter lanjut
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

  /* ---------------- loop: gerak + gambar ---------------- */
  const playing =
    phase === "countdown" || phase === "playing" || phase === "finishing";
  useEffect(() => {
    if (!playing) return;
    const canvas = canvasRef.current;
    const wrap = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return;
    let dpr = 1;
    const resize = () => {
      const w = world.current;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w.W = wrap.clientWidth;
      w.H = wrap.clientHeight;
      canvas.width = Math.round(w.W * dpr);
      canvas.height = Math.round(w.H * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const drawFish = (
      f: Swimmer,
      color: string,
      label: string | null,
      t: number,
    ) => {
      const s = f.size;
      const dir = f.vx >= 0 ? 1 : -1;
      const wig = Math.sin(t * 8 + f.phase) * 0.18;
      ctx.save();
      ctx.translate(f.x, f.y);
      if (f.state === "hooked" || f.state === "caught")
        ctx.rotate(-Math.PI / 2 + Math.sin(t * 20) * 0.25);
      ctx.scale(dir, 1);
      ctx.globalAlpha = f.alpha;
      if (f.glow > 0) {
        ctx.shadowColor = "#fde047";
        ctx.shadowBlur = 24;
      }
      // ekor
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-s * 0.7, 0);
      ctx.lineTo(-s * 1.25, -s * (0.45 + wig));
      ctx.lineTo(-s * 1.25, s * (0.45 - wig));
      ctx.closePath();
      ctx.fill();
      // badan
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.9, s * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.ellipse(s * 0.05, -s * 0.18, s * 0.55, s * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      // mata
      ctx.fillStyle = "white";
      ctx.beginPath();
      ctx.arc(s * 0.5, -s * 0.12, s * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(s * 0.54, -s * 0.12, s * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (label) {
        // lencana huruf (tidak ikut terbalik)
        ctx.save();
        ctx.globalAlpha = f.alpha;
        const lx =
          f.state === "hooked" || f.state === "caught"
            ? f.x + s * 0.7
            : f.x - dir * s * 0.1;
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(lx, f.y, s * 0.36, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = f.glow > 0 ? "#facc15" : color;
        ctx.lineWidth = f.glow > 0 ? 4 : 2;
        ctx.stroke();
        ctx.fillStyle = "#0f172a";
        ctx.font = `900 ${Math.round(s * 0.44)}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, lx, f.y + 1);
        ctx.restore();
      }
    };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = world.current;
      const { W, H } = w;
      const t = now / 1000;
      const { water, tipX, tipY, top, bottom } = geo();

      // --- gerak ikan
      for (const f of [...w.fish, ...w.deco]) {
        if (f.glow > 0) f.glow -= dt * 0.4;
        if (f.state === "swim") {
          f.alpha = Math.min(1, f.alpha + dt * 2);
          f.x += f.vx * dt;
          f.y += Math.sin(t * 1.3 + f.phase) * 6 * dt;
          f.y = Math.max(top - 10, Math.min(bottom + 10, f.y));
          if (
            (f.x < f.size * 1.4 && f.vx < 0) ||
            (f.x > W - f.size * 1.4 && f.vx > 0)
          )
            f.vx = -f.vx;
        } else if (f.state === "escape") {
          f.x += f.vx * dt;
          f.alpha = Math.max(0, f.alpha - dt * 1.2);
          if (f.alpha <= 0) f.state = "gone";
        } else if (f.state === "caught") {
          // naik ke ember di dermaga
          f.y -= 90 * dt;
          f.alpha = Math.max(0, f.alpha - dt * 0.9);
          if (f.alpha <= 0) f.state = "gone";
        }
      }
      // --- kail
      const ln = w.line;
      if (ln) {
        const f = w.fish.find((x) => x.k === ln.k);
        if (ln.phase === "cast" && f) {
          ln.t += dt / CAST_S;
          ln.x = tipX + (f.x - tipX) * Math.min(1, ln.t);
          ln.y = tipY + (f.y - tipY) * Math.min(1, ln.t);
          if (ln.t >= 1) {
            ln.phase = "reel";
            ln.t = 0;
            f.state = "hooked";
            f.alpha = 1;
            gameAudio().splash();
          }
        } else if (ln.phase === "reel" && f) {
          ln.t += dt / REEL_S;
          const e = Math.min(1, ln.t);
          ln.x += (tipX - ln.x) * Math.min(1, dt * 5);
          ln.y = f.y =
            f.y + (tipY + 34 - f.y) * Math.min(1, dt * 4 * (0.5 + e));
          f.x = ln.x;
          if (ln.t >= 1) ln.phase = "hold";
        }
        if (ln.phase === "hold" && w.result) {
          w.line = null;
          settleRef.current(ln.k, w.result);
        }
      }
      // --- partikel, teks, gelembung
      for (const p of w.particles) {
        p.vy += p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      w.particles = w.particles.filter((p) => p.life > 0);
      for (const fl of w.floats) {
        fl.y -= 28 * dt;
        fl.life -= dt;
      }
      w.floats = w.floats.filter((fl) => fl.life > 0);
      if (Math.random() < dt * 2.5)
        w.bubbles.push({
          x: Math.random() * W,
          y: H,
          r: 2 + Math.random() * 4,
          v: 20 + Math.random() * 30,
        });
      for (const b of w.bubbles) b.y -= b.v * dt;
      w.bubbles = w.bubbles.filter((b) => b.y > water);

      // --- gambar
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sky = ctx.createLinearGradient(0, 0, 0, water);
      sky.addColorStop(0, "#7dd3fc");
      sky.addColorStop(1, "#e0f2fe");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, water);
      // matahari & bukit
      ctx.fillStyle = "#fde68a";
      ctx.beginPath();
      ctx.arc(W * 0.82, water * 0.4, Math.min(30, W * 0.06), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#86efac";
      ctx.beginPath();
      ctx.ellipse(W * 0.7, water, W * 0.4, water * 0.45, 0, Math.PI, 0);
      ctx.fill();
      // air
      const lake = ctx.createLinearGradient(0, water, 0, H);
      lake.addColorStop(0, "#38bdf8");
      lake.addColorStop(1, "#1e3a8a");
      ctx.fillStyle = lake;
      ctx.fillRect(0, water, W, H - water);
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8)
        ctx.lineTo(x, water + Math.sin(x / 22 + t * 2) * 2.5);
      ctx.stroke();
      // tanaman air
      ctx.strokeStyle = "#166534";
      ctx.lineWidth = 4;
      for (let k = 0; k < 7; k++) {
        const x = (W / 7) * (k + 0.5);
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.quadraticCurveTo(
          x + Math.sin(t + k) * 10,
          H - 40,
          x + Math.sin(t * 1.3 + k) * 6,
          H - 70 - (k % 3) * 18,
        );
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (const b of w.bubbles) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // dermaga
      ctx.fillStyle = "#92400e";
      ctx.fillRect(0, water - 14, tipX * 0.62, 16);
      ctx.fillStyle = "#78350f";
      for (let x = 10; x < tipX * 0.62; x += 34) ctx.fillRect(x, water, 7, 34);
      // ikan
      for (const f of w.deco) drawFish(f, DECO_COLORS[f.k], null, t);
      for (const f of w.fish)
        if (f.state !== "gone")
          drawFish(f, OPTION_COLORS[f.k], LETTERS[f.k], t);
      // joran & tali
      ctx.strokeStyle = "#78350f";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tipX * 0.36, water - 40);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      if (ln)
        ctx.quadraticCurveTo(
          (tipX + ln.x) / 2,
          Math.max(tipY, ln.y) + 20,
          ln.x,
          ln.y,
        );
      else ctx.lineTo(tipX, water - 6 + Math.sin(t * 2) * 3);
      ctx.stroke();
      if (!ln) {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(tipX, water - 6 + Math.sin(t * 2) * 3, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // partikel & teks
      for (const p of w.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const fl of w.floats) {
        ctx.globalAlpha = Math.min(1, fl.life * 1.5);
        ctx.font = `900 ${Math.round(Math.max(15, W / 26))}px system-ui`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(15,23,42,0.85)";
        const x = Math.max(90, Math.min(W - 90, fl.x));
        ctx.strokeText(fl.text, x, fl.y);
        ctx.fillStyle = fl.color;
        ctx.fillText(fl.text, x, fl.y);
      }
      ctx.globalAlpha = 1;
      // kucing di dermaga
      if (catRef.current) {
        const size = Math.max(44, Math.min(110, water - 2));
        catRef.current.style.width = `${size}px`;
        catRef.current.style.height = `${size}px`;
        catRef.current.style.transform = `translate(${tipX * 0.3 - size / 2}px, ${water - 12 - size}px)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // geo hanya membaca ref
     
  }, [playing]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __fishing: unknown }).__fishing = {
      phase,
      stage,
      level,
      score,
      tank,
      world: world.current,
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
        <div className="card p-4 text-center text-sm font-bold text-navy-700">
          <p>
            🐠 Akuarium kamu ({tank.length} ikan
            {tank.includes("🐠")
              ? `, ${tank.filter((x) => x === "🐠").length} langka ✨`
              : ""}
            )
          </p>
          <p className="mt-1 text-3xl tracking-wider">
            {tank.length ? tank.join("") : "🫧"}
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
        title="Mode Memancing di Danau"
        subtitle="Ikan berlabel jawaban berenang di danau — pancing ikan yang benar dan isi akuariummu!"
        bullets={[
          {
            text: "🎣 Ketuk ikan berlabel jawabanmu (atau tombol jawaban / 1–4 / A–D) untuk melempar kail.",
          },
          {
            text: "🐠 Benar → ikan masuk akuarium. Jawab cepat = ikan langka ✨.",
          },
          {
            text: "😿 Salah → ikan lepas dari kail, lalu ikan yang benar bersinar.",
          },
          {
            text: "💨 Waktu habis → ikan-ikan kabur. 50:50 membuat 2 ikan salah berenang pergi.",
          },
          {
            text: `🧠 Paling santai: ${secondsPerQuestion} detik per soal seperti mode klasik. Skor sama dengan mode klasik.`,
            tone: "emerald",
            wide: true,
          },
        ]}
        loggedIn={props.loggedIn}
        loginHref={props.loginHref}
        onBack={props.onExit}
        onStart={() => void begin()}
        startLabel="Mulai memancing"
        startIcon={<FishIcon className="h-5 w-5" />}
      />
    );

  const n = optionCount(q);
  const mood = catMood(streak, wrongStreak);
  return (
    <ArenaFrame
      label={`Soal ${level + 1}/${questions.length}`}
      extra={
        <>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-extrabold text-cyan-700">
            ⭐ {score}
          </span>
          <span className="hidden shrink-0 whitespace-nowrap rounded-full bg-sky-50 px-2.5 py-1 text-xs font-extrabold text-sky-700 sm:inline">
            🪣 {tank.length}
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
      {/* danau */}
      <div className="relative h-[40svh] min-h-52 shrink-0 select-none overflow-hidden bg-sky-300">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={onCanvasDown}
        />
        <div
          ref={catRef}
          className="pointer-events-none absolute left-0 top-0 will-change-transform"
        >
          <GameCat mood={mood} className="h-full w-full" />
        </div>
        <div className="pointer-events-none absolute right-2 top-2 rounded-2xl bg-navy-950/60 px-2.5 py-1 text-right text-xs font-bold text-white backdrop-blur">
          🪣 {tank.length}
          <div className="max-w-28 truncate text-sm leading-tight">
            {tank.slice(-6).join("")}
          </div>
        </div>
        {streak >= 2 && (
          <div className="pointer-events-none absolute left-2 top-2 animate-pop rounded-2xl bg-orange-500/90 px-2.5 py-1 text-sm font-black text-white shadow-lg">
            🔥 x{streak}
          </div>
        )}
        <ArenaOverlay phase={phase} count={cd.count} />
      </div>

      {/* soal & jawaban */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        {phase === "playing" && stage !== "enter" ? (
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
                      "flex min-h-11 items-center gap-2 rounded-2xl bg-white px-2.5 py-2 text-left text-sm font-semibold text-navy-900 shadow-sm ring-2 transition sm:text-base",
                      stage === "question" &&
                        !off &&
                        "hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]",
                      off && "opacity-20 grayscale",
                      feedback && !isRight && !isWrong && "opacity-40",
                      isRight && "bg-emerald-50 ring-emerald-400",
                      isWrong && "animate-shake bg-rose-50 ring-rose-400",
                    )}
                    style={
                      isRight || isWrong
                        ? undefined
                        : {
                            ["--tw-ring-color" as string]: `${OPTION_COLORS[k]}55`,
                          }
                    }
                  >
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white"
                      style={{ background: OPTION_COLORS[k] }}
                    >
                      {LETTERS[k]}
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
            {stage === "casting" && (
              <p className="mt-2 text-sm font-semibold text-navy-500">
                🎣 Menarik kail…
              </p>
            )}
            {stage === "question" && (
              <p className="mt-2 text-xs font-semibold text-navy-500">
                Ketuk ikan berlabel jawabanmu di danau (atau tombol di atas).
              </p>
            )}
            {feedback && stage === "feedback" && (
              <div className="mt-3">
                <FeedbackBox
                  key={level}
                  feedback={feedback}
                  onNext={() => void next()}
                  nextLabel={
                    level + 1 < questions.length
                      ? "Pancing lagi"
                      : "Lihat akuarium & skor"
                  }
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm font-semibold text-navy-600">
            {phase === "countdown"
              ? "Bersiap memancing… 🎣"
              : "Ikan-ikan berdatangan… 🐟"}
          </p>
        )}
        <p className="mt-2 hidden text-[11px] text-navy-400 pointer-fine:block">
          Klik ikan · 1–{n} / A–{LETTERS[n - 1]}: pancing · Enter: lanjut
        </p>
      </div>
    </ArenaFrame>
  );
}

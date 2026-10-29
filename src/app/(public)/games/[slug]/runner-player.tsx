"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Lightbulb,
  LogIn,
  LogOut,
  Maximize,
  Minimize,
  Play,
  Turtle,
  Zap,
} from "lucide-react";
import {
  checkAnswerAction,
  collectStarAction,
  questionShownAction,
  startPlayAction,
  submitScoreAction,
  takeHintAction,
  type ScoreResult,
} from "@/app/actions/games";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/form-buttons";
import { GameCat } from "@/components/game-cat";
import { MathText } from "@/components/math-text";
import { gameAudio } from "@/lib/game-audio";
import { catMood, GAME_HINTS } from "@/lib/game-rules";
import { cn } from "@/lib/utils";
import { ResultCelebration } from "./result-celebration";

/**
 * Mode Lari Lintasan: soal yang sama dengan mode klasik, disajikan sebagai game lari 3 dimensi semu (gaya Subway Surfers).
 * Kucing berlari otomatis; soal tampil di panel atas, lalu gerbang A/B/C/D datang dari kejauhan — lewati gerbang jawabanmu.
 * Kunci, waktu & skor tetap dicatat server (startPlay → questionShown → checkAnswer → submitScore). Ikan 🐟 = bonus pungut
 * (id dari server, sah per segmen setelah soal sebelumnya dijawab, dihitung server: +5).
 *
 * Satuan dunia: x ternormalisasi −1 (kiri) … 1 (kanan) selebar jalan; z = jarak ke depan (0 = posisi kucing).
 * Gerbang datang setelah waktu baca yang menyesuaikan panjang soal; tombol ⚡ Gas mempercepatnya (bonus kecepatan).
 */

type Question = { id: number; text: string; options: string[]; points: number };
type Phase = "ready" | "countdown" | "playing" | "finishing" | "result";
type Stage = "intro" | "reading" | "checking" | "gap" | "toFinish" | "done";

type Obj =
  | { kind: "gate"; qi: number; z: number }
  | { kind: "box"; lane: number; z: number; hit: boolean }
  | {
      kind: "fish";
      lane: number;
      z: number;
      high: boolean;
      id: string;
      seg: number;
      taken: boolean;
    }
  | { kind: "turtle"; lane: number; z: number; taken: boolean }
  | { kind: "finish"; z: number };
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
type Feedback = {
  choice: number;
  correct: boolean;
  answerIndex: number;
  explanation: string | null;
  points: number;
};

const LETTERS = ["A", "B", "C", "D", "E"];
const OPTION_COLORS = ["#1a6f9f", "#0ea5e9", "#eab308", "#2563eb", "#14b8a6"];

const BASE_SPEED = 18; // unit/detik (pemanasan, jeda antar soal, menuju finish)
/** saat soal tampil kucing berlari santai: gerbang terlihat lebih lama (Z_FAR / JOG_SPEED ≈ 8 dtk) */
const JOG_SPEED = 9;
/** ⚡ Gas = lari kencang menuju gerbang */
const GAS_SPEED = 40;
/** 🐢 Mode Pelan: dunia melambat selama soal tampil, menghabiskan energi pelan (detik) */
const SLOW_MUL = 0.3;
const SLOW_START = 6;
const SLOW_MAX = 15;
const SLOW_PICKUP = 4;
const STUMBLE_MUL = 0.45;
const STUMBLE_S = 0.7;
const Z_FAR = 70; // batas pandang
const INTRO_S = 2.6; // lari pemanasan sebelum soal pertama
const GAP_S = 3.2; // jeda antar soal (pembahasan singkat + pungut ikan)
const FINISH_S = 2.6;
const JUMP_S = 0.62;
const GAS_AFTER_MS = 900; // gas bisa dipakai setelah soal tampil sekian ms (cegah tak sengaja)
const D = 9; // proyeksi perspektif (makin besar = objek jauh tampak lebih besar)
const Z0 = 1.4;

/** Skor per soal sama dengan server: poin penuh bila instan, minimal 50% setelah batas waktu */
function pointsFor(base: number, secondsLimit: number, elapsedMs: number) {
  const limitMs = secondsLimit * 1000;
  const remaining = Math.max(0, limitMs - Math.min(elapsedMs, limitMs));
  return Math.round(base * (0.5 + 0.5 * (remaining / limitMs)));
}

const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Waktu sebelum gerbang tiba (detik, tanpa Gas/Pelan): sama dengan waktu soal di mode klasik (min 8 dtk),
 * ditambah bila soal & pilihannya panjang. Lewat batas waktu soal pun jawaban benar tetap dapat 50% poin (server).
 */
function readSeconds(q: Question, secondsLimit: number) {
  const chars =
    q.text.length + q.options.reduce((n, o) => n + o.length, 0) * 0.6;
  return Math.min(45, Math.max(8, secondsLimit, 4 + chars / 18));
}

const optionCount = (q: Question) => Math.max(2, Math.min(5, q.options.length));
/**
 * Gerbang k menempati jalur [⌊k·L/n⌋, ⌊(k+1)·L/n⌋) — batas gerbang selalu di garis batas jalur, jadi kucing tidak pernah
 * berlari tepat di bawah tiang (mis. 2 pilihan di 3 jalur: A = 1 jalur, B = 2 jalur). Butuh L ≥ n (dijamin LANES).
 */
const gateStartLane = (k: number, lanes: number, n: number) =>
  Math.floor((k * lanes) / n);
/** tepi kiri gerbang k dalam x ternormalisasi (k = n → tepi kanan jalan) */
const gateEdge = (k: number, lanes: number, n: number) =>
  -1 + (2 * gateStartLane(k, lanes, n)) / lanes;
/** gerbang yang dilewati kucing di jalur `lane` */
const gateOfLane = (lane: number, lanes: number, n: number) => {
  for (let k = n - 1; k >= 0; k--)
    if (lane >= gateStartLane(k, lanes, n)) return k;
  return 0;
};
const laneCenter = (lane: number, lanes: number) => -1 + (2 * lane + 1) / lanes;

export function RunnerPlayer(props: {
  gameId: number;
  secondsPerQuestion: number;
  questions: Question[];
  loggedIn: boolean;
  canSave: boolean;
  loginHref: string;
  onExit: () => void;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const { gameId, questions, secondsPerQuestion, onPlayingChange } = props;
  const router = useRouter();
  const toast = useToast();
  // jumlah jalur tetap selama permainan: mengikuti soal dengan pilihan terbanyak (3–5)
  const LANES = Math.max(
    3,
    Math.min(5, Math.max(...questions.map(optionCount), 2)),
  );

  const [phase, setPhase] = useState<Phase>("ready");
  const [count, setCount] = useState(3);
  const [level, setLevel] = useState(-1);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [hintsLeft, setHintsLeft] = useState(GAME_HINTS);
  const [hinting, setHinting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [score, setScore] = useState(0);
  const [fishCount, setFishCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [gasOn, setGasOn] = useState(false);
  const [slowOn, setSlowOn] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const etaRef = useRef<HTMLSpanElement>(null);
  const gasBtnRef = useRef<HTMLButtonElement>(null);
  const slowBtnRef = useRef<HTMLButtonElement>(null);
  const token = useRef<string | null>(null);

  const fresh = () => ({
    lane: Math.floor(LANES / 2),
    xVis: laneCenter(Math.floor(LANES / 2), LANES),
    jumpT: -1,
    stumbleT: -1,
    travelled: 0,
    stage: "intro" as Stage,
    stageDist: 0,
    gapDist: 0,
    objects: [] as Obj[],
    qi: -1,
    shownAt: 0,
    answered: [] as boolean[],
    hidden: [] as number[],
    gas: false,
    fishBySeg: new Map<number, string[]>(),
    startAt: 0,
    particles: [] as Particle[],
    floats: [] as FloatText[],
    tilt: 0,
    slow: false,
    slowEnergy: SLOW_START,
    done: false,
  });
  const game = useRef(fresh());

  const playing =
    phase === "countdown" || phase === "playing" || phase === "finishing";
  useEffect(() => {
    onPlayingChange?.(phase !== "ready");
  }, [phase, onPlayingChange]);
  useEffect(() => () => gameAudio().stopMusic(0.1), []);

  // layar penuh: menutupi header & tombol chat; halaman belakang tidak ikut tergulir
  useEffect(() => {
    if (!playing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [playing]);
  useEffect(() => {
    if (!playing && document.fullscreenElement)
      void document.exitFullscreen().catch(() => undefined);
  }, [playing]);
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => undefined);
    else
      void document.documentElement
        .requestFullscreen?.({ navigationUI: "hide" })
        .catch(() => undefined);
  };

  const mood = catMood(streak, wrongStreak);
  const q = level >= 0 ? questions[level] : null;

  /* ---------------- efek ---------------- */

  /** partikel di koordinat layar (px) sekitar kucing */
  const burst = (
    x: number,
    y: number,
    kind: "good" | "water" | "fire" | "fish",
  ) => {
    const g = game.current;
    const n = kind === "fish" ? 10 : kind === "good" ? 26 : 30;
    for (let i = 0; i < n; i++) {
      if (kind === "good" || kind === "fish") {
        const a = Math.random() * Math.PI * 2;
        const v = (kind === "fish" ? 80 : 120) + Math.random() * 160;
        g.particles.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 120,
          life: 0.8,
          max: 0.8,
          color:
            kind === "fish"
              ? "#fde047"
              : ["#facc15", "#4ade80", "#f472b6", "#38bdf8"][i % 4],
          size: 2 + Math.random() * 3,
          grav: 420,
        });
      } else if (kind === "water") {
        g.particles.push({
          x: x - 30 + Math.random() * 60,
          y: y - 120 - Math.random() * 40,
          vx: (Math.random() - 0.5) * 40,
          vy: 80 + Math.random() * 90,
          life: 1.1,
          max: 1.1,
          color: i % 3 ? "#38bdf8" : "#bae6fd",
          size: 2.5 + Math.random() * 2.5,
          grav: 900,
        });
      } else {
        g.particles.push({
          x: x - 22 + Math.random() * 44,
          y: y - Math.random() * 10,
          vx: (Math.random() - 0.5) * 70,
          vy: -90 - Math.random() * 150,
          life: 0.9,
          max: 0.9,
          color: ["#f97316", "#ef4444", "#facc15"][i % 3],
          size: 3 + Math.random() * 4,
          grav: -120,
        });
      }
    }
  };

  /* ---------------- alur soal (server) ---------------- */

  /** sisipkan baris ikan untuk segmen `seg` (4 ikan dari server) mulai jarak z0; kadang melengkung di atas kardus */
  /** item 🐢 (+energi Mode Pelan) di jalur acak; tidak memengaruhi skor */
  const spawnTurtle = (z: number) => {
    const g = game.current;
    if (g.objects.some((o) => Math.abs(o.z - z) < 3)) z += 5;
    g.objects.push({
      kind: "turtle",
      lane: Math.floor(Math.random() * LANES),
      z,
      taken: false,
    });
  };

  const spawnFish = (seg: number, z0: number) => {
    const g = game.current;
    const ids = g.fishBySeg.get(seg) ?? [];
    if (!ids.length) return;
    g.fishBySeg.delete(seg);
    const lane = Math.floor(Math.random() * LANES);
    const arch = Math.random() < 0.4;
    ids.forEach((id, i) => {
      const z = z0 + i * 3.2;
      const high = arch && (i === 1 || i === 2);
      g.objects.push({ kind: "fish", lane, z, high, id, seg, taken: false });
    });
    if (arch)
      g.objects.push({ kind: "box", lane, z: z0 + 1.5 * 3.2, hit: false });
  };

  const spawnBox = (zMin: number, zMax: number) => {
    const g = game.current;
    if (zMax - zMin < 2) return;
    const z = zMin + Math.random() * (zMax - zMin);
    // jangan menumpuk dengan objek lain di dekatnya
    if (g.objects.some((o) => Math.abs(o.z - z) < 4)) return;
    g.objects.push({
      kind: "box",
      lane: Math.floor(Math.random() * LANES),
      z,
      hit: false,
    });
  };

  const showQuestion = useCallback(
    (i: number) => {
      const g = game.current;
      g.qi = i;
      g.stage = "reading";
      g.shownAt = performance.now();
      g.hidden = [];
      g.gas = false;
      setGasOn(false);
      g.slow = false;
      setSlowOn(false);
      setHidden([]);
      setLevel(i);
      setFeedback(null);
      setShowExplain(false);
      const dist = JOG_SPEED * readSeconds(questions[i], secondsPerQuestion);
      g.objects.push({ kind: "gate", qi: i, z: dist });
      // satu kardus di tengah perjalanan bila cukup jauh (tidak dekat gerbang)
      if (dist > 34) spawnBox(12, dist - 16);
      if (token.current)
        void questionShownAction(token.current, questions[i].id);
    },
    // spawnBox memakai ref & LANES (tetap selama permainan)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, secondsPerQuestion],
  );

  const answer = useCallback(
    async (i: number, k: number, catX: number, catY: number) => {
      const g = game.current;
      g.stage = "checking";
      setChecking(true);
      const elapsed = Math.round(performance.now() - g.shownAt);
      try {
        const res = await checkAnswerAction(
          token.current ?? "",
          questions[i].id,
          k,
          elapsed,
        );
        // balasan dari sesi lama (pemain sudah keluar / main ulang) → abaikan
        if (game.current !== g) return;
        if ("error" in res && res.error) toast.error(res.error);
        const pts = res.correct
          ? pointsFor(questions[i].points, secondsPerQuestion, elapsed)
          : 0;
        g.answered[i] = true;
        setFeedback({
          choice: k,
          correct: res.correct,
          answerIndex: res.answerIndex,
          explanation: res.explanation ?? null,
          points: pts,
        });
        setScore((s) => s + pts);
        if (res.correct) {
          setStreak((s) => {
            gameAudio().correct(s + 1);
            return s + 1;
          });
          setWrongStreak(0);
          burst(catX, catY - 30, "good");
          g.floats.push({
            x: catX,
            y: catY - 90,
            text: `Benar! +${pts}`,
            color: "#4ade80",
            life: 1.4,
          });
        } else {
          setStreak(0);
          setWrongStreak((s) => s + 1);
          const water = Math.random() < 0.5;
          burst(catX, catY, water ? "water" : "fire");
          if (water) gameAudio().splash();
          else gameAudio().burn();
          gameAudio().wrong();
          g.stumbleT = 0;
          g.floats.push({
            x: catX,
            y: catY - 90,
            text: water ? "Byurr! 💦" : "Panas! 🔥",
            color: "#fca5a5",
            life: 1.4,
          });
        }
      } catch {
        if (game.current !== g) return;
        toast.error(
          "Koneksi terputus saat mengecek jawaban — jawaban dianggap belum terkirim, lanjut ke soal berikutnya.",
        );
        g.answered[i] = true;
      } finally {
        if (game.current === g) {
          setChecking(false);
          // jeda: ikan segmen berikutnya + kardus, lalu soal berikutnya / garis finish
          g.stage = "gap";
          g.gapDist = 0;
          spawnFish(i + 1, 10);
          spawnTurtle(24);
          spawnBox(30, BASE_SPEED * GAP_S - 4);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [questions, secondsPerQuestion, toast],
  );

  const finish = useCallback(async () => {
    const g = game.current;
    if (g.done) return;
    g.done = true;
    g.stage = "done";
    setPhase("finishing");
    gameAudio().stopMusic();
    try {
      const res = await submitScoreAction(token.current ?? "");
      if (game.current !== g) return;
      token.current = null;
      if ("error" in res) {
        toast.error(res.error ?? "Gagal menyimpan skor.");
        setPhase("ready");
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
      setPhase("ready");
    }
  }, [router, toast]);

  const takeHint = async () => {
    const g = game.current;
    const i = g.qi;
    if (
      i < 0 ||
      g.stage !== "reading" ||
      hinting ||
      hintsLeft <= 0 ||
      g.hidden.length
    )
      return;
    setHinting(true);
    gameAudio().click();
    try {
      const res = await takeHintAction(token.current ?? "", questions[i].id);
      if (game.current !== g) return;
      if (res.error) toast.error(res.error);
      if (typeof res.left === "number") setHintsLeft(res.left);
      if (res.removed && g.qi === i && g.stage === "reading") {
        g.hidden = res.removed;
        setHidden(res.removed);
      }
    } catch {
      toast.error("Koneksi terputus saat mengambil petunjuk.");
    } finally {
      setHinting(false);
    }
  };

  /* ---------------- kontrol ---------------- */

  const move = (d: -1 | 1) => {
    const g = game.current;
    if (g.stage === "done") return;
    const next = Math.max(0, Math.min(LANES - 1, g.lane + d));
    if (next === g.lane) return;
    g.lane = next;
    g.tilt = d;
    gameAudio().whoosh();
  };
  const jump = () => {
    const g = game.current;
    if (g.jumpT >= 0 || g.stage === "done") return;
    g.jumpT = 0;
    gameAudio().jump();
  };
  const gas = () => {
    const g = game.current;
    if (
      g.stage !== "reading" ||
      g.gas ||
      performance.now() - g.shownAt < GAS_AFTER_MS
    )
      return;
    g.gas = true;
    setGasOn(true);
    // gas mematikan mode pelan
    g.slow = false;
    setSlowOn(false);
    gameAudio().boost();
  };
  /** 🐢 Mode Pelan: tekan untuk memperlambat, tekan lagi untuk melepas (hanya saat soal tampil & ada energi) */
  const slow = () => {
    const g = game.current;
    if (g.slow) {
      g.slow = false;
      setSlowOn(false);
      gameAudio().click();
      return;
    }
    if (g.stage !== "reading" || g.gas || g.slowEnergy <= 0.05) return;
    g.slow = true;
    setSlowOn(true);
    gameAudio().whoosh();
  };
  const controls = useRef({ move, jump, gas, slow });
  useEffect(() => {
    controls.current = { move, jump, gas, slow };
  });

  useEffect(() => {
    if (!playing) return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const c = controls.current;
      if (k === "arrowleft" || k === "a") {
        if (!e.repeat) c.move(-1);
      } else if (k === "arrowright" || k === "d") {
        if (!e.repeat) c.move(1);
      } else if (k === "arrowup" || k === "w" || k === " ") c.jump();
      else if (k === "enter" || k === "e" || k === "shift") c.gas();
      else if (k === "arrowdown" || k === "s") {
        if (!e.repeat) c.slow();
      } else return;
      const t = e.target as HTMLElement | null;
      if (!t || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
        e.preventDefault();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [playing]);

  // geser layar: kiri/kanan = pindah jalur, atas = lompat
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const onArenaDown = (e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onArenaUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy))
      controls.current.move(dx < 0 ? -1 : 1);
    else if (dy < -28) controls.current.jump();
  };
  const tap = (action: "left" | "right" | "jump" | "gas" | "slow") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const c = controls.current;
      if (action === "left") c.move(-1);
      else if (action === "right") c.move(1);
      else if (action === "jump") c.jump();
      else if (action === "slow") c.slow();
      else c.gas();
    },
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  /* ---------------- mulai ---------------- */

  const begin = () => {
    if (
      window.matchMedia("(pointer: coarse)").matches &&
      !document.fullscreenElement
    )
      void document.documentElement
        .requestFullscreen?.({ navigationUI: "hide" })
        .catch(() => undefined);
    const audio = gameAudio();
    audio.unlock();
    audio.click();
    audio.startMusic();
    game.current = fresh();
    setLevel(-1);
    setFeedback(null);
    setHidden([]);
    setHintsLeft(GAME_HINTS);
    setScore(0);
    setFishCount(0);
    setStreak(0);
    setWrongStreak(0);
    setResult(null);
    setConfirmExit(false);
    setGasOn(false);
    setCount(3);
    setPhase("countdown");
    token.current = null;
    startPlayAction(gameId, "runner")
      .then((r) => {
        if (r.token) {
          token.current = r.token;
          const by = new Map<number, string[]>();
          for (const s of r.stars ?? [])
            by.set(s.seg, [...(by.get(s.seg) ?? []), s.id]);
          game.current.fishBySeg = by;
          spawnFish(0, 22);
          spawnTurtle(14);
        } else {
          toast.error(r.error ?? "Gagal memulai game.");
          gameAudio().stopMusic(0.1);
          setPhase("ready");
        }
      })
      .catch(() => {
        toast.error("Koneksi terputus. Coba mulai lagi.");
        setPhase("ready");
      });
  };

  useEffect(() => {
    if (phase !== "countdown") return;
    gameAudio().countdown(count === 0);
    const t = setTimeout(
      () => {
        if (count === 0) {
          game.current.startAt = performance.now();
          setPhase("playing");
        } else setCount((c) => c - 1);
      },
      count === 0 ? 350 : 650,
    );
    return () => clearTimeout(t);
  }, [phase, count]);

  /* ---------------- loop: gerak + gambar ---------------- */

  const refs = useRef({ answer, showQuestion, finish });
  useEffect(() => {
    refs.current = { answer, showQuestion, finish };
  });

  useEffect(() => {
    if (!playing) return;
    const canvas = canvasRef.current;
    const wrap = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return;
    let W = 0;
    let H = 0;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      W = r.width;
      H = r.height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    if (process.env.NODE_ENV !== "production")
      (window as unknown as { __runner?: unknown }).__runner = game.current;

    // proyeksi
    const pz = (z: number) => D / (D + z + Z0);
    const horizon = () => H * 0.3;
    // kaki kucing (z = 0) selalu di atas deretan tombol (±100 px dari bawah); jalan diteruskan sampai tepi bawah layar
    const baseY = () =>
      horizon() + (H - Math.min(110, H * 0.2) - horizon()) / pz(0);
    const sy = (z: number) => horizon() + (baseY() - horizon()) * pz(z);
    /** z yang jatuh tepat di tepi bawah layar (lebih kecil dari 0 = di belakang kucing) */
    const zBottom = () =>
      D / ((H - horizon()) / (baseY() - horizon())) - D - Z0;
    const half = (z: number) => W * 0.62 * pz(z);
    const sx = (xn: number, z: number) => W / 2 + xn * half(z);
    const laneW = 2 / LANES;
    const catPos = () => {
      const g = game.current;
      const jumpH = g.jumpT >= 0 ? Math.sin((Math.PI * g.jumpT) / JUMP_S) : 0;
      const u = half(0);
      return { x: sx(g.xVis, 0), y: sy(0) - jumpH * 0.6 * laneW * u, jumpH };
    };

    let raf = 0;
    let last = performance.now();

    const step = (dt: number) => {
      const g = game.current;
      if (phase !== "playing" || g.stage === "done") return;
      // lompat & tersandung
      if (g.jumpT >= 0) {
        g.jumpT += dt;
        if (g.jumpT >= JUMP_S) {
          g.jumpT = -1;
          gameAudio().land();
        }
      }
      if (g.stumbleT >= 0) {
        g.stumbleT += dt;
        if (g.stumbleT >= STUMBLE_S) g.stumbleT = -1;
      }
      g.xVis += (laneCenter(g.lane, LANES) - g.xVis) * Math.min(1, dt * 14);
      g.tilt *= Math.max(0, 1 - dt * 8);
      // kecepatan: santai saat soal tampil (atau sangat pelan bila 🐢 aktif), kencang saat ⚡ Gas / di luar soal
      const reading = g.stage === "reading";
      if (g.slow) {
        if (!reading) g.slow = false;
        else {
          g.slowEnergy = Math.max(0, g.slowEnergy - dt);
          if (g.slowEnergy <= 0) {
            g.slow = false;
            setSlowOn(false);
            const cp0 = catPos();
            g.floats.push({
              x: cp0.x,
              y: cp0.y - 80,
              text: "Energi 🐢 habis",
              color: "#e2e8f0",
              life: 1,
            });
          }
        }
      }
      const v =
        (g.gas
          ? GAS_SPEED
          : reading
            ? JOG_SPEED * (g.slow ? SLOW_MUL : 1)
            : BASE_SPEED) * (g.stumbleT >= 0 ? STUMBLE_MUL : 1);
      const dz = v * dt;
      g.travelled += dz;

      // alur tahap
      if (g.stage === "intro") {
        g.stageDist += dz;
        if (g.stageDist >= BASE_SPEED * INTRO_S && token.current)
          refs.current.showQuestion(0);
      } else if (g.stage === "gap") {
        g.gapDist += dz;
        if (g.gapDist >= BASE_SPEED * GAP_S) {
          const nextQ = g.qi + 1;
          if (nextQ < questions.length) refs.current.showQuestion(nextQ);
          else {
            g.stage = "toFinish";
            g.objects.push({ kind: "finish", z: BASE_SPEED * FINISH_S });
          }
        }
      }

      // gerbang ditutup (petunjuk 50:50) → kucing digeser ke jalur gerbang terbuka terdekat
      if (g.stage === "reading") {
        const gate = g.objects.find((o) => o.kind === "gate" && o.qi === g.qi);
        if (gate && gate.z < 7 && g.hidden.length) {
          const n = optionCount(questions[g.qi]);
          if (g.hidden.includes(gateOfLane(g.lane, LANES, n))) {
            const open = Array.from({ length: LANES }, (_, l) => l).filter(
              (l) => !g.hidden.includes(gateOfLane(l, LANES, n)),
            );
            const best = open.sort(
              (a, b) => Math.abs(a - g.lane) - Math.abs(b - g.lane),
            )[0];
            if (best != null) {
              g.tilt = Math.sign(best - g.lane);
              g.lane = best;
              const cp = catPos();
              g.floats.push({
                x: cp.x,
                y: cp.y - 80,
                text: "Jalur ditutup!",
                color: "#e2e8f0",
                life: 1,
              });
            }
          }
        }
      }

      // gerak objek & tabrakan (dicek saat objek melewati posisi kucing, aman walau sedang "gas")
      const cp = catPos();
      for (const o of g.objects) {
        const prev = o.z;
        o.z -= dz;
        const crossed = prev > 0 && o.z <= 0;
        if (
          o.kind === "gate" &&
          crossed &&
          g.stage === "reading" &&
          o.qi === g.qi
        ) {
          const n = optionCount(questions[o.qi]);
          const k = gateOfLane(g.lane, LANES, n);
          g.gas = false;
          setGasOn(false);
          gameAudio().press();
          void refs.current.answer(o.qi, k, cp.x, cp.y);
        } else if (
          o.kind === "box" &&
          !o.hit &&
          o.lane === g.lane &&
          prev > -0.4 &&
          o.z <= 0.4 &&
          cp.jumpH < 0.35
        ) {
          o.hit = true;
          g.stumbleT = 0;
          gameAudio().bump();
          g.floats.push({
            x: cp.x,
            y: cp.y - 80,
            text: "Aduh!",
            color: "#fdba74",
            life: 0.9,
          });
        } else if (
          o.kind === "fish" &&
          !o.taken &&
          o.lane === g.lane &&
          prev > -0.5 &&
          o.z <= 0.5 &&
          (o.high ? cp.jumpH > 0.35 : cp.jumpH < 0.6)
        ) {
          // ikan segmen ini sah setelah soal sebelumnya dijawab (diperiksa server juga)
          const answeredCount = g.answered.filter(Boolean).length;
          if (o.seg > answeredCount) continue;
          o.taken = true;
          gameAudio().coin();
          burst(cp.x, cp.y - 40, "fish");
          g.floats.push({
            x: cp.x,
            y: cp.y - 70,
            text: "+5 🐟",
            color: "#fde047",
            life: 0.9,
          });
          setScore((s) => s + 5);
          setFishCount((s) => s + 1);
          if (token.current)
            void collectStarAction(token.current, o.id).then((r) => {
              if (!r.ok && game.current === g) {
                setScore((s) => s - 5);
                setFishCount((s) => s - 1);
              }
            });
        } else if (
          o.kind === "turtle" &&
          !o.taken &&
          o.lane === g.lane &&
          prev > -0.5 &&
          o.z <= 0.5 &&
          cp.jumpH < 0.6
        ) {
          o.taken = true;
          g.slowEnergy = Math.min(SLOW_MAX, g.slowEnergy + SLOW_PICKUP);
          gameAudio().coin();
          g.floats.push({
            x: cp.x,
            y: cp.y - 70,
            text: `+${SLOW_PICKUP} dtk 🐢`,
            color: "#86efac",
            life: 1,
          });
        } else if (o.kind === "finish" && crossed) {
          void refs.current.finish();
        }
      }
      g.objects = g.objects.filter(
        (o) => o.z > -3 && !(o.kind === "fish" && o.taken),
      );

      g.particles = g.particles.filter((pt) => (pt.life -= dt) > 0);
      for (const pt of g.particles) {
        pt.vy += pt.grav * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
      }
      g.floats = g.floats.filter((f) => (f.life -= dt) > 0);
      for (const f of g.floats) f.y -= 45 * dt;
    };

    const draw = (now: number) => {
      const g = game.current;
      const hz = horizon();
      // langit & matahari
      const sky = ctx.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, "#0b2638");
      sky.addColorStop(1, "#38bdf8");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, hz + 1);
      ctx.fillStyle = "rgba(253,224,71,0.9)";
      ctx.beginPath();
      ctx.arc(W * 0.78, hz * 0.55, Math.max(14, W * 0.05), 0, Math.PI * 2);
      ctx.fill();
      // siluet kota (bergeser pelan)
      ctx.fillStyle = "rgba(19,62,87,0.75)";
      const off = (g.travelled * 0.6) % 60;
      for (let i = -1; i < W / 30 + 2; i++) {
        const x = i * 30 - off;
        const h = 18 + ((i * 37 + 11) % 5) * 9;
        ctx.fillRect(x, hz - h, 26, h);
      }
      // rumput
      const grass = ctx.createLinearGradient(0, hz, 0, H);
      grass.addColorStop(0, "#15803d");
      grass.addColorStop(1, "#166534");
      ctx.fillStyle = grass;
      ctx.fillRect(0, hz, W, H - hz);

      // jalan (trapesium)
      const zNear = zBottom();
      ctx.fillStyle = "#334155";
      ctx.beginPath();
      ctx.moveTo(sx(-1, Z_FAR), sy(Z_FAR));
      ctx.lineTo(sx(1, Z_FAR), sy(Z_FAR));
      ctx.lineTo(sx(1, zNear), sy(zNear));
      ctx.lineTo(sx(-1, zNear), sy(zNear));
      ctx.closePath();
      ctx.fill();
      // garis tepi
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 3;
      for (const e of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx(e, Z_FAR), sy(Z_FAR));
        ctx.lineTo(sx(e, zNear), sy(zNear));
        ctx.stroke();
      }
      // garis jalur putus-putus (ikut bergerak)
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      for (let i = 1; i < LANES; i++) {
        const xn = -1 + (2 * i) / LANES;
        for (let z = 0; z < Z_FAR; z += 4) {
          const z1 = z - (g.travelled % 4);
          const z2 = z1 + 2;
          if (z2 < zNear) continue;
          ctx.lineWidth = Math.max(1, 3 * pz(z1));
          ctx.beginPath();
          ctx.moveTo(sx(xn, Math.max(z1, zNear)), sy(Math.max(z1, zNear)));
          ctx.lineTo(sx(xn, z2), sy(z2));
          ctx.stroke();
        }
      }
      // pohon di pinggir jalan
      for (let z = 0; z < Z_FAR; z += 8) {
        const zz = z - (g.travelled % 8);
        if (zz < zNear) continue;
        const s = pz(zz);
        for (const side of [-1.32, 1.32]) {
          const x = sx(side, zz);
          const y = sy(zz);
          ctx.fillStyle = "#14532d";
          ctx.beginPath();
          ctx.moveTo(x, y - 90 * s);
          ctx.lineTo(x - 26 * s, y - 20 * s);
          ctx.lineTo(x + 26 * s, y - 20 * s);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#78350f";
          ctx.fillRect(x - 4 * s, y - 22 * s, 8 * s, 22 * s);
        }
      }

      // objek: jauh → dekat
      const objs = [...g.objects]
        .filter((o) => o.z < Z_FAR && o.z > zBottom())
        .sort((a, b) => b.z - a.z);
      for (const o of objs) {
        const y = sy(o.z);
        const u = half(o.z);
        const fade = Math.min(1, (Z_FAR - o.z) / 12);
        ctx.globalAlpha = fade;
        if (o.kind === "gate") {
          const qq = questions[o.qi];
          const n = optionCount(qq);
          const top = y - 0.78 * u;
          for (let k = 0; k < n; k++) {
            const x1 = sx(gateEdge(k, LANES, n), o.z) + 0.03 * u;
            const x2 = sx(gateEdge(k + 1, LANES, n), o.z) - 0.03 * u;
            const off = g.qi === o.qi && g.hidden.includes(k);
            // papan di atas gerbang
            ctx.fillStyle = off ? "#64748b" : OPTION_COLORS[k];
            ctx.beginPath();
            ctx.roundRect(x1, top, x2 - x1, 0.3 * u, 0.04 * u);
            ctx.fill();
            // tirai cahaya di bawah papan
            ctx.fillStyle = off
              ? "rgba(71,85,105,0.55)"
              : "rgba(255,255,255,0.14)";
            ctx.fillRect(x1, top + 0.3 * u, x2 - x1, y - top - 0.3 * u);
            if (off) {
              ctx.strokeStyle = "rgba(226,232,240,0.8)";
              ctx.lineWidth = Math.max(1, 0.02 * u);
              for (let b = 1; b < 4; b++) {
                const yy = top + 0.3 * u + ((y - top - 0.3 * u) * b) / 4;
                ctx.beginPath();
                ctx.moveTo(x1, yy);
                ctx.lineTo(x2, yy);
                ctx.stroke();
              }
            }
            // teks: huruf + potongan jawaban
            const fs = Math.max(8, 0.12 * u);
            ctx.fillStyle = "#fff";
            ctx.textAlign = "center";
            ctx.font = `900 ${Math.round(fs * 1.25)}px system-ui`;
            ctx.fillText(off ? "✕" : LETTERS[k], (x1 + x2) / 2, top + 0.16 * u);
            if (!off && x2 - x1 > 40) {
              ctx.font = `700 ${Math.round(fs * 0.72)}px system-ui`;
              const maxW = x2 - x1 - 6;
              let t = qq.options[k] ?? "";
              while (t.length > 1 && ctx.measureText(t).width > maxW)
                t = t.slice(0, -2);
              if (t !== (qq.options[k] ?? "")) t = t.replace(/.$/, "…");
              ctx.fillText(t, (x1 + x2) / 2, top + 0.27 * u);
            }
          }
          // tiang
          ctx.fillStyle = "#e2e8f0";
          for (let k = 0; k <= n; k++) {
            const x = sx(gateEdge(k, LANES, n), o.z);
            ctx.fillRect(x - 0.02 * u, top, 0.04 * u, y - top);
          }
        } else if (o.kind === "box") {
          const cx = sx(laneCenter(o.lane, LANES), o.z);
          const w = 0.62 * laneW * u;
          const h = 0.5 * laneW * u;
          ctx.fillStyle = o.hit ? "#a16207" : "#b45309";
          ctx.fillRect(cx - w / 2, y - h, w, h);
          ctx.strokeStyle = "#78350f";
          ctx.lineWidth = Math.max(1, 0.012 * u);
          ctx.strokeRect(cx - w / 2, y - h, w, h);
          ctx.beginPath();
          ctx.moveTo(cx - w / 2, y - h);
          ctx.lineTo(cx + w / 2, y);
          ctx.moveTo(cx + w / 2, y - h);
          ctx.lineTo(cx - w / 2, y);
          ctx.stroke();
        } else if (o.kind === "turtle") {
          if (o.taken) continue;
          const cx = sx(laneCenter(o.lane, LANES), o.z);
          ctx.font = `${Math.round(Math.max(12, 0.42 * laneW * u))}px system-ui`;
          ctx.textAlign = "center";
          ctx.fillText(
            "🐢",
            cx,
            y - 0.12 * laneW * u + Math.sin(now / 250 + o.z) * 2,
          );
        } else if (o.kind === "fish") {
          const cx = sx(laneCenter(o.lane, LANES), o.z);
          const lift = o.high ? 0.75 * laneW * u : 0.18 * laneW * u;
          const open = o.seg <= g.answered.filter(Boolean).length;
          ctx.globalAlpha = fade * (open ? 1 : 0.35);
          ctx.font = `${Math.round(Math.max(10, 0.36 * laneW * u))}px system-ui`;
          ctx.textAlign = "center";
          ctx.fillText("🐟", cx, y - lift + Math.sin(now / 200 + o.z) * 2);
        } else if (o.kind === "finish") {
          const band = Math.max(4, 0.08 * u);
          const cells = 12;
          for (let i = 0; i < cells; i++)
            for (let j = 0; j < 2; j++) {
              ctx.fillStyle = (i + j) % 2 ? "#0f172a" : "#f8fafc";
              const xa = sx(-1 + (2 * i) / cells, o.z);
              const xb = sx(-1 + (2 * (i + 1)) / cells, o.z);
              ctx.fillRect(xa, y - band * (2 - j), xb - xa, band);
            }
          ctx.fillStyle = "#22c55e";
          ctx.fillRect(
            sx(-1, o.z),
            y - 1.05 * u,
            sx(1, o.z) - sx(-1, o.z),
            0.22 * u,
          );
          ctx.fillStyle = "#fff";
          ctx.font = `900 ${Math.round(Math.max(10, 0.16 * u))}px system-ui`;
          ctx.textAlign = "center";
          ctx.fillText("🏁 FINISH 🏁", W / 2, y - 0.89 * u);
          ctx.fillStyle = "#e2e8f0";
          ctx.fillRect(
            sx(-1, o.z) - 0.02 * u,
            y - 1.05 * u,
            0.04 * u,
            1.05 * u,
          );
          ctx.fillRect(sx(1, o.z) - 0.02 * u, y - 1.05 * u, 0.04 * u, 1.05 * u);
        }
        ctx.globalAlpha = 1;
      }

      // bayangan kucing
      const cp = catPos();
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(
        cp.x,
        sy(0),
        0.28 * laneW * half(0) * (1 - cp.jumpH * 0.4),
        0.06 * laneW * half(0),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      for (const pt of g.particles) {
        ctx.globalAlpha = Math.max(0, pt.life / pt.max);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const f of g.floats) {
        ctx.globalAlpha = Math.min(1, f.life * 1.5);
        ctx.fillStyle = f.color;
        ctx.font = `800 ${Math.round(Math.max(14, W * 0.045))}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      // garis kecepatan saat gas
      if (g.gas) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + now / 300;
          const r1 = Math.min(W, H) * 0.35;
          const r2 = r1 + 40;
          ctx.beginPath();
          ctx.moveTo(
            W / 2 + Math.cos(a) * r1,
            H * 0.55 + Math.sin(a) * r1 * 0.6,
          );
          ctx.lineTo(
            W / 2 + Math.cos(a) * r2,
            H * 0.55 + Math.sin(a) * r2 * 0.6,
          );
          ctx.stroke();
        }
      }

      // kucing (SVG maskot)
      const el = catRef.current;
      if (el) {
        const size = Math.max(54, 0.85 * laneW * half(0));
        const shake = g.stumbleT >= 0 ? Math.sin(g.stumbleT * 60) * 4 : 0;
        el.style.width = `${size}px`;
        el.style.height = `${size * 0.95}px`;
        el.style.transform = `translate(${cp.x - size / 2 + shake}px, ${cp.y - size * 0.92}px) rotate(${g.tilt * 10}deg)`;
      }
      if (timeRef.current && g.startAt)
        timeRef.current.textContent = fmtTime(now - g.startAt);
      // hitung mundur gerbang & ketersediaan gas
      if (etaRef.current) {
        const gate =
          g.stage === "reading"
            ? g.objects.find((o) => o.kind === "gate" && o.qi === g.qi)
            : null;
        const v = g.gas ? GAS_SPEED : JOG_SPEED * (g.slow ? SLOW_MUL : 1);
        etaRef.current.textContent = gate
          ? `🚪 ${Math.max(0, gate.z / v).toFixed(1)} dtk${g.slow ? " 🐢" : ""}`
          : "";
      }
      if (slowBtnRef.current) {
        slowBtnRef.current.disabled =
          !g.slow && (g.stage !== "reading" || g.gas || g.slowEnergy <= 0.05);
        const label = slowBtnRef.current.querySelector("[data-energy]");
        if (label) label.textContent = `${Math.ceil(g.slowEnergy)}`;
      }
      if (gasBtnRef.current) {
        const ready =
          g.stage === "reading" && !g.gas && now - g.shownAt >= GAS_AFTER_MS;
        gasBtnRef.current.disabled = !ready;
      }
    };

    const loop = (now: number) => {
      let dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      while (dt > 0) {
        const d = Math.min(1 / 120, dt);
        step(d);
        dt -= d;
      }
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // LANES tetap selama komponen hidup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, phase, questions]);

  if (!questions.length)
    return (
      <div className="card text-sm text-navy-400">
        Game ini belum memiliki soal.
      </div>
    );

  if (phase === "result" && result)
    return (
      <ResultCelebration
        result={result}
        onReplay={() => setPhase("ready")}
        canSave={props.canSave}
      />
    );

  /* ---------------- layar siap ---------------- */
  if (phase === "ready") {
    return (
      <div className="card animate-fade-up space-y-5 p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <GameCat mood="girang" className="h-24 w-24 shrink-0" />
          <div>
            <h2 className="text-xl font-extrabold text-navy-900">
              Mode Lari Lintasan
            </h2>
            <p className="text-sm text-navy-500">
              Si kucing berlari kencang! Lewati gerbang jawaban yang benar
              sebelum waktunya habis.
            </p>
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-2 text-sm text-navy-700 sm:grid-cols-2">
          <li className="rounded-2xl bg-brand-50 p-3">
            ⬅️ ➡️ Pindah jalur (geser layar / panah / A D).
          </li>
          <li className="rounded-2xl bg-brand-50 p-3">
            ⬆️ Lompati kardus (geser ke atas / panah atas / spasi).
          </li>
          <li className="rounded-2xl bg-brand-50 p-3">
            🚪 Baca soal di atas, lalu masuk jalur gerbang jawabanmu A / B / C /
            D.
          </li>
          <li className="rounded-2xl bg-brand-50 p-3">
            ⚡ Sudah yakin? Tekan Gas (Enter) supaya gerbang datang lebih cepat
            — bonus kecepatan.
          </li>
          <li className="rounded-2xl bg-emerald-50 p-3 sm:col-span-2">
            🐢 Butuh waktu berpikir? Tekan <b>Pelan</b> (panah bawah / S) supaya
            lari melambat; tekan lagi untuk melepas. Energinya terbatas — tambah
            dengan mengambil 🐢 di jalan. Gerbang baru tiba setelah waktu soal
            habis (seperti mode klasik).
          </li>
          <li className="rounded-2xl bg-amber-50 p-3 sm:col-span-2">
            🐟 Ambil ikan di sepanjang jalan: <b>+5 poin</b> per ikan. Ikan yang
            masih samar terbuka setelah soalnya dijawab.
          </li>
        </ul>
        {!props.loggedIn && (
          <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-100">
            Kamu belum masuk, jadi skor tidak tersimpan ke leaderboard.
            <Link
              href={props.loginHref}
              className="inline-flex items-center gap-1 font-bold underline"
            >
              <LogIn className="h-4 w-4" /> Masuk dulu
            </Link>
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={props.onExit} className="btn-ghost">
            <ArrowLeft className="h-4 w-4" /> Pilih mode lain
          </button>
          <button
            type="button"
            onClick={begin}
            className="btn-primary flex-1 py-4 text-base"
          >
            <Play className="h-5 w-5 fill-current" /> Mulai berlari
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- arena (layar penuh, portal ke body agar menutupi header & tombol chat) ---------------- */
  const n = q ? optionCount(q) : 0;
  return createPortal(
    <div className="fixed inset-0 z-[99] flex flex-col bg-navy-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden bg-white sm:my-3 sm:rounded-3xl">
        {/* panel soal */}
        <div className="max-h-[40svh] shrink-0 overflow-y-auto border-b border-navy-100 bg-white p-3 sm:p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap rounded-full bg-navy-900 px-2.5 py-1 text-xs font-bold text-white">
              {q
                ? `Soal ${level + 1}/${questions.length}`
                : `0/${questions.length}`}
            </span>
            <span
              ref={etaRef}
              className="min-w-0 truncate whitespace-nowrap text-[11px] font-bold text-amber-600 sm:text-xs"
            />
            <div className="ml-auto flex items-center gap-1.5">
              {q && !feedback && (
                <button
                  type="button"
                  onClick={takeHint}
                  disabled={
                    hinting ||
                    hintsLeft <= 0 ||
                    hidden.length > 0 ||
                    n <= 2 ||
                    checking
                  }
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-sun-400 px-2.5 py-1 text-xs font-bold text-navy-900 disabled:opacity-40"
                >
                  {hinting ? (
                    <Spinner />
                  ) : (
                    <Lightbulb className="h-3.5 w-3.5" />
                  )}{" "}
                  50:50 ({hintsLeft})
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!confirmExit) {
                    setConfirmExit(true);
                    setTimeout(() => setConfirmExit(false), 3000);
                    return;
                  }
                  gameAudio().stopMusic(0.1);
                  token.current = null;
                  game.current.stage = "done";
                  setPhase("ready");
                }}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold",
                  confirmExit
                    ? "bg-rose-500 text-white"
                    : "bg-navy-50 text-navy-600",
                )}
              >
                <LogOut className="h-3.5 w-3.5" />{" "}
                {confirmExit ? "Yakin keluar?" : "Keluar"}
              </button>
              {typeof document !== "undefined" &&
                document.fullscreenEnabled && (
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-600"
                    aria-label={
                      fullscreen ? "Keluar dari layar penuh" : "Layar penuh"
                    }
                    title={
                      fullscreen ? "Keluar dari layar penuh" : "Layar penuh"
                    }
                  >
                    {fullscreen ? (
                      <Minimize className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
            </div>
          </div>
          {q ? (
            <>
              <MathText
                as="p"
                text={q.text}
                className="font-bold leading-snug text-navy-900"
              />
              <div
                className={cn(
                  "mt-2 grid gap-1.5",
                  n > 2 ? "grid-cols-2" : "grid-cols-1",
                )}
              >
                {q.options.slice(0, 5).map((o, k) => {
                  const isRight = feedback && k === feedback.answerIndex;
                  const isWrong =
                    feedback && k === feedback.choice && !feedback.correct;
                  const off = !feedback && hidden.includes(k);
                  return (
                    <div
                      key={k}
                      className={cn(
                        "flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-sm ring-1",
                        isRight
                          ? "bg-emerald-50 ring-emerald-300"
                          : isWrong
                            ? "bg-rose-50 ring-rose-300"
                            : off
                              ? "bg-navy-50 opacity-40 ring-navy-100"
                              : "bg-navy-50/60 ring-navy-100",
                      )}
                    >
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white"
                        style={{
                          background: isRight
                            ? "#22c55e"
                            : isWrong
                              ? "#ef4444"
                              : off
                                ? "#94a3b8"
                                : OPTION_COLORS[k],
                        }}
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
                    </div>
                  );
                })}
              </div>
              {checking && (
                <p className="mt-2 flex items-center gap-2 text-sm text-navy-500">
                  <Spinner /> Memeriksa jawaban…
                </p>
              )}
              {feedback ? (
                <div
                  className={cn(
                    "mt-2 rounded-xl p-2.5 text-sm",
                    feedback.correct
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-rose-50 text-rose-800",
                  )}
                >
                  <p className="font-bold">
                    {feedback.correct
                      ? `Benar! +${feedback.points} poin 😺`
                      : `Kurang tepat — jawabannya ${LETTERS[feedback.answerIndex] ?? "-"}.`}{" "}
                    <span className="font-semibold text-navy-600">
                      {level + 1 < questions.length
                        ? "Soal berikutnya segera datang…"
                        : "Lari ke garis FINISH! 🏁"}
                    </span>
                  </p>
                  {feedback.explanation && (
                    <>
                      <button
                        type="button"
                        className="mt-1 text-xs font-bold underline"
                        onClick={() => setShowExplain((v) => !v)}
                      >
                        {showExplain
                          ? "Sembunyikan pembahasan"
                          : "Lihat pembahasan"}
                      </button>
                      {showExplain && (
                        <MathText
                          as="p"
                          text={feedback.explanation}
                          className="mt-1 whitespace-pre-line text-navy-700"
                        />
                      )}
                    </>
                  )}
                </div>
              ) : (
                !checking && (
                  <p className="mt-2 text-xs font-semibold text-navy-500">
                    Masuk ke jalur gerbang jawabanmu sebelum gerbang tiba. Butuh
                    waktu? 🐢 Pelan. Yakin? ⚡ Gas.
                  </p>
                )
              )}
            </>
          ) : (
            <p className="text-sm font-semibold text-navy-600">
              Bersiap… soal pertama segera muncul. Ambil ikan di jalan! 🐟
            </p>
          )}
        </div>

        {/* arena */}
        <div
          className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-sky-400"
          onPointerDown={onArenaDown}
          onPointerUp={onArenaUp}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          <div
            ref={catRef}
            className="pointer-events-none absolute left-0 top-0 will-change-transform"
          >
            <GameCat mood={mood} className="h-full w-full" />
          </div>
          {/* skor, ikan, waktu, combo */}
          <div className="pointer-events-none absolute right-2 top-2 rounded-2xl bg-navy-950/70 px-3 py-1.5 text-right text-white backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-200">
              Skor
            </p>
            <p className="text-lg font-extrabold leading-none">{score}</p>
            <p className="mt-1 text-xs font-bold text-amber-300">
              🐟 {fishCount}
            </p>
            <p className="mt-0.5 font-mono text-xs text-brand-100">
              ⏱ <span ref={timeRef}>00:00</span>
            </p>
          </div>
          {streak >= 2 && (
            <div className="pointer-events-none absolute left-2 top-2 animate-pop rounded-2xl bg-orange-500/90 px-3 py-1.5 text-sm font-black text-white shadow-lg">
              🔥 x{streak}
            </div>
          )}
          {phase === "countdown" && (
            <div className="absolute inset-0 grid place-items-center bg-navy-950/40">
              <span
                key={count}
                className="animate-pop text-7xl font-black text-white drop-shadow-lg"
              >
                {count || "GO!"}
              </span>
            </div>
          )}
          {phase === "finishing" && (
            <div className="absolute inset-0 grid place-items-center bg-navy-950/50 text-white">
              <p className="flex items-center gap-2 text-lg font-bold">
                <Spinner /> Menghitung skor…
              </p>
            </div>
          )}
          {/* tombol layar sentuh (juga bisa geser layar) */}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Pindah kiri"
                className="grid h-14 w-14 place-items-center rounded-2xl bg-white/25 text-white ring-1 ring-white/40 backdrop-blur active:bg-white/45 sm:h-12 sm:w-12"
                {...tap("left")}
              >
                <ArrowLeft className="h-7 w-7" />
              </button>
              <button
                type="button"
                aria-label="Pindah kanan"
                className="grid h-14 w-14 place-items-center rounded-2xl bg-white/25 text-white ring-1 ring-white/40 backdrop-blur active:bg-white/45 sm:h-12 sm:w-12"
                {...tap("right")}
              >
                <ArrowRight className="h-7 w-7" />
              </button>
            </div>
            <div className="flex items-end gap-2">
              <button
                ref={slowBtnRef}
                type="button"
                aria-label="Pelan"
                className={cn(
                  "relative grid h-14 w-14 place-items-center rounded-full text-navy-950 shadow-lg ring-2 ring-white/50 transition disabled:opacity-35 sm:h-12 sm:w-12",
                  slowOn ? "animate-pulse bg-emerald-400" : "bg-white/90",
                )}
                {...tap("slow")}
              >
                <Turtle className="h-7 w-7" />
                <span
                  data-energy
                  className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-emerald-600 px-1 text-[10px] font-black text-white"
                >
                  {SLOW_START}
                </span>
              </button>
              <button
                ref={gasBtnRef}
                type="button"
                aria-label="Gas"
                className={cn(
                  "grid h-14 w-14 place-items-center rounded-full text-navy-950 shadow-lg ring-2 ring-white/50 transition disabled:opacity-35 sm:h-12 sm:w-12",
                  gasOn ? "animate-pulse bg-orange-400" : "bg-white/90",
                )}
                {...tap("gas")}
              >
                <Zap className="h-7 w-7 fill-current" />
              </button>
              <button
                type="button"
                aria-label="Lompat"
                className="grid h-16 w-16 place-items-center rounded-full bg-sun-400/90 text-navy-950 shadow-lg ring-2 ring-white/40 active:scale-95 sm:h-14 sm:w-14"
                {...tap("jump")}
              >
                <ArrowUp className="h-8 w-8" />
              </button>
            </div>
          </div>
          <p className="pointer-events-none absolute bottom-20 left-3 hidden rounded-lg bg-navy-950/50 px-2 py-1 text-[11px] text-brand-100 pointer-fine:block">
            ← → / A D: pindah jalur · ↑ / W / Spasi: lompat · ↓ / S: 🐢 Pelan ·
            Enter: ⚡ Gas
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

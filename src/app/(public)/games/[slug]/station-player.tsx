"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Rocket, Wrench } from "lucide-react";
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
 * Mode Stasiun Kucing: Misi Orbit — soal yang sama dengan mode klasik, dimainkan di stasiun luar angkasa (dilihat dari atas).
 * Kucing berjalan bebas (joystick / panah / WASD) ke titik misi di berbagai modul; tombol PERBAIKI membuka terminal berisi soal.
 * Misi boleh dikerjakan dalam urutan apa pun (soal diambil berurutan). Kejadian penyusup: lampu padam (pandangan menyempit
 * sampai misi berikutnya selesai), alarm oksigen (misi darurat di Anjungan), petunjuk letak markas penyusup.
 * Penjaga penyusup (🐷 pistol air, 🐶 penyembur api) berpatroli; bila kucing masuk kerucut pandangnya, kucing disemprot
 * & pingsan 5 dtk (tak bisa bergerak), penjaga lanjut patroli; setelah bangun kucing kebal 3 dtk. Penjaga tidak menyerang
 * saat terminal terbuka. Setelah semua misi: Rapat Awak (tebak markas penyusup — hanya cerita). Skor = skor klasik dari server.
 */

type Phase =
  "ready" | "countdown" | "playing" | "meeting" | "finishing" | "result";
type Rect = { x: number; y: number; w: number; h: number };
type Room = Rect & {
  key: string;
  name: string;
  icon: string;
  floor: string;
  accent: string;
  spots: [number, number][];
  tasks: string[];
};
type Task = {
  id: number;
  room: number;
  x: number;
  y: number;
  name: string;
  done: boolean;
  urgent: boolean;
  hidden: boolean;
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
};

const WORLD_W = 1600;
const WORLD_H = 1100;
const SPEED = 270; // px dunia / detik
const CAT_R = 18;
const REACH = 72; // jarak untuk bisa memperbaiki
const VIEW = 320;
const VIEW_DARK = 135;
/** modul stasiun (indeks 0 = Anjungan di tengah); titik misi relatif terhadap ukuran modul */
const ROOMS: Room[] = [
  {
    key: "bridge",
    name: "Anjungan Kendali",
    icon: "🎛️",
    x: 650,
    y: 420,
    w: 300,
    h: 260,
    floor: "#1e3a5f",
    accent: "#38bdf8",
    spots: [
      [0.5, 0.25],
      [0.18, 0.72],
      [0.82, 0.72],
    ],
    tasks: [
      "Pulihkan oksigen (DARURAT)",
      "Atur navigasi",
      "Cek kemudi stasiun",
    ],
  },
  {
    key: "garden",
    name: "Kebun Hidroponik",
    icon: "🌱",
    x: 120,
    y: 100,
    w: 320,
    h: 240,
    floor: "#14532d",
    accent: "#4ade80",
    spots: [
      [0.18, 0.28],
      [0.82, 0.3],
      [0.5, 0.8],
    ],
    tasks: [
      "Siram tanaman hidroponik",
      "Cek sensor kelembapan",
      "Panen sayur antariksa",
    ],
  },
  {
    key: "observ",
    name: "Observatorium",
    icon: "🔭",
    x: 680,
    y: 40,
    w: 240,
    h: 220,
    floor: "#312e81",
    accent: "#a5b4fc",
    spots: [
      [0.2, 0.32],
      [0.8, 0.32],
      [0.5, 0.62],
    ],
    tasks: [
      "Kalibrasi teleskop",
      "Petakan rasi bintang",
      "Bersihkan lensa kubah",
    ],
  },
  {
    key: "lab",
    name: "Lab Sains",
    icon: "🧪",
    x: 1160,
    y: 100,
    w: 320,
    h: 240,
    floor: "#134e4a",
    accent: "#5eead4",
    spots: [
      [0.18, 0.28],
      [0.82, 0.28],
      [0.5, 0.8],
    ],
    tasks: ["Analisis sampel batuan", "Atur mikroskop", "Campur larutan kimia"],
  },
  {
    key: "reactor",
    name: "Ruang Reaktor",
    icon: "⚡",
    x: 80,
    y: 480,
    w: 280,
    h: 260,
    floor: "#7c2d12",
    accent: "#fb923c",
    spots: [
      [0.2, 0.2],
      [0.2, 0.8],
      [0.8, 0.82],
    ],
    tasks: [
      "Stabilkan inti reaktor",
      "Ganti sekring utama",
      "Atur suhu reaktor",
    ],
  },
  {
    key: "comms",
    name: "Ruang Komunikasi",
    icon: "🛰️",
    x: 1240,
    y: 480,
    w: 280,
    h: 260,
    floor: "#4a044e",
    accent: "#e879f9",
    spots: [
      [0.8, 0.2],
      [0.8, 0.8],
      [0.22, 0.82],
    ],
    tasks: [
      "Perbaiki antena parabola",
      "Kirim sinyal ke Bumi",
      "Pulihkan jaringan data",
    ],
  },
  {
    key: "kitchen",
    name: "Dapur Awak",
    icon: "🍽️",
    x: 260,
    y: 860,
    w: 320,
    h: 200,
    floor: "#713f12",
    accent: "#fcd34d",
    spots: [
      [0.15, 0.3],
      [0.85, 0.3],
      [0.5, 0.78],
    ],
    tasks: ["Perbaiki kulkas", "Isi persediaan makanan", "Cek oven listrik"],
  },
  {
    key: "cargo",
    name: "Gudang Kargo",
    icon: "📦",
    x: 1000,
    y: 860,
    w: 340,
    h: 200,
    floor: "#3f3f46",
    accent: "#d4d4d8",
    spots: [
      [0.15, 0.3],
      [0.85, 0.3],
      [0.5, 0.78],
    ],
    tasks: [
      "Susun kotak kargo",
      "Periksa manifes muatan",
      "Perbaiki pintu kargo",
    ],
  },
];
/** lorong penghubung (bertumpuk sedikit dengan modul agar bisa dilewati) */
const HALLS: Rect[] = [
  { x: 430, y: 180, w: 740, h: 90 },
  { x: 230, y: 330, w: 90, h: 160 },
  { x: 1300, y: 330, w: 90, h: 160 },
  { x: 350, y: 545, w: 310, h: 90 },
  { x: 940, y: 545, w: 310, h: 90 },
  { x: 755, y: 250, w: 90, h: 180 },
  { x: 230, y: 730, w: 90, h: 140 },
  { x: 570, y: 930, w: 440, h: 90 },
  { x: 1250, y: 730, w: 90, h: 140 },
  { x: 755, y: 670, w: 90, h: 270 },
];
const WALKABLE: Rect[] = [...ROOMS, ...HALLS];

const inside = (x: number, y: number) =>
  WALKABLE.some(
    (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
  );
const free = (x: number, y: number) =>
  inside(x - CAT_R, y - CAT_R) &&
  inside(x + CAT_R, y - CAT_R) &&
  inside(x - CAT_R, y + CAT_R) &&
  inside(x + CAT_R, y + CAT_R);
const shuffle = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** misi = jumlah soal, tersebar di modul (bukan Anjungan); 1 misi darurat di Anjungan muncul di tengah permainan */
function makeTasks(n: number): Task[] {
  const spots: { room: number; k: number }[] = [];
  for (let r = 1; r < ROOMS.length; r++)
    for (let k = 0; k < ROOMS[r].spots.length; k++) spots.push({ room: r, k });
  const extra = [1, 2].map((k) => ({ room: 0, k }));
  const pool = shuffle(spots).concat(extra);
  const urgentAt = n >= 4 ? Math.floor(n / 2) : -1;
  return Array.from({ length: n }, (_, i) => {
    const s = i === urgentAt ? { room: 0, k: 0 } : pool[i % pool.length];
    const room = ROOMS[s.room];
    const lap = Math.floor(i / pool.length); // soal sangat banyak → titik yang sama sedikit bergeser
    return {
      id: i,
      room: s.room,
      x: room.x + room.w * room.spots[s.k][0] + lap * 26,
      y: room.y + room.h * room.spots[s.k][1],
      name: room.tasks[s.k],
      done: false,
      urgent: i === urgentAt,
      hidden: i === urgentAt,
    };
  });
}

type Guard = {
  kind: "pig" | "dog";
  x: number;
  y: number;
  at: number;
  to: number;
  dir: number;
  pause: number;
  alert: number;
  cooldown: number;
  spray: number;
};

/** jalur patroli: titik di tengah modul & persimpangan lorong; tiap ruas lurus berada di dalam area jalan */
const NODES: [number, number][] = [
  [800, 590],
  [800, 225],
  [800, 130],
  [280, 222],
  [1345, 222],
  [275, 610],
  [1345, 590],
  [290, 975],
  [800, 975],
  [1170, 975],
  [1295, 700],
  [1295, 975],
];
const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [3, 5],
  [5, 0],
  [0, 6],
  [4, 6],
  [5, 7],
  [7, 8],
  [8, 0],
  [8, 9],
  [9, 11],
  [11, 10],
  [10, 6],
];
const NEXT = NODES.map((_, i) =>
  EDGES.flatMap(([a, b]) => (a === i ? [b] : b === i ? [a] : [])),
);
const GUARD_SPEED = 95;
const SEE = 175; // jarak pandang penjaga
const CONE = 0.8; // setengah sudut kerucut pandang (rad)
const ALERT_S = 0.55; // jeda "❗" sebelum menyemprot
const FAINT_S = 5;
const WAKE_INV = 3;

/** penjaga mulai jauh dari Anjungan (posisi awal kucing) */
function makeGuards(n: number): Guard[] {
  const kinds: Guard["kind"][] =
    n >= 10 ? ["pig", "dog", "dog"] : ["pig", "dog"];
  const starts = [7, 4, 2];
  return kinds.map((kind, i) => {
    const at = starts[i];
    const to = NEXT[at][0];
    return {
      kind,
      x: NODES[at][0],
      y: NODES[at][1],
      at,
      to,
      dir: 0,
      pause: 0,
      alert: 0,
      cooldown: 0,
      spray: 0,
    };
  });
}

/** garis pandang tidak terhalang dinding */
function lineOfSight(x0: number, y0: number, x1: number, y1: number) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  for (let s = 0; s <= d; s += 16)
    if (!inside(x0 + ((x1 - x0) * s) / d, y0 + ((y1 - y0) * s) / d))
      return false;
  return true;
}

/**
 * Gerak & penglihatan penjaga. `canSee` = kucing boleh ditangkap (bermain, terminal tertutup, tidak pingsan/kebal).
 * Mengembalikan jenis penjaga yang baru menyemprot kucing, atau null.
 */
function stepGuards(
  w: World,
  dt: number,
  canSee: boolean,
): Guard["kind"] | null {
  let hit: Guard["kind"] | null = null;
  for (const g of w.guards) {
    if (g.cooldown > 0) g.cooldown -= dt;
    const dx = w.x - g.x;
    const dy = w.y - g.y;
    const dist = Math.hypot(dx, dy);
    if (g.spray > 0) {
      g.spray -= dt;
      if (g.spray <= 0) {
        // selesai menyemprot: pergi ke arah yang menjauhi kucing (jangan melewati kucing yang pingsan)
        const [ax, ay] = NODES[g.at];
        const [bx, by] = NODES[g.to];
        if (Math.hypot(ax - w.x, ay - w.y) > Math.hypot(bx - w.x, by - w.y)) [g.at, g.to] = [g.to, g.at];
        g.pause = 0;
      }
      // semburan air / api ke arah kucing
      for (let k = 0; k < 3; k++) {
        const a = g.dir + (Math.random() - 0.5) * 0.25;
        const v = 260 + Math.random() * 160;
        w.particles.push({
          x: g.x + Math.cos(g.dir) * 26,
          y: g.y + Math.sin(g.dir) * 26,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0.45,
          max: 0.45,
          color:
            g.kind === "pig"
              ? ["#38bdf8", "#bae6fd", "#0ea5e9"][k]
              : ["#f97316", "#facc15", "#ef4444"][k],
          size: 4 + Math.random() * 4,
        });
      }
      continue;
    }
    if (g.alert > 0) {
      g.alert -= dt;
      g.dir = Math.atan2(dy, dx);
      if (
        g.alert <= 0 &&
        canSee &&
        dist < SEE * 1.3 &&
        lineOfSight(g.x, g.y, w.x, w.y)
      ) {
        g.spray = 0.9;
        g.cooldown = 8;
        hit = g.kind;
      }
      continue;
    }
    if (g.pause > 0) {
      g.pause -= dt;
      g.dir += Math.sin(g.pause * 3) * dt * 2.2; // menoleh ke kiri-kanan
    } else {
      const [tx, ty] = NODES[g.to];
      const d = Math.hypot(tx - g.x, ty - g.y);
      const step = GUARD_SPEED * dt;
      if (d <= step) {
        g.x = tx;
        g.y = ty;
        const opts = NEXT[g.to].filter((nb) => nb !== g.at);
        const pool = opts.length ? opts : NEXT[g.to];
        g.at = g.to;
        g.to = pool[Math.floor(Math.random() * pool.length)];
        if (Math.random() < 0.4) g.pause = 0.8 + Math.random() * 1.2;
      } else {
        g.x += ((tx - g.x) / d) * step;
        g.y += ((ty - g.y) / d) * step;
        g.dir = Math.atan2(ty - g.y, tx - g.x);
      }
    }
    // melihat kucing?
    if (canSee && g.cooldown <= 0 && dist < SEE) {
      let diff = Math.atan2(dy, dx) - g.dir;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (
        (dist < 60 || Math.abs(diff) < CONE) &&
        lineOfSight(g.x, g.y, w.x, w.y)
      ) {
        g.alert = ALERT_S;
        gameAudio().roar();
      }
    }
  }
  return hit;
}

function makeWorld(n: number) {
  const hide = 1 + Math.floor(Math.random() * (ROOMS.length - 1));
  return {
    x: ROOMS[0].x + ROOMS[0].w / 2,
    y: ROOMS[0].y + ROOMS[0].h / 2 + 30,
    face: 1,
    moving: false,
    keys: new Set<string>(),
    joy: { x: 0, y: 0 },
    tasks: makeTasks(n),
    near: -1,
    dark: false,
    alarm: false,
    shock: 0,
    hide,
    /** urutan modul yang dinyatakan bersih (petunjuk) */
    clues: shuffle(ROOMS.map((_, i) => i).filter((i) => i > 0 && i !== hide)),
    particles: [] as Particle[],
    paws: shuffle(HALLS)
      .slice(0, 4)
      .flatMap((h) =>
        Array.from({ length: 4 }, (_, i) => ({
          x: h.x + 20 + ((h.w - 40) * i) / 3,
          y: h.y + h.h / 2 + (i % 2 ? 10 : -10),
        })),
      ),
    stars: Array.from({ length: 160 }, () => ({
      x: Math.random() * WORLD_W * 1.4 - WORLD_W * 0.2,
      y: Math.random() * WORLD_H * 1.4 - WORLD_H * 0.2,
      r: Math.random() * 1.6 + 0.3,
    })),
    open: false,
    guards: makeGuards(n),
    /** sisa waktu pingsan (dtk) & kebal setelah bangun */
    faint: 0,
    wakeInv: 0,
    sprayKind: "pig" as Guard["kind"],
  };
}
type World = ReturnType<typeof makeWorld>;

/** percikan listrik / kilau di koordinat dunia */
function spark(w: World, x: number, y: number, good: boolean) {
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 60 + Math.random() * 180;
    w.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0.8,
      max: 0.8,
      color: good
        ? ["#4ade80", "#facc15", "#38bdf8"][i % 3]
        : ["#fde047", "#facc15", "#fff"][i % 3],
      size: 2 + Math.random() * 3,
    });
  }
}

export function StationPlayer(props: PlayerProps) {
  const { gameId, questions, secondsPerQuestion, onPlayingChange } = props;
  const session = useQuizSession(gameId, "station");
  const [phase, setPhase] = useState<Phase>("ready");
  const [terminal, setTerminal] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [hintsLeft, setHintsLeft] = useState(GAME_HINTS);
  const [hinting, setHinting] = useState(false);
  const [done, setDone] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [taskView, setTaskView] = useState<Task[]>([]);
  const [clues, setClues] = useState<number[]>([]);
  const [near, setNear] = useState(-1);
  const [faintLeft, setFaintLeft] = useState(0);
  const [banner, setBanner] = useState<{
    text: string;
    key: number;
    tone: "info" | "warn" | "good";
  } | null>(null);
  const [dark, setDark] = useState(false);
  const [alarm, setAlarm] = useState(false);
  const [vote, setVote] = useState<number | null>(null);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [showTasks, setShowTasks] = useState(true);
  const [hide, setHide] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const joyKnob = useRef<HTMLDivElement>(null);
  const world = useRef(makeWorld(0));
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
  const say = useCallback(
    (text: string, tone: "info" | "warn" | "good" = "info") =>
      setBanner({ text, key: Date.now(), tone }),
    [],
  );

  const q = questions[done] ?? questions[questions.length - 1];
  const task = terminal !== null ? (taskView[terminal] ?? null) : null;

  /* ---------------- terminal soal ---------------- */

  const openTerminal = useCallback(
    (id: number) => {
      const w = world.current;
      const t = w.tasks[id];
      if (!t || t.done || t.hidden || w.open || done >= questions.length)
        return;
      w.open = true;
      w.keys.clear();
      w.joy = { x: 0, y: 0 };
      setTerminal(id);
      setFeedback(null);
      setHidden([]);
      gameAudio().unlockUp();
      session.shown(questions[done].id);
    },
    [done, questions, session],
  );

  const answerRef = useRef<(k: number) => void>(() => undefined);
  const timer = useQuestionTimer(
    phase === "playing" && terminal !== null && !feedback && !checking
      ? done
      : null,
    secondsPerQuestion,
    () => answerRef.current(-1),
  );

  const answer = useCallback(
    async (k: number) => {
      if (terminal === null || feedback || checking) return;
      const elapsed = timer.elapsed();
      setChecking(true);
      const res = await session.check(q.id, k, elapsed);
      setChecking(false);
      if (!res) return;
      const w = world.current;
      const t = w.tasks[terminal];
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
        setStreak((s) => {
          audio.correct(s + 1);
          return s + 1;
        });
        setWrongStreak(0);
        spark(w, t.x, t.y, true);
      } else {
        setStreak(0);
        setWrongStreak((s) => s + 1);
        if (k === -1) audio.timeout();
        else audio.wrong();
        audio.burn();
        w.shock = 0.7;
        spark(w, t.x, t.y, false);
      }
    },
    [terminal, feedback, checking, timer, session, q, secondsPerQuestion],
  );
  useEffect(() => {
    answerRef.current = (k) => void answer(k);
  });

  /** tutup terminal setelah menjawab: misi selesai, kejadian penyusup, atau Rapat Awak */
  const closeTerminal = useCallback(() => {
    if (terminal === null || !feedback) return;
    const w = world.current;
    const t = w.tasks[terminal];
    t.done = true;
    w.open = false;
    const nd = done + 1;
    setDone(nd);
    setTerminal(null);
    setFeedback(null);
    gameAudio().click();
    if (t.urgent) {
      w.alarm = false;
      setAlarm(false);
      say("✅ Oksigen pulih! Stasiun aman kembali", "good");
    }
    if (w.dark) {
      w.dark = false;
      setDark(false);
      say("💡 Lampu menyala lagi!", "good");
    }
    // petunjuk: tiap 2 misi, satu modul dinyatakan bersih (minimal 2 tersangka tersisa)
    if (nd % 2 === 0) {
      const given = Math.min(w.clues.length - 1, Math.floor(nd / 2));
      const list = w.clues.slice(0, Math.max(0, given));
      if (list.length > clues.length) {
        setClues(list);
        later(900, () =>
          say(
            `🐾 Petunjuk baru: tidak ada jejak penyusup di ${ROOMS[list[list.length - 1]].name}`,
          ),
        );
      }
    }
    if (nd >= questions.length) {
      later(700, () => {
        setPhase("meeting");
        gameAudio().roar();
      });
      return;
    }
    // kejadian penyusup
    const urgent = w.tasks.find((x) => x.urgent && x.hidden);
    if (urgent && nd >= Math.floor(questions.length / 2)) {
      urgent.hidden = false;
      w.alarm = true;
      setAlarm(true);
      later(500, () => {
        say("🚨 ALARM OKSIGEN! Segera ke Anjungan Kendali", "warn");
        gameAudio().roar();
      });
    } else if (
      questions.length >= 5 &&
      (nd === 2 || (nd > 2 && (nd - 2) % 4 === 0))
    ) {
      w.dark = true;
      setDark(true);
      later(500, () => {
        say("⚠️ Lampu padam! Penyusup beraksi…", "warn");
        gameAudio().timeout();
      });
    }
    setTaskView(w.tasks.map((x) => ({ ...x })));
  }, [terminal, feedback, done, questions.length, clues.length, later, say]);

  const takeHint = async () => {
    if (
      terminal === null ||
      feedback ||
      hinting ||
      hintsLeft <= 0 ||
      hidden.length
    )
      return;
    setHinting(true);
    gameAudio().click();
    const res = await session.hint(q.id);
    setHinting(false);
    if (!res) return;
    if (typeof res.left === "number") setHintsLeft(res.left);
    if (res.removed) setHidden(res.removed);
  };

  /* ---------------- mulai / selesai ---------------- */

  const cd = useCountdown(phase === "countdown", () => {
    setPhase("playing");
    say("🛠️ Selesaikan misi di seluruh stasiun!");
  });
  const begin = async () => {
    requestMobileFullscreen();
    const audio = gameAudio();
    audio.unlock();
    audio.click();
    audio.startMusic();
    run.current++;
    world.current = makeWorld(questions.length);
    setHide(world.current.hide);
    // HP: daftar misi tertutup agar peta terlihat (bisa dibuka dengan mengetuk)
    setShowTasks(window.innerWidth >= 640);
    setTaskView(world.current.tasks.map((x) => ({ ...x })));
    setDone(0);
    setScore(0);
    setStreak(0);
    setWrongStreak(0);
    setHintsLeft(GAME_HINTS);
    setClues([]);
    setTerminal(null);
    setFeedback(null);
    setDark(false);
    setAlarm(false);
    setVote(null);
    setResult(null);
    setBanner(null);
    setNear(-1);
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

  const finish = async (choice: number) => {
    setVote(choice);
    const caught = choice === hide;
    gameAudio().result(caught ? "tertinggi" : "normal");
    later(2600, async () => {
      setPhase("finishing");
      gameAudio().stopMusic();
      const res = await session.submit();
      if (!res) return setPhase("ready");
      setResult(res);
      setPhase("result");
      gameAudio().result(res.tier);
    });
  };

  const exit = () => {
    run.current++;
    session.stop();
    world.current.open = false;
    setTerminal(null);
    setPhase("ready");
  };

  /* ---------------- kontrol ---------------- */

  const act = useCallback(() => {
    const w = world.current;
    if (w.near >= 0 && !w.open && w.faint <= 0) openTerminal(w.near);
  }, [openTerminal]);
  const keys = useRef({
    act,
    answer: answerRef,
    closeTerminal,
    terminal,
    feedback,
    hidden,
    n: 0,
  });
  useEffect(() => {
    keys.current = {
      act,
      answer: answerRef,
      closeTerminal,
      terminal,
      feedback,
      hidden,
      n: q ? optionCount(q) : 0,
    };
  });
  useEffect(() => {
    if (phase !== "playing") return;
    const map: Record<string, string> = {
      arrowup: "u",
      w: "u",
      arrowdown: "d",
      s: "d",
      arrowleft: "l",
      a: "l",
      arrowright: "r",
      d: "r",
    };
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const k = keys.current;
      if (k.terminal !== null) {
        if (e.repeat) return;
        if (!k.feedback) {
          let idx = "12345".indexOf(key);
          if (idx < 0) idx = "abcde".indexOf(key);
          if (idx >= 0 && idx < k.n && !k.hidden.includes(idx)) {
            e.preventDefault();
            k.answer.current(idx);
          }
        } else if (key === "enter" || key === " " || key === "e") {
          e.preventDefault();
          k.closeTerminal();
        }
        return;
      }
      if (map[key]) {
        e.preventDefault();
        world.current.keys.add(map[key]);
      } else if ((key === "e" || key === " " || key === "enter") && !e.repeat) {
        e.preventDefault();
        k.act();
      }
    };
    const up = (e: KeyboardEvent) => {
      const m = map[e.key.toLowerCase()];
      if (m) world.current.keys.delete(m);
    };
    const blur = () => world.current.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [phase]);

  // joystick virtual: tarik dari tengah lingkaran, lepas = berhenti
  const joyBase = useRef<{ x: number; y: number; id: number } | null>(null);
  const onJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    joyBase.current = {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      id: e.pointerId,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* abaikan */
    }
    onJoyMove(e);
  };
  const onJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const b = joyBase.current;
    if (!b || b.id !== e.pointerId) return;
    let dx = e.clientX - b.x;
    let dy = e.clientY - b.y;
    const len = Math.hypot(dx, dy);
    const max = 46;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    world.current.joy = { x: dx / max, y: dy / max };
    if (joyKnob.current)
      joyKnob.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const onJoyUp = () => {
    joyBase.current = null;
    world.current.joy = { x: 0, y: 0 };
    if (joyKnob.current)
      joyKnob.current.style.transform = "translate(0px, 0px)";
  };

  /* ---------------- loop: gerak + gambar ---------------- */

  const active =
    phase === "countdown" ||
    phase === "playing" ||
    phase === "meeting" ||
    phase === "finishing";
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const wrap = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return;
    let W = 0;
    let H = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    let camX = world.current.x;
    let camY = world.current.y;
    let lastNear = -2;
    let lastFaint = -1;
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = world.current;
      const t = now / 1000;

      // --- gerak
      let vx = 0;
      let vy = 0;
      if (!w.open && phase === "playing" && w.faint <= 0) {
        if (w.keys.has("l")) vx -= 1;
        if (w.keys.has("r")) vx += 1;
        if (w.keys.has("u")) vy -= 1;
        if (w.keys.has("d")) vy += 1;
        vx += w.joy.x;
        vy += w.joy.y;
      }
      const len = Math.hypot(vx, vy);
      if (len > 1) {
        vx /= len;
        vy /= len;
      }
      const slow = w.shock > 0 ? 0.35 : 1;
      const nx = w.x + vx * SPEED * slow * dt;
      const ny = w.y + vy * SPEED * slow * dt;
      if (free(nx, w.y)) w.x = nx;
      if (free(w.x, ny)) w.y = ny;
      w.moving = len > 0.15;
      if (Math.abs(vx) > 0.1) w.face = vx > 0 ? 1 : -1;
      if (w.shock > 0) w.shock -= dt;

      // --- penjaga penyusup & pingsan
      if (phase === "playing") {
        const hit = stepGuards(
          w,
          dt,
          !w.open && w.faint <= 0 && w.wakeInv <= 0,
        );
        if (hit) {
          w.faint = FAINT_S;
          w.sprayKind = hit;
          w.keys.clear();
          w.joy = { x: 0, y: 0 };
          if (hit === "pig") gameAudio().splash();
          else gameAudio().burn();
          say(
            hit === "pig"
              ? "🐷💦 Ketahuan Babi! Kucing basah kuyup & pingsan…"
              : "🐶🔥 Ketahuan Anjing! Kucing gosong & pingsan…",
            "warn",
          );
        }
      }
      if (w.faint > 0) {
        w.faint -= dt;
        if (w.faint <= 0) {
          w.faint = 0;
          w.wakeInv = WAKE_INV;
          say("😼 Kucing bangun! Lanjutkan misi — hati-hati penjaga", "good");
        }
      } else if (w.wakeInv > 0) w.wakeInv -= dt;
      const fl = Math.ceil(w.faint);
      if (fl !== lastFaint) {
        lastFaint = fl;
        setFaintLeft(fl);
      }

      // --- titik misi terdekat yang bisa diperbaiki
      let nearId = -1;
      let best = REACH;
      for (const tk of w.tasks) {
        if (tk.done || tk.hidden) continue;
        const d = Math.hypot(tk.x - w.x, tk.y - w.y);
        if (d < best) {
          best = d;
          nearId = tk.id;
        }
      }
      w.near = nearId;
      if (nearId !== lastNear) {
        lastNear = nearId;
        setNear(nearId);
      }
      for (const p of w.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.life -= dt;
      }
      w.particles = w.particles.filter((p) => p.life > 0);

      // --- kamera
      const scale = Math.max(0.55, Math.min(1.15, Math.min(W, H) / 560));
      camX += (w.x - camX) * Math.min(1, dt * 6);
      camY += (w.y - camY) * Math.min(1, dt * 6);
      const sx = (x: number) => (x - camX) * scale + W / 2;
      const sy = (y: number) => (y - camY) * scale + H / 2;

      // --- gambar: luar angkasa
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#050816";
      ctx.fillRect(0, 0, W, H);
      for (const s of w.stars) {
        ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(t * 1.5 + s.x)})`;
        ctx.fillRect(
          (s.x - camX * 0.35) * scale * 0.6 + W / 2,
          (s.y - camY * 0.35) * scale * 0.6 + H / 2,
          s.r,
          s.r,
        );
      }
      ctx.save();
      ctx.translate(W / 2 - camX * scale, H / 2 - camY * scale);
      ctx.scale(scale, scale);
      // dinding (lambung stasiun) lalu lantai
      ctx.fillStyle = "#64748b";
      for (const r of WALKABLE)
        ctx.fillRect(r.x - 14, r.y - 14, r.w + 28, r.h + 28);
      ctx.fillStyle = "#334155";
      for (const r of WALKABLE)
        ctx.fillRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
      for (const h of HALLS) {
        ctx.fillStyle = "#1f2937";
        ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.fillStyle = "rgba(250,204,21,0.25)";
        if (h.w > h.h)
          for (let x = h.x + 10; x < h.x + h.w - 10; x += 40)
            ctx.fillRect(x, h.y + h.h / 2 - 2, 20, 4);
        else
          for (let y = h.y + 10; y < h.y + h.h - 10; y += 40)
            ctx.fillRect(h.x + h.w / 2 - 2, y, 4, 20);
      }
      ROOMS.forEach((r, i) => {
        ctx.fillStyle = r.floor;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        for (let x = r.x + 40; x < r.x + r.w; x += 40) {
          ctx.beginPath();
          ctx.moveTo(x, r.y);
          ctx.lineTo(x, r.y + r.h);
          ctx.stroke();
        }
        for (let y = r.y + 40; y < r.y + r.h; y += 40) {
          ctx.beginPath();
          ctx.moveTo(r.x, y);
          ctx.lineTo(r.x + r.w, y);
          ctx.stroke();
        }
        // dekorasi khas modul
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (r.key === "reactor") {
          const g = 0.6 + 0.4 * Math.sin(t * 3);
          ctx.fillStyle = `rgba(251,146,60,${0.25 * g})`;
          ctx.beginPath();
          ctx.arc(cx + 30, cy - 10, 62, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fb923c";
          ctx.beginPath();
          ctx.arc(cx + 30, cy - 10, 30 + 4 * g, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fff7ed";
          ctx.beginPath();
          ctx.arc(cx + 30, cy - 10, 12, 0, Math.PI * 2);
          ctx.fill();
        } else if (r.key === "observ") {
          ctx.fillStyle = "#020617";
          ctx.beginPath();
          ctx.arc(cx, r.y + 26, 70, 0, Math.PI);
          ctx.fill();
          ctx.fillStyle = "#fff";
          for (let k = 0; k < 9; k++)
            ctx.fillRect(cx - 55 + k * 14, r.y + 34 + ((k * 7) % 30), 2, 2);
          ctx.font = "34px system-ui";
          ctx.fillText("🔭", cx, cy + 10);
        } else if (r.key === "garden") {
          ctx.font = "24px system-ui";
          for (let k = 0; k < 6; k++)
            ctx.fillText(k % 2 ? "🌿" : "🥬", r.x + 70 + k * 36, cy + 4);
        } else if (r.key === "lab") {
          ctx.fillStyle = "#0f766e";
          ctx.fillRect(cx - 70, cy - 18, 140, 36);
          ctx.font = "22px system-ui";
          ctx.fillText("🧪 ⚗️ 🔬", cx, cy);
        } else if (r.key === "comms") {
          ctx.font = "44px system-ui";
          ctx.fillText("📡", cx - 10, cy);
        } else if (r.key === "kitchen") {
          ctx.fillStyle = "#a16207";
          ctx.beginPath();
          ctx.ellipse(cx, cy + 6, 70, 30, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = "22px system-ui";
          ctx.fillText("🍕 🥤 🍎", cx, cy + 6);
        } else if (r.key === "cargo") {
          ctx.fillStyle = "#a16207";
          for (let k = 0; k < 4; k++)
            ctx.fillRect(cx - 80 + k * 42, cy - 14 + (k % 2) * 12, 34, 34);
        } else if (r.key === "bridge") {
          ctx.fillStyle = "#0c4a6e";
          ctx.beginPath();
          ctx.arc(cx, cy + 20, 52, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = "rgba(56,189,248,0.6)";
          ctx.font = "bold 13px system-ui";
          ctx.fillText("ORBIT POSI", cx, cy + 20);
        }
        // nama modul
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "bold 15px system-ui";
        ctx.fillText(`${r.icon} ${r.name}`, cx, r.y + r.h - 14);
        if (i === 0 && w.alarm) {
          ctx.fillStyle = `rgba(239,68,68,${0.18 + 0.15 * Math.sin(t * 8)})`;
          ctx.fillRect(r.x, r.y, r.w, r.h);
        }
      });
      // jejak tikus di lorong
      ctx.font = "14px system-ui";
      ctx.globalAlpha = 0.45;
      for (const p of w.paws) ctx.fillText("🐾", p.x, p.y);
      ctx.globalAlpha = 1;
      // titik misi (konsol)
      for (const tk of w.tasks) {
        if (tk.hidden) continue;
        const r = ROOMS[tk.room];
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(tk.x - 24, tk.y - 16, 48, 32);
        ctx.fillStyle = tk.done
          ? "#22c55e"
          : tk.urgent
            ? Math.sin(t * 10) > 0
              ? "#ef4444"
              : "#7f1d1d"
            : r.accent;
        ctx.globalAlpha = tk.done ? 0.6 : 0.85 + 0.15 * Math.sin(t * 4 + tk.id);
        ctx.fillRect(tk.x - 18, tk.y - 11, 36, 18);
        ctx.globalAlpha = 1;
        if (!tk.done) {
          const bob = Math.sin(t * 4 + tk.id) * 4;
          ctx.fillStyle = tk.urgent ? "#ef4444" : "#facc15";
          ctx.beginPath();
          ctx.moveTo(tk.x, tk.y - 26 + bob);
          ctx.lineTo(tk.x - 9, tk.y - 42 + bob);
          ctx.lineTo(tk.x + 9, tk.y - 42 + bob);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#0f172a";
          ctx.font = "bold 12px system-ui";
          ctx.fillText("!", tk.x, tk.y - 37 + bob);
        } else {
          ctx.fillStyle = "#fff";
          ctx.font = "bold 14px system-ui";
          ctx.fillText("✓", tk.x, tk.y - 2);
        }
        if (tk.id === w.near) {
          ctx.strokeStyle = "rgba(250,204,21,0.9)";
          ctx.lineWidth = 3;
          ctx.strokeRect(tk.x - 28, tk.y - 20, 56, 40);
        }
      }
      for (const p of w.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      // penjaga penyusup: kerucut pandang, badan, senjata
      for (const g of w.guards) {
        ctx.fillStyle =
          g.alert > 0 || g.spray > 0
            ? "rgba(239,68,68,0.22)"
            : "rgba(250,204,21,0.13)";
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.arc(g.x, g.y, SEE, g.dir - CONE, g.dir + CONE);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(g.x, g.y + 20, 20, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.dir);
        ctx.fillStyle = g.kind === "pig" ? "#0ea5e9" : "#ea580c";
        ctx.fillRect(8, -5, 26, 10);
        ctx.fillStyle = g.kind === "pig" ? "#e0f2fe" : "#facc15";
        ctx.fillRect(30, -3, 8, 6);
        ctx.restore();
        ctx.fillStyle = g.kind === "pig" ? "#be185d" : "#7c2d12";
        ctx.beginPath();
        ctx.arc(g.x, g.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "30px system-ui";
        ctx.fillText(g.kind === "pig" ? "🐷" : "🐶", g.x, g.y + 1);
        if (g.alert > 0 || g.spray > 0) {
          ctx.fillStyle = "#ef4444";
          ctx.font = "900 26px system-ui";
          ctx.fillText("❗", g.x, g.y - 34 + Math.sin(t * 20) * 3);
        }
      }
      // kucing pingsan: bintang berputar
      if (w.faint > 0) {
        ctx.font = "18px system-ui";
        for (let k = 0; k < 3; k++) {
          const a = t * 4 + (k * Math.PI * 2) / 3;
          ctx.fillText(
            "💫",
            w.x + Math.cos(a) * 26,
            w.y - 40 + Math.sin(a) * 8,
          );
        }
      }
      // bayangan kucing
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(w.x, w.y + 20, 20, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // --- jangkauan pandang (kabut)
      const R = (w.dark ? VIEW_DARK : VIEW) * scale;
      const g = ctx.createRadialGradient(
        sx(w.x),
        sy(w.y),
        R * 0.55,
        sx(w.x),
        sy(w.y),
        R,
      );
      g.addColorStop(0, "rgba(2,6,23,0)");
      g.addColorStop(1, w.dark ? "rgba(2,6,23,0.97)" : "rgba(2,6,23,0.66)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (w.shock > 0) {
        ctx.fillStyle = `rgba(250,204,21,${Math.min(0.35, w.shock * 0.5)})`;
        ctx.fillRect(0, 0, W, H);
      }

      // --- peta mini
      const ms = Math.min(150, W * 0.3) / WORLD_W;
      const mx = W - WORLD_W * ms - 10;
      const my = 10;
      ctx.fillStyle = "rgba(2,6,23,0.75)";
      ctx.fillRect(mx - 5, my - 5, WORLD_W * ms + 10, WORLD_H * ms + 10);
      ctx.fillStyle = "#475569";
      for (const r of WALKABLE)
        ctx.fillRect(
          mx + r.x * ms,
          my + r.y * ms,
          Math.max(1, r.w * ms),
          Math.max(1, r.h * ms),
        );
      for (const tk of w.tasks) {
        if (tk.done || tk.hidden) continue;
        ctx.fillStyle = tk.urgent ? "#ef4444" : "#facc15";
        ctx.fillRect(mx + tk.x * ms - 2, my + tk.y * ms - 2, 4, 4);
      }
      ctx.fillStyle = "#ef4444";
      for (const g of w.guards) {
        ctx.beginPath();
        ctx.arc(mx + g.x * ms, my + g.y * ms, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(
        mx + w.x * ms,
        my + w.y * ms,
        3 + Math.sin(t * 6),
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // --- kucing (DOM)
      if (catRef.current) {
        const size = 70 * scale;
        const bob = w.moving ? Math.abs(Math.sin(t * 12)) * 5 * scale : 0;
        const jit = w.shock > 0 ? Math.sin(t * 90) * 4 : 0;
        catRef.current.style.width = `${size}px`;
        catRef.current.style.height = `${size}px`;
        const lie = w.faint > 0 ? ` rotate(${w.face * 90}deg)` : "";
        catRef.current.style.opacity =
          w.wakeInv > 0 && Math.sin(t * 30) > 0 ? "0.4" : "1";
        catRef.current.style.filter =
          w.faint > 0
            ? w.sprayKind === "pig"
              ? "hue-rotate(160deg) saturate(1.4)"
              : "brightness(0.55) sepia(0.6)"
            : "none";
        catRef.current.style.transform = `translate(${sx(w.x) - size / 2 + jit}px, ${sy(w.y) - size * 0.78 - bob + (w.faint > 0 ? size * 0.25 : 0)}px) scaleX(${w.face})${lie}`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active, phase, say]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __station: unknown }).__station = {
      phase,
      done,
      score,
      terminal,
      near,
      dark,
      alarm,
      clues,
      world: world.current,
    };
  });

  /* ---------------- tampilan ---------------- */

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
  if (phase === "result" && result) {
    const caught = vote === hide;
    return (
      <div className="space-y-4">
        <div className="card p-4 text-center text-sm font-bold text-navy-700">
          <p className="text-base">
            🚀 Stasiun Orbit POSI pulih: {questions.length}/{questions.length}{" "}
            misi
          </p>
          <p className="mt-1">
            {caught
              ? "🐷🐶 Markas penyusup ditemukan — Babi & Anjing tertangkap! Kucing pahlawan stasiun 🏅"
              : `🐷🐶 Markas penyusup ternyata di ${ROOMS[hide].name} — mereka kabur kali ini!`}
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
        title="Mode Stasiun Kucing: Misi Orbit"
        subtitle="Sistem stasiun luar angkasa rusak & penyusup Babi 🐷 dan Anjing 🐶 bersenjata berpatroli di dalamnya! Jelajahi stasiun diam-diam dan perbaiki semua modul dengan menjawab soal."
        bullets={[
          {
            text: "🕹️ Jalan bebas: joystick di layar (HP) atau panah / WASD (laptop).",
          },
          {
            text: "🛠️ Datangi tanda ❗ kuning di tiap modul lalu tekan PERBAIKI (atau E / spasi) — soal muncul di terminal.",
          },
          {
            text: "✅ Benar → misi selesai. ⚡ Salah → kucing tersetrum sebentar, jawaban benar ditampilkan.",
          },
          {
            text: "🐷💦 🐶🔥 Penjaga berpatroli — jangan masuk kerucut pandangnya! Tertangkap = disemprot & pingsan 5 detik.",
          },
          {
            text: "🚨 Awas kejadian penyusup: lampu padam & alarm oksigen di Anjungan!",
          },
          {
            text: `🐾 Kumpulkan petunjuk, lalu tebak markas penyusup di Rapat Awak. ${secondsPerQuestion} detik per soal — skor sama dengan mode klasik.`,
            tone: "emerald",
            wide: true,
          },
        ]}
        loggedIn={props.loggedIn}
        loginHref={props.loginHref}
        onBack={props.onExit}
        onStart={() => void begin()}
        startLabel="Mulai misi"
        startIcon={<Rocket className="h-5 w-5" />}
      />
    );

  const mood =
    faintLeft > 0
      ? "menangis"
      : feedback
        ? feedback.correct
          ? "girang"
          : "sedih"
        : catMood(streak, wrongStreak);
  const n = optionCount(q);
  const remaining = taskView.filter((x) => !x.done && !x.hidden);
  const nearTask = near >= 0 ? (taskView[near] ?? null) : null;
  const candidates = ROOMS.map((_, i) => i).filter((i) => i > 0);
  return (
    <ArenaFrame
      label={`Misi ${done}/${questions.length}`}
      extra={
        <>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-sky-50 px-2.5 py-1 text-xs font-extrabold text-sky-700">
            ⭐ {score}
          </span>
          {terminal !== null && !feedback && <TimeChip left={timer.timeLeft} />}
        </>
      }
      hint={
        terminal !== null && !feedback
          ? {
              left: hintsLeft,
              busy: hinting,
              disabled:
                hintsLeft <= 0 || hidden.length > 0 || n <= 2 || checking,
              onClick: () => void takeHint(),
            }
          : null
      }
      onExit={exit}
    >
      <div className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-[#050816]">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        <div
          ref={catRef}
          className="pointer-events-none absolute left-0 top-0 origin-bottom will-change-transform"
        >
          <div className="absolute -top-[18%] left-1/2 h-[42%] w-[62%] -translate-x-1/2 rounded-full border-2 border-sky-200/70 bg-sky-200/15" />
          <GameCat mood={mood} className="relative h-full w-full" />
        </div>

        {/* bilah perbaikan stasiun */}
        <div className="pointer-events-none absolute bottom-7 left-1/2 z-10 w-[34%] -translate-x-1/2 sm:bottom-auto sm:top-2 sm:w-[min(60%,320px)]">
          <div className="h-3.5 overflow-hidden rounded-full bg-navy-950/80 ring-2 ring-white/30">
            <div
              className="h-full rounded-full bg-linear-to-r from-emerald-400 to-lime-300 transition-[width] duration-700"
              style={{ width: `${(done / questions.length) * 100}%` }}
            />
          </div>
          <p className="mt-0.5 text-center text-[10px] font-black uppercase tracking-wider text-white/80 drop-shadow">
            Perbaikan stasiun {Math.round((done / questions.length) * 100)}%
          </p>
        </div>

        {/* daftar misi & petunjuk */}
        <div className="absolute left-2 top-2 z-10 max-w-[46%] sm:max-w-60">
          <button
            type="button"
            onClick={() => setShowTasks((v) => !v)}
            className="rounded-t-xl bg-navy-950/85 px-2.5 py-1 text-[11px] font-black text-amber-300"
          >
            📋 MISI ({done}/{questions.length}) {showTasks ? "▾" : "▸"}
          </button>
          {showTasks && (
            <div className="max-h-[38svh] space-y-0.5 overflow-y-auto rounded-b-xl rounded-tr-xl bg-navy-950/75 p-2 text-[11px] leading-tight text-white backdrop-blur">
              {taskView
                .filter((x) => !x.hidden)
                .map((x) => (
                  <p
                    key={x.id}
                    className={cn(
                      x.done
                        ? "text-emerald-300/70 line-through"
                        : x.urgent
                          ? "animate-pulse font-black text-rose-300"
                          : "text-white",
                    )}
                  >
                    {x.done ? "✓" : x.urgent ? "🚨" : "•"} {ROOMS[x.room].name}:{" "}
                    {x.name}
                  </p>
                ))}
              {clues.length > 0 && (
                <div className="mt-1.5 border-t border-white/15 pt-1.5 text-sky-200">
                  <p className="font-black">🐾 Petunjuk</p>
                  {clues.map((c) => (
                    <p key={c}>Bersih: {ROOMS[c].name}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* peringatan kejadian */}
        {faintLeft > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-[38%] z-20 text-center">
            <span className="inline-block animate-pulse rounded-2xl bg-navy-950/85 px-4 py-2 text-base font-black text-white shadow-xl">
              😵 Pingsan… bangun dalam {faintLeft} detik
            </span>
          </div>
        )}
        {(dark || alarm) && (
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-14 z-10 text-center",
              alarm && "animate-pulse",
            )}
          >
            <span
              className={cn(
                "inline-block rounded-xl px-3 py-1 text-xs font-black text-white shadow-lg",
                alarm ? "bg-rose-600" : "bg-slate-700",
              )}
            >
              {alarm
                ? "🚨 Oksigen menipis — perbaiki di Anjungan!"
                : "⚠️ Lampu padam — selesaikan 1 misi untuk memulihkan"}
            </span>
          </div>
        )}
        {banner && (
          <div
            key={banner.key}
            className="duel-banner pointer-events-none absolute inset-x-0 top-[30%] z-20 text-center"
          >
            <span
              className={cn(
                "inline-block max-w-[90%] rounded-2xl px-4 py-2 text-sm font-black text-white shadow-xl sm:text-base",
                banner.tone === "warn"
                  ? "bg-rose-600/90"
                  : banner.tone === "good"
                    ? "bg-emerald-600/90"
                    : "bg-navy-950/85",
              )}
            >
              {banner.text}
            </span>
          </div>
        )}

        {/* kontrol: joystick & tombol perbaiki */}
        {phase === "playing" && terminal === null && (
          <>
            <div
              className="absolute bottom-4 left-4 z-10 grid h-28 w-28 touch-none place-items-center rounded-full bg-white/10 ring-2 ring-white/25 backdrop-blur-sm"
              onPointerDown={onJoyDown}
              onPointerMove={onJoyMove}
              onPointerUp={onJoyUp}
              onPointerCancel={onJoyUp}
              onLostPointerCapture={onJoyUp}
              aria-label="Joystick"
            >
              <div
                ref={joyKnob}
                className="pointer-events-none h-12 w-12 rounded-full bg-white/70 shadow-lg ring-2 ring-white"
              />
            </div>
            <button
              type="button"
              onClick={act}
              disabled={near < 0 || faintLeft > 0}
              className={cn(
                "absolute bottom-5 right-4 z-10 flex h-24 w-24 flex-col items-center justify-center gap-0.5 rounded-3xl text-xs font-black shadow-2xl ring-4 transition",
                near >= 0 && faintLeft <= 0
                  ? nearTask?.urgent
                    ? "bg-rose-500 text-white ring-rose-200 shadow-[0_0_28px_rgba(244,63,94,0.8)]"
                    : "bg-amber-400 text-navy-950 ring-amber-200 shadow-[0_0_28px_rgba(250,204,21,0.8)] hover:scale-105"
                  : "bg-white/15 text-white/50 ring-white/20",
              )}
            >
              <Wrench className="h-8 w-8" />
              PERBAIKI
            </button>
            {nearTask && (
              <div className="pointer-events-none absolute bottom-32 right-3 z-10 max-w-48 rounded-xl bg-navy-950/85 px-2.5 py-1.5 text-right text-[11px] font-bold text-amber-200">
                {nearTask.name}
              </div>
            )}
            <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 hidden -translate-x-1/2 rounded-lg bg-navy-950/60 px-2 py-0.5 text-[11px] text-sky-100 pointer-fine:block">
              Panah / WASD: jalan · E / spasi: perbaiki
            </p>
            {remaining.length === 0 && done < questions.length && (
              <p className="pointer-events-none absolute bottom-32 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-navy-950/80 px-3 py-1 text-xs font-bold text-white">
                Menyiapkan misi…
              </p>
            )}
          </>
        )}

        {/* terminal soal */}
        {task && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-navy-950/60 p-2 backdrop-blur-[2px] sm:p-4">
            <div className="max-h-full w-full max-w-xl overflow-y-auto rounded-3xl border-2 border-sky-400/60 bg-linear-to-b from-slate-900 to-slate-950 p-4 text-white shadow-[0_0_40px_rgba(56,189,248,0.35)]">
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="grid h-9 w-9 place-items-center rounded-xl text-xl"
                  style={{ background: `${ROOMS[task.room].accent}33` }}
                >
                  {ROOMS[task.room].icon}
                </span>
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-[11px] font-black uppercase tracking-widest",
                      task.urgent ? "text-rose-300" : "text-sky-300",
                    )}
                  >
                    {task.urgent ? "🚨 Terminal darurat" : "Terminal"} ·{" "}
                    {ROOMS[task.room].name}
                  </p>
                  <p className="truncate font-bold">{task.name}</p>
                </div>
                <span className="ml-auto font-mono text-[11px] text-emerald-300">
                  SOAL {done + 1}/{questions.length}
                </span>
              </div>
              <div className="rounded-2xl bg-black/40 p-3 font-mono ring-1 ring-sky-500/30">
                <MathText
                  key={q.id}
                  as="p"
                  text={q.text}
                  className="font-sans font-bold leading-snug text-sky-50 sm:text-lg"
                />
              </div>
              <div className={cn("mt-3 grid gap-2", n > 2 && "sm:grid-cols-2")}>
                {q.options.slice(0, 5).map((o, k) => {
                  const isRight = feedback && k === feedback.answerIndex;
                  const isWrong =
                    feedback && k === feedback.choice && !feedback.correct;
                  const off = !feedback && hidden.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!!feedback || checking || off}
                      onClick={() => answerRef.current(k)}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition sm:text-base",
                        "border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/25",
                        off && "opacity-20",
                        feedback && !isRight && !isWrong && "opacity-35",
                        isRight && "border-emerald-400 bg-emerald-500/30",
                        isWrong &&
                          "animate-shake border-rose-400 bg-rose-500/30",
                      )}
                    >
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-black text-white"
                        style={{ background: OPTION_COLORS[k] }}
                      >
                        {checking && !feedback ? <Spinner /> : LETTERS[k]}
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
                <div className="mt-3 text-navy-900">
                  <FeedbackBox
                    feedback={feedback}
                    message={
                      feedback.correct
                        ? "Misi selesai ✅"
                        : "Kucing tersetrum ⚡ — misi tetap tercatat."
                    }
                    onNext={closeTerminal}
                    nextLabel={
                      done + 1 < questions.length
                        ? "Tutup terminal"
                        : "Ke Rapat Awak 🗳️"
                    }
                  />
                </div>
              )}
              <p className="mt-2 hidden text-[11px] text-sky-200/70 pointer-fine:block">
                1–{n} / A–{LETTERS[n - 1]}: jawab · Enter: tutup terminal
              </p>
            </div>
          </div>
        )}

        {/* Rapat Awak */}
        {phase === "meeting" && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-navy-950/75 p-3 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-3xl border-2 border-amber-300/70 bg-linear-to-b from-indigo-950 to-slate-950 p-4 text-white shadow-2xl">
              <p className="text-center text-xl font-black">🗳️ RAPAT AWAK</p>
              <p className="mt-1 text-center text-sm text-indigo-200">
                Semua misi selesai! Di modul mana markas penyusup Babi &amp;
                Anjing? Gunakan petunjuk yang kamu kumpulkan.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {candidates.map((i) => {
                  const clean = clues.includes(i);
                  const picked = vote === i;
                  const reveal = vote !== null && i === hide;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={vote !== null || clean}
                      onClick={() => void finish(i)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm font-bold transition",
                        clean
                          ? "border-white/10 bg-white/5 text-white/35 line-through"
                          : "border-amber-300/40 bg-amber-300/10 hover:bg-amber-300/25",
                        picked && "ring-2 ring-white",
                        reveal &&
                          "border-rose-400 bg-rose-500/40 text-white no-underline",
                      )}
                    >
                      <span className="text-xl">
                        {reveal ? "🐷" : ROOMS[i].icon}
                      </span>
                      <span className="min-w-0">{ROOMS[i].name}</span>
                    </button>
                  );
                })}
              </div>
              {vote !== null && (
                <p className="mt-3 animate-pop text-center text-base font-black">
                  {vote === hide
                    ? "🎉 Tepat! Babi & Anjing tertangkap di markasnya!"
                    : `😿 Meleset — markas penyusup ada di ${ROOMS[hide].name}!`}
                </p>
              )}
            </div>
          </div>
        )}
        <ArenaOverlay phase={phase} count={cd.count} />
      </div>
    </ArenaFrame>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Lightbulb, LogIn, LogOut, Maximize, Minimize, Play } from "lucide-react";
import { checkAnswerAction, questionShownAction, startPlayAction, submitScoreAction, takeHintAction, type ScoreResult } from "@/app/actions/games";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/form-buttons";
import { GameCat } from "@/components/game-cat";
import { MathText } from "@/components/math-text";
import { gameAudio } from "@/lib/game-audio";
import { catMood, GAME_HINTS } from "@/lib/game-rules";
import { cn } from "@/lib/utils";
import { ResultCelebration } from "./result-celebration";

/**
 * Mode Labirin: soal yang sama dengan mode klasik, disajikan sebagai labirin dari atas.
 * Pemain menggerakkan kucing sendiri (per kotak). Labirin dibuat acak setiap main dan terdiri dari ruangan berurutan;
 * tiap ruangan berakhir di Ruang Pintu A/B/C/D. Masuk Ruang Pintu → soal tampil (waktu = waktu soal klasik),
 * jawab dengan berjalan masuk ke pintu jawabannya. Salah → jebakan (api / duri / air), lalu pintu benar terbuka.
 * Kunci, waktu & skor tetap dicatat server (startPlay → questionShown → checkAnswer → submitScore).
 * Kabut gelap + senter, peta mini & kompas; ikan 🐟 di jalan buntu hanya koleksi (tidak menambah skor).
 */

type Question = { id: number; text: string; options: string[]; points: number };
type Phase = "ready" | "countdown" | "playing" | "finishing" | "result";
type Stage = "explore" | "question" | "checking" | "done";
type Dir = "up" | "down" | "left" | "right";
type Door = { room: number; k: number; x: number; y: number; state: "closed" | "open" | "locked" };
type Room = { x0: number; chamberX0: number; doorX: number; theme: number };
type MazeMap = { w: number; h: number; tiles: Uint8Array; room: Int16Array; rooms: Room[]; doors: Door[]; fish: Set<number>; exit: { x: number; y: number } };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; grav: number };
type FloatText = { x: number; y: number; text: string; color: string; life: number };
type Feedback = { choice: number; correct: boolean; answerIndex: number; explanation: string | null; points: number };
type Trap = "fire" | "spikes" | "water";

const LETTERS = ["A", "B", "C", "D", "E"];
const OPTION_COLORS = ["#1a6f9f", "#0ea5e9", "#eab308", "#2563eb", "#14b8a6"];
const T_FLOOR = 0;
const T_WALL = 1;
const T_DOOR = 2;
const T_EXIT = 3;
/** tinggi peta (kotak): 5 baris sel labirin */
const MAP_H = 11;
const MID = 5;
const STEP_S = 0.14; // detik per langkah
const VIEW_R = 4.6; // jangkauan senter (kotak)
const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const THEMES = [
  { name: "Lorong Batu", floor: ["#d4dbe5", "#c8d1dd"], wall: "#334155", top: "#64748b" },
  { name: "Taman Rahasia", floor: ["#c7f0d2", "#b6e8c4"], wall: "#14532d", top: "#2f9e57" },
  { name: "Gua Kristal", floor: ["#e4dcfb", "#d8cdf7"], wall: "#3b0764", top: "#7c3aed" },
  { name: "Menara Pasir", floor: ["#fbe7b0", "#f6dc98"], wall: "#78350f", top: "#b7791f" },
];

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
const optionCount = (q: Question) => Math.min(5, Math.max(2, q.options.length));

/**
 * Peta: ruangan berurutan ke kanan. Tiap ruangan = labirin sempurna (sel 5 baris × 4–6 kolom, recursive backtracker)
 * → Ruang Pintu terbuka 3 kolom → kolom pintu (satu pintu per pilihan, berjarak 2) → lorong vertikal ke ruangan berikutnya.
 * Setelah ruangan terakhir: ruang Pintu Keluar.
 */
function buildMap(counts: number[]): MazeMap {
  const cols = counts.map((_, r) => 4 + (r % 3));
  const w = cols.reduce((s, c) => s + 2 * c + 1 + 5, 0) + 5;
  const tiles = new Uint8Array(w * MAP_H).fill(T_WALL);
  const room = new Int16Array(w * MAP_H).fill(counts.length);
  const set = (x: number, y: number, t: number) => (tiles[y * w + x] = t);
  const rooms: Room[] = [];
  const doors: Door[] = [];
  const fish = new Set<number>();
  let x0 = 0;
  counts.forEach((k, r) => {
    const C = cols[r];
    const wm = 2 * C + 1;
    const tile = (cx: number, cy: number) => [x0 + 1 + 2 * cx, 1 + 2 * cy] as const;
    // labirin sempurna
    const seen = new Uint8Array(C * 5);
    const deg = new Uint8Array(C * 5);
    const stack: [number, number][] = [[0, 2]];
    seen[2 * C] = 1;
    set(...tile(0, 2), T_FLOOR);
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const opts = (Object.values(DIRS) as [number, number][])
        .map(([dx, dy]) => [cx + dx, cy + dy] as const)
        .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < C && ny < 5 && !seen[ny * C + nx]);
      if (!opts.length) {
        stack.pop();
        continue;
      }
      const [nx, ny] = opts[Math.floor(Math.random() * opts.length)];
      seen[ny * C + nx] = 1;
      deg[ny * C + nx]++;
      deg[cy * C + cx]++;
      const [ax, ay] = tile(cx, cy);
      const [bx, by] = tile(nx, ny);
      set(bx, by, T_FLOOR);
      set((ax + bx) / 2, (ay + by) / 2, T_FLOOR);
      stack.push([nx, ny]);
    }
    if (r > 0) set(x0, MID, T_FLOOR); // pintu masuk dari lorong ruangan sebelumnya
    const ey = Math.floor(Math.random() * 5);
    set(x0 + wm - 1, 1 + 2 * ey, T_FLOOR);
    // ikan di jalan buntu (koleksi)
    const ends: number[] = [];
    for (let cy = 0; cy < 5; cy++)
      for (let cx = 0; cx < C; cx++) if (deg[cy * C + cx] === 1 && !(cx === 0 && cy === 2) && !(cx === C - 1 && cy === ey)) ends.push(cy * C + cx);
    ends.sort(() => Math.random() - 0.5);
    for (const e of ends.slice(0, 2)) {
      const [fx, fy] = tile(e % C, Math.floor(e / C));
      fish.add(fy * w + fx);
    }
    // Ruang Pintu, kolom pintu & lorong
    const chamberX0 = x0 + wm;
    for (let x = chamberX0; x < chamberX0 + 3; x++) for (let y = 1; y < MAP_H - 1; y++) set(x, y, T_FLOOR);
    const doorX = chamberX0 + 3;
    const rows = Array.from({ length: k }, (_, j) => MID - (k - 1) + 2 * j);
    rows.forEach((y, j) => {
      set(doorX, y, T_DOOR);
      doors.push({ room: r, k: j, x: doorX, y, state: "closed" });
    });
    for (let y = Math.min(rows[0], MID); y <= Math.max(rows[k - 1], MID); y++) set(doorX + 1, y, T_FLOOR);
    for (let x = x0; x <= doorX + 1; x++) for (let y = 0; y < MAP_H; y++) room[y * w + x] = r;
    rooms.push({ x0, chamberX0, doorX, theme: r % THEMES.length });
    x0 += wm + 5;
  });
  // ruang Pintu Keluar
  if (counts.length) set(x0, MID, T_FLOOR);
  for (let x = x0 + 1; x <= x0 + 3; x++) for (let y = MID - 1; y <= MID + 1; y++) set(x, y, T_FLOOR);
  set(x0 + 3, MID, T_EXIT);
  return { w, h: MAP_H, tiles, room, rooms, doors, fish, exit: { x: x0 + 3, y: MID } };
}

function makeGame(counts: number[]) {
  const map = buildMap(counts);
  const start = counts.length ? { x: 1, y: MID } : { x: map.exit.x - 2, y: MID };
  return {
    map,
    cx: start.x,
    cy: start.y,
    px: start.x,
    py: start.y,
    camX: start.x,
    camY: start.y,
    moving: null as null | { fx: number; fy: number; tx: number; ty: number; t: number; hop: boolean },
    held: [] as Dir[],
    pad: null as Dir | null,
    /** ketukan singkat tombol arah: tetap satu langkah walau dilepas sebelum frame berikutnya */
    tap: null as Dir | null,
    auto: null as Dir | null,
    stage: "explore" as Stage,
    qi: 0,
    answered: [] as boolean[],
    shownAt: 0,
    lastTick: 0,
    hidden: [] as number[],
    explored: new Uint8Array(map.w * map.h),
    lastRoom: -1,
    fishTaken: 0,
    bumpAt: 0,
    shakeT: -1,
    particles: [] as Particle[],
    floats: [] as FloatText[],
    spikes: [] as { x: number; y: number; t: number }[],
    glow: [] as { x: number; y: number; t: number }[],
    startAt: 0,
    done: false,
  };
}
type Game = ReturnType<typeof makeGame>;

export function MazePlayer(props: {
  gameId: number;
  secondsPerQuestion: number;
  questions: Question[];
  loggedIn: boolean;
  canSave: boolean;
  loginHref: string;
  onExit: () => void;
  autoStart?: boolean;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const { gameId, questions, secondsPerQuestion, onPlayingChange } = props;
  const router = useRouter();
  const toast = useToast();

  const [phase, setPhase] = useState<Phase>("ready");
  const [count, setCount] = useState(3);
  const [level, setLevel] = useState(-1);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [hintsLeft, setHintsLeft] = useState(GAME_HINTS);
  const [hinting, setHinting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [asking, setAsking] = useState(false);
  const [score, setScore] = useState(0);
  const [fishCount, setFishCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [banner, setBanner] = useState<{ text: string; key: number } | null>(null);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const qTimeRef = useRef<HTMLSpanElement>(null);
  const token = useRef<string | null>(null);
  const game = useRef<Game>(makeGame([]));

  const playing = phase === "countdown" || phase === "playing" || phase === "finishing";
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
    if (!playing && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [playing]);
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => undefined);
  };

  const mood = catMood(streak, wrongStreak);
  const q = level >= 0 ? questions[level] : null;

  /* ---------------- efek (satuan kotak) ---------------- */

  const burst = (x: number, y: number, kind: "good" | "water" | "fire" | "fish") => {
    const g = game.current;
    const n = kind === "fish" ? 10 : kind === "good" ? 28 : 30;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      if (kind === "good" || kind === "fish") {
        const v = (kind === "fish" ? 1.4 : 2.2) + Math.random() * 2.6;
        g.particles.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 2,
          life: 0.8,
          max: 0.8,
          color: kind === "fish" ? "#fde047" : ["#facc15", "#4ade80", "#f472b6", "#38bdf8"][i % 4],
          size: 0.05 + Math.random() * 0.06,
          grav: 7,
        });
      } else if (kind === "water")
        g.particles.push({
          x: x - 0.5 + Math.random(),
          y: y - 1.8 - Math.random() * 0.6,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 1.5 + Math.random() * 1.5,
          life: 1.1,
          max: 1.1,
          color: i % 3 ? "#38bdf8" : "#bae6fd",
          size: 0.05 + Math.random() * 0.05,
          grav: 14,
        });
      else
        g.particles.push({
          x: x - 0.35 + Math.random() * 0.7,
          y: y + 0.2 - Math.random() * 0.2,
          vx: (Math.random() - 0.5) * 1.2,
          vy: -1.5 - Math.random() * 2.5,
          life: 0.9,
          max: 0.9,
          color: ["#f97316", "#ef4444", "#facc15"][i % 3],
          size: 0.06 + Math.random() * 0.07,
          grav: -2,
        });
    }
  };
  const float = (x: number, y: number, text: string, color: string, life = 1.3) => game.current.floats.push({ x, y, text, color, life });

  /* ---------------- alur soal (server) ---------------- */

  const showQuestion = useCallback(
    (i: number) => {
      const g = game.current;
      g.stage = "question";
      g.shownAt = performance.now();
      g.lastTick = 0;
      g.hidden = [];
      g.auto = null;
      setHidden([]);
      setLevel(i);
      setFeedback(null);
      setShowExplain(false);
      setAsking(true);
      gameAudio().unlockUp();
      gameAudio().setIntensity(false);
      if (token.current) void questionShownAction(token.current, questions[i].id);
    },
    [questions],
  );

  /** buka pintu yang benar (pintu lain terkunci); tanpa kunci yang sah (koneksi putus) semua pintu dibuka */
  const openDoors = (room: number, k: number) => {
    const g = game.current;
    const ds = g.map.doors.filter((d) => d.room === room);
    const valid = ds.some((d) => d.k === k);
    for (const d of ds) {
      d.state = !valid || d.k === k ? "open" : "locked";
      if (d.state === "open") g.glow.push({ x: d.x, y: d.y, t: 0 });
    }
    gameAudio().unlockUp();
  };

  const answer = useCallback(
    async (k: number) => {
      const g = game.current;
      const i = g.qi;
      if (g.stage !== "question") return;
      g.stage = "checking";
      g.auto = null;
      setChecking(true);
      const elapsed = Math.round(performance.now() - g.shownAt);
      const door = g.map.doors.find((d) => d.room === i && d.k === k);
      try {
        const res = await checkAnswerAction(token.current ?? "", questions[i].id, k, elapsed);
        // balasan dari sesi lama (pemain sudah keluar / main ulang) → abaikan
        if (game.current !== g) return;
        if ("error" in res && res.error) toast.error(res.error);
        const pts = res.correct ? pointsFor(questions[i].points, secondsPerQuestion, elapsed) : 0;
        setFeedback({ choice: k, correct: res.correct, answerIndex: res.answerIndex, explanation: res.explanation ?? null, points: pts });
        setScore((s) => s + pts);
        const audio = gameAudio();
        if (res.correct && door) {
          openDoors(i, k);
          setStreak((s) => {
            audio.correct(s + 1);
            return s + 1;
          });
          setWrongStreak(0);
          burst(door.x, door.y, "good");
          float(door.x, door.y - 0.6, `Benar! +${pts}`, "#4ade80", 1.5);
          // kucing melangkah masuk melewati pintu
          g.auto = "right";
        } else {
          setStreak(0);
          setWrongStreak((s) => s + 1);
          audio.wrong();
          if (door) door.state = "locked";
          const trap: Trap = (["fire", "spikes", "water"] as const)[Math.floor(Math.random() * 3)];
          if (trap === "fire") {
            burst(g.cx, g.cy, "fire");
            audio.burn();
            float(g.cx, g.cy - 0.9, "Panas! 🔥", "#fca5a5");
          } else if (trap === "water") {
            burst(g.cx, g.cy, "water");
            audio.splash();
            float(g.cx, g.cy - 0.9, "Byurr! 💦", "#93c5fd");
          } else {
            g.spikes.push({ x: g.cx, y: g.cy, t: 0 });
            audio.bump();
            float(g.cx, g.cy - 0.9, "Aduh, duri! 🌵", "#fdba74");
          }
          // terpental mundur dari pintu
          if (k >= 0 && tileAt(g, g.cx - 1, g.cy) === T_FLOOR) g.moving = { fx: g.cx, fy: g.cy, tx: g.cx - 1, ty: g.cy, t: 0, hop: true };
          else g.shakeT = 0;
          const ans = res.answerIndex;
          setTimeout(() => {
            if (game.current === g) openDoors(i, ans);
          }, 1000);
        }
      } catch {
        if (game.current !== g) return;
        toast.error("Koneksi terputus saat mengecek jawaban — semua pintu dibuka, lanjut ke ruangan berikutnya.");
        openDoors(i, -1);
      } finally {
        if (game.current === g) {
          g.answered[i] = true;
          g.qi = i + 1;
          g.stage = "explore";
          setChecking(false);
          setAsking(false);
        }
      }
    },
    // openDoors / burst / float hanya memakai ref
     
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
        toast.success(res.personalBest ? `Rekor baru ${res.score} poin tersimpan ke leaderboard 🏆` : `Skor ${res.score} tersimpan. Skor terbaikmu tetap ${res.previousBest}.`);
      router.refresh();
    } catch {
      toast.error("Gagal mengirim skor. Periksa koneksi lalu coba lagi.");
      setPhase("ready");
    }
  }, [router, toast]);

  const takeHint = async () => {
    const g = game.current;
    const i = g.qi;
    if (g.stage !== "question" || hinting || hintsLeft <= 0 || g.hidden.length) return;
    setHinting(true);
    gameAudio().click();
    try {
      const res = await takeHintAction(token.current ?? "", questions[i].id);
      if (game.current !== g) return;
      if (res.error) toast.error(res.error);
      if (typeof res.left === "number") setHintsLeft(res.left);
      if (res.removed && g.qi === i && g.stage === "question") {
        g.hidden = res.removed;
        setHidden(res.removed);
        lockDoors(g, i, res.removed);
      }
    } catch {
      toast.error("Koneksi terputus saat mengambil petunjuk.");
    } finally {
      setHinting(false);
    }
  };

  /* ---------------- kontrol ---------------- */

  // keyboard: panah / WASD (tahan = terus berjalan)
  useEffect(() => {
    if (!playing) return;
    const key = (e: KeyboardEvent): Dir | null => {
      const k = e.key.toLowerCase();
      return k === "arrowup" || k === "w" ? "up" : k === "arrowdown" || k === "s" ? "down" : k === "arrowleft" || k === "a" ? "left" : k === "arrowright" || k === "d" ? "right" : null;
    };
    const down = (e: KeyboardEvent) => {
      const d = key(e);
      if (!d) return;
      e.preventDefault();
      const g = game.current;
      g.auto = null;
      if (!g.held.includes(d)) g.held.push(d);
    };
    const up = (e: KeyboardEvent) => {
      const d = key(e);
      if (d) game.current.held = game.current.held.filter((x) => x !== d);
    };
    const blur = () => {
      game.current.held = [];
      game.current.pad = null;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [playing]);

  // geser layar: kucing berlari otomatis mengikuti lorong sampai persimpangan
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
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    game.current.auto = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  };
  // tombol arah: tahan = terus berjalan (dilepas di mana pun → berhenti)
  const press = (d: Dir) => {
    const g = game.current;
    g.auto = null;
    g.pad = d;
    g.tap = d;
  };
  useEffect(() => {
    if (!playing) return;
    // fase capture: tetap terpanggil walau handler lain menghentikan propagasi
    const release = () => {
      game.current.pad = null;
    };
    const opts = { capture: true };
    window.addEventListener("pointerup", release, opts);
    window.addEventListener("pointercancel", release, opts);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("pointerup", release, opts);
      window.removeEventListener("pointercancel", release, opts);
      document.removeEventListener("visibilitychange", release);
    };
  }, [playing]);
  const onPadDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    press(e.currentTarget.dataset.dir as Dir);
  };
  // dilepas / sentuhan batal / jari keluar dari tombol → berhenti
  const onPadUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (game.current.pad === e.currentTarget.dataset.dir) game.current.pad = null;
  };
  const padProps = {
    onPointerDown: onPadDown,
    onPointerUp: onPadUp,
    onPointerCancel: onPadUp,
    onLostPointerCapture: onPadUp,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  /* ---------------- mulai ---------------- */

  const begin = () => {
    if (window.matchMedia("(pointer: coarse)").matches && !document.fullscreenElement)
      void document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => undefined);
    const audio = gameAudio();
    audio.unlock();
    audio.click();
    audio.startMusic();
    game.current = makeGame(questions.map(optionCount));
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
    setAsking(false);
    setChecking(false);
    setBanner(null);
    setCount(3);
    setPhase("countdown");
    token.current = null;
    const g = game.current;
    startPlayAction(gameId, "maze")
      .then((r) => {
        if (game.current !== g) return;
        if (r.token) token.current = r.token;
        else {
          toast.error(r.error ?? "Gagal memulai game.");
          gameAudio().stopMusic(0.1);
          setPhase("ready");
        }
      })
      .catch(() => {
        if (game.current !== g) return;
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

    const walkable = (g: Game, x: number, y: number) => {
      const t = tileAt(g, x, y);
      if (t === T_FLOOR || t === T_EXIT) return true;
      if (t === T_DOOR) return g.map.doors.find((d) => d.x === x && d.y === y)?.state === "open";
      return false;
    };

    /** sampai di kotak baru: ikan, ruangan, Ruang Pintu, pintu keluar, lari otomatis */
    const arrive = (g: Game, from: Dir | null) => {
      const { map } = g;
      const idx = g.cy * map.w + g.cx;
      if (map.fish.has(idx)) {
        map.fish.delete(idx);
        g.fishTaken++;
        setFishCount(g.fishTaken);
        burst(g.cx, g.cy, "fish");
        float(g.cx, g.cy - 0.7, "🐟 +1 koleksi", "#fde047", 1);
        gameAudio().coin();
      }
      const r = map.room[idx];
      if (r !== g.lastRoom && r < map.rooms.length && g.cx < map.rooms[r].chamberX0) {
        g.lastRoom = r;
        setBanner({ text: `Ruang ${r + 1}: ${THEMES[map.rooms[r].theme].name}`, key: Date.now() });
      }
      if (tileAt(g, g.cx, g.cy) === T_EXIT && g.qi >= questions.length) {
        g.auto = null;
        g.held = [];
        g.pad = null;
        burst(g.cx, g.cy, "good");
        float(g.cx, g.cy - 0.8, "KELUAR! ☀️", "#fde047", 2);
        void refs.current.finish();
        return;
      }
      const rm = map.rooms[r];
      if (rm && r === g.qi && g.stage === "explore" && !g.answered[r] && g.cx >= rm.chamberX0 && g.cx < rm.doorX) {
        refs.current.showQuestion(r);
        return;
      }
      if (g.auto && from) {
        // ikuti lorong: lanjut hanya bila tepat satu jalan (selain arah datang)
        const back = (Object.keys(DIRS) as Dir[]).find((d) => DIRS[d][0] === -DIRS[from][0] && DIRS[d][1] === -DIRS[from][1]);
        const ways = (Object.keys(DIRS) as Dir[]).filter((d) => d !== back && walkable(g, g.cx + DIRS[d][0], g.cy + DIRS[d][1]));
        g.auto = ways.length === 1 ? ways[0] : null;
      }
    };

    let lastDir: Dir | null = null;
    const tryMove = (g: Game, d: Dir, now: number) => {
      const nx = g.cx + DIRS[d][0];
      const ny = g.cy + DIRS[d][1];
      const t = tileAt(g, nx, ny);
      if (t === T_DOOR) {
        const door = g.map.doors.find((x) => x.x === nx && x.y === ny);
        if (door?.state === "open") {
          g.moving = { fx: g.cx, fy: g.cy, tx: nx, ty: ny, t: 0, hop: false };
          lastDir = d;
          return;
        }
        g.auto = null;
        if (door && door.room === g.qi && g.stage === "question" && door.state === "closed") {
          void refs.current.answer(door.k);
          return;
        }
        if (now - g.bumpAt > 600) {
          g.bumpAt = now;
          g.shakeT = 0;
          gameAudio().bump();
          float(nx, ny - 0.5, door?.state === "locked" ? "🔒 Terkunci" : "Masuk Ruang Pintu dulu", "#e2e8f0", 0.9);
        }
        return;
      }
      if (walkable(g, nx, ny)) {
        g.moving = { fx: g.cx, fy: g.cy, tx: nx, ty: ny, t: 0, hop: false };
        lastDir = d;
        return;
      }
      g.auto = null;
      if (now - g.bumpAt > 450) {
        g.bumpAt = now;
        g.shakeT = 0;
      }
    };

    const step = (dt: number, now: number) => {
      const g = game.current;
      if (phase !== "playing" || g.done) return;
      // waktu soal
      if (g.stage === "question") {
        const left = secondsPerQuestion - (now - g.shownAt) / 1000;
        const sec = Math.ceil(left);
        if (left > 0 && sec <= 5 && sec !== g.lastTick) {
          g.lastTick = sec;
          gameAudio().tick();
          gameAudio().setIntensity(true);
        }
        if (left <= 0) void refs.current.answer(-1);
      }
      // gerak per kotak
      if (g.moving) {
        g.moving.t += dt / (g.moving.hop ? STEP_S * 2.2 : STEP_S);
        const m = g.moving;
        const e = Math.min(1, m.t);
        g.px = m.fx + (m.tx - m.fx) * e;
        g.py = m.fy + (m.ty - m.fy) * e;
        if (m.t >= 1) {
          g.cx = m.tx;
          g.cy = m.ty;
          g.moving = null;
          arrive(g, m.hop ? null : lastDir);
        }
      }
      if (!g.moving && g.stage !== "checking" && !g.done) {
        const d = g.auto ?? g.pad ?? g.tap ?? g.held[g.held.length - 1] ?? null;
        g.tap = null;
        if (d) tryMove(g, d, now);
      }
      if (g.shakeT >= 0) {
        g.shakeT += dt;
        if (g.shakeT > 0.3) g.shakeT = -1;
      }
      // kamera: ikuti kucing; saat soal tampil, pusatkan ke Ruang Pintu agar semua pintu terlihat
      const k = Math.min(1, dt * 8);
      const rmQ = (g.stage === "question" || g.stage === "checking") && g.map.rooms[g.qi];
      g.camX += ((rmQ ? rmQ.chamberX0 + 1.5 : g.px) - g.camX) * k;
      g.camY += ((rmQ ? (g.py + MID) / 2 : g.py) - g.camY) * k;
      // senter: tandai kotak yang sudah terlihat
      const { map } = g;
      for (let y = Math.max(0, Math.floor(g.py - VIEW_R)); y <= Math.min(map.h - 1, Math.ceil(g.py + VIEW_R)); y++)
        for (let x = Math.max(0, Math.floor(g.px - VIEW_R)); x <= Math.min(map.w - 1, Math.ceil(g.px + VIEW_R)); x++)
          if (Math.hypot(x - g.px, y - g.py) <= VIEW_R) g.explored[y * map.w + x] = 1;
      // partikel, teks melayang, duri, kilau pintu
      for (const p of g.particles) {
        p.vy += p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      g.particles = g.particles.filter((p) => p.life > 0);
      for (const f of g.floats) {
        f.y -= dt * 0.9;
        f.life -= dt;
      }
      g.floats = g.floats.filter((f) => f.life > 0);
      for (const s of g.spikes) s.t += dt;
      g.spikes = g.spikes.filter((s) => s.t < 0.9);
      for (const s of g.glow) s.t += dt;
      g.glow = g.glow.filter((s) => s.t < 1.4);
    };

    const draw = (now: number) => {
      const g = game.current;
      const { map } = g;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0b1020";
      ctx.fillRect(0, 0, W, H);
      const T = Math.max(30, Math.min(68, Math.min(W, H) / 7.2));
      // kamera dijepit di tepi peta
      const clampCam = (c: number, view: number, size: number) => {
        const half = view / 2 / T;
        if (size <= view / T) return size / 2 - 0.5;
        return Math.max(half - 0.5, Math.min(size - half - 0.5, c));
      };
      const camX = clampCam(g.camX, W, map.w);
      const camY = clampCam(g.camY, H, map.h);
      const ox = W / 2 - (camX + 0.5) * T;
      const oy = H / 2 - (camY + 0.5) * T;
      const x0 = Math.max(0, Math.floor(-ox / T) - 1);
      const x1 = Math.min(map.w - 1, Math.ceil((W - ox) / T) + 1);
      const y0 = Math.max(0, Math.floor(-oy / T) - 1);
      const y1 = Math.min(map.h - 1, Math.ceil((H - oy) / T) + 1);
      const activeRoom = g.stage === "question" || g.stage === "checking" ? g.qi : -1;
      const lit = (x: number, y: number) => {
        if (activeRoom < 0) return false;
        const rm = map.rooms[activeRoom];
        return map.room[y * map.w + x] === activeRoom && x >= rm.chamberX0 && x <= rm.doorX && y > 0 && y < map.h - 1;
      };

      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * map.w + x;
          const t = map.tiles[i];
          const th = THEMES[map.rooms[Math.min(map.room[i], map.rooms.length - 1)]?.theme ?? 3] ?? THEMES[3];
          const X = ox + x * T;
          const Y = oy + y * T;
          if (t === T_WALL) {
            ctx.fillStyle = th.top;
            ctx.fillRect(X, Y, T + 0.5, T + 0.5);
            if (tileAt(g, x, y + 1) !== T_WALL) {
              ctx.fillStyle = th.wall;
              ctx.fillRect(X, Y + T * 0.68, T + 0.5, T * 0.32 + 0.5);
            }
            continue;
          }
          ctx.fillStyle = th.floor[(x + y) % 2];
          ctx.fillRect(X, Y, T + 0.5, T + 0.5);
          if (t === T_EXIT) {
            const rot = now / 1600;
            ctx.save();
            ctx.translate(X + T / 2, Y + T / 2);
            ctx.fillStyle = "rgba(253,224,71,0.35)";
            for (let k = 0; k < 8; k++) {
              ctx.rotate(Math.PI / 4);
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(T * 1.1 * Math.cos(rot), -T * 0.12);
              ctx.lineTo(T * 1.1 * Math.cos(rot), T * 0.12);
              ctx.fill();
            }
            ctx.fillStyle = "#facc15";
            ctx.beginPath();
            ctx.arc(0, 0, T * 0.34, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            ctx.fillStyle = "#713f12";
            ctx.font = `900 ${Math.round(T * 0.2)}px system-ui`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("KELUAR", X + T / 2, Y + T / 2);
          } else if (t === T_DOOR) {
            const d = map.doors.find((dd) => dd.x === x && dd.y === y);
            if (!d) continue;
            if (d.state === "open") {
              ctx.fillStyle = "#1e293b";
              ctx.fillRect(X, Y, T * 0.12, T);
              ctx.fillRect(X + T * 0.88, Y, T * 0.12, T);
            } else {
              const active = d.room === g.qi && g.stage === "question" && d.state === "closed";
              const pulse = active ? 0.5 + 0.5 * Math.sin(now / 220) : 0;
              ctx.fillStyle = d.state === "locked" ? "#64748b" : OPTION_COLORS[d.k];
              ctx.beginPath();
              ctx.roundRect(X + T * 0.08, Y + T * 0.06, T * 0.84, T * 0.88, T * 0.14);
              ctx.fill();
              if (active) {
                ctx.strokeStyle = `rgba(253,224,71,${0.5 + pulse * 0.5})`;
                ctx.lineWidth = 2 + pulse * 2;
                ctx.stroke();
              }
              ctx.fillStyle = "white";
              ctx.font = `900 ${Math.round(T * 0.5)}px system-ui`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(d.state === "locked" ? "✕" : LETTERS[d.k], X + T / 2, Y + T / 2 + 1);
            }
          }
          if (map.fish.has(i)) {
            ctx.font = `${Math.round(T * 0.5)}px system-ui`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("🐟", X + T / 2, Y + T / 2 + Math.sin(now / 250 + x) * T * 0.05);
          }
        }

      // kilau pintu terbuka
      for (const s of g.glow) {
        const a = 1 - s.t / 1.4;
        ctx.fillStyle = `rgba(253,224,71,${a * 0.55})`;
        ctx.beginPath();
        ctx.arc(ox + (s.x + 0.5) * T, oy + (s.y + 0.5) * T, T * (0.5 + s.t * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
      // duri mencuat
      for (const s of g.spikes) {
        const up = Math.min(1, s.t / 0.12) * (s.t > 0.6 ? 1 - (s.t - 0.6) / 0.3 : 1);
        const X = ox + s.x * T;
        const Y = oy + (s.y + 1) * T;
        ctx.fillStyle = "#94a3b8";
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 5; k++) {
          ctx.beginPath();
          ctx.moveTo(X + T * (0.05 + k * 0.18), Y - T * 0.08);
          ctx.lineTo(X + T * (0.14 + k * 0.18), Y - T * 0.08 - T * 0.55 * up);
          ctx.lineTo(X + T * (0.23 + k * 0.18), Y - T * 0.08);
          ctx.fill();
          ctx.stroke();
        }
      }

      // kabut gelap: senter di sekitar kucing, kotak yang pernah terlihat tampak redup
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x - g.px, y - g.py);
          let a = d <= VIEW_R - 1.4 ? 0 : d <= VIEW_R ? ((d - (VIEW_R - 1.4)) / 1.4) * 0.5 : g.explored[y * map.w + x] ? 0.58 : 0.94;
          if (lit(x, y)) a = Math.min(a, 0.1);
          if (a <= 0) continue;
          ctx.fillStyle = `rgba(5,8,20,${a})`;
          ctx.fillRect(ox + x * T, oy + y * T, T + 0.5, T + 0.5);
        }

      // partikel & teks melayang (di atas kabut)
      for (const p of g.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(ox + (p.x + 0.5) * T, oy + (p.y + 0.5) * T, p.size * T, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const f of g.floats) {
        ctx.globalAlpha = Math.min(1, f.life * 1.5);
        ctx.font = `900 ${Math.round(Math.max(14, T * 0.32))}px system-ui`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(15,23,42,0.85)";
        const fx = ox + (f.x + 0.5) * T;
        const fy = oy + (f.y + 0.5) * T;
        ctx.strokeText(f.text, fx, fy);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, fx, fy);
      }
      ctx.globalAlpha = 1;

      // kompas: panah ke Ruang Pintu berikutnya / pintu keluar
      const target =
        g.stage === "explore"
          ? g.qi < map.rooms.length
            ? { x: map.rooms[g.qi].chamberX0 + 1, y: MID }
            : map.exit
          : null;
      const catSX = ox + (g.px + 0.5) * T;
      const catSY = oy + (g.py + 0.5) * T;
      if (target && Math.hypot(target.x - g.px, target.y - g.py) > 2.5) {
        const ang = Math.atan2(target.y - g.py, target.x - g.px);
        const r = T * 1.05;
        ctx.save();
        ctx.translate(catSX + Math.cos(ang) * r, catSY + Math.sin(ang) * r);
        ctx.rotate(ang);
        ctx.globalAlpha = 0.65 + 0.35 * Math.sin(now / 260);
        ctx.fillStyle = "#facc15";
        ctx.strokeStyle = "#713f12";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(T * 0.24, 0);
        ctx.lineTo(-T * 0.14, -T * 0.16);
        ctx.lineTo(-T * 0.06, 0);
        ctx.lineTo(-T * 0.14, T * 0.16);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // peta mini (kotak yang sudah terlihat)
      const S = W < 420 ? 3 : 4;
      const span = Math.floor(Math.min(46, (W * 0.42) / S) / 2);
      const mx0 = Math.max(0, Math.min(map.w - span * 2, Math.round(g.px) - span));
      const mw = Math.min(map.w, span * 2);
      ctx.fillStyle = "rgba(2,6,23,0.72)";
      ctx.beginPath();
      ctx.roundRect(8, 8, mw * S + 8, map.h * S + 8, 6);
      ctx.fill();
      for (let y = 0; y < map.h; y++)
        for (let x = mx0; x < mx0 + mw; x++) {
          const i = y * map.w + x;
          if (!g.explored[i]) continue;
          const t = map.tiles[i];
          ctx.fillStyle = t === T_WALL ? "#475569" : t === T_DOOR ? "#38bdf8" : t === T_EXIT ? "#facc15" : "#e2e8f0";
          ctx.fillRect(12 + (x - mx0) * S, 12 + y * S, S, S);
        }
      if (target && target.x >= mx0 && target.x < mx0 + mw && Math.sin(now / 200) > 0) {
        ctx.fillStyle = "#f43f5e";
        ctx.fillRect(12 + (target.x - mx0) * S - 1, 12 + target.y * S - 1, S + 2, S + 2);
      }
      ctx.fillStyle = "#facc15";
      ctx.fillRect(12 + (g.px - mx0) * S - 1, 12 + g.py * S - 1, S + 2, S + 2);

      // kucing (elemen DOM di atas kanvas)
      if (catRef.current) {
        const size = T * 1.25;
        const m = g.moving;
        const hop = m ? Math.sin(Math.PI * Math.min(1, m.t)) * T * (m.hop ? 0.45 : 0.08) : 0;
        const shake = g.shakeT >= 0 ? Math.sin(g.shakeT * 60) * T * 0.06 : 0;
        catRef.current.style.width = `${size}px`;
        catRef.current.style.height = `${size}px`;
        catRef.current.style.transform = `translate(${catSX - size / 2 + shake}px, ${catSY + T * 0.45 - size - hop}px)`;
      }
      if (timeRef.current && g.startAt) timeRef.current.textContent = fmtTime(now - g.startAt);
      if (qTimeRef.current) {
        const left = secondsPerQuestion - (now - g.shownAt) / 1000;
        qTimeRef.current.textContent = g.stage === "question" ? `⏱ ${Math.max(0, Math.ceil(left))} dtk` : "";
        qTimeRef.current.className = cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black", g.stage !== "question" ? "hidden" : left < 5 ? "animate-pulse bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-700");
      }
    };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(dt, now);
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // burst / float hanya memakai ref
     
  }, [playing, phase, questions, secondsPerQuestion]);

  // keadaan untuk uji otomatis (hanya saat development)
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __maze: unknown }).__maze = game.current;
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

  if (!questions.length) return <div className="card text-sm text-navy-400">Game ini belum memiliki soal.</div>;

  if (phase === "result" && result) return <ResultCelebration result={result} onReplay={() => setPhase("ready")} canSave={props.canSave} />;

  /* ---------------- layar siap ---------------- */
  if (phase === "ready") {
    return (
      <div className="card animate-fade-up space-y-5 p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <GameCat mood="girang" className="h-24 w-24 shrink-0" />
          <div>
            <h2 className="text-xl font-extrabold text-navy-900">Mode Labirin: Cari Jalan Pulang</h2>
            <p className="text-sm text-navy-500">Si kucing tersesat di labirin gelap! Jelajahi lorongnya dan lewati pintu jawaban yang benar sampai ke pintu keluar.</p>
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-2 text-sm text-navy-700 sm:grid-cols-2">
          <li className="rounded-2xl bg-brand-50 p-3">🕹️ Gerakkan kucing: panah / WASD (tahan = terus jalan), tombol arah, atau geser layar untuk berlari menyusuri lorong.</li>
          <li className="rounded-2xl bg-brand-50 p-3">🚪 Masuk Ruang Pintu → soal muncul. Jalan masuk ke pintu jawabanmu A / B / C / D.</li>
          <li className="rounded-2xl bg-rose-50 p-3">🔥 Salah pintu? Awas jebakan api, duri, atau siraman air! Lalu pintu yang benar terbuka.</li>
          <li className="rounded-2xl bg-brand-50 p-3">🔦 Labirin gelap — senter menerangi sekitar kucing. Ikuti panah kuning & peta mini.</li>
          <li className="rounded-2xl bg-amber-50 p-3 sm:col-span-2">
            🐟 Ikan tersembunyi di jalan buntu untuk dikoleksi. Waktu menjawab {secondsPerQuestion} detik per soal (mulai saat masuk Ruang Pintu, waktu menjelajah tidak
            dihitung) — skor sama dengan mode klasik.
          </li>
        </ul>
        {!props.loggedIn && (
          <p className="flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 ring-1 ring-amber-100">
            Kamu belum masuk, jadi skor tidak tersimpan ke leaderboard.
            <Link href={props.loginHref} className="inline-flex items-center gap-1 font-bold underline">
              <LogIn className="h-4 w-4" /> Masuk dulu
            </Link>
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={props.onExit} className="btn-ghost">
            <ArrowLeft className="h-4 w-4" /> Pilih mode lain
          </button>
          <button type="button" onClick={begin} className="btn-primary flex-1 py-4 text-base">
            <Play className="h-5 w-5 fill-current" /> Masuk labirin
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- arena (layar penuh, portal ke body) ---------------- */
  const n = q ? optionCount(q) : 0;
  const padBtn = "grid h-12 w-12 place-items-center rounded-2xl bg-white/25 text-white ring-1 ring-white/40 backdrop-blur active:bg-white/50 sm:h-11 sm:w-11";
  return createPortal(
    <div className="fixed inset-0 z-[99] flex flex-col bg-navy-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden bg-white sm:my-3 sm:rounded-3xl">
        {/* panel soal */}
        <div className="max-h-[40svh] shrink-0 overflow-y-auto border-b border-navy-100 bg-white p-3 sm:p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap rounded-full bg-navy-900 px-2.5 py-1 text-xs font-bold text-white">
              {q ? `Soal ${level + 1}/${questions.length}` : `0/${questions.length}`}
            </span>
            <span ref={qTimeRef} className="hidden" />
            <div className="ml-auto flex items-center gap-1.5">
              {asking && (
                <button
                  type="button"
                  onClick={takeHint}
                  disabled={hinting || hintsLeft <= 0 || hidden.length > 0 || n <= 2 || checking}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-sun-400 px-2.5 py-1 text-xs font-bold text-navy-900 disabled:opacity-40"
                >
                  {hinting ? <Spinner /> : <Lightbulb className="h-3.5 w-3.5" />} 50:50 ({hintsLeft})
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
                  game.current.done = true;
                  setPhase("ready");
                }}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold",
                  confirmExit ? "bg-rose-500 text-white" : "bg-navy-50 text-navy-600",
                )}
              >
                <LogOut className="h-3.5 w-3.5" /> {confirmExit ? "Yakin keluar?" : "Keluar"}
              </button>
              {typeof document !== "undefined" && document.fullscreenEnabled && (
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-600"
                  aria-label={fullscreen ? "Keluar dari layar penuh" : "Layar penuh"}
                  title={fullscreen ? "Keluar dari layar penuh" : "Layar penuh"}
                >
                  {fullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          </div>
          {q && (asking || feedback) ? (
            <>
              <MathText as="p" text={q.text} className="font-bold leading-snug text-navy-900" />
              <div className={cn("mt-2 grid gap-1.5", n > 2 ? "grid-cols-2" : "grid-cols-1")}>
                {q.options.slice(0, 5).map((o, k) => {
                  const isRight = feedback && k === feedback.answerIndex;
                  const isWrong = feedback && k === feedback.choice && !feedback.correct;
                  const off = !feedback && hidden.includes(k);
                  return (
                    <div
                      key={k}
                      className={cn(
                        "flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-sm ring-1",
                        isRight ? "bg-emerald-50 ring-emerald-300" : isWrong ? "bg-rose-50 ring-rose-300" : off ? "bg-navy-50 opacity-40 ring-navy-100" : "bg-navy-50/60 ring-navy-100",
                      )}
                    >
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white"
                        style={{ background: isRight ? "#22c55e" : isWrong ? "#ef4444" : off ? "#94a3b8" : OPTION_COLORS[k] }}
                      >
                        {LETTERS[k]}
                      </span>
                      <MathText text={o} className={cn("min-w-0 wrap-break-word", off && "line-through")} />
                    </div>
                  );
                })}
              </div>
              {checking && (
                <p className="mt-2 flex items-center gap-2 text-sm text-navy-500">
                  <Spinner /> Membuka pintu…
                </p>
              )}
              {feedback ? (
                <div className={cn("mt-2 rounded-xl p-2.5 text-sm", feedback.correct ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>
                  <p className="font-bold">
                    {feedback.correct
                      ? `Benar! +${feedback.points} poin 😺`
                      : feedback.choice === -1
                        ? `Waktu habis — jawabannya ${LETTERS[feedback.answerIndex] ?? "-"}.`
                        : `Kurang tepat — jawabannya ${LETTERS[feedback.answerIndex] ?? "-"}.`}{" "}
                    <span className="font-semibold text-navy-600">
                      {level + 1 < questions.length ? "Pintunya terbuka — cari Ruang Pintu berikutnya!" : "Cari PINTU KELUAR ☀️"}
                    </span>
                  </p>
                  {feedback.explanation && (
                    <>
                      <button type="button" className="mt-1 text-xs font-bold underline" onClick={() => setShowExplain((v) => !v)}>
                        {showExplain ? "Sembunyikan pembahasan" : "Lihat pembahasan"}
                      </button>
                      {showExplain && <MathText as="p" text={feedback.explanation} className="mt-1 whitespace-pre-line text-navy-700" />}
                    </>
                  )}
                </div>
              ) : (
                !checking && <p className="mt-2 text-xs font-semibold text-navy-500">Jalan masuk ke pintu jawabanmu. Hati-hati, pintu yang salah berjebakan!</p>
              )}
            </>
          ) : (
            <p className="text-sm font-semibold text-navy-600">
              {phase === "countdown" ? "Bersiap… nyalakan senter! 🔦" : "Jelajahi labirin & temukan Ruang Pintu 🚪 — ikuti panah kuning."}
            </p>
          )}
        </div>

        {/* arena */}
        <div className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-[#0b1020]" onPointerDown={onArenaDown} onPointerUp={onArenaUp}>
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          <div ref={catRef} className="pointer-events-none absolute left-0 top-0 will-change-transform">
            <GameCat mood={mood} className="h-full w-full" />
          </div>
          <div className="pointer-events-none absolute right-2 top-2 rounded-2xl bg-navy-950/70 px-3 py-1.5 text-right text-white backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-200">Skor</p>
            <p className="text-lg font-extrabold leading-none">{score}</p>
            <p className="mt-1 text-xs font-bold text-amber-300">🐟 {fishCount}</p>
            <p className="mt-0.5 font-mono text-xs text-brand-100">
              ⏱ <span ref={timeRef}>00:00</span>
            </p>
          </div>
          {streak >= 2 && (
            <div className="pointer-events-none absolute left-2 top-14 animate-pop rounded-2xl bg-orange-500/90 px-3 py-1 text-sm font-black text-white shadow-lg">🔥 x{streak}</div>
          )}
          {banner && (
            <div key={banner.key} className="duel-banner pointer-events-none absolute inset-x-0 top-[18%] text-center">
              <span className="inline-block rounded-2xl bg-navy-950/75 px-4 py-2 text-base font-black text-white shadow-xl">{banner.text}</span>
            </div>
          )}
          {phase === "countdown" && (
            <div className="absolute inset-0 grid place-items-center bg-navy-950/40">
              <span key={count} className="animate-pop text-7xl font-black text-white drop-shadow-lg">
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
          {/* tombol arah (tahan = terus berjalan) */}
          <div className="absolute bottom-3 left-3 grid grid-cols-3 gap-1.5">
            <span />
            <button type="button" aria-label="Atas" className={padBtn} data-dir="up" {...padProps}>
              <ArrowUp className="h-6 w-6" />
            </button>
            <span />
            <button type="button" aria-label="Kiri" className={padBtn} data-dir="left" {...padProps}>
              <ArrowLeft className="h-6 w-6" />
            </button>
            <button type="button" aria-label="Bawah" className={padBtn} data-dir="down" {...padProps}>
              <ArrowDown className="h-6 w-6" />
            </button>
            <button type="button" aria-label="Kanan" className={padBtn} data-dir="right" {...padProps}>
              <ArrowRight className="h-6 w-6" />
            </button>
          </div>
          <p className="pointer-events-none absolute bottom-3 right-3 hidden rounded-lg bg-navy-950/50 px-2 py-1 text-[11px] text-brand-100 pointer-fine:block">
            Panah / WASD: jalan (tahan) · geser layar: lari menyusuri lorong
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function tileAt(g: Game, x: number, y: number) {
  const { map } = g;
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return T_WALL;
  return map.tiles[y * map.w + x];
}

/** pintu yang disembunyikan petunjuk 50:50 → terkunci */
function lockDoors(g: Game, room: number, ks: number[]) {
  for (const d of g.map.doors) if (d.room === room && ks.includes(d.k)) d.state = "locked";
}

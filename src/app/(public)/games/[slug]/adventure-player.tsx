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
} from "lucide-react";
import {
  checkAnswerAction,
  collectStarAction,
  questionShownAction,
  startPlayAction,
  submitScoreAction,
  takeHintAction,
  type AdventureStar,
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
 * Mode Petualangan: soal yang sama dengan mode klasik, disajikan sebagai game lompat-lompat ke atas.
 * Kucing kuning naik lantai demi lantai; tiap lantai = 1 soal dengan jalur A/B/C/D… berisi tombol.
 * Menjawab = melompat lalu menginjak tombol di jalur pilihan. Kunci jawaban, waktu & skor tetap dicatat
 * server (startPlay → questionShown → checkAnswer → submitScore), sama persis dengan mode klasik.
 *
 * Dunia: lebar 360 unit, sumbu y ke ATAS. Semua pijakan "satu arah" (bisa ditembus dari bawah, dipijak dari atas).
 * Pijakan ke lantai berikutnya baru aktif setelah soal lantai ini dijawab, jadi soal tidak bisa dilewati.
 */

type Question = { id: number; text: string; options: string[]; points: number };
type Phase = "ready" | "countdown" | "playing" | "finishing" | "result";

const W = 360;
const GAP = 210; // jarak antar lantai
const STEP_RISE = 105; // pijakan di tengah antar lantai
const GRAV = 1900;
const JUMP_V = 690; // tinggi lompat ±125
const SPEED = 205;
const CAT_W = 26; // kotak tabrakan
const CAT_VIEW = 50; // ukuran gambar kucing
const DIV_H = 30; // sekat antar jalur
/** lebar tombol maksimum; menyempit bila pilihan banyak agar ada ruang aman di kiri-kanannya */
const BTN_W = 34;
/** tombol = pelat rendah: bisa dinaiki sambil berjalan (naik otomatis) atau diinjak dari lompatan */
const BTN_H = 7;
const STEP_UP = 9;
/** berdiri di tombol selama ini untuk memilih (lewat sekilas saat menyeberang jalur tidak terhitung) */
const HOLD_MS = 900;
const LETTERS = ["A", "B", "C", "D", "E"];
const OPTION_COLORS = ["#1a6f9f", "#0ea5e9", "#eab308", "#2563eb", "#14b8a6"];

type Plat = {
  kind: "ground" | "step" | "row" | "finish" | "btn" | "wall";
  lvl: number;
  x1: number;
  x2: number;
  y: number;
  h: number;
  k?: number;
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
type Feedback = {
  choice: number;
  correct: boolean;
  answerIndex: number;
  explanation: string | null;
  points: number;
};

/** Skor per soal sama dengan server: poin penuh bila instan, minimal 50% bila benar setelah batas waktu */
function pointsFor(base: number, secondsLimit: number, elapsedMs: number) {
  const limitMs = secondsLimit * 1000;
  const remaining = Math.max(0, limitMs - Math.min(elapsedMs, limitMs));
  return Math.round(base * (0.5 + 0.5 * (remaining / limitMs)));
}

const fmtTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Susun dunia: tanah, lalu per soal: pijakan tengah + lantai berisi jalur & tombol; terakhir garis FINISH */
function buildWorld(questions: Question[]) {
  const plats: Plat[] = [
    { kind: "ground", lvl: -1, x1: 0, x2: W, y: 0, h: 40 },
  ];
  questions.forEach((q, i) => {
    const left = i % 2 === 0;
    plats.push({
      kind: "step",
      lvl: i,
      x1: left ? 22 : 226,
      x2: left ? 134 : 338,
      y: i * GAP + STEP_RISE,
      h: 12,
    });
    const rowY = (i + 1) * GAP;
    plats.push({ kind: "row", lvl: i, x1: 0, x2: W, y: rowY, h: 14 });
    const n = Math.max(2, Math.min(5, q.options.length));
    const cell = W / n;
    for (let k = 1; k < n; k++)
      plats.push({
        kind: "wall",
        lvl: i,
        x1: k * cell - 3,
        x2: k * cell + 3,
        y: rowY + DIV_H,
        h: DIV_H,
      });
    const bw = Math.min(BTN_W, cell * 0.36);
    for (let k = 0; k < n; k++) {
      const cx = (k + 0.5) * cell;
      plats.push({
        kind: "btn",
        lvl: i,
        k,
        x1: cx - bw / 2,
        x2: cx + bw / 2,
        y: rowY + BTN_H,
        h: BTN_H,
      });
    }
  });
  const n = questions.length;
  const left = n % 2 === 0;
  plats.push({
    kind: "step",
    lvl: n,
    x1: left ? 22 : 226,
    x2: left ? 134 : 338,
    y: n * GAP + STEP_RISE,
    h: 12,
  });
  plats.push({ kind: "finish", lvl: n, x1: 0, x2: W, y: (n + 1) * GAP, h: 14 });
  return { plats, top: (n + 1) * GAP };
}

export function AdventurePlayer(props: {
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

  const [phase, setPhase] = useState<Phase>("ready");
  const [count, setCount] = useState(3);
  const [level, setLevel] = useState(-1); // soal yang sedang tampil (-1 = belum naik ke lantai 1)
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [hintsLeft, setHintsLeft] = useState(GAME_HINTS);
  const [hinting, setHinting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [score, setScore] = useState(0);
  const [starCount, setStarCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [showExplain, setShowExplain] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const bonusRef = useRef<HTMLSpanElement>(null);
  const token = useRef<string | null>(null);
  const input = useRef({
    left: false,
    right: false,
    jump: false,
    jumpPressedAt: -1,
  });

  // keadaan permainan yang berubah tiap frame disimpan di ref (tanpa render ulang React)
  const game = useRef({
    world: buildWorld(questions),
    cat: {
      x: W / 2,
      y: 0,
      vx: 0,
      vy: 0,
      face: 1,
      ground: null as Plat | null,
      lastGroundLvl: -2,
      lastGroundKind: "ground" as Plat["kind"],
      coyote: 0,
    },
    camY: -30,
    answered: [] as boolean[],
    chosen: [] as (Feedback | null)[],
    hidden: [] as number[],
    active: -1, // lantai yang soalnya sedang tampil
    shownAt: 0,
    armedAt: 0,
    pending: false,
    startAt: 0,
    particles: [] as Particle[],
    floats: [] as FloatText[],
    unlockPulse: [] as number[], // waktu pijakan lantai tsb terbuka (untuk panah berkedip)
    /** tombol yang sedang diinjak: valid = diinjak SETELAH soal tampil (mendarat saat tiba di lantai tidak dihitung) */
    plate: null as {
      lvl: number;
      k: number;
      at: number;
      valid: boolean;
    } | null,
    /** bintang dari server (+10 tiap bintang); seg = jeda antar lantai, terbuka setelah seg soal dijawab */
    stars: [] as (AdventureStar & { taken: boolean })[],
    done: false,
  });

  const playing =
    phase === "countdown" || phase === "playing" || phase === "finishing";
  useEffect(() => {
    onPlayingChange?.(phase !== "ready");
  }, [phase, onPlayingChange]);
  useEffect(() => () => gameAudio().stopMusic(0.1), []);

  const mood = catMood(streak, wrongStreak);
  const q = level >= 0 ? questions[level] : null;

  /* ---------------- alur soal (server) ---------------- */

  const activate = useCallback(
    (i: number) => {
      const g = game.current;
      if (g.active === i || g.answered[i]) return;
      g.active = i;
      g.shownAt = performance.now();
      g.armedAt = g.shownAt + 350;
      g.hidden = [];
      setHidden([]);
      setLevel(i);
      setFeedback(null);
      setShowExplain(false);
      if (token.current)
        void questionShownAction(token.current, questions[i].id);
    },
    [questions],
  );

  const burst = (x: number, y: number, kind: "good" | "water" | "fire") => {
    const g = game.current;
    for (let i = 0; i < (kind === "good" ? 26 : 34); i++) {
      if (kind === "good") {
        const a = Math.random() * Math.PI * 2;
        const v = 90 + Math.random() * 160;
        g.particles.push({
          x,
          y: y + 24,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v + 120,
          life: 0.9,
          max: 0.9,
          color: ["#facc15", "#4ade80", "#f472b6", "#38bdf8"][i % 4],
          size: 3 + Math.random() * 3,
          grav: 500,
        });
      } else if (kind === "water") {
        g.particles.push({
          x: x - 26 + Math.random() * 52,
          y: y + 90 + Math.random() * 40,
          vx: (Math.random() - 0.5) * 30,
          vy: -60 - Math.random() * 80,
          life: 1.1,
          max: 1.1,
          color: i % 3 ? "#38bdf8" : "#bae6fd",
          size: 2.5 + Math.random() * 2.5,
          grav: 900,
        });
      } else {
        g.particles.push({
          x: x - 18 + Math.random() * 36,
          y: y + Math.random() * 10,
          vx: (Math.random() - 0.5) * 60,
          vy: 80 + Math.random() * 140,
          life: 0.9,
          max: 0.9,
          color: ["#f97316", "#ef4444", "#facc15"][i % 3],
          size: 3 + Math.random() * 4,
          grav: -120,
        });
      }
    }
  };

  const answer = useCallback(
    async (i: number, k: number) => {
      const g = game.current;
      if (g.pending || g.answered[i] || g.active !== i) return;
      g.pending = true;
      setChecking(true);
      const elapsed = Math.round(performance.now() - g.shownAt);
      gameAudio().press();
      try {
        const res = await checkAnswerAction(
          token.current ?? "",
          questions[i].id,
          k,
          elapsed,
        );
        if ("error" in res && res.error) toast.error(res.error);
        const pts = res.correct
          ? pointsFor(questions[i].points, secondsPerQuestion, elapsed)
          : 0;
        const fb: Feedback = {
          choice: k,
          correct: res.correct,
          answerIndex: res.answerIndex,
          explanation: res.explanation ?? null,
          points: pts,
        };
        g.answered[i] = true;
        g.chosen[i] = fb;
        g.unlockPulse[i + 1] = performance.now();
        setFeedback(fb);
        setScore((s) => s + pts);
        const c = g.cat;
        if (res.correct) {
          setStreak((s) => {
            gameAudio().correct(s + 1);
            return s + 1;
          });
          setWrongStreak(0);
          burst(c.x, c.y, "good");
          g.floats.push({
            x: c.x,
            y: c.y + 70,
            text: `+${pts}`,
            color: "#4ade80",
            life: 1.4,
          });
        } else {
          setStreak(0);
          setWrongStreak((s) => s + 1);
          const water = Math.random() < 0.5;
          burst(c.x, c.y, water ? "water" : "fire");
          if (water) gameAudio().splash();
          else gameAudio().burn();
          gameAudio().wrong();
          g.floats.push({
            x: c.x,
            y: c.y + 70,
            text: water ? "Byurr! 💦" : "Panas! 🔥",
            color: "#fca5a5",
            life: 1.4,
          });
        }
        setTimeout(() => gameAudio().unlockUp(), 650);
      } catch {
        toast.error(
          "Koneksi terputus saat mengecek jawaban. Injak tombolnya lagi.",
        );
      } finally {
        g.pending = false;
        setChecking(false);
        // gagal (koneksi) → injak ulang untuk mencoba lagi
        if (!g.answered[i] && g.plate) g.plate.valid = false;
      }
    },
    [questions, secondsPerQuestion, toast],
  );

  const finish = useCallback(async () => {
    const g = game.current;
    if (g.done) return;
    g.done = true;
    setPhase("finishing");
    gameAudio().stopMusic();
    try {
      const res = await submitScoreAction(token.current ?? "");
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
    const i = g.active;
    if (i < 0 || g.answered[i] || hinting || hintsLeft <= 0 || g.hidden.length)
      return;
    setHinting(true);
    gameAudio().click();
    try {
      const res = await takeHintAction(token.current ?? "", questions[i].id);
      if (res.error) toast.error(res.error);
      if (typeof res.left === "number") setHintsLeft(res.left);
      if (res.removed && !g.answered[i]) {
        g.hidden = res.removed;
        setHidden(res.removed);
      }
    } catch {
      toast.error("Koneksi terputus saat mengambil petunjuk.");
    } finally {
      setHinting(false);
    }
  };

  /* ---------------- mulai ---------------- */

  const begin = () => {
    // HP/tablet: sekalian layar penuh browser (sembunyikan bilah alamat). iPhone tidak mendukung → tetap mode penuh di halaman
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
    game.current = {
      ...game.current,
      world: buildWorld(questions),
      cat: {
        x: W / 2,
        y: 0,
        vx: 0,
        vy: 0,
        face: 1,
        ground: null,
        lastGroundLvl: -2,
        lastGroundKind: "ground",
        coyote: 0,
      },
      camY: -30,
      answered: [],
      chosen: [],
      hidden: [],
      active: -1,
      pending: false,
      particles: [],
      floats: [],
      unlockPulse: [performance.now()],
      plate: null,
      stars: [],
      done: false,
    };
    setLevel(-1);
    setFeedback(null);
    setHidden([]);
    setHintsLeft(GAME_HINTS);
    setScore(0);
    setStarCount(0);
    setStreak(0);
    setWrongStreak(0);
    setResult(null);
    setConfirmExit(false);
    setCount(3);
    setPhase("countdown");
    token.current = null;
    startPlayAction(gameId, "adventure")
      .then((r) => {
        if (r.token) {
          token.current = r.token;
          game.current.stars = (r.stars ?? []).map((s) => ({
            ...s,
            taken: false,
          }));
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

  // layar penuh: arena menutupi header & tombol chat; halaman di belakang tidak ikut tergulir
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [playing]);
  // keluar dari layar penuh browser saat permainan selesai / keluar
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

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    if (!playing) return;
    const set = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      const i = input.current;
      if (k === "arrowleft" || k === "a") i.left = down;
      else if (k === "arrowright" || k === "d") i.right = down;
      else if (k === "arrowup" || k === "w" || k === " ") {
        if (down && !i.jump) i.jumpPressedAt = performance.now();
        i.jump = down;
      } else return;
      // jangan menggulir halaman saat bermain
      const t = e.target as HTMLElement | null;
      if (!t || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
        e.preventDefault();
    };
    const down = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      input.current = {
        left: false,
        right: false,
        jump: false,
        jumpPressedAt: -1,
      };
    };
  }, [playing]);

  /* ---------------- loop: fisika + gambar ---------------- */

  const answerRef = useRef(answer);
  const activateRef = useRef(activate);
  const finishRef = useRef(finish);
  useEffect(() => {
    answerRef.current = answer;
    activateRef.current = activate;
    finishRef.current = finish;
  });

  useEffect(() => {
    if (!playing) return;
    const canvas = canvasRef.current;
    const wrap = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return;
    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      cssW = r.width;
      cssH = r.height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    // hanya saat pengembangan: buka keadaan game untuk uji otomatis (tidak ada di build produksi)
    if (process.env.NODE_ENV !== "production")
      (window as unknown as { __adventure?: unknown }).__adventure =
        game.current;
    const isActive = (p: Plat) => {
      const g = game.current;
      if (p.kind === "ground") return true;
      if (p.kind === "finish") return !!g.answered[questions.length - 1];
      return p.lvl === 0 || !!g.answered[p.lvl - 1];
    };

    const step = (dt: number, now: number) => {
      const g = game.current;
      const c = g.cat;
      const inp = input.current;
      if (phase !== "playing") return;
      // gerak kiri-kanan
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const target = dir * SPEED;
      const accel = c.ground ? 1800 : 1100;
      c.vx +=
        Math.sign(target - c.vx) *
        Math.min(Math.abs(target - c.vx), accel * dt);
      if (dir) c.face = dir;
      // lompat (dengan "coyote time" & buffer agar terasa responsif)
      c.coyote = c.ground ? 0.09 : Math.max(0, c.coyote - dt);
      if (
        inp.jumpPressedAt > 0 &&
        now - inp.jumpPressedAt < 130 &&
        c.coyote > 0
      ) {
        c.vy = JUMP_V;
        c.coyote = 0;
        c.ground = null;
        inp.jumpPressedAt = -1;
        gameAudio().jump();
      }
      // lompatan selalu penuh (ketukan singkat di HP pun sampai ke pijakan berikutnya)
      c.vy -= GRAV * dt;
      const prevY = c.y;
      c.x = Math.max(CAT_W / 2, Math.min(W - CAT_W / 2, c.x + c.vx * dt));
      c.y += c.vy * dt;

      const wasGround = c.ground;
      c.ground = null;
      for (const p of g.world.plats) {
        // sekat antar jalur hanya penanda visual: kucing bebas berjalan kiri-kanan
        // (salah pilih dicegah oleh aturan "berdiri di tombol ±0,9 dtk", bukan oleh sekat)
        if (p.kind === "wall" || !isActive(p)) continue;
        const half = CAT_W / 2;
        // tombol baru terinjak bila TENGAH badan kucing di atasnya (ruang aman untuk ancang-ancang di sampingnya)
        const overlapX =
          p.kind === "btn"
            ? c.x >= p.x1 && c.x <= p.x2
            : c.x + half > p.x1 && c.x - half < p.x2;
        if (!overlapX) continue;
        const top = p.y;
        const pressed = p.kind === "btn" && g.chosen[p.lvl]?.choice === p.k;
        const surface = pressed ? top - BTN_H / 2 : top;
        // mendarat dari atas
        if (c.vy <= 0 && prevY >= surface - 0.5 && c.y <= surface) {
          c.y = surface;
          c.vy = 0;
          c.ground = p;
          continue;
        }
        // naik otomatis ke pelat tombol saat berjalan di lantai yang sama
        if (
          p.kind === "btn" &&
          c.vy <= 0 &&
          c.y < surface &&
          c.y >= surface - STEP_UP &&
          prevY >= surface - STEP_UP - 0.5
        ) {
          c.y = surface;
          c.vy = 0;
          c.ground = p;
          continue;
        }
      }
      if (c.y < 0) {
        c.y = 0;
        c.vy = 0;
        c.ground = g.world.plats[0];
      }

      // baru mendarat
      if (c.ground && c.ground !== wasGround) {
        const p = c.ground;
        if (!wasGround) gameAudio().land();
        // tiba di lantai berikutnya → soal tampil
        const arriving =
          (p.kind === "row" || p.kind === "btn" || p.kind === "wall") &&
          !g.answered[p.lvl] &&
          g.active !== p.lvl;
        if (arriving) activateRef.current(p.lvl);
        if (p.kind === "finish" && !g.done) finishRef.current();
        // menginjak tombol jawaban: mulai hitung "tahan"; mendarat di tombol saat baru tiba tidak dihitung
        if (
          p.kind === "btn" &&
          p.k != null &&
          g.active === p.lvl &&
          !g.answered[p.lvl]
        ) {
          if (g.hidden.includes(p.k))
            g.floats.push({
              x: c.x,
              y: c.y + 60,
              text: "Jalur ditutup",
              color: "#cbd5e1",
              life: 1,
            });
          g.plate = {
            lvl: p.lvl,
            k: p.k,
            at: now,
            valid:
              !arriving &&
              !g.hidden.includes(p.k) &&
              c.lastGroundKind !== "step",
          };
          if (g.plate.valid) gameAudio().click();
          else if (!g.hidden.includes(p.k))
            g.floats.push({
              x: c.x,
              y: c.y + 60,
              text: "Turun lalu injak lagi",
              color: "#fde68a",
              life: 1.1,
            });
        }
        c.lastGroundLvl = p.lvl;
        c.lastGroundKind = p.kind;
      }

      // ambil bintang (+10): hanya di jeda lantai yang sudah terbuka; skor resmi dihitung server
      const answeredCount = g.answered.filter(Boolean).length;
      for (const s of g.stars) {
        if (s.taken || s.seg > answeredCount) continue;
        if (Math.hypot(s.x - c.x, s.y - (c.y + 16)) > 22) continue;
        s.taken = true;
        gameAudio().coin();
        g.floats.push({
          x: s.x,
          y: s.y + 18,
          text: "+10 ⭐",
          color: "#fde047",
          life: 1.1,
        });
        for (let i = 0; i < 12; i++) {
          const a = (Math.PI * 2 * i) / 12;
          g.particles.push({
            x: s.x,
            y: s.y,
            vx: Math.cos(a) * 120,
            vy: Math.sin(a) * 120,
            life: 0.5,
            max: 0.5,
            color: "#fde047",
            size: 2.5,
            grav: 0,
          });
        }
        setScore((v) => v + 10);
        setStarCount((v) => v + 1);
        if (token.current)
          void collectStarAction(token.current, s.id).then((r) => {
            // ditolak server (mis. sesi kedaluwarsa) → batalkan tambahan di layar
            if (!r.ok) {
              setScore((v) => v - 10);
              setStarCount((v) => v - 1);
            }
          });
      }

      // berdiri di tombol cukup lama → jawaban dipilih
      const pl = g.plate;
      if (
        pl &&
        (c.ground?.kind !== "btn" ||
          c.ground.k !== pl.k ||
          c.ground.lvl !== pl.lvl)
      )
        g.plate = null;
      else if (
        pl?.valid &&
        now - pl.at >= HOLD_MS &&
        g.active === pl.lvl &&
        !g.answered[pl.lvl] &&
        !g.pending &&
        now >= g.armedAt
      ) {
        pl.valid = false;
        void answerRef.current(pl.lvl, pl.k);
      }

      // partikel & teks
      g.particles = g.particles.filter((pt) => (pt.life -= dt) > 0);
      for (const pt of g.particles) {
        pt.vy -= pt.grav * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
      }
      g.floats = g.floats.filter((f) => (f.life -= dt) > 0);
      for (const f of g.floats) f.y += 40 * dt;
    };

    const draw = (now: number) => {
      const g = game.current;
      const c = g.cat;
      // menara selebar arena di HP; di layar lebar dibatasi agar ±1,7 lantai terlihat (menara di tengah)
      const scale = Math.min(cssW / W, cssH / 360);
      const TW = W * scale;
      const offX = (cssW - TW) / 2;
      const viewH = cssH / scale;
      // kamera: kucing di ±35% dari bawah, bergerak halus
      const targetCam = Math.max(-30, c.y - viewH * 0.35);
      g.camY += (targetCam - g.camY) * Math.min(1, 0.12);
      const viewTop = g.camY + viewH;
      const sy = (y: number) => (viewTop - y) * scale;
      const sx = (x: number) => x * scale;

      // langit: makin tinggi makin gelap berbintang
      const prog = Math.min(1, Math.max(0, g.camY / g.world.top));
      const sky = ctx.createLinearGradient(0, 0, 0, cssH);
      sky.addColorStop(0, prog > 0.5 ? "#0b2638" : "#133e57");
      sky.addColorStop(1, prog > 0.5 ? "#133e57" : "#1a6f9f");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cssW, cssH);
      // bintang (paralaks: bergeser lebih lambat dari dunia)
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      const span = cssH + 20;
      for (let i = 0; i < 60; i++) {
        const y =
          ((((i * 211 + g.camY * 0.35 * scale) % span) + span) % span) - 10;
        ctx.fillRect(sx((i * 97) % W), y, 1.6, 1.6);
      }
      // dinding menara
      if (offX > 1) {
        // di luar menara: lebih gelap
        ctx.fillStyle = "rgba(4,16,26,0.45)";
        ctx.fillRect(0, 0, offX, cssH);
        ctx.fillRect(cssW - offX, 0, offX, cssH);
      }
      ctx.save();
      ctx.translate(offX, 0);
      ctx.fillStyle = "rgba(11,38,56,0.55)";
      ctx.fillRect(0, 0, sx(6), cssH);
      ctx.fillRect(TW - sx(6), 0, sx(6), cssH);

      const round = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
      };

      for (const p of g.world.plats) {
        const yTop = sy(p.y);
        if (yTop > cssH + 60 || yTop < -80) continue;
        const active =
          p.kind === "ground" || p.kind === "finish"
            ? true
            : p.lvl === 0 || !!g.answered[p.lvl - 1];
        if (p.kind === "ground") {
          ctx.fillStyle = "#14532d";
          ctx.fillRect(0, yTop, TW, cssH);
          ctx.fillStyle = "#22c55e";
          ctx.fillRect(0, yTop, TW, sx(7));
        } else if (p.kind === "step") {
          if (active) {
            ctx.fillStyle = "#b45309";
            round(sx(p.x1), yTop, sx(p.x2 - p.x1), sx(p.h), sx(4));
            ctx.fill();
            ctx.fillStyle = "#facc15";
            ctx.fillRect(sx(p.x1 + 3), yTop, sx(p.x2 - p.x1 - 6), sx(3));
            // panah berkedip saat baru terbuka
            const since = (now - (g.unlockPulse[p.lvl] ?? -1e9)) / 1000;
            if (since >= 0 && since < 6 && c.y < p.y) {
              const bob = Math.sin(now / 160) * 4;
              ctx.fillStyle = "#fde047";
              ctx.font = `bold ${Math.round(sx(20))}px system-ui`;
              ctx.textAlign = "center";
              ctx.fillText("⬆", sx((p.x1 + p.x2) / 2), yTop - sx(10) + bob);
            }
          } else {
            ctx.setLineDash([sx(5), sx(4)]);
            ctx.strokeStyle = "rgba(255,255,255,0.25)";
            ctx.lineWidth = 1.5;
            round(sx(p.x1), yTop, sx(p.x2 - p.x1), sx(p.h), sx(4));
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = "rgba(255,255,255,0.35)";
            ctx.font = `${Math.round(sx(11))}px system-ui`;
            ctx.textAlign = "center";
            ctx.fillText("🔒 jawab dulu", sx((p.x1 + p.x2) / 2), yTop + sx(10));
          }
        } else if (p.kind === "row") {
          ctx.globalAlpha = active ? 1 : 0.35;
          ctx.fillStyle = "#1e3a5f";
          ctx.fillRect(0, yTop, TW, sx(p.h));
          ctx.fillStyle = "#38bdf8";
          ctx.fillRect(0, yTop, TW, sx(3));
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.font = `bold ${Math.round(sx(9))}px system-ui`;
          ctx.textAlign = "left";
          ctx.fillText(`LANTAI ${p.lvl + 1}`, sx(8), yTop + sx(11));
          // huruf jalur di atas tiap jalur
          const n = Math.max(2, Math.min(5, questions[p.lvl].options.length));
          const cell = W / n;
          const fb = g.chosen[p.lvl];
          for (let k = 0; k < n; k++) {
            const cx = sx((k + 0.5) * cell);
            const y = sy(p.y + 64);
            const hiddenK = g.active === p.lvl && g.hidden.includes(k) && !fb;
            const color = fb
              ? k === fb.answerIndex
                ? "#22c55e"
                : k === fb.choice
                  ? "#ef4444"
                  : "rgba(148,163,184,0.5)"
              : hiddenK
                ? "rgba(100,116,139,0.6)"
                : OPTION_COLORS[k];
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(cx, y, sx(12), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = `bold ${Math.round(sx(13))}px system-ui`;
            ctx.textAlign = "center";
            ctx.fillText(hiddenK ? "✕" : LETTERS[k], cx, y + sx(4.5));
          }
          ctx.globalAlpha = 1;
        } else if (p.kind === "wall") {
          ctx.globalAlpha = active ? 1 : 0.35;
          ctx.fillStyle = "#64748b";
          ctx.fillRect(sx(p.x1), yTop, sx(p.x2 - p.x1), sx(p.h));
          ctx.globalAlpha = 1;
        } else if (p.kind === "btn" && p.k != null) {
          ctx.globalAlpha = active ? 1 : 0.35;
          const fb = g.chosen[p.lvl];
          const pressed = fb?.choice === p.k;
          const hiddenK = g.active === p.lvl && g.hidden.includes(p.k) && !fb;
          const h = pressed ? BTN_H / 2 : BTN_H;
          const color = fb
            ? p.k === fb.answerIndex
              ? "#22c55e"
              : pressed
                ? "#ef4444"
                : "#94a3b8"
            : hiddenK
              ? "#475569"
              : OPTION_COLORS[p.k];
          ctx.fillStyle = color;
          round(sx(p.x1), sy(p.y - BTN_H + h), sx(p.x2 - p.x1), sx(h), sx(3));
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.fillRect(
            sx(p.x1 + 3),
            sy(p.y - BTN_H + h),
            sx(p.x2 - p.x1 - 6),
            sx(2),
          );
          if (fb && p.k === fb.answerIndex) {
            ctx.shadowColor = "#22c55e";
            ctx.shadowBlur = 14;
            ctx.strokeStyle = "#bbf7d0";
            ctx.strokeRect(
              sx(p.x1),
              sy(p.y - BTN_H + h),
              sx(p.x2 - p.x1),
              sx(h),
            );
            ctx.shadowBlur = 0;
          }
          ctx.globalAlpha = 1;
        } else if (p.kind === "finish") {
          const tile = sx(10);
          for (let i = 0; i * tile < TW; i++)
            for (let j = 0; j < 2; j++) {
              ctx.fillStyle = (i + j) % 2 ? "#0f172a" : "#f8fafc";
              ctx.fillRect(i * tile, yTop + j * tile, tile, tile);
            }
          ctx.fillStyle = "#22c55e";
          ctx.fillRect(0, yTop - sx(4), TW, sx(4));
          ctx.fillStyle = active ? "#4ade80" : "rgba(74,222,128,0.4)";
          ctx.font = `900 ${Math.round(sx(30))}px system-ui`;
          ctx.textAlign = "center";
          ctx.fillText("FINISH", TW / 2, yTop - sx(22));
          ctx.font = `${Math.round(sx(24))}px system-ui`;
          ctx.fillText("🏁", sx(30), yTop - sx(22));
          ctx.fillText("🏁", TW - sx(30), yTop - sx(22));
        }
      }

      for (const pt of g.particles) {
        ctx.globalAlpha = Math.max(0, pt.life / pt.max);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(sx(pt.x), sy(pt.y), sx(pt.size), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const f of g.floats) {
        ctx.globalAlpha = Math.min(1, f.life * 1.5);
        ctx.fillStyle = f.color;
        ctx.font = `800 ${Math.round(sx(15))}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText(f.text, sx(f.x), sy(f.y));
      }
      ctx.globalAlpha = 1;

      // bintang: berkilau & melayang; yang belum terbuka (lantai di bawahnya belum dijawab) tampil samar
      const answeredNow = g.answered.filter(Boolean).length;
      for (const s of g.stars) {
        if (s.taken) continue;
        const y = sy(s.y + Math.sin(now / 300 + s.x) * 3);
        if (y < -30 || y > cssH + 30) continue;
        const open = s.seg <= answeredNow;
        const r = sx(open ? 11 : 9);
        ctx.save();
        ctx.translate(sx(s.x), y);
        ctx.rotate(Math.sin(now / 500 + s.y) * 0.25);
        ctx.globalAlpha = open ? 1 : 0.35;
        if (open) {
          ctx.shadowColor = "#fde047";
          ctx.shadowBlur = 14;
        }
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rr = i % 2 ? r * 0.45 : r;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = "#facc15";
        ctx.fill();
        ctx.lineWidth = sx(1.5);
        ctx.strokeStyle = "#fff7c2";
        ctx.stroke();
        ctx.restore();
      }

      // lingkaran "tahan" di atas tombol yang sedang diinjak
      if (g.plate?.valid && !g.answered[g.plate.lvl]) {
        const prog = Math.min(1, (now - g.plate.at) / HOLD_MS);
        const n = Math.max(
          2,
          Math.min(5, questions[g.plate.lvl].options.length),
        );
        const cx = sx((g.plate.k + 0.5) * (W / n));
        const cy = sy(c.y + 62);
        ctx.lineWidth = sx(4);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.beginPath();
        ctx.arc(cx, cy, sx(14), 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = OPTION_COLORS[g.plate.k];
        ctx.beginPath();
        ctx.arc(
          cx,
          cy,
          sx(14),
          -Math.PI / 2,
          -Math.PI / 2 + prog * Math.PI * 2,
        );
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.round(sx(12))}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText(LETTERS[g.plate.k], cx, cy + sx(4));
      }

      ctx.restore();

      // kucing (SVG maskot di atas canvas)
      const el = catRef.current;
      if (el) {
        const size = CAT_VIEW * scale;
        el.style.width = `${size}px`;
        el.style.height = `${size * 0.95}px`;
        el.style.transform = `translate(${offX + sx(c.x) - size / 2}px, ${sy(c.y) - size * 0.95 + 2}px) scaleX(${c.face < 0 ? -1 : 1})`;
      }
      if (timeRef.current && g.startAt)
        timeRef.current.textContent = fmtTime(now - g.startAt);
      if (bonusRef.current) {
        const left =
          g.active >= 0 && !g.answered[g.active]
            ? Math.max(0, secondsPerQuestion - (now - g.shownAt) / 1000)
            : null;
        bonusRef.current.textContent =
          left == null
            ? ""
            : left > 0
              ? `⚡ ${Math.ceil(left)} dtk`
              : "⚡ bonus habis";
      }
    };

    const loop = (now: number) => {
      let dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      while (dt > 0) {
        const d = Math.min(1 / 120, dt);
        step(d, now);
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
  }, [playing, phase, questions, secondsPerQuestion]);

  /* ---------------- tombol layar sentuh ---------------- */

  const hold = (key: "left" | "right" | "jump") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      // sebagian browser/perangkat menolak capture (pointer sudah tidak aktif) → abaikan, tombol tetap berfungsi
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* abaikan */
      }
      if (key === "jump") input.current.jumpPressedAt = performance.now();
      input.current[key] = true;
    },
    onPointerUp: () => (input.current[key] = false),
    onPointerCancel: () => (input.current[key] = false),
    onLostPointerCapture: () => (input.current[key] = false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

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
          <GameCat mood="senyum" className="h-24 w-24 shrink-0" />
          <div>
            <h2 className="text-xl font-extrabold text-navy-900">
              Mode Petualangan
            </h2>
            <p className="text-sm text-navy-500">
              Bantu si kucing kuning naik ke puncak menara. Tiap lantai berisi 1
              soal.
            </p>
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-2 text-sm text-navy-700 sm:grid-cols-2">
          <li className="rounded-2xl bg-brand-50 p-3">
            ⬅️ ➡️ Gerak kiri–kanan, ⬆️ lompat (keyboard: panah / A D W / spasi).
          </li>
          <li className="rounded-2xl bg-brand-50 p-3">
            🏢 Naik ke lantai berikutnya → soal muncul di atas arena.
          </li>
          <li className="rounded-2xl bg-brand-50 p-3">
            🔘 Pilih jawaban: masuk ke jalur A / B / C / D, berdiri di tombolnya
            sampai lingkarannya penuh.
          </li>
          <li className="rounded-2xl bg-brand-50 p-3">
            💦🔥 Salah? Kucing disiram — tetap lanjut naik sampai garis FINISH.
          </li>
          <li className="rounded-2xl bg-amber-50 p-3 sm:col-span-2">
            ⭐ Ambil bintang di sepanjang jalan: <b>+10 poin</b> per bintang.
            Bintang di atas lantai yang soalnya belum dijawab masih samar —
            jawab dulu untuk membukanya.
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
            <Play className="h-5 w-5 fill-current" /> Mulai petualangan
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- arena ---------------- */
  const n = q ? Math.max(2, Math.min(5, q.options.length)) : 0;
  // arena dipasang langsung di <body> (portal) agar benar-benar menutupi header & tombol chat:
  // pembungkus halaman punya lapisan z sendiri sehingga fixed + z-index dari dalamnya tetap kalah
  return createPortal(
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[99] flex flex-col bg-navy-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden bg-white sm:my-3 sm:rounded-3xl">
        {/* panel soal & pembahasan di atas arena (tidak menutupi permainan) */}
        <div className="max-h-[40svh] shrink-0 overflow-y-auto border-b border-navy-100 bg-white p-3 sm:p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="shrink-0 whitespace-nowrap rounded-full bg-navy-900 px-2.5 py-1 text-xs font-bold text-white">
              {q
                ? `Lantai ${level + 1}/${questions.length}`
                : `0/${questions.length}`}
            </span>
            <span
              ref={bonusRef}
              className="min-w-0 truncate whitespace-nowrap text-[11px] font-bold text-amber-600 sm:text-xs"
            />
            <div className="ml-auto flex items-center gap-1.5">
              {q && !feedback && (
                <button
                  type="button"
                  onClick={takeHint}
                  disabled={
                    hinting || hintsLeft <= 0 || hidden.length > 0 || n <= 2
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
                    className="grid h-7 w-7 place-items-center rounded-full bg-navy-50 text-navy-600"
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
                          "min-w-0 break-words",
                          off && "line-through",
                        )}
                      />
                    </div>
                  );
                })}
              </div>
              {!feedback && !checking && (
                <p className="mt-2 text-xs font-semibold text-navy-500">
                  Masuk ke jalur jawabanmu lalu berdiri di tombolnya sampai
                  lingkaran penuh.
                </p>
              )}
              {checking && (
                <p className="mt-2 flex items-center gap-2 text-sm text-navy-500">
                  <Spinner /> Memeriksa jawaban…
                </p>
              )}
              {feedback && (
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
                        ? "Naik ke lantai berikutnya ⬆"
                        : "Naik ke garis FINISH ⬆"}
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
              )}
            </>
          ) : (
            <p className="text-sm font-semibold text-navy-600">
              Lompat naik ke Lantai 1 untuk membuka soal pertama ⬆
            </p>
          )}
        </div>

        {/* arena */}
        <div className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-navy-900">
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          <div
            ref={catRef}
            className="pointer-events-none absolute left-0 top-0 origin-center will-change-transform"
          >
            <GameCat mood={mood} className="h-full w-full" />
          </div>
          {/* skor & waktu (kanan atas) */}
          <div className="pointer-events-none absolute right-2 top-2 rounded-2xl bg-navy-950/70 px-3 py-1.5 text-right text-white backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-200">
              Skor
            </p>
            <p className="text-lg font-extrabold leading-none">{score}</p>
            <p className="mt-1 text-xs font-bold text-amber-300">
              ⭐ {starCount}
            </p>
            <p className="mt-1 font-mono text-xs text-brand-100">
              ⏱ <span ref={timeRef}>00:00</span>
            </p>
          </div>
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
          {/* kontrol layar sentuh */}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-3 pointer-fine:hidden">
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Kiri"
                className="grid h-16 w-16 place-items-center rounded-2xl bg-white/20 text-white ring-1 ring-white/30 backdrop-blur active:bg-white/40"
                {...hold("left")}
              >
                <ArrowLeft className="h-7 w-7" />
              </button>
              <button
                type="button"
                aria-label="Kanan"
                className="grid h-16 w-16 place-items-center rounded-2xl bg-white/20 text-white ring-1 ring-white/30 backdrop-blur active:bg-white/40"
                {...hold("right")}
              >
                <ArrowRight className="h-7 w-7" />
              </button>
            </div>
            <button
              type="button"
              aria-label="Lompat"
              className="grid h-20 w-20 place-items-center rounded-full bg-sun-400/90 text-navy-950 shadow-lg ring-2 ring-white/40 active:scale-95"
              {...hold("jump")}
            >
              <ArrowUp className="h-9 w-9" />
            </button>
          </div>
          <p className="pointer-events-none absolute bottom-2 left-3 hidden rounded-lg bg-navy-950/50 px-2 py-1 text-[11px] text-brand-100 pointer-fine:block">
            ← → / A D: gerak · ↑ / W / Spasi: lompat
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

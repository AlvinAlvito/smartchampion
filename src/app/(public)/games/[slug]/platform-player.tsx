"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Sparkles,
} from "lucide-react";
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
 * Mode Petualangan Kucing: Lembah Pixel — platformer gulir-samping bergaya retro (desain orisinal).
 * Tiap soal = satu segmen dunia (tema berganti) berisi rintangan & musuh; di ujung segmen ada terowongan batu
 * berlabel A/B/C/D: berdiri di atasnya lalu jongkok ±0,7 dtk = memilih jawaban. Benar beruntun → kucing berubah
 * wujud (Jagoan → Super + lempar bola benang → Bintang kebal); salah → kembali wujud biasa. Tidak ada nyawa:
 * jatuh / kena musuh hanya terpental (skor tetap adil). Finis: Gerbang Pelangi dengan lonceng emas.
 * Skor = skor klasik dari server; ikan hanya koleksi.
 */

type Phase = "ready" | "countdown" | "playing" | "finishing" | "result";
/** run = menjelajah · question = soal tampil (waktu berjalan) · enter = masuk terowongan · final = menuju finis · done */
type Stage = "run" | "question" | "enter" | "final" | "done";

const T = 32; // ukuran petak dunia (px)
const ROWS = 15;
const GROUND = 13; // baris permukaan tanah
const E = 0;
const GND = 1;
const BRICK = 2;
const BOX = 3;
const USED = 4;
const STONE = 5;
const SPIKE = 6;
const GRAVITY = 2000;
const RUN = 215;
const CROUCH_S = 0.7;
const THEMES = [
  {
    name: "Padang Rumput",
    sky: ["#8fd3ff", "#d8f1ff"],
    top: "#3fb950",
    soil: "#9a5b2e",
    soilDark: "#7a4522",
    hill: "#58c46a",
    deco: "tree",
  },
  {
    name: "Hutan Jamur Ungu",
    sky: ["#c4a8ff", "#efe4ff"],
    top: "#8b5cf6",
    soil: "#5b3a8c",
    soilDark: "#43296a",
    hill: "#a78bfa",
    deco: "shroom",
  },
  {
    name: "Gurun Kaktus",
    sky: ["#ffd59a", "#fff3d6"],
    top: "#e9b949",
    soil: "#c4893a",
    soilDark: "#a3702c",
    hill: "#f2c76e",
    deco: "cactus",
  },
  {
    name: "Bukit Salju",
    sky: ["#a9d8ff", "#f0f8ff"],
    top: "#f8fafc",
    soil: "#7c9cbf",
    soilDark: "#5f7fa3",
    hill: "#e2ecf7",
    deco: "pine",
  },
  {
    name: "Gua Lava",
    sky: ["#2a1022", "#5a1d2e"],
    top: "#f97316",
    soil: "#4b2a2a",
    soilDark: "#351c1c",
    hill: "#7f1d1d",
    deco: "crystal",
  },
] as const;
const POWER = [
  { name: "Kucing Biasa", icon: "🐱" },
  { name: "Kucing Jagoan", icon: "🧢" },
  { name: "Kucing Super", icon: "🦸" },
  { name: "Kucing Bintang", icon: "⭐" },
];

type Enemy = {
  kind: "snail" | "bee" | "hog" | "bat";
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  baseY: number;
  t: number;
  alive: boolean;
  shell: boolean;
  slide: number;
  dead: number;
};
type Tunnel = { seg: number; k: number; x: number; label: boolean };
type Zone = {
  seg: number;
  trigger: number;
  start: number;
  wall: number;
  spawnX: number;
  theme: number;
};
type Plat = {
  x: number;
  y: number;
  w: number;
  x0: number;
  x1: number;
  vx: number;
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

/* ---------------- pembuat level ---------------- */

function makeLevel(counts: number[]) {
  const segLen = 92;
  const finalLen = 46;
  const W = counts.length * segLen + finalLen + 8;
  const tiles = new Uint8Array(W * ROWS);
  const theme = new Uint8Array(W);
  const set = (x: number, y: number, t: number) => {
    if (x >= 0 && x < W && y >= 0 && y < ROWS) tiles[y * W + x] = t;
  };
  const ground = (x0: number, x1: number) => {
    for (let x = x0; x < x1; x++)
      for (let y = GROUND; y < ROWS; y++) set(x, y, GND);
  };
  const enemies: Enemy[] = [];
  const coins: { x: number; y: number; taken: boolean }[] = [];
  const plats: Plat[] = [];
  const tunnels: Tunnel[] = [];
  const exits: number[] = [];
  const zones: Zone[] = [];
  const rnd = (a: number, b: number) =>
    a + Math.floor(Math.random() * (b - a + 1));
  const enemy = (kind: Enemy["kind"], tx: number, ty: number) => {
    const fly = kind === "bee" || kind === "bat";
    const w = kind === "snail" ? 28 : kind === "hog" ? 30 : 26;
    const h = kind === "snail" ? 24 : kind === "hog" ? 22 : 22;
    enemies.push({
      kind,
      x: tx * T + 2,
      y: ty * T + (T - h),
      w,
      h,
      vx: fly ? 30 : -45,
      vy: 0,
      baseY: ty * T,
      t: Math.random() * 6,
      alive: true,
      shell: false,
      slide: 0,
      dead: 0,
    });
  };
  const coinArc = (x0: number, y: number, n: number) => {
    for (let i = 0; i < n; i++)
      coins.push({
        x: (x0 + i) * T + T / 2,
        y:
          (y - Math.round(Math.sin((i / Math.max(1, n - 1)) * Math.PI) * 2)) *
            T +
          T / 2,
        taken: false,
      });
  };
  const exitTunnel = (x: number) => {
    for (let dx = 0; dx < 2; dx++)
      for (let y = GROUND - 2; y < GROUND; y++) set(x + dx, y, STONE);
    exits.push(x);
  };

  let x = 0;
  counts.forEach((k, seg) => {
    const th = seg % THEMES.length;
    const cave = THEMES[th].deco === "crystal";
    const segStart = x;
    ground(x, x + 8);
    exitTunnel(x + 2);
    const spawnX = x + 2;
    x += 8;
    // potongan rintangan (makin jauh makin menantang)
    const pieces = 4 + Math.min(2, Math.floor(seg / 3));
    for (let p = 0; p < pieces; p++) {
      const kind = rnd(0, 7);
      if (kind === 0) {
        ground(x, x + 9);
        enemy(cave ? "bat" : "snail", x + 6, GROUND - 1);
        coinArc(x + 2, GROUND - 3, 3);
        x += 9;
      } else if (kind === 1) {
        ground(x, x + 10);
        const row = GROUND - 4;
        [BRICK, BOX, BRICK, BOX, BRICK].forEach((t, i) =>
          set(x + 2 + i, row, t),
        );
        if (Math.random() < 0.5) set(x + 4, row - 4, BOX);
        enemy("snail", x + 8, GROUND - 1);
        x += 10;
      } else if (kind === 2) {
        ground(x, x + 3);
        const gap = rnd(2, 3);
        coinArc(x + 2, GROUND - 4, gap + 2);
        x += 3 + gap;
        ground(x, x + 3);
        x += 3;
      } else if (kind === 3) {
        ground(x, x + 2);
        const gap = 6;
        plats.push({
          x: (x + 2) * T,
          y: (GROUND - 2) * T,
          w: 3 * T,
          x0: (x + 2) * T,
          x1: (x + 2 + gap - 3) * T,
          vx: 60,
        });
        coinArc(x + 3, GROUND - 5, 4);
        x += 2 + gap;
        ground(x, x + 3);
        x += 3;
      } else if (kind === 4) {
        ground(x, x + 12);
        const hgt = rnd(3, 4);
        for (let i = 0; i < hgt; i++)
          for (let j = 0; j <= i; j++) set(x + 1 + i, GROUND - 1 - j, STONE);
        // puncak datar 2 petak lalu turun — tanpa celah di antara (celah sempit = kucing terkurung)
        for (let j = 0; j < hgt; j++) set(x + 1 + hgt, GROUND - 1 - j, STONE);
        for (let i = 0; i < hgt - 1; i++)
          for (let j = 0; j < hgt - 1 - i; j++)
            set(x + 2 + hgt + i, GROUND - 1 - j, STONE);
        coins.push({
          x: (x + 1 + hgt) * T + T / 2,
          y: (GROUND - hgt - 2) * T + T / 2,
          taken: false,
        });
        x += 12;
      } else if (kind === 5) {
        ground(x, x + 9);
        set(x + 3, GROUND - 1, SPIKE);
        set(x + 4, GROUND - 1, SPIKE);
        set(x + 5, GROUND - 1, SPIKE);
        for (let i = 2; i < 7; i++) set(x + i, GROUND - 5, BRICK);
        coinArc(x + 3, GROUND - 7, 3);
        x += 9;
      } else if (kind === 6) {
        ground(x, x + 11);
        enemy(seg >= 1 ? "hog" : "snail", x + 5, GROUND - 1);
        enemy(cave ? "bat" : "bee", x + 8, GROUND - 4);
        set(x + 3, GROUND - 3, STONE);
        set(x + 4, GROUND - 3, STONE);
        x += 11;
      } else {
        ground(x, x + 10);
        for (const [dx, h] of [
          [2, 2],
          [6, 3],
        ])
          for (let j = 0; j < h; j++) {
            set(x + dx, GROUND - 1 - j, STONE);
            set(x + dx + 1, GROUND - 1 - j, STONE);
          }
        enemy(cave ? "bat" : "bee", x + 4, GROUND - 5);
        x += 10;
      }
    }
    // zona jawaban: terowongan berlabel, lalu dinding penutup
    ground(x, x + 4 + k * 5 + 3);
    const trigger = x;
    const start = x + 3;
    for (let i = 0; i < k; i++) {
      const tx = start + i * 5;
      for (let dx = 0; dx < 2; dx++)
        for (let y = GROUND - 2; y < GROUND; y++) set(tx + dx, y, STONE);
      tunnels.push({ seg, k: i, x: tx, label: true });
    }
    const wall = start + k * 5;
    for (let y = 0; y < GROUND; y++) set(wall, y, STONE);
    x = wall + 1;
    zones.push({ seg, trigger, start, wall, spawnX, theme: th });
    for (let i = segStart; i < x; i++) theme[i] = th;
  });
  // jalur finis: tangga lalu Gerbang Pelangi
  const finalStart = x;
  ground(x, W);
  exitTunnel(x + 2);
  const finalSpawn = x + 2;
  x += 9;
  for (let i = 0; i < 6; i++)
    for (let j = 0; j <= i; j++) set(x + i, GROUND - 1 - j, STONE);
  for (let j = 0; j < 6; j++) set(x + 6, GROUND - 1 - j, STONE);
  x += 10;
  const gate = x + 4;
  for (let i = finalStart; i < W; i++)
    theme[i] =
      ((counts.length % THEMES.length) + THEMES.length - 1) % THEMES.length;
  return {
    W,
    tiles,
    theme,
    enemies,
    coins,
    plats,
    tunnels,
    exits,
    zones,
    finalSpawn,
    gate,
  };
}

function makeWorld(counts: number[]) {
  const lv = makeLevel(counts);
  const sx = (lv.zones[0]?.spawnX ?? lv.finalSpawn) * T + 16;
  return {
    ...lv,
    p: {
      x: sx,
      y: (GROUND - 3) * T,
      w: 22,
      h: 28,
      vx: 0,
      vy: 0,
      onGround: false,
      face: 1,
      coyote: 0,
      jumpBuf: 0,
      jumpHeld: false,
      crouch: 0,
      inv: 0,
      safeX: sx,
      rise: 0,
      sink: 0,
      stuck: 0,
    },
    keys: { l: false, r: false, jump: false, down: false },
    power: 0,
    stage: "run" as Stage,
    qi: 0,
    yarn: [] as {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
    }[],
    particles: [] as Particle[],
    floats: [] as FloatText[],
    fish: 0,
    bumps: [] as { x: number; y: number; t: number }[],
    bell: false,
    cam: 0,
    tunnelK: -1,
  };
}
type World = ReturnType<typeof makeWorld>;

const tileAt = (w: World, tx: number, ty: number) =>
  tx < 0 || tx >= w.W
    ? STONE
    : ty < 0 || ty >= ROWS
      ? E
      : w.tiles[ty * w.W + tx];
const solid = (t: number) =>
  t === GND || t === BRICK || t === BOX || t === USED || t === STONE;
const hitW = (w: World) => (w.power > 0 ? 24 : 22);
const hitH = (w: World) => (w.power > 0 ? 40 : 28);

function burst(
  w: World,
  x: number,
  y: number,
  colors: string[],
  n = 18,
  grav = 900,
) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 80 + Math.random() * 220;
    w.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 140,
      life: 0.8,
      max: 0.8,
      color: colors[i % colors.length],
      size: 3 + Math.random() * 3,
      grav,
    });
  }
}
const say = (
  w: World,
  x: number,
  y: number,
  text: string,
  color = "#fff",
  life = 1.1,
) => w.floats.push({ x, y, text, color, life });

/** kucing terluka: turun satu wujud (atau terpental), kebal sebentar */
function hurt(w: World, from: number) {
  const p = w.p;
  if (p.inv > 0 || w.power >= 3) return;
  gameAudio().bump();
  if (w.power > 0) {
    w.power--;
    say(w, p.x, p.y - 10, `Aduh! → ${POWER[w.power].name}`, "#fca5a5");
  } else say(w, p.x, p.y - 10, "Aduh!", "#fca5a5");
  p.inv = 1.6;
  p.vx = from < p.x ? 220 : -220;
  p.vy = -360;
}

/** sundul balok dari bawah */
function bumpTile(w: World, tx: number, ty: number) {
  const t = tileAt(w, tx, ty);
  if (t === BOX) {
    w.tiles[ty * w.W + tx] = USED;
    w.fish++;
    gameAudio().coin();
    say(w, tx * T + 16, ty * T - 8, "+1 🐟", "#fde047", 0.9);
    w.bumps.push({ x: tx, y: ty, t: 0 });
  } else if (t === BRICK) {
    if (w.power > 0) {
      w.tiles[ty * w.W + tx] = E;
      gameAudio().bump();
      burst(w, tx * T + 16, ty * T + 16, ["#b45309", "#92400e", "#f59e0b"], 10);
    } else {
      w.bumps.push({ x: tx, y: ty, t: 0 });
      gameAudio().press();
    }
  }
  // musuh di atas balok yang disundul ikut terlempar
  for (const e of w.enemies)
    if (
      e.alive &&
      Math.abs(e.x + e.w / 2 - (tx * T + 16)) < 24 &&
      Math.abs(e.y + e.h - ty * T) < 6
    ) {
      e.alive = false;
      e.dead = 1;
      e.vy = -300;
    }
}

/** gerak & tabrakan kucing dengan petak (x lalu y) */
function movePlayer(w: World, dt: number) {
  const p = w.p;
  p.w = hitW(w);
  const newH = hitH(w);
  if (newH !== p.h) {
    p.y += p.h - newH;
    p.h = newH;
  }
  // x
  p.x += p.vx * dt;
  {
    const x0 = Math.floor(p.x / T);
    const x1 = Math.floor((p.x + p.w - 0.01) / T);
    const y0 = Math.floor(p.y / T);
    const y1 = Math.floor((p.y + p.h - 0.01) / T);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (solid(tileAt(w, tx, ty))) {
          if (p.vx > 0) p.x = tx * T - p.w;
          else if (p.vx < 0) p.x = (tx + 1) * T;
          p.vx = 0;
        }
  }
  // y
  const wasGround = p.onGround;
  p.onGround = false;
  p.y += p.vy * dt;
  {
    const x0 = Math.floor(p.x / T);
    const x1 = Math.floor((p.x + p.w - 0.01) / T);
    const y0 = Math.floor(p.y / T);
    const y1 = Math.floor((p.y + p.h - 0.01) / T);
    let bumped = false;
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (solid(tileAt(w, tx, ty))) {
          if (p.vy > 0) {
            p.y = ty * T - p.h;
            p.onGround = true;
          } else if (p.vy < 0 && !bumped) {
            p.y = (ty + 1) * T;
            // sundul petak yang paling dekat dengan tengah kucing
            const cx = Math.floor((p.x + p.w / 2) / T);
            bumpTile(w, solid(tileAt(w, cx, ty)) ? cx : tx, ty);
            bumped = true;
          }
          p.vy = Math.max(0, p.vy);
        }
  }
  // platform bergerak (hanya dari atas)
  for (const pl of w.plats)
    if (
      p.vy >= 0 &&
      p.x + p.w > pl.x &&
      p.x < pl.x + pl.w &&
      p.y + p.h >= pl.y &&
      p.y + p.h <= pl.y + 14
    ) {
      p.y = pl.y - p.h;
      p.vy = 0;
      p.onGround = true;
      p.x += pl.vx * dt;
    }
  if (p.onGround) {
    p.coyote = 0.09;
    const tx = Math.floor((p.x + p.w / 2) / T);
    if (solid(tileAt(w, tx, Math.floor((p.y + p.h + 2) / T)))) p.safeX = p.x;
    if (!wasGround) gameAudio().land();
  }
}

/**
 * Pengaman: kucing di lubang sempit yang dinding kiri & kanannya ≥ 4 petak (tak terjangkau lompatan) lebih dari 1 dtk
 * → diangkat ke atas dinding kanan.
 */
function rescueIfTrapped(w: World, dt: number) {
  const p = w.p;
  const feet = Math.floor((p.y + p.h - 1) / T);
  const cc = Math.floor((p.x + p.w / 2) / T);
  const tall = (c: number) => {
    for (let r = feet; r > feet - 4; r--)
      if (!solid(tileAt(w, c, r))) return false;
    return true;
  };
  // dinding terdekat di kiri & kanan (maks. 2 kolom) yang sama-sama terlalu tinggi untuk dilompati
  const lc = [cc - 1, cc - 2].find((c) => solid(tileAt(w, c, feet)));
  const rc = [cc + 1, cc + 2].find((c) => solid(tileAt(w, c, feet)));
  const trapped =
    p.onGround && lc !== undefined && rc !== undefined && tall(lc) && tall(rc);
  p.stuck = trapped ? p.stuck + dt : 0;
  if (p.stuck < 1 || rc === undefined) return;
  let top = feet;
  while (top > 0 && solid(tileAt(w, rc, top))) top--;
  p.x = rc * T + (T - p.w) / 2;
  p.y = (top + 1) * T - p.h - 1;
  p.vx = 0;
  p.vy = 0;
  p.stuck = 0;
  gameAudio().jump();
  say(w, p.x, p.y - 10, "Hup! Keluar dari lubang 🐾", "#fde68a");
}

/** satu langkah fisika dunia (kucing, musuh, benda) */
function stepWorld(w: World, dt: number) {
  const p = w.p;
  const k = w.keys;
  const free =
    w.stage === "run" || w.stage === "question" || w.stage === "final";
  // timer
  p.coyote -= dt;
  p.jumpBuf -= dt;
  if (p.inv > 0) p.inv -= dt;
  // masuk / keluar terowongan (animasi)
  if (p.sink > 0) {
    p.sink = Math.min(1.2, p.sink + dt * 2);
    return;
  }
  if (p.rise > 0) {
    p.rise -= dt * 2;
    if (p.rise < 0) p.rise = 0;
  }
  // input
  const crouching = free && k.down && p.onGround;
  let dir = 0;
  if (free && !crouching) dir = (k.r ? 1 : 0) - (k.l ? 1 : 0);
  const target = dir * RUN * (w.power >= 2 ? 1.1 : 1);
  const acc = p.onGround ? 1700 : 1100;
  if (dir)
    p.vx +=
      Math.sign(target - p.vx) * Math.min(Math.abs(target - p.vx), acc * dt);
  else
    p.vx -=
      Math.sign(p.vx) *
      Math.min(Math.abs(p.vx), (p.onGround ? 1900 : 500) * dt);
  if (dir) p.face = dir;
  if (free && p.jumpBuf > 0 && (p.onGround || p.coyote > 0) && !crouching) {
    p.vy = -(w.power >= 2 ? 790 : w.power === 1 ? 740 : 710);
    p.onGround = false;
    p.coyote = 0;
    p.jumpBuf = 0;
    gameAudio().jump();
  }
  if (!k.jump && p.vy < -260) p.vy = -260; // lompat pendek bila tombol dilepas cepat
  p.vy = Math.min(900, p.vy + GRAVITY * dt);
  movePlayer(w, dt);
  rescueIfTrapped(w, dt);
  p.crouch = crouching ? p.crouch + dt : 0;
  // jatuh ke jurang → kembali ke pijakan aman terakhir
  if (p.y > ROWS * T + 40) {
    p.x = p.safeX;
    p.y = (GROUND - 4) * T;
    p.vx = 0;
    p.vy = 0;
    p.inv = Math.max(p.inv, 1.4);
    gameAudio().splash();
    say(w, p.x, p.y, "Uups! Hampir jatuh 😿", "#fde68a");
  }
  // duri
  const ty = Math.floor((p.y + p.h - 4) / T);
  for (const tx of [Math.floor((p.x + 3) / T), Math.floor((p.x + p.w - 3) / T)])
    if (tileAt(w, tx, ty) === SPIKE) hurt(w, tx * T + 16);
  // platform bergerak
  for (const pl of w.plats) {
    pl.x += pl.vx * dt;
    if (pl.x < pl.x0 || pl.x > pl.x1) pl.vx = -pl.vx;
  }
  // ikan
  for (const c of w.coins)
    if (
      !c.taken &&
      Math.abs(c.x - (p.x + p.w / 2)) < 20 &&
      Math.abs(c.y - (p.y + p.h / 2)) < p.h / 2 + 10
    ) {
      c.taken = true;
      w.fish++;
      gameAudio().coin();
    }
  // musuh (hanya yang dekat layar)
  const left = w.cam - 200;
  const right = w.cam + 1400;
  for (const e of w.enemies) {
    if (e.x < left || e.x > right) continue;
    if (!e.alive) {
      if (e.dead > 0) {
        e.vy += GRAVITY * dt;
        e.y += e.vy * dt;
        e.dead -= dt * 0.5;
      }
      continue;
    }
    e.t += dt;
    if (e.kind === "bee" || e.kind === "bat") {
      const swoop = e.kind === "bat" && Math.abs(e.x - p.x) < 180;
      e.x += e.vx * dt;
      if (e.t % 4 < dt) e.vx = -e.vx;
      e.y = e.baseY + Math.sin(e.t * (swoop ? 4 : 2.2)) * (swoop ? 70 : 34);
    } else {
      const speed = e.shell ? e.slide : e.vx;
      e.vy = Math.min(900, e.vy + GRAVITY * dt);
      e.x += speed * dt;
      const fx = Math.floor((speed > 0 ? e.x + e.w : e.x) / T);
      const fy = Math.floor((e.y + e.h / 2) / T);
      if (solid(tileAt(w, fx, fy))) {
        if (e.shell) e.slide = -e.slide;
        else e.vx = -e.vx;
        e.x += (speed > 0 ? -1 : 1) * 2;
      }
      e.y += e.vy * dt;
      const by = Math.floor((e.y + e.h) / T);
      if (solid(tileAt(w, Math.floor((e.x + e.w / 2) / T), by))) {
        e.y = by * T - e.h;
        e.vy = 0;
        // berbalik di tepi jurang (kecuali cangkang meluncur)
        const ahead = Math.floor((e.vx > 0 ? e.x + e.w + 2 : e.x - 2) / T);
        if (!e.shell && !solid(tileAt(w, ahead, by))) e.vx = -e.vx;
      }
      if (e.y > ROWS * T + 60) e.alive = false;
      // cangkang meluncur menabrak musuh lain
      if (e.shell && e.slide)
        for (const o of w.enemies)
          if (
            o !== e &&
            o.alive &&
            Math.abs(o.x - e.x) < 26 &&
            Math.abs(o.y - e.y) < 26
          ) {
            o.alive = false;
            o.dead = 1;
            o.vy = -320;
            gameAudio().bump();
          }
    }
    // tabrakan dengan kucing
    if (
      p.x < e.x + e.w &&
      p.x + p.w > e.x &&
      p.y < e.y + e.h &&
      p.y + p.h > e.y
    ) {
      if (w.power >= 3) {
        e.alive = false;
        e.dead = 1;
        e.vy = -320;
        gameAudio().bump();
        burst(w, e.x + e.w / 2, e.y, ["#fde047", "#f472b6", "#38bdf8"]);
        continue;
      }
      const stomp = p.vy > 60 && p.y + p.h - e.y < 16;
      if (stomp && e.kind !== "hog") {
        p.vy = -430;
        gameAudio().press();
        if (e.kind === "snail" && !e.shell) {
          e.shell = true;
          e.slide = 0;
          e.h = 20;
          e.y += 4;
          say(w, e.x, e.y - 10, "Injak!", "#fff");
        } else if (e.kind === "snail" && e.shell && !e.slide) {
          e.slide = p.x + p.w / 2 < e.x + e.w / 2 ? 330 : -330;
        } else {
          e.alive = false;
          e.dead = 1;
          e.vy = -200;
          burst(w, e.x + e.w / 2, e.y, ["#fff", "#facc15"], 10);
        }
      } else if (e.shell && !e.slide) {
        // tendang cangkang yang diam
        e.slide = p.x + p.w / 2 < e.x + e.w / 2 ? 330 : -330;
        e.x += e.slide > 0 ? 8 : -8;
        gameAudio().whoosh();
      } else if (!(e.shell && Math.abs(e.slide) > 0 && p.inv > 0)) hurt(w, e.x);
    }
  }
  // bola benang
  for (const y of w.yarn) {
    y.vy = Math.min(700, y.vy + 1600 * dt);
    y.x += y.vx * dt;
    y.y += y.vy * dt;
    y.life -= dt;
    if (solid(tileAt(w, Math.floor(y.x / T), Math.floor((y.y + 8) / T)))) {
      y.y = Math.floor((y.y + 8) / T) * T - 8;
      y.vy = -330;
    }
    if (
      solid(
        tileAt(
          w,
          Math.floor((y.x + Math.sign(y.vx) * 8) / T),
          Math.floor(y.y / T),
        ),
      )
    )
      y.life = 0;
    for (const e of w.enemies)
      if (
        e.alive &&
        Math.abs(e.x + e.w / 2 - y.x) < e.w / 2 + 8 &&
        Math.abs(e.y + e.h / 2 - y.y) < e.h / 2 + 8
      ) {
        e.alive = false;
        e.dead = 1;
        e.vy = -300;
        y.life = 0;
        gameAudio().bump();
        burst(w, y.x, y.y, ["#f472b6", "#fb7185", "#fff"], 10);
      }
  }
  w.yarn = w.yarn.filter((y) => y.life > 0);
  // efek
  for (const pt of w.particles) {
    pt.vy += pt.grav * dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
  }
  w.particles = w.particles.filter((pt) => pt.life > 0);
  for (const f of w.floats) {
    f.y -= 40 * dt;
    f.life -= dt;
  }
  w.floats = w.floats.filter((f) => f.life > 0);
  for (const b of w.bumps) b.t += dt;
  w.bumps = w.bumps.filter((b) => b.t < 0.2);
}

/** terowongan jawaban yang sedang diinjak kucing (indeks pilihan) atau −1 */
function tunnelUnder(w: World) {
  const p = w.p;
  if (!p.onGround) return -1;
  const cx = p.x + p.w / 2;
  const feet = Math.round((p.y + p.h) / T);
  const t = w.tunnels.find(
    (tu) =>
      tu.seg === w.qi &&
      cx >= tu.x * T + 4 &&
      cx <= (tu.x + 2) * T - 4 &&
      feet === GROUND - 2,
  );
  return t ? t.k : -1;
}

/** pindahkan kucing ke terowongan keluar segmen berikutnya (atau jalur finis) */
function teleport(w: World, toSeg: number) {
  const p = w.p;
  const tx = toSeg < w.zones.length ? w.zones[toSeg].spawnX : w.finalSpawn;
  p.x = tx * T + T - p.w / 2;
  p.y = (GROUND - 2) * T - p.h;
  p.vx = 0;
  p.vy = 0;
  p.sink = 0;
  p.rise = 1;
  p.safeX = p.x;
  w.cam = Math.max(0, p.x - 260);
}

function throwYarn(w: World) {
  if (w.power < 2 || w.yarn.length >= 2) return;
  const p = w.p;
  w.yarn.push({
    x: p.x + p.w / 2 + p.face * 14,
    y: p.y + p.h / 2,
    vx: p.face * 420,
    vy: -150,
    life: 1.6,
  });
  gameAudio().whoosh();
}

/* ---------------- gambar ---------------- */

function drawWorld(
  ctx: CanvasRenderingContext2D,
  w: World,
  W: number,
  H: number,
  scale: number,
  t: number,
) {
  const viewW = W / scale;
  const th =
    THEMES[
      w.theme[
        Math.max(0, Math.min(w.W - 1, Math.floor((w.cam + viewW / 2) / T)))
      ]
    ];
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, th.sky[0]);
  sky.addColorStop(1, th.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.scale(scale, scale);
  // latar: bukit & awan (paralaks)
  ctx.fillStyle = th.hill;
  for (let i = -1; i < viewW / 260 + 2; i++) {
    const bx = i * 260 - ((w.cam * 0.35) % 260);
    ctx.beginPath();
    ctx.ellipse(bx + 120, GROUND * T, 150, 90 + (i % 2) * 30, 0, Math.PI, 0);
    ctx.fill();
  }
  if (th.deco !== "crystal") {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let i = -1; i < viewW / 330 + 2; i++) {
      const cx = i * 330 - ((w.cam * 0.2) % 330) + 60;
      const cy = 60 + (i % 3) * 26;
      for (const [dx, dy, r] of [
        [0, 0, 18],
        [20, -8, 22],
        [42, 0, 18],
      ]) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.translate(-Math.round(w.cam), 0);
  const x0 = Math.max(0, Math.floor(w.cam / T) - 1);
  const x1 = Math.min(w.W - 1, Math.ceil((w.cam + viewW) / T) + 1);
  // dekorasi tanah
  ctx.font = "26px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (let tx = x0; tx <= x1; tx++) {
    if (
      tx % 9 !== 4 ||
      w.tiles[GROUND * w.W + tx] !== GND ||
      w.tiles[(GROUND - 1) * w.W + tx] !== E
    )
      continue;
    const d = THEMES[w.theme[tx]].deco;
    ctx.fillText(
      d === "tree"
        ? "🌳"
        : d === "shroom"
          ? "🍄"
          : d === "cactus"
            ? "🌵"
            : d === "pine"
              ? "🌲"
              : "💎",
      tx * T + 16,
      GROUND * T + 2,
    );
  }
  // petak
  for (let tx = x0; tx <= x1; tx++) {
    const tt = THEMES[w.theme[tx]];
    for (let ty = 0; ty < ROWS; ty++) {
      const tile = w.tiles[ty * w.W + tx];
      if (tile === E) continue;
      const bump = w.bumps.find((b) => b.x === tx && b.y === ty);
      const X = tx * T;
      const Y = ty * T - (bump ? Math.sin((bump.t / 0.2) * Math.PI) * 8 : 0);
      if (tile === GND) {
        const top = w.tiles[(ty - 1) * w.W + tx] !== GND;
        ctx.fillStyle = tt.soil;
        ctx.fillRect(X, Y, T, T);
        ctx.fillStyle = tt.soilDark;
        ctx.fillRect(X + ((tx * 7) % 3) * 8 + 4, Y + 10, 6, 6);
        ctx.fillRect(X + ((tx * 5) % 4) * 6 + 2, Y + 22, 5, 5);
        if (top) {
          ctx.fillStyle = tt.top;
          ctx.fillRect(X, Y, T, 9);
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.fillRect(X, Y, T, 3);
        }
      } else if (tile === BRICK) {
        ctx.fillStyle = "#c2410c";
        ctx.fillRect(X, Y, T, T);
        ctx.fillStyle = "#7c2d12";
        ctx.fillRect(X, Y + 15, T, 2);
        ctx.fillRect(X + 15, Y, 2, 15);
        ctx.fillRect(X + 7, Y + 17, 2, 15);
        ctx.fillRect(X + 23, Y + 17, 2, 15);
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillRect(X, Y, T, 2);
      } else if (tile === BOX || tile === USED) {
        ctx.fillStyle = tile === BOX ? "#f59e0b" : "#a16207";
        ctx.fillRect(X, Y, T, T);
        ctx.strokeStyle = "#78350f";
        ctx.lineWidth = 2;
        ctx.strokeRect(X + 1, Y + 1, T - 2, T - 2);
        ctx.fillStyle = "#78350f";
        for (const [dx, dy] of [
          [4, 4],
          [24, 4],
          [4, 24],
          [24, 24],
        ])
          ctx.fillRect(X + dx, Y + dy, 4, 4);
        if (tile === BOX) {
          ctx.font = "16px system-ui";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 5);
          ctx.fillText("🐾", X + 16, Y + 17);
          ctx.globalAlpha = 1;
        }
      } else if (tile === STONE) {
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(X, Y, T, T);
        ctx.fillStyle = "#64748b";
        ctx.fillRect(X, Y + T - 4, T, 4);
        ctx.fillRect(X + T - 4, Y, 4, T);
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(X, Y, T, 3);
        ctx.fillRect(X, Y, 3, T);
      } else if (tile === SPIKE) {
        ctx.fillStyle = "#e2e8f0";
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(X + i * 11, Y + T);
          ctx.lineTo(X + i * 11 + 5.5, Y + 8);
          ctx.lineTo(X + i * 11 + 11, Y + T);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }
  // terowongan (mulut batu berlabel) & terowongan keluar
  const drawTunnel = (
    tx: number,
    color: string | null,
    label: string | null,
    active: boolean,
  ) => {
    const X = tx * T;
    const Y = (GROUND - 2) * T;
    ctx.fillStyle = "#57534e";
    ctx.fillRect(X - 3, Y - 6, 2 * T + 6, 14);
    ctx.fillStyle = "#a8a29e";
    ctx.fillRect(X - 3, Y - 6, 2 * T + 6, 4);
    ctx.fillStyle = "#1c1917";
    ctx.beginPath();
    ctx.ellipse(X + T, Y + 2, T - 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (color && label) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(X + 10, Y + 16, 2 * T - 20, 2 * T - 26, 8);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = `rgba(253,224,71,${0.6 + 0.4 * Math.sin(t * 6)})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.fillStyle = "#fff";
      ctx.font = "900 24px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, X + T, Y + 34);
    }
  };
  for (const x of w.exits)
    if (x >= x0 - 2 && x <= x1) drawTunnel(x, null, null, false);
  for (const tu of w.tunnels)
    if (tu.x >= x0 - 2 && tu.x <= x1)
      drawTunnel(
        tu.x,
        tu.seg === w.qi || tu.seg > w.qi ? OPTION_COLORS[tu.k] : "#64748b",
        LETTERS[tu.k],
        tu.seg === w.qi && w.stage === "question",
      );
  // platform bergerak
  for (const pl of w.plats) {
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(pl.x, pl.y, pl.w, 12);
    ctx.fillStyle = "#94a3b8";
    for (let i = 0; i < pl.w; i += 16)
      ctx.fillRect(pl.x + i + 2, pl.y + 3, 10, 6);
  }
  // ikan
  ctx.font = "20px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const c of w.coins)
    if (!c.taken && c.x > w.cam - 40 && c.x < w.cam + viewW + 40)
      ctx.fillText("🐟", c.x, c.y + Math.sin(t * 4 + c.x) * 3);
  // Gerbang Pelangi & lonceng
  {
    const gx = w.gate * T;
    const gy = GROUND * T;
    const rb = [
      "#ef4444",
      "#f97316",
      "#facc15",
      "#22c55e",
      "#3b82f6",
      "#a855f7",
    ];
    rb.forEach((c, i) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(gx + 80, gy, 150 - i * 8, Math.PI, 0);
      ctx.stroke();
    });
    ctx.fillStyle = "#78350f";
    ctx.fillRect(gx + 76, gy - 160, 8, 30);
    const swing = w.bell ? Math.sin(t * 12) * 0.4 : Math.sin(t * 1.5) * 0.08;
    ctx.save();
    ctx.translate(gx + 80, gy - 130);
    ctx.rotate(swing);
    ctx.fillStyle = "#facc15";
    ctx.beginPath();
    ctx.moveTo(-24, 34);
    ctx.quadraticCurveTo(-22, 0, 0, 0);
    ctx.quadraticCurveTo(22, 0, 24, 34);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#a16207";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#a16207";
    ctx.beginPath();
    ctx.arc(0, 38, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.font = "900 16px system-ui";
    ctx.fillText("FINISH", gx + 80, gy - 20);
  }
  // musuh
  for (const e of w.enemies) {
    if (
      e.x < w.cam - 60 ||
      e.x > w.cam + viewW + 60 ||
      (!e.alive && e.dead <= 0)
    )
      continue;
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    if (!e.alive) ctx.rotate(Math.PI);
    const dir = (e.shell ? e.slide : e.vx) >= 0 ? 1 : -1;
    ctx.scale(dir, 1);
    if (e.kind === "snail") {
      if (!e.shell) {
        ctx.fillStyle = "#fde68a";
        ctx.fillRect(-14, 4, 28, 8);
        ctx.fillRect(8, -6, 6, 12);
        ctx.fillStyle = "#1f2937";
        ctx.fillRect(10, -6, 3, 3);
        ctx.fillStyle = "#b91c1c";
        ctx.fillRect(9, -2, 6, 2);
      }
      ctx.fillStyle = "#16a34a";
      ctx.beginPath();
      ctx.arc(-2, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#065f46";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(-2, 0, 6, 0, Math.PI * 1.6);
      ctx.stroke();
    } else if (e.kind === "hog") {
      ctx.fillStyle = "#78350f";
      for (let i = -12; i <= 8; i += 5) {
        ctx.beginPath();
        ctx.moveTo(i, -2);
        ctx.lineTo(i + 3, -14 - (i % 2) * 2);
        ctx.lineTo(i + 6, -2);
        ctx.fill();
      }
      ctx.fillStyle = "#b45309";
      ctx.beginPath();
      ctx.ellipse(0, 3, 15, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fde68a";
      ctx.beginPath();
      ctx.ellipse(12, 5, 5, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.fillRect(10, 1, 2, 2);
    } else if (e.kind === "bee") {
      const flap = Math.sin(e.t * 30) * 4;
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath();
      ctx.ellipse(-3, -9 - flap / 2, 7, 5 + flap / 2, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.ellipse(0, 2, 13, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1f2937";
      ctx.fillRect(-5, -6, 3, 16);
      ctx.fillRect(2, -6, 3, 16);
      ctx.fillRect(8, -1, 2, 2);
    } else {
      const flap = Math.sin(e.t * 18);
      ctx.fillStyle = "#3b0764";
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(-18, -6 + flap * 8);
      ctx.lineTo(-10, 6);
      ctx.moveTo(4, 0);
      ctx.lineTo(18, -6 + flap * 8);
      ctx.lineTo(10, 6);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fde047";
      ctx.fillRect(2, 0, 2, 2);
      ctx.fillRect(-4, 0, 2, 2);
    }
    ctx.restore();
  }
  // bola benang
  for (const y of w.yarn) {
    ctx.fillStyle = "#f472b6";
    ctx.beginPath();
    ctx.arc(y.x, y.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(y.x, y.y, 5, t * 10, t * 10 + 2.5);
    ctx.stroke();
  }
  // jubah (Kucing Super) & cahaya bintang di belakang kucing
  const p = w.p;
  const cx = p.x + p.w / 2;
  const sinkY =
    p.sink > 0 ? Math.min(1, p.sink) * 44 : p.rise > 0 ? p.rise * 44 : 0;
  if (w.power >= 2 && sinkY < 30) {
    ctx.fillStyle =
      w.power >= 3 ? `hsl(${(t * 360) % 360},90%,60%)` : "#dc2626";
    const wave = Math.sin(t * 14) * (Math.abs(p.vx) > 20 ? 6 : 2);
    ctx.beginPath();
    ctx.moveTo(cx - 6 * p.face, p.y + 10 + sinkY);
    ctx.lineTo(cx - (22 + wave) * p.face, p.y + p.h + sinkY);
    ctx.lineTo(cx - 2 * p.face, p.y + p.h - 4 + sinkY);
    ctx.fill();
  }
  if (w.power >= 3) {
    ctx.fillStyle = `hsla(${(t * 360) % 360},90%,65%,0.35)`;
    ctx.beginPath();
    ctx.arc(cx, p.y + p.h / 2 + sinkY, p.h * 0.95, 0, Math.PI * 2);
    ctx.fill();
  }
  // partikel & teks
  for (const pt of w.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const f of w.floats) {
    ctx.globalAlpha = Math.min(1, f.life * 1.6);
    ctx.font = "900 15px system-ui";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(15,23,42,0.85)";
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // HUD retro
  ctx.font = "bold 13px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(15,23,42,0.6)";
  ctx.fillRect(8, 8, 150, 22);
  ctx.fillStyle = "#fff";
  ctx.fillText(
    `🐟 x${String(w.fish).padStart(2, "0")}  ${POWER[w.power].icon} ${w.power ? POWER[w.power].name.split(" ")[1] : "Biasa"}`,
    14,
    12,
  );
}

/* ---------------- komponen ---------------- */

export function PlatformPlayer(props: PlayerProps) {
  const { gameId, questions, secondsPerQuestion, onPlayingChange } = props;
  const session = useQuizSession(gameId, "platform");
  const [phase, setPhase] = useState<Phase>("ready");
  const [stage, setStage] = useState<Stage>("run");
  const [level, setLevel] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [hintsLeft, setHintsLeft] = useState(GAME_HINTS);
  const [hinting, setHinting] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [power, setPower] = useState(0);
  const [fish, setFish] = useState(0);
  const [banner, setBanner] = useState<{
    text: string;
    key: number;
    good: boolean;
  } | null>(null);
  const [crouchPct, setCrouchPct] = useState(0);
  const [bell, setBell] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const world = useRef(makeWorld([]));
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
  const go = (s: Stage) => {
    world.current.stage = s;
    setStage(s);
  };

  const q = questions[Math.min(level, questions.length - 1)];

  const showQuestion = useCallback(
    (i: number) => {
      setLevel(i);
      setFeedback(null);
      setHidden([]);
      go("question");
      gameAudio().unlockUp();
      session.shown(questions[i].id);
    },
    // go hanya memakai ref & setter

    [questions, session],
  );

  const answerRef = useRef<(k: number) => void>(() => undefined);
  const timer = useQuestionTimer(
    phase === "playing" && stage === "question" ? level : null,
    secondsPerQuestion,
    () => answerRef.current(-1),
  );

  /** masuk terowongan k (−1 = waktu habis): cek jawaban, ubah wujud, keluar di segmen berikutnya */
  const answer = useCallback(
    async (k: number) => {
      const w = world.current;
      if (w.stage !== "question") return;
      const i = w.qi;
      const elapsed = timer.elapsed();
      go("enter");
      w.p.sink = 0.01;
      w.tunnelK = k;
      gameAudio().whoosh();
      const res = await session.check(questions[i].id, k, elapsed);
      if (!res || world.current !== w) return;
      const pts = res.correct
        ? pointsFor(questions[i].points, secondsPerQuestion, elapsed)
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
      let ns = 0;
      if (res.correct) {
        ns = streak + 1;
        setStreak(ns);
        setWrongStreak(0);
        audio.correct(ns);
        const np =
          ns >= 6
            ? 3
            : ns >= 4
              ? Math.max(w.power, 2)
              : ns >= 2
                ? Math.max(w.power, 1)
                : w.power;
        if (np > w.power)
          later(700, () =>
            setBanner({
              text: `✨ Berubah: ${POWER[np].icon} ${POWER[np].name}!`,
              key: Date.now(),
              good: true,
            }),
          );
        else
          later(700, () =>
            setBanner({
              text: `Benar! +${pts} 🎉`,
              key: Date.now(),
              good: true,
            }),
          );
        w.power = np;
      } else {
        setStreak(0);
        setWrongStreak((s) => s + 1);
        if (k === -1) audio.timeout();
        else audio.wrong();
        if (w.power > 0)
          later(700, () =>
            setBanner({
              text: `Salah… kembali jadi Kucing Biasa 😿`,
              key: Date.now(),
              good: false,
            }),
          );
        else
          later(700, () =>
            setBanner({
              text: k === -1 ? "Waktu habis! 💨" : "Kurang tepat… 💨",
              key: Date.now(),
              good: false,
            }),
          );
        w.power = 0;
      }
      setPower(w.power);
      later(650, () => {
        w.qi = i + 1;
        teleport(w, i + 1);
        burst(
          w,
          w.p.x + w.p.w / 2,
          w.p.y,
          res.correct
            ? ["#facc15", "#4ade80", "#f472b6", "#38bdf8"]
            : ["#a8a29e", "#d6d3d1", "#78716c"],
          22,
        );
        if (i + 1 >= questions.length) {
          go("final");
          later(400, () =>
            setBanner({
              text: "🏁 Semua soal selesai! Lari ke Gerbang Pelangi!",
              key: Date.now(),
              good: true,
            }),
          );
        } else go("run");
      });
    },
    // go/teleport/burst hanya memakai ref

    [timer, session, questions, secondsPerQuestion, streak, later],
  );
  useEffect(() => {
    answerRef.current = (k) => void answer(k);
  });

  const finish = useCallback(async () => {
    const w = world.current;
    if (w.stage === "done") return;
    go("done");
    gameAudio().result(w.bell ? "tertinggi" : "tinggi");
    for (let i = 0; i < 4; i++)
      later(i * 250, () =>
        burst(
          w,
          w.gate * T + 80 + (Math.random() - 0.5) * 200,
          GROUND * T - 200 - Math.random() * 80,
          ["#facc15", "#f472b6", "#38bdf8", "#4ade80"],
          28,
          300,
        ),
      );
    later(2200, async () => {
      setPhase("finishing");
      gameAudio().stopMusic();
      const res = await session.submit();
      if (!res) return setPhase("ready");
      setResult(res);
      setPhase("result");
      gameAudio().result(res.tier);
    });
  }, [later, session]);

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

  const cd = useCountdown(phase === "countdown", () => {
    setPhase("playing");
    setBanner({
      text: `${THEMES[0].name} — ayo jalan ke kanan! ▶`,
      key: Date.now(),
      good: true,
    });
  });
  const begin = async () => {
    requestMobileFullscreen();
    const audio = gameAudio();
    audio.unlock();
    audio.click();
    audio.startMusic();
    run.current++;
    world.current = makeWorld(questions.map(optionCount));
    setStage("run");
    setLevel(0);
    setFeedback(null);
    setHidden([]);
    setHintsLeft(GAME_HINTS);
    setScore(0);
    setStreak(0);
    setWrongStreak(0);
    setPower(0);
    setFish(0);
    setBell(false);
    setBanner(null);
    setResult(null);
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

  const exit = () => {
    run.current++;
    session.stop();
    world.current.stage = "done";
    setPhase("ready");
  };

  /* ---------------- kontrol ---------------- */

  const press = (key: "l" | "r" | "jump" | "down" | "throw", on: boolean) => {
    const w = world.current;
    if (key === "throw") {
      if (on) throwYarn(w);
      return;
    }
    if (key === "jump" && on && !w.keys.jump) w.p.jumpBuf = 0.12;
    w.keys[key] = on;
  };
  const pressRef = useRef(press);
  useEffect(() => {
    pressRef.current = press;
  });
  useEffect(() => {
    if (phase !== "playing") return;
    const map: Record<string, "l" | "r" | "jump" | "down" | "throw"> = {
      arrowleft: "l",
      a: "l",
      arrowright: "r",
      d: "r",
      arrowup: "jump",
      w: "jump",
      " ": "jump",
      arrowdown: "down",
      s: "down",
      f: "throw",
    };
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = map[e.key.toLowerCase()];
      if (!k) return;
      e.preventDefault();
      if (e.repeat && k !== "down" && k !== "l" && k !== "r") return;
      pressRef.current(k, true);
    };
    const up = (e: KeyboardEvent) => {
      const k = map[e.key.toLowerCase()];
      if (k) pressRef.current(k, false);
    };
    // tombol layar dilepas di mana pun → berhenti (fase capture: tidak terhalang stopPropagation)
    const release = () => {
      const k = world.current.keys;
      k.l = k.r = k.jump = k.down = false;
    };
    const opts = { capture: true };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    window.addEventListener("pointerup", release, opts);
    window.addEventListener("pointercancel", release, opts);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
      window.removeEventListener("pointerup", release, opts);
      window.removeEventListener("pointercancel", release, opts);
    };
  }, [phase]);
  const onPadDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    press(
      e.currentTarget.dataset.key as "l" | "r" | "jump" | "down" | "throw",
      true,
    );
  };
  const onPadUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const k = e.currentTarget.dataset.key as
      "l" | "r" | "jump" | "down" | "throw";
    if (k !== "throw") press(k, false);
  };
  const padProps = {
    onPointerDown: onPadDown,
    onPointerUp: onPadUp,
    onPointerCancel: onPadUp,
    onLostPointerCapture: onPadUp,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  /* ---------------- loop ---------------- */

  const refs = useRef({ answer: answerRef, showQuestion, finish });
  useEffect(() => {
    refs.current = { answer: answerRef, showQuestion, finish };
  });
  const active =
    phase === "countdown" || phase === "playing" || phase === "finishing";
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
    let raf = 0;
    let last = performance.now();
    let lastFish = -1;
    let lastCrouch = -1;
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const w = world.current;
      const t = now / 1000;
      const scale = H / (ROWS * T);
      if (phase === "playing") {
        stepWorld(w, dt);
        const p = w.p;
        // kamera mengikuti kucing (sepertiga kiri layar)
        const viewW = W / scale;
        w.cam +=
          (Math.max(0, Math.min(w.W * T - viewW, p.x - viewW * 0.38)) - w.cam) *
          Math.min(1, dt * 8);
        // soal muncul saat mendekati terowongan jawaban
        const z = w.zones[w.qi];
        if (w.stage === "run" && z && p.x >= z.trigger * T)
          refs.current.showQuestion(w.qi);
        // jongkok di atas terowongan = memilih jawaban
        const k = w.stage === "question" ? tunnelUnder(w) : -1;
        const pct = k >= 0 ? Math.min(1, p.crouch / CROUCH_S) : 0;
        const pr = Math.round(pct * 10);
        if (pr !== lastCrouch) {
          lastCrouch = pr;
          setCrouchPct(pct);
        }
        if (k >= 0 && p.crouch >= CROUCH_S) {
          p.crouch = 0;
          refs.current.answer.current(k);
        }
        // finis: lonceng & gerbang
        if (w.stage === "final") {
          const bx = w.gate * T + 80;
          const by = GROUND * T - 130;
          if (!w.bell && Math.abs(p.x + p.w / 2 - bx) < 34 && p.y < by + 40) {
            w.bell = true;
            setBell(true);
            gameAudio().unlockUp();
            say(w, bx, by - 20, "DING! 🔔 Lompatan juara!", "#fde047", 2);
          }
          if (p.x + p.w / 2 >= w.gate * T + 80) void refs.current.finish();
        }
        if (w.fish !== lastFish) {
          lastFish = w.fish;
          setFish(w.fish);
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawWorld(ctx, w, W, H, scale, t);
      // kucing (DOM)
      if (catRef.current) {
        const p = w.p;
        const big = w.power > 0 ? 1.4 : 1;
        const size = 40 * big * scale;
        const sink =
          p.sink > 0 ? Math.min(1, p.sink) * 44 : p.rise > 0 ? p.rise * 44 : 0;
        const squash = p.crouch > 0 ? 0.72 : 1;
        const blink = p.inv > 0 && Math.sin(t * 40) > 0 ? 0.35 : 1;
        catRef.current.style.width = `${size}px`;
        catRef.current.style.height = `${size}px`;
        catRef.current.style.opacity = String(p.sink >= 1 ? 0 : blink);
        catRef.current.style.transform = `translate(${(p.x + p.w / 2 - w.cam) * scale - size / 2}px, ${(p.y + p.h + sink) * scale - size * squash}px) scale(${p.face}, ${squash})`;
        catRef.current.style.clipPath =
          sink > 0
            ? `inset(0 0 ${Math.min(100, (sink / (40 * big)) * 100)}% 0)`
            : "none";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [active, phase]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __platform: unknown }).__platform = {
      phase,
      stage,
      level,
      score,
      power,
      fish,
      world: world.current,
    };
    (window as unknown as { __platformLevel: unknown }).__platformLevel =
      makeLevel;
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
  if (phase === "result" && result)
    return (
      <div className="space-y-4">
        <div className="card p-4 text-center text-sm font-bold text-navy-700">
          <p className="text-base">🌈 Kucing tiba di Gerbang Pelangi!</p>
          <p className="mt-1">
            🐟 {fish} ikan dikoleksi · wujud akhir {POWER[power].icon}{" "}
            {POWER[power].name}
            {bell && " · 🔔 Lonceng emas berbunyi!"}
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
        title="Petualangan Kucing: Lembah Pixel"
        subtitle="Platformer retro gulir-samping! Lewati rintangan & musuh, lalu jongkok di terowongan jawaban yang benar."
        bullets={[
          {
            text: "🕹️ ◀ ▶ jalan, ⬆ / spasi lompat (tahan = lebih tinggi), ⬇ / S jongkok, F lempar bola benang.",
          },
          {
            text: "🚇 Di ujung tiap wilayah ada terowongan A/B/C/D: berdiri di atasnya & jongkok sampai bar penuh untuk menjawab.",
          },
          {
            text: "✨ Benar beruntun → berubah wujud: 🧢 Jagoan (2x), 🦸 Super + bola benang (4x), ⭐ Bintang kebal (6x). Salah → kembali biasa.",
          },
          {
            text: "🐌 Injak siput & lebah — tapi 🦔 landak berduri harus dilompati! Sundul balok 🐾 untuk ikan.",
          },
          {
            text: `🌈 Finis di Gerbang Pelangi — lompat setinggi mungkin untuk membunyikan lonceng emas! ${secondsPerQuestion} detik per soal, skor sama dengan mode klasik.`,
            tone: "emerald",
            wide: true,
          },
        ]}
        loggedIn={props.loggedIn}
        loginHref={props.loginHref}
        onBack={props.onExit}
        onStart={() => void begin()}
        startLabel="Mulai petualangan"
        startIcon={<Sparkles className="h-5 w-5" />}
      />
    );

  const n = optionCount(q);
  const mood = feedback
    ? feedback.correct
      ? "girang"
      : "sedih"
    : catMood(streak, wrongStreak);
  const padBtn =
    "grid h-14 w-14 place-items-center rounded-2xl bg-white/30 text-white ring-1 ring-white/50 backdrop-blur active:bg-white/55 sm:h-12 sm:w-12";
  return (
    <ArenaFrame
      label={
        stage === "final" || stage === "done"
          ? "Menuju finis 🌈"
          : `Wilayah ${Math.min(level + 1, questions.length)}/${questions.length}`
      }
      extra={
        <>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-amber-700">
            ⭐ {score}
          </span>
          {stage === "question" && <TimeChip left={timer.timeLeft} />}
        </>
      }
      hint={
        stage === "question"
          ? {
              left: hintsLeft,
              busy: hinting,
              disabled: hintsLeft <= 0 || hidden.length > 0 || n <= 2,
              onClick: () => void takeHint(),
            }
          : null
      }
      onExit={exit}
    >
      {/* panel soal */}
      <div className="max-h-[36svh] shrink-0 overflow-y-auto border-b border-navy-100 bg-white p-3">
        {stage === "question" ||
        stage === "enter" ||
        (feedback && stage !== "final") ? (
          <>
            <MathText
              key={q.id}
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
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-extrabold text-white"
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
                  </div>
                );
              })}
            </div>
            {feedback ? (
              <div className="mt-2">
                <FeedbackBox
                  key={level}
                  feedback={feedback}
                  message={
                    level + 1 < questions.length
                      ? "Lanjutkan petualangan ke kanan ▶"
                      : "Lari ke Gerbang Pelangi 🌈"
                  }
                />
              </div>
            ) : stage === "question" ? (
              <p className="mt-2 text-xs font-semibold text-navy-500">
                Berdiri di atas terowongan jawabanmu lalu <b>jongkok ⬇</b>{" "}
                sampai bar penuh. Terowongan yang ditutup 50:50 tetap bisa
                dimasuki — hati-hati!
              </p>
            ) : (
              <p className="mt-2 text-sm font-semibold text-navy-500">
                🚇 Masuk terowongan…
              </p>
            )}
          </>
        ) : (
          <p className="text-sm font-semibold text-navy-600">
            {phase === "countdown"
              ? "Bersiap… 🎮"
              : stage === "final" || stage === "done"
                ? "🌈 Lari ke Gerbang Pelangi & lompat untuk membunyikan lonceng emas!"
                : `▶ Jelajahi ${THEMES[level % THEMES.length].name} — soal muncul saat kamu tiba di terowongan jawaban.`}
          </p>
        )}
      </div>

      {/* arena */}
      <div className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-sky-300">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full [image-rendering:pixelated]"
        />
        <div
          ref={catRef}
          className="pointer-events-none absolute left-0 top-0 origin-bottom will-change-transform"
        >
          {power === 1 && (
            <span className="absolute -top-[26%] left-1/2 -translate-x-1/2 text-[min(5vw,26px)]">
              🧢
            </span>
          )}
          <GameCat mood={mood} className="h-full w-full" />
        </div>
        {crouchPct > 0 && stage === "question" && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 w-40 -translate-x-1/2 rounded-full bg-navy-950/70 p-1">
            <div
              className="h-2.5 rounded-full bg-amber-400 transition-[width] duration-100"
              style={{ width: `${crouchPct * 100}%` }}
            />
          </div>
        )}
        {banner && (
          <div
            key={banner.key}
            className="duel-banner pointer-events-none absolute inset-x-0 top-[22%] z-20 text-center"
          >
            <span
              className={cn(
                "inline-block max-w-[92%] rounded-2xl px-4 py-2 text-sm font-black text-white shadow-xl sm:text-base",
                banner.good ? "bg-emerald-600/90" : "bg-rose-600/90",
              )}
            >
              {banner.text}
            </span>
          </div>
        )}
        {streak >= 2 && (
          <div className="pointer-events-none absolute right-2 top-2 z-10 animate-pop rounded-xl bg-orange-500/90 px-2.5 py-1 text-xs font-black text-white shadow-lg">
            🔥 x{streak}
          </div>
        )}
        {/* tombol layar */}
        {phase === "playing" && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 p-3">
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Kiri"
                data-key="l"
                className={padBtn}
                {...padProps}
              >
                <ArrowLeft className="h-7 w-7" />
              </button>
              <button
                type="button"
                aria-label="Kanan"
                data-key="r"
                className={padBtn}
                {...padProps}
              >
                <ArrowRight className="h-7 w-7" />
              </button>
            </div>
            <div className="flex items-end gap-2">
              {power >= 2 && (
                <button
                  type="button"
                  aria-label="Lempar"
                  data-key="throw"
                  className={cn(padBtn, "bg-pink-400/70 text-xl")}
                  {...padProps}
                >
                  🧶
                </button>
              )}
              <button
                type="button"
                aria-label="Jongkok"
                data-key="down"
                className={cn(
                  padBtn,
                  stage === "question" && "bg-amber-400/80 text-navy-950",
                )}
                {...padProps}
              >
                <ArrowDown className="h-7 w-7" />
              </button>
              <button
                type="button"
                aria-label="Lompat"
                data-key="jump"
                className="grid h-16 w-16 place-items-center rounded-full bg-sun-400/90 text-navy-950 shadow-lg ring-2 ring-white/50 active:scale-95"
                {...padProps}
              >
                <ArrowUp className="h-8 w-8" />
              </button>
            </div>
          </div>
        )}
        <p className="pointer-events-none absolute left-3 top-10 z-10 hidden rounded-lg bg-navy-950/50 px-2 py-1 text-[11px] text-white pointer-fine:block">
          ◀ ▶ / A D: jalan · ⬆ / W / spasi: lompat · ⬇ / S: jongkok · F: lempar
        </p>
        <ArenaOverlay phase={phase} count={cd.count} />
      </div>
    </ArenaFrame>
  );
}

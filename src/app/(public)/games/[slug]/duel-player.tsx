"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Lightbulb,
  LogIn,
  LogOut,
  Maximize,
  Minimize,
  Swords,
  Zap,
} from "lucide-react";
import {
  checkAnswerAction,
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
 * Mode Duel: soal yang sama dengan mode klasik, disajikan sebagai pertarungan bergiliran.
 * Kucing melawan beberapa monster lalu bos di soal-soal terakhir. Jawab benar = kucing menyerang (cepat = kritikal),
 * salah / waktu habis = monster balas menyerang. Tidak ada tekanan gerak — cocok untuk soal yang butuh berpikir.
 * Kunci, waktu & skor tetap dicatat server (startPlay → questionShown → checkAnswer → submitScore); nyawa, perisai,
 * jurus spesial & HP monster hanya tampilan (tidak memengaruhi skor), sehingga skor setara mode klasik.
 */

type Question = { id: number; text: string; options: string[]; points: number };
type Phase = "ready" | "countdown" | "battle" | "finishing" | "result";
/** enter = monster baru muncul · question = soal tampil (waktu berjalan) · anim = serangan · feedback = pembahasan */
type Stage = "enter" | "question" | "checking" | "anim" | "feedback";
type FxKind = "attack" | "crit" | "special" | "hurt" | "block";
type MonsterState = "enter" | "idle" | "defeat" | "flee";
type Float = {
  id: number;
  text: string;
  side: "cat" | "monster";
  color: string;
};
type Feedback = {
  choice: number;
  correct: boolean;
  answerIndex: number;
  explanation: string | null;
  points: number;
};

const LETTERS = ["A", "B", "C", "D", "E"];
const OPTION_STYLES = [
  "from-brand-500 to-brand-700",
  "from-sky-500 to-navy-600",
  "from-sun-500 to-sun-700",
  "from-sky-500 to-navy-800",
  "from-brand-400 to-navy-700",
];

const MAX_HEARTS = 3;
/** jurus spesial terisi setelah sekian jawaban benar */
const CHARGE_MAX = 3;
/** HP monster per soal yang dihadapinya; serangan biasa 60–100 → semua benar pasti mengalahkan monster */
const HP_PER_Q = 60;
/** kritikal bila dijawab benar dalam 40% awal waktu soal */
const CRIT_REMAIN = 0.6;
const ENTER_MS = 1300;
const ANIM_MS = 1150;
const FLEE_MS = 750;

type Kind = "slime" | "bat" | "rock" | "ghost" | "king";
const MONSTERS: { kind: Kind; name: string; body: string; dark: string }[] = [
  { kind: "slime", name: "Lendo si Slime", body: "#4ade80", dark: "#15803d" },
  {
    kind: "bat",
    name: "Kelepak si Kelelawar",
    body: "#a78bfa",
    dark: "#6d28d9",
  },
  {
    kind: "rock",
    name: "Batuk si Golem Batu",
    body: "#a8a29e",
    dark: "#57534e",
  },
  {
    kind: "ghost",
    name: "Kabut si Hantu Iseng",
    body: "#bae6fd",
    dark: "#0284c7",
  },
];
const BOSS = {
  kind: "king" as const,
  name: "Raja Monster Soal",
  body: "#f87171",
  dark: "#991b1b",
};

/** Skor per soal sama dengan server: poin penuh bila instan, minimal 50% setelah batas waktu */
function pointsFor(base: number, secondsLimit: number, elapsedMs: number) {
  const limitMs = secondsLimit * 1000;
  const remaining = Math.max(0, limitMs - Math.min(elapsedMs, limitMs));
  return Math.round(base * (0.5 + 0.5 * (remaining / limitMs)));
}

type Foe = {
  kind: Kind;
  name: string;
  body: string;
  dark: string;
  end: number;
  hp: number;
  boss: boolean;
  serial: number;
};

/** bos menghadapi 1–3 soal terakhir */
const bossShare = (n: number) => (n <= 3 ? n : n <= 6 ? 2 : 3);

/**
 * Lawan untuk soal ke-i. Monster biasa mendapat jatah 2–3 soal (kabur bila belum kalah saat jatahnya habis);
 * kalah lebih cepat → monster berikutnya langsung datang. Bos selalu menghadapi soal-soal terakhir,
 * dan bila kalah sebelum soal terakhir ia bangkit lagi dengan HP sisa soal.
 */
function nextFoe(i: number, n: number, serial: number, bossRound: number): Foe {
  const bossQ = bossShare(n);
  const remaining = n - i;
  if (remaining <= bossQ)
    return {
      ...BOSS,
      name: bossRound > 0 ? "Raja Monster (bangkit lagi!)" : BOSS.name,
      end: n,
      hp: remaining * HP_PER_Q,
      boss: true,
      serial,
    };
  const rest = remaining - bossQ;
  const size = rest <= 3 ? rest : 2;
  return {
    ...MONSTERS[serial % MONSTERS.length],
    end: i + size,
    hp: size * HP_PER_Q,
    boss: false,
    serial,
  };
}

/** Monster SVG lucu: bentuk badan per jenis; mata silang saat kalah */
function MonsterArt({
  kind,
  body,
  dark,
  hurt,
}: {
  kind: Kind;
  body: string;
  dark: string;
  hurt: boolean;
}) {
  const eyes = hurt ? (
    <g stroke="#1e1b4b" strokeWidth="5" strokeLinecap="round">
      <path d="M52 66 L66 80 M66 66 L52 80" />
      <path d="M94 66 L108 80 M108 66 L94 80" />
    </g>
  ) : (
    <g>
      <ellipse cx="59" cy="73" rx="13" ry="14" fill="white" />
      <ellipse cx="101" cy="73" rx="13" ry="14" fill="white" />
      <circle cx="55" cy="76" r="6.5" fill="#1e1b4b" />
      <circle cx="97" cy="76" r="6.5" fill="#1e1b4b" />
      <circle cx="53" cy="73" r="2" fill="white" />
      <circle cx="95" cy="73" r="2" fill="white" />
      <path
        d="M44 56 L70 63 M116 56 L90 63"
        stroke="#1e1b4b"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </g>
  );
  const mouth = (
    <g>
      <path d="M58 100 Q80 116 102 100 Q80 106 58 100Z" fill="#7f1d1d" />
      <path d="M64 101 L68 109 L72 103 M88 103 L92 109 L96 101" fill="white" />
    </g>
  );
  return (
    <svg
      viewBox="0 0 160 150"
      overflow="visible"
      className="h-full w-full drop-shadow-xl"
    >
      <ellipse cx="80" cy="142" rx="50" ry="7" fill="black" opacity="0.18" />
      {kind === "bat" && (
        <g fill={dark}>
          <path d="M40 70 Q8 40 0 74 Q14 70 18 86 Q26 74 40 92Z" />
          <path d="M120 70 Q152 40 160 74 Q146 70 142 86 Q134 74 120 92Z" />
        </g>
      )}
      {kind === "king" && (
        <g>
          <path
            d="M34 50 Q18 22 30 6 Q36 30 52 40Z"
            fill="#fef3c7"
            stroke={dark}
            strokeWidth="3"
          />
          <path
            d="M126 50 Q142 22 130 6 Q124 30 108 40Z"
            fill="#fef3c7"
            stroke={dark}
            strokeWidth="3"
          />
        </g>
      )}
      {kind === "slime" && (
        <path
          d="M18 130 Q14 44 80 36 Q146 44 142 130 Q112 140 80 136 Q48 140 18 130Z"
          fill={body}
          stroke={dark}
          strokeWidth="4"
        />
      )}
      {kind === "bat" && (
        <ellipse
          cx="80"
          cy="88"
          rx="44"
          ry="48"
          fill={body}
          stroke={dark}
          strokeWidth="4"
        />
      )}
      {kind === "rock" && (
        <path
          d="M22 132 L14 84 L34 48 L62 30 L100 32 L130 52 L146 90 L138 132Z"
          fill={body}
          stroke={dark}
          strokeWidth="4"
          strokeLinejoin="round"
        />
      )}
      {kind === "ghost" && (
        <path
          d="M24 136 L24 76 Q24 30 80 30 Q136 30 136 76 L136 136 L118 124 L100 136 L80 124 L60 136 L42 124Z"
          fill={body}
          stroke={dark}
          strokeWidth="4"
          strokeLinejoin="round"
          opacity="0.92"
        />
      )}
      {kind === "king" && (
        <path
          d="M14 134 Q8 40 80 30 Q152 40 146 134 Q112 144 80 140 Q48 144 14 134Z"
          fill={body}
          stroke={dark}
          strokeWidth="4"
        />
      )}
      {kind === "slime" && (
        <ellipse cx="46" cy="56" rx="10" ry="6" fill="white" opacity="0.45" />
      )}
      {kind === "rock" && (
        <path
          d="M40 112 L56 100 M110 116 L122 98 M96 46 L104 58"
          stroke={dark}
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      {kind === "bat" && (
        <path
          d="M58 44 L52 24 L70 40 M102 44 L108 24 L90 40"
          fill={body}
          stroke={dark}
          strokeWidth="3"
        />
      )}
      {kind === "king" && (
        <path
          d="M54 34 L58 10 L70 24 L80 4 L90 24 L102 10 L106 34Z"
          fill="#facc15"
          stroke="#a16207"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      )}
      {eyes}
      {mouth}
    </svg>
  );
}

export function DuelPlayer(props: {
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
  const [stage, setStage] = useState<Stage>("enter");
  const [level, setLevel] = useState(0);
  const [foe, setFoe] = useState<Foe>(() => nextFoe(0, questions.length, 0, 0));
  const [hp, setHp] = useState(0);
  const [monsterState, setMonsterState] = useState<MonsterState>("enter");
  const [hearts, setHearts] = useState(MAX_HEARTS);
  const [shield, setShield] = useState(false);
  const [charge, setCharge] = useState(0);
  const [armed, setArmed] = useState(false);
  const [fx, setFx] = useState<{ kind: FxKind; key: number } | null>(null);
  const [floats, setFloats] = useState<Float[]>([]);
  const [banner, setBanner] = useState<{ text: string; key: number } | null>(
    null,
  );
  const [timeLeft, setTimeLeft] = useState(secondsPerQuestion);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [hidden, setHidden] = useState<number[]>([]);
  const [hintsLeft, setHintsLeft] = useState(GAME_HINTS);
  const [hinting, setHinting] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [defeated, setDefeated] = useState(0);
  const [faints, setFaints] = useState(0);
  const [bossDown, setBossDown] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const token = useRef<string | null>(null);
  /** id permainan: balasan server / timer dari permainan lama (keluar lalu main ulang) diabaikan */
  const run = useRef(0);
  const shownAt = useRef(0);
  const locked = useRef(true);
  const lastTick = useRef(0);
  const floatId = useRef(0);
  // salinan nilai terbaru untuk dipakai di dalam callback async
  const live = useRef({
    hp: 0,
    hearts: MAX_HEARTS,
    shield: false,
    charge: 0,
    armed: false,
    streak: 0,
  });
  const foeRef = useRef({
    foe: nextFoe(0, questions.length, 0, 0),
    bossRounds: 0,
  });

  const playing =
    phase === "countdown" || phase === "battle" || phase === "finishing";
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

  /** jalankan fn setelah ms, hanya bila masih di permainan yang sama */
  const later = useCallback((ms: number, fn: () => void) => {
    const id = run.current;
    setTimeout(() => {
      if (run.current === id) fn();
    }, ms);
  }, []);

  const pushFloat = useCallback(
    (text: string, side: Float["side"], color: string) => {
      const id = ++floatId.current;
      setFloats((f) => [...f, { id, text, side, color }]);
      setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1400);
    },
    [],
  );
  const showBanner = (text: string) => setBanner({ text, key: Date.now() });

  const sync = (patch: Partial<typeof live.current>) => {
    Object.assign(live.current, patch);
    if (patch.hp !== undefined) setHp(patch.hp);
    if (patch.hearts !== undefined) setHearts(patch.hearts);
    if (patch.shield !== undefined) setShield(patch.shield);
    if (patch.charge !== undefined) setCharge(patch.charge);
    if (patch.armed !== undefined) setArmed(patch.armed);
    if (patch.streak !== undefined) setStreak(patch.streak);
  };

  /* ---------------- alur soal (server) ---------------- */

  const showQuestion = useCallback(
    (i: number) => {
      setLevel(i);
      setFeedback(null);
      setPicked(null);
      setHidden([]);
      setTimeLeft(secondsPerQuestion);
      setStage("question");
      shownAt.current = performance.now();
      lastTick.current = 0;
      locked.current = false;
      gameAudio().setIntensity(false);
      if (token.current)
        void questionShownAction(token.current, questions[i].id);
    },
    [questions, secondsPerQuestion],
  );

  /** soal ke-i: bila monsternya baru, monster masuk dulu (waktu soal belum berjalan) */
  const startQuestion = useCallback(
    (i: number, fresh = false) => {
      const cur = foeRef.current;
      if (fresh || live.current.hp <= 0 || i >= cur.foe.end) {
        const foe = nextFoe(
          i,
          questions.length,
          fresh ? 0 : cur.foe.serial + 1,
          cur.bossRounds,
        );
        if (foe.boss) cur.bossRounds++;
        cur.foe = foe;
        setFoe(foe);
        sync({ hp: foe.hp });
        setMonsterState("enter");
        setLevel(i);
        setFeedback(null);
        setStage("enter");
        showBanner(foe.boss ? "⚠️ BOS MUNCUL!" : `${foe.name} muncul!`);
        if (foe.boss) gameAudio().roar();
        else gameAudio().whoosh();
        later(ENTER_MS, () => {
          setMonsterState("idle");
          showQuestion(i);
        });
      } else showQuestion(i);
    },
    // sync hanya menulis ref & state
     
    [questions.length, later, showQuestion],
  );

  const answer = useCallback(
    async (choice: number) => {
      if (locked.current) return;
      locked.current = true;
      const id = run.current;
      const i = level;
      const elapsed = Math.round(performance.now() - shownAt.current);
      setPicked(choice);
      setStage("checking");
      gameAudio().setIntensity(false);
      try {
        const res = await checkAnswerAction(
          token.current ?? "",
          questions[i].id,
          choice,
          elapsed,
        );
        if (run.current !== id) return;
        if ("error" in res && res.error) toast.error(res.error);
        const L = live.current;
        const pts = res.correct
          ? pointsFor(questions[i].points, secondsPerQuestion, elapsed)
          : 0;
        setFeedback({
          choice,
          correct: res.correct,
          answerIndex: res.answerIndex,
          explanation: res.explanation ?? null,
          points: pts,
        });
        setScore((s) => s + pts);
        const audio = gameAudio();
        if (res.correct) {
          const remain =
            1 -
            Math.min(elapsed, secondsPerQuestion * 1000) /
              (secondsPerQuestion * 1000);
          const crit = remain >= CRIT_REMAIN;
          const special = L.armed;
          const dmg = Math.round(
            (60 + 40 * remain) * (crit ? 1.5 : 1) * (special ? 2 : 1),
          );
          const hpLeft = Math.max(0, L.hp - dmg);
          const streakNow = L.streak + 1;
          const gainShield = streakNow % 3 === 0 && !L.shield;
          sync({
            hp: hpLeft,
            streak: streakNow,
            armed: false,
            charge: special ? 0 : Math.min(CHARGE_MAX, L.charge + 1),
            shield: L.shield || gainShield,
          });
          setWrongStreak(0);
          setFx({
            kind: special ? "special" : crit ? "crit" : "attack",
            key: Date.now(),
          });
          if (special) audio.thunder();
          else audio.slash(crit);
          audio.correct(streakNow);
          later(300, () =>
            pushFloat(
              `-${dmg}${crit ? " KRITIKAL!" : ""}`,
              "monster",
              special ? "#fde047" : crit ? "#fb923c" : "#ffffff",
            ),
          );
          if (gainShield)
            later(700, () => {
              pushFloat("+🛡️ Perisai", "cat", "#7dd3fc");
              audio.heal();
            });
          if (L.charge + 1 >= CHARGE_MAX && !special && L.charge < CHARGE_MAX)
            later(900, () => showBanner("⚡ Jurus spesial siap!"));
          if (hpLeft <= 0) {
            const foe = foeRef.current.foe;
            later(ANIM_MS - 250, () => {
              setMonsterState("defeat");
              setDefeated((d) => d + 1);
              if (foe.boss) setBossDown(true);
              showBanner(foe.boss ? "🏆 BOS KALAH!" : "Monster kalah!");
              if (live.current.hearts < MAX_HEARTS) {
                sync({ hearts: live.current.hearts + 1 });
                pushFloat("+❤️", "cat", "#f87171");
              }
              audio.heal();
            });
          }
        } else {
          setWrongStreak((s) => s + 1);
          const blocked = L.shield;
          let heartsLeft = L.hearts;
          if (!blocked) heartsLeft = L.hearts - 1;
          sync({
            streak: 0,
            armed: false,
            charge: L.armed ? 0 : L.charge,
            shield: false,
          });
          setFx({ kind: blocked ? "block" : "hurt", key: Date.now() });
          audio.roar();
          if (choice === -1) audio.timeout();
          else audio.wrong();
          if (blocked)
            later(300, () => {
              pushFloat("🛡️ Ditahan!", "cat", "#7dd3fc");
              audio.clang();
            });
          else {
            later(300, () => pushFloat("-❤️", "cat", "#f87171"));
            if (heartsLeft <= 0) {
              // pingsan sebentar lalu bangkit lagi — permainan tetap berlanjut agar skor adil
              setFaints((f) => f + 1);
              later(700, () => {
                showBanner("😵 Pingsan… bangkit lagi!");
                sync({ hearts: MAX_HEARTS });
              });
            }
            sync({ hearts: Math.max(0, heartsLeft) });
          }
        }
      } catch {
        if (run.current !== id) return;
        toast.error(
          "Koneksi terputus saat mengecek jawaban — lanjut ke soal berikutnya.",
        );
        setFeedback({
          choice,
          correct: false,
          answerIndex: -1,
          explanation: null,
          points: 0,
        });
      }
      setStage("anim");
      later(ANIM_MS, () => setStage("feedback"));
    },
    // sync hanya menulis ref & state
     
    [level, questions, secondsPerQuestion, toast, later, pushFloat],
  );

  const finish = useCallback(async () => {
    const id = run.current;
    setPhase("finishing");
    gameAudio().stopMusic();
    try {
      const res = await submitScoreAction(token.current ?? "");
      if (run.current !== id) return;
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

  /** lanjut dari pembahasan: monster yang belum kalah di akhir gilirannya kabur dulu */
  const next = useCallback(() => {
    if (stage !== "feedback") return;
    gameAudio().click();
    const foe = foeRef.current.foe;
    const lastOfFoe = level + 1 >= foe.end;
    const go = () =>
      level + 1 < questions.length ? startQuestion(level + 1) : void finish();
    setStage("enter");
    if (lastOfFoe && live.current.hp > 0) {
      setMonsterState("flee");
      showBanner(
        foe.boss ? "Bos kabur… lain kali pasti kalah!" : `${foe.name} kabur!`,
      );
      gameAudio().whoosh();
      later(FLEE_MS, go);
    } else go();
     
  }, [stage, level, questions.length, startQuestion, finish, later]);

  const takeHint = async () => {
    const id = run.current;
    const i = level;
    if (
      stage !== "question" ||
      hinting ||
      hintsLeft <= 0 ||
      hidden.length ||
      locked.current
    )
      return;
    setHinting(true);
    gameAudio().click();
    try {
      const res = await takeHintAction(token.current ?? "", questions[i].id);
      if (run.current !== id) return;
      if (res.error) toast.error(res.error);
      if (typeof res.left === "number") setHintsLeft(res.left);
      if (res.removed && !locked.current) setHidden(res.removed);
    } catch {
      toast.error("Koneksi terputus saat mengambil petunjuk.");
    } finally {
      setHinting(false);
    }
  };

  const toggleSpecial = () => {
    if (stage !== "question" || locked.current) return;
    const L = live.current;
    if (L.armed) {
      sync({ armed: false });
      gameAudio().click();
    } else if (L.charge >= CHARGE_MAX) {
      sync({ armed: true });
      gameAudio().boost();
    }
  };

  // waktu soal (sama dengan mode klasik)
  useEffect(() => {
    if (phase !== "battle" || stage !== "question") return;
    const t = setInterval(() => {
      const left =
        secondsPerQuestion - (performance.now() - shownAt.current) / 1000;
      setTimeLeft(Math.max(0, left));
      const sec = Math.ceil(left);
      if (left > 0 && sec <= 5 && sec !== lastTick.current) {
        lastTick.current = sec;
        gameAudio().tick();
        gameAudio().setIntensity(true);
      }
      if (left <= 0) {
        clearInterval(t);
        void answer(-1);
      }
    }, 100);
    return () => clearInterval(t);
  }, [phase, stage, secondsPerQuestion, answer]);

  // keyboard: 1–5 / A–E jawab · S / spasi jurus spesial · Enter lanjut
  const keys = useRef({ answer, next, toggleSpecial, stage, hidden, n: 0 });
  useEffect(() => {
    keys.current = {
      answer,
      next,
      toggleSpecial,
      stage,
      hidden,
      n: questions[level]?.options.length ?? 0,
    };
  });
  useEffect(() => {
    if (phase !== "battle") return;
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
        } else if (key === "s" || key === " ") {
          e.preventDefault();
          k.toggleSpecial();
        }
      } else if (k.stage === "feedback" && key === "enter") {
        e.preventDefault();
        k.next();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [phase]);

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
    run.current++;
    locked.current = true;
    live.current = {
      hp: 0,
      hearts: MAX_HEARTS,
      shield: false,
      charge: 0,
      armed: false,
      streak: 0,
    };
    setHp(0);
    setHearts(MAX_HEARTS);
    setShield(false);
    setCharge(0);
    setArmed(false);
    setFx(null);
    setFloats([]);
    setBanner(null);
    setLevel(0);
    foeRef.current = { foe: nextFoe(0, questions.length, 0, 0), bossRounds: 0 };
    setFoe(foeRef.current.foe);
    setMonsterState("enter");
    setStage("enter");
    setFeedback(null);
    setHidden([]);
    setHintsLeft(GAME_HINTS);
    setScore(0);
    setStreak(0);
    setWrongStreak(0);
    setDefeated(0);
    setFaints(0);
    setBossDown(false);
    setResult(null);
    setConfirmExit(false);
    setCount(3);
    setPhase("countdown");
    token.current = null;
    const id = run.current;
    startPlayAction(gameId, "duel")
      .then((r) => {
        if (run.current !== id) return;
        if (r.token) token.current = r.token;
        else {
          toast.error(r.error ?? "Gagal memulai game.");
          gameAudio().stopMusic(0.1);
          setPhase("ready");
        }
      })
      .catch(() => {
        if (run.current !== id) return;
        toast.error("Koneksi terputus. Coba mulai lagi.");
        setPhase("ready");
      });
  };

  // hitung mundur 3-2-1 → monster pertama masuk (menunggu sesi server siap)
  useEffect(() => {
    if (phase !== "countdown") return;
    gameAudio().countdown(count === 0);
    const id = run.current;
    const t = setTimeout(
      () => {
        if (count > 0) return setCount((c) => c - 1);
        const go = () => {
          if (run.current !== id) return;
          if (!token.current) return void setTimeout(go, 150);
          setPhase("battle");
          startQuestion(0, true);
        };
        go();
      },
      count === 0 ? 350 : 650,
    );
    return () => clearTimeout(t);
  }, [phase, count, startQuestion]);

  const exit = () => {
    if (!confirmExit) {
      setConfirmExit(true);
      setTimeout(() => setConfirmExit(false), 3000);
      return;
    }
    gameAudio().stopMusic(0.1);
    run.current++;
    token.current = null;
    setPhase("ready");
  };

  // keadaan untuk uji otomatis (hanya saat development)
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __duel: unknown }).__duel = {
      phase,
      stage,
      level,
      foe,
      hp,
      hearts,
      shield,
      charge,
      armed,
      score,
      defeated,
      faints,
      monsterState,
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
          <span>⚔️ Monster dikalahkan: {defeated}</span>
          <span>
            {bossDown
              ? "🏆 Bos berhasil dikalahkan!"
              : "👑 Bos masih berkuasa — coba lagi!"}
          </span>
          {faints === 0 && <span>❤️ Tanpa pingsan</span>}
        </div>
        <ResultCelebration
          result={result}
          onReplay={() => setPhase("ready")}
          canSave={props.canSave}
        />
      </div>
    );

  /* ---------------- layar siap ---------------- */
  if (phase === "ready") {
    return (
      <div className="card animate-fade-up space-y-5 p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <GameCat mood="girang" className="h-24 w-24 shrink-0" />
          <div>
            <h2 className="text-xl font-extrabold text-navy-900">
              Mode Duel Kucing Pemberani
            </h2>
            <p className="text-sm text-navy-500">
              Lawan {questions.length > 3 ? "para monster lalu " : ""}Raja
              Monster Soal! Setiap jawaban benar adalah seranganmu.
            </p>
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-2 text-sm text-navy-700 sm:grid-cols-2">
          <li className="rounded-2xl bg-brand-50 p-3">
            ⚔️ Jawab benar → kucing menyerang. Makin cepat, makin besar — jawab
            cepat = <b>KRITIKAL</b>.
          </li>
          <li className="rounded-2xl bg-brand-50 p-3">
            👾 Jawab salah / waktu habis → monster balas menyerang, ❤️
            berkurang.
          </li>
          <li className="rounded-2xl bg-brand-50 p-3">
            ⚡ {CHARGE_MAX} jawaban benar mengisi <b>Jurus Spesial</b> (serangan
            ×2). Aktifkan sebelum menjawab (tombol / S).
          </li>
          <li className="rounded-2xl bg-brand-50 p-3">
            🛡️ 3 benar beruntun = perisai penahan 1 serangan. Monster kalah =
            +❤️.
          </li>
          <li className="rounded-2xl bg-emerald-50 p-3 sm:col-span-2">
            🧠 Tidak perlu buru-buru: waktunya {secondsPerQuestion} detik per
            soal seperti mode klasik, dan pembahasan bisa dibaca sebelum lanjut.
            Skor sama dengan mode klasik.
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
            <Swords className="h-5 w-5" /> Mulai duel
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- arena (layar penuh, portal ke body) ---------------- */
  const q = questions[level];
  const mood =
    fx?.kind === "hurt" && stage === "anim"
      ? "sedih"
      : catMood(streak, wrongStreak);
  const n = Math.min(5, q.options.length);
  const answering = stage === "question";
  const showOpts = stage !== "enter";
  const pct = (timeLeft / secondsPerQuestion) * 100;
  const danger = answering && timeLeft < 5;
  const attackFx =
    fx && (fx.kind === "attack" || fx.kind === "crit" || fx.kind === "special");
  const catAnim =
    stage === "anim" && fx
      ? attackFx
        ? fx.kind === "special"
          ? "duel-dash-big"
          : "duel-dash"
        : fx.kind === "hurt"
          ? "duel-ouch"
          : "duel-block"
      : "";
  const monAnim =
    monsterState === "enter"
      ? "duel-enter"
      : monsterState === "defeat"
        ? "duel-defeat"
        : monsterState === "flee"
          ? "duel-flee"
          : stage === "anim" && fx
            ? attackFx
              ? "duel-hurt"
              : "duel-lunge"
            : foe.boss
              ? "duel-boss-idle"
              : "duel-idle";

  return createPortal(
    <div className="fixed inset-0 z-[99] flex flex-col bg-navy-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden bg-white sm:my-3 sm:rounded-3xl">
        {/* bilah atas */}
        <div className="flex shrink-0 items-center gap-2 border-b border-navy-100 px-3 py-2">
          <span className="shrink-0 whitespace-nowrap rounded-full bg-navy-900 px-2.5 py-1 text-xs font-bold text-white">
            Soal {level + 1}/{questions.length}
          </span>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-brand-50 px-2.5 py-1 text-xs font-extrabold text-brand-700">
            ⭐ {score}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={takeHint}
              disabled={
                !answering ||
                hinting ||
                hintsLeft <= 0 ||
                hidden.length > 0 ||
                n <= 2
              }
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-sun-400 px-2.5 py-1 text-xs font-bold text-navy-900 disabled:opacity-40"
            >
              {hinting ? <Spinner /> : <Lightbulb className="h-3.5 w-3.5" />}{" "}
              50:50 ({hintsLeft})
            </button>
            <button
              type="button"
              onClick={exit}
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
            {typeof document !== "undefined" && document.fullscreenEnabled && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-600"
                aria-label={
                  fullscreen ? "Keluar dari layar penuh" : "Layar penuh"
                }
                title={fullscreen ? "Keluar dari layar penuh" : "Layar penuh"}
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

        {/* arena pertarungan */}
        <div
          className={cn(
            "relative h-[34svh] min-h-44 shrink-0 select-none overflow-hidden",
            stage === "anim" &&
              fx &&
              (fx.kind === "crit" ||
                fx.kind === "special" ||
                fx.kind === "hurt") &&
              "duel-quake",
            foe.boss
              ? "bg-linear-to-b from-rose-950 via-purple-900 to-orange-700"
              : "bg-linear-to-b from-sky-400 via-sky-300 to-emerald-200",
          )}
          style={{ ["--dash" as string]: "min(40vw, 300px)" }}
        >
          {/* latar: bukit & tanah */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 h-[30%]",
              foe.boss ? "bg-stone-800" : "bg-emerald-500",
            )}
          />
          <div
            className={cn(
              "absolute -left-10 bottom-[24%] h-24 w-72 rounded-[50%]",
              foe.boss ? "bg-stone-700" : "bg-emerald-400",
            )}
          />
          <div
            className={cn(
              "absolute -right-16 bottom-[24%] h-28 w-80 rounded-[50%]",
              foe.boss ? "bg-stone-700" : "bg-emerald-400",
            )}
          />
          {foe.boss && (
            <div className="absolute right-[18%] top-[12%] h-12 w-12 rounded-full bg-orange-300/80 blur-[2px]" />
          )}
          {!foe.boss && (
            <div className="absolute right-[12%] top-[10%] h-10 w-10 rounded-full bg-sun-300" />
          )}

          {/* kucing + nyawa */}
          <div className="absolute bottom-[8%] left-[6%] flex w-[30%] max-w-40 flex-col items-center">
            <div
              className="mb-1 flex items-center gap-0.5 rounded-full bg-navy-950/55 px-2 py-0.5 text-sm backdrop-blur"
              aria-label={`nyawa ${hearts}`}
            >
              {Array.from({ length: MAX_HEARTS }, (_, k) => (
                <span
                  key={k}
                  className={cn(
                    "transition",
                    k < hearts ? "" : "opacity-30 grayscale",
                  )}
                >
                  ❤️
                </span>
              ))}
              {shield && <span className="ml-0.5 animate-pop">🛡️</span>}
            </div>
            <div
              key={stage === "anim" && fx ? `c${fx.key}` : "cat"}
              className={cn("relative aspect-square w-full", catAnim)}
            >
              {shield && (
                <div className="absolute inset-[-8%] rounded-full bg-sky-300/25 ring-2 ring-sky-200/70" />
              )}
              {armed && (
                <div className="absolute inset-[-10%] animate-pulse rounded-full bg-sun-300/40 ring-4 ring-sun-300" />
              )}
              <GameCat mood={mood} className="relative h-full w-full" />
            </div>
          </div>

          {/* monster + HP */}
          <div className="absolute bottom-[8%] right-[5%] flex w-[34%] max-w-48 flex-col items-center">
            <div
              className={cn(
                "mb-1 w-full transition-opacity",
                monsterState === "defeat" || monsterState === "flee"
                  ? "opacity-0"
                  : "opacity-100",
              )}
            >
              <p className="truncate text-center text-[11px] font-extrabold text-white drop-shadow sm:text-xs">
                {foe.boss && "👑 "}
                {foe.name}
              </p>
              <div className="mt-0.5 h-2.5 overflow-hidden rounded-full bg-navy-950/60 ring-1 ring-white/50">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    hp / foe.hp > 0.5
                      ? "bg-emerald-400"
                      : hp / foe.hp > 0.2
                        ? "bg-amber-400"
                        : "bg-rose-500",
                  )}
                  style={{ width: `${(hp / foe.hp) * 100}%` }}
                />
              </div>
            </div>
            <div
              key={`m${foe.serial}-${monsterState}-${stage === "anim" && fx ? fx.key : ""}`}
              className={cn(
                "aspect-square w-full",
                foe.boss && "scale-110",
                monAnim,
              )}
            >
              <MonsterArt
                kind={foe.kind}
                body={foe.body}
                dark={foe.dark}
                hurt={monsterState === "defeat"}
              />
            </div>
            {/* efek serangan kucing */}
            {stage === "anim" && attackFx && (
              <div
                key={`s${fx.key}`}
                className="pointer-events-none absolute inset-0 grid place-items-center"
              >
                <svg
                  viewBox="0 0 100 100"
                  className="duel-slash absolute h-3/4 w-3/4"
                >
                  <path
                    d="M15 20 L85 75"
                    stroke="white"
                    strokeWidth="7"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M10 40 L80 90"
                    stroke={fx.kind === "crit" ? "#fb923c" : "white"}
                    strokeWidth="6"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M30 8 L92 58"
                    stroke={fx.kind === "special" ? "#fde047" : "white"}
                    strokeWidth="5"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
                <span className="duel-pop text-5xl sm:text-6xl">
                  {fx.kind === "special" ? "⚡" : "💥"}
                </span>
              </div>
            )}
          </div>
          {/* efek serangan monster */}
          {stage === "anim" && fx && !attackFx && (
            <div
              key={`h${fx.key}`}
              className="pointer-events-none absolute bottom-[25%] left-[14%]"
            >
              <span className="duel-pop block text-5xl">
                {fx.kind === "block" ? "🛡️" : "💢"}
              </span>
            </div>
          )}
          {stage === "anim" && fx?.kind === "special" && (
            <div
              key={`f${fx.key}`}
              className="duel-flash pointer-events-none absolute inset-0 bg-sun-100"
            />
          )}

          {/* angka melayang */}
          {floats.map((f) => (
            <span
              key={f.id}
              className="duel-float pointer-events-none absolute whitespace-nowrap text-lg font-black drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)] sm:text-2xl"
              style={{
                color: f.color,
                left: f.side === "cat" ? "21%" : "66%",
                top: "22%",
              }}
            >
              {f.text}
            </span>
          ))}

          {banner && (
            <div
              key={banner.key}
              className="duel-banner pointer-events-none absolute inset-x-0 top-[8%] text-center"
            >
              <span className="inline-block rounded-2xl bg-navy-950/75 px-4 py-2 text-base font-black text-white shadow-xl sm:text-lg">
                {banner.text}
              </span>
            </div>
          )}
          {streak >= 2 && (
            <div className="pointer-events-none absolute left-2 top-2 animate-pop rounded-2xl bg-orange-500/90 px-2.5 py-1 text-sm font-black text-white shadow-lg">
              🔥 x{streak}
            </div>
          )}
          {phase === "countdown" && (
            <div className="absolute inset-0 grid place-items-center bg-navy-950/45">
              <span
                key={count}
                className="animate-pop text-7xl font-black text-white drop-shadow-lg"
              >
                {count || "DUEL!"}
              </span>
            </div>
          )}
          {phase === "finishing" && (
            <div className="absolute inset-0 grid place-items-center bg-navy-950/55 text-white">
              <p className="flex items-center gap-2 text-lg font-bold">
                <Spinner /> Menghitung skor…
              </p>
            </div>
          )}
        </div>

        {/* waktu soal */}
        <div className="h-2 shrink-0 bg-navy-100">
          <div
            className={cn(
              "h-full transition-[width] duration-100",
              danger ? "bg-rose-500" : "bg-brand-500",
            )}
            style={{
              width: `${answering ? pct : stage === "enter" ? 100 : 0}%`,
            }}
          />
        </div>

        {/* soal & jawaban */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {phase === "battle" && showOpts ? (
            <>
              <div className="mb-2 flex items-start gap-3">
                <MathText
                  key={q.id}
                  as="p"
                  text={q.text}
                  className="min-w-0 flex-1 animate-fade-up font-bold leading-snug text-navy-900 sm:text-lg"
                />
                {answering && (
                  <span
                    className={cn(
                      "shrink-0 rounded-xl px-2 py-1 font-mono text-sm font-black",
                      danger
                        ? "animate-pulse bg-rose-100 text-rose-600"
                        : "bg-navy-50 text-navy-700",
                    )}
                  >
                    {Math.ceil(timeLeft)}s
                  </span>
                )}
              </div>
              <div className={cn("grid gap-2", n > 2 && "sm:grid-cols-2")}>
                {q.options.slice(0, 5).map((o, k) => {
                  const isRight = feedback && k === feedback.answerIndex;
                  const isWrong =
                    feedback && k === feedback.choice && !feedback.correct;
                  const off = !feedback && hidden.includes(k);
                  const waiting = stage === "checking" && k === picked;
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!answering || off}
                      onClick={() => void answer(k)}
                      className={cn(
                        "flex min-h-12 items-center gap-2.5 rounded-2xl bg-linear-to-br px-3 py-2.5 text-left text-sm font-semibold text-white shadow-md transition sm:text-base",
                        OPTION_STYLES[k],
                        answering &&
                          !off &&
                          "hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98]",
                        off && "opacity-15 grayscale",
                        feedback &&
                          !isRight &&
                          !isWrong &&
                          "opacity-35 saturate-50",
                        isRight && "ring-4 ring-emerald-300",
                        isWrong && "animate-shake ring-4 ring-rose-300",
                        waiting && "ring-4 ring-white/70",
                      )}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/20 text-xs font-extrabold">
                        {waiting ? <Spinner /> : LETTERS[k]}
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

              {stage === "feedback" && feedback ? (
                <div
                  className={cn(
                    "mt-3 animate-scale-in rounded-2xl p-3 text-sm ring-1",
                    feedback.correct
                      ? "bg-emerald-50 ring-emerald-100"
                      : "bg-rose-50 ring-rose-100",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p
                      className={cn(
                        "font-bold",
                        feedback.correct ? "text-emerald-700" : "text-rose-600",
                      )}
                    >
                      {feedback.correct
                        ? `Seranganmu kena! +${feedback.points} poin`
                        : feedback.choice === -1
                          ? `Waktu habis! Jawabannya ${LETTERS[feedback.answerIndex] ?? "-"}.`
                          : `Kurang tepat — jawabannya ${LETTERS[feedback.answerIndex] ?? "-"}.`}
                    </p>
                    <button
                      type="button"
                      onClick={next}
                      className="btn-primary py-2"
                    >
                      {level + 1 < questions.length
                        ? "Lanjut bertarung"
                        : "Lihat hasil"}{" "}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                  {feedback.explanation && (
                    <div className="mt-2 flex gap-2 border-t border-white pt-2 text-navy-700">
                      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                      <MathText
                        as="p"
                        text={feedback.explanation}
                        className="min-w-0 whitespace-pre-line"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSpecial}
                    disabled={!answering || (charge < CHARGE_MAX && !armed)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-extrabold transition disabled:opacity-50",
                      armed
                        ? "animate-pulse bg-sun-400 text-navy-950 ring-4 ring-sun-200"
                        : charge >= CHARGE_MAX
                          ? "bg-navy-900 text-sun-300"
                          : "bg-navy-50 text-navy-400",
                    )}
                  >
                    <Zap className="h-4 w-4 fill-current" />
                    {armed ? "Jurus spesial AKTIF" : "Jurus spesial"}
                    <span className="flex gap-0.5">
                      {Array.from({ length: CHARGE_MAX }, (_, k) => (
                        <span
                          key={k}
                          className={cn(
                            "h-2 w-2 rounded-full",
                            k < charge ? "bg-sun-400" : "bg-navy-200",
                          )}
                        />
                      ))}
                    </span>
                  </button>
                  <p className="text-xs font-semibold text-navy-500">
                    {stage === "checking" || stage === "anim"
                      ? "Menyerang…"
                      : "Pilih jawaban untuk menyerang! Cepat = kritikal."}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm font-semibold text-navy-600">
              {phase === "countdown"
                ? "Bersiap… monster pertama datang!"
                : "Monster mendekat…"}
            </p>
          )}
          <p className="mt-3 hidden text-[11px] text-navy-400 pointer-fine:block">
            1–{n} / A–{LETTERS[n - 1]}: jawab · S / spasi: jurus spesial ·
            Enter: lanjut
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

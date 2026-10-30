import { CarFront, Coffee, Dices, Fish, Footprints, Goal, Grid3x3, Mountain, Play, Rocket, Sparkles, Swords, type LucideIcon } from "lucide-react";
import type { PlayMode } from "@/lib/game-rules";

/**
 * Daftar mode bermain (sumber tunggal untuk Arena Game /games, halaman pilih soal, & pemilih mode di halaman game).
 * Gambar latar: public/games/modes/<key>.jpg. `tone` = warna RGB gradasi kartu.
 */
export type ModeInfo = {
  key: PlayMode;
  label: string;
  name: string;
  desc: string;
  icon: LucideIcon;
  tone: string;
  dark?: boolean;
  fav?: boolean;
  isNew?: boolean;
};

export const MODES: ModeInfo[] = [
  { key: "classic", label: "Main klasik", name: "Klasik", desc: "Pilih jawaban A/B/C/D secepatnya, ada hitung mundur tiap soal.", icon: Play, tone: "245,179,1", dark: true },
  { key: "adventure", label: "Main petualangan", name: "Petualangan", desc: "Gerakkan kucing, lompat naik lantai demi lantai & injak tombol jawabannya.", icon: Mountain, tone: "26,95,138", fav: true },
  { key: "runner", label: "Main lari lintasan", name: "Lari Lintasan", desc: "Kucing berlari! Pindah jalur & lewati gerbang jawaban yang benar.", icon: Footprints, tone: "5,150,105" },
  { key: "duel", label: "Main duel", name: "Duel", desc: "Lawan monster & bos! Jawaban benar = serangan, santai untuk soal yang butuh mikir.", icon: Swords, tone: "190,24,93" },
  { key: "maze", label: "Main labirin", name: "Labirin", desc: "Kucing tersesat di labirin gelap! Jelajahi lorong & masuk pintu jawaban yang benar — awas jebakan.", icon: Grid3x3, tone: "55,48,163", fav: true },
  { key: "board", label: "Main ular tangga", name: "Ular Tangga", desc: "Jawab benar untuk lempar dadu! Naik tangga, hindari ular, sampai FINISH.", icon: Dices, tone: "234,88,12", isNew: true },
  { key: "cafe", label: "Main kafe kucing", name: "Kafe Kucing", desc: "Sajikan hidangan jawaban yang benar untuk pelanggan — jangan sampai mereka cemberut!", icon: Coffee, tone: "219,39,119", isNew: true },
  { key: "penalty", label: "Main adu penalti", name: "Adu Penalti", desc: "Kucing FC vs kiper Babi FC! Jawaban benar = tendangan pasti GOL.", icon: Goal, tone: "21,128,61", isNew: true },
  { key: "kart", label: "Main balap gokart", name: "Balap Gokart", desc: "Balapan melawan Dodo, Rara & Popo! Jawab benar = ngebut & menyalip.", icon: CarFront, tone: "185,28,28", isNew: true },
  { key: "platform", label: "Main lembah pixel", name: "Lembah Pixel", desc: "Platformer retro! Lompati musuh, berubah wujud saat benar beruntun & jongkok di terowongan jawaban.", icon: Sparkles, tone: "194,65,12", isNew: true, fav: true },
  { key: "station", label: "Main stasiun orbit", name: "Stasiun Orbit", desc: "Jelajahi stasiun luar angkasa, perbaiki modul lewat soal & hindari penjaga Babi 🐷 dan Anjing 🐶!", icon: Rocket, tone: "30,27,75", isNew: true, fav: true },
  { key: "fishing", label: "Main memancing", name: "Memancing", desc: "Pancing ikan berlabel jawaban yang benar & isi akuariummu. Paling santai!", icon: Fish, tone: "3,105,161", isNew: true },
];

export const modeOf = (key: unknown) => MODES.find((m) => m.key === key);

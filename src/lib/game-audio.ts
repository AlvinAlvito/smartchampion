"use client";

/**
 * Audio games (musik latar + efek suara) yang disintesis langsung di browser dengan Web Audio API.
 * Tanpa file audio → tanpa masalah lisensi & tanpa beban unduhan.
 * Browser hanya mengizinkan suara setelah interaksi pengguna, jadi panggil `unlock()` dari klik tombol.
 */

type Wave = OscillatorType;
const MUTE_KEY = "pp_game_muted";

// Frekuensi nada (Hz)
const N: Record<string, number> = {
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77, C6: 1046.5,
};

// Progresi ceria I–V–vi–IV (C, G, Am, F), 4 ketukan per akor
const CHORDS: { bass: string; arp: string[] }[] = [
  { bass: "C3", arp: ["C4", "E4", "G4", "C5", "G4", "E4", "C5", "E5"] },
  { bass: "G3", arp: ["B3", "D4", "G4", "B4", "G4", "D4", "B4", "D5"] },
  { bass: "A3", arp: ["C4", "E4", "A4", "C5", "A4", "E4", "C5", "E5"] },
  { bass: "F3", arp: ["C4", "F4", "A4", "C5", "A4", "F4", "C5", "F5"] },
];
// Melodi pendek yang muncul tiap putaran ke-2
const MELODY = ["E5", null, "G5", "E5", "D5", null, "C5", null, "D5", null, "B4", "G4", "C5", null, "E5", null,
  "A4", null, "C5", "E5", "D5", null, "C5", "A4", "F4", "A4", "C5", null, "B4", null, null, null] as (string | null)[];

class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextTime = 0;
  private tempo = 116;
  private noise: AudioBuffer | null = null;
  muted = false;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        this.muted = localStorage.getItem(MUTE_KEY) === "1";
      } catch {
        /* storage diblokir */
      }
    }
  }

  /** Siapkan AudioContext (wajib dipanggil dari event klik). */
  unlock() {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0.22;
      this.music.connect(this.master);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = 0.55;
      this.sfx.connect(this.master);
      // buffer noise untuk hi-hat
      const len = this.ctx.sampleRate * 0.2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private listeners = new Set<() => void>();
  /** Untuk useSyncExternalStore (status mute di UI). */
  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  setMuted(m: boolean) {
    this.muted = m;
    this.listeners.forEach((l) => l());
    try {
      localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    } catch {
      /* abaikan */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  /* ---------------- primitif ---------------- */

  private tone(freq: number, start: number, dur: number, { type = "square" as Wave, vol = 0.2, bus = this.sfx, slideTo = 0, attack = 0.005 } = {}) {
    if (!this.ctx || !bus) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(bus);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private hat(start: number, vol = 0.05, bus = this.music) {
    if (!this.ctx || !this.noise || !bus) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
    src.connect(hp).connect(g).connect(bus);
    src.start(start);
    src.stop(start + 0.06);
  }

  private kick(start: number, vol = 0.5) {
    this.tone(150, start, 0.18, { type: "sine", vol, bus: this.music, slideTo: 45 });
  }

  /* ---------------- musik latar ---------------- */

  startMusic() {
    this.unlock();
    if (!this.ctx || this.timer) return;
    this.step = 0;
    this.tempo = 116;
    this.nextTime = this.ctx.currentTime + 0.08;
    // penjadwal dengan lookahead agar ritme stabil
    this.timer = setInterval(() => this.schedule(), 25);
  }

  /** Percepat musik (mis. saat waktu hampir habis). */
  setIntensity(high: boolean) {
    this.tempo = high ? 140 : 116;
  }

  stopMusic(fade = 0.4) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.music && this.ctx) {
      const g = this.music.gain;
      g.setTargetAtTime(0.0001, this.ctx.currentTime, fade / 3);
      setTimeout(() => this.ctx && g.setTargetAtTime(0.22, this.ctx.currentTime, 0.01), fade * 1000 + 150);
    }
  }

  private schedule() {
    if (!this.ctx) return;
    const eighth = 60 / this.tempo / 2;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      const t = this.nextTime;
      const s = this.step;
      const chord = CHORDS[Math.floor(s / 8) % CHORDS.length];
      const bar = Math.floor(s / 32);
      // bass di ketukan 1 & 3
      if (s % 4 === 0) this.tone(N[chord.bass], t, eighth * 1.8, { type: "triangle", vol: 0.35, bus: this.music });
      // arpeggio
      this.tone(N[chord.arp[s % 8]], t, eighth * 0.9, { type: "square", vol: 0.06, bus: this.music });
      // drum
      if (s % 4 === 0) this.kick(t, 0.45);
      this.hat(t, s % 2 ? 0.03 : 0.05);
      // melodi setiap putaran ganjil
      if (bar % 2 === 1) {
        const m = MELODY[s % 32];
        if (m) this.tone(N[m], t, eighth * 1.6, { type: "square", vol: 0.07, bus: this.music, attack: 0.01 });
      }
      this.nextTime += eighth;
      this.step++;
    }
  }

  /* ---------------- efek suara ---------------- */

  private now() {
    this.unlock();
    return this.ctx?.currentTime ?? 0;
  }

  countdown(last = false) {
    const t = this.now();
    this.tone(last ? N.C6 : N.C5, t, last ? 0.35 : 0.15, { type: "square", vol: 0.25 });
  }
  click() {
    this.tone(1200, this.now(), 0.04, { type: "square", vol: 0.08 });
  }
  tick() {
    this.tone(1800, this.now(), 0.03, { type: "square", vol: 0.08 });
  }
  correct(streak = 1) {
    const t = this.now();
    const up = Math.min(streak - 1, 4) * 2; // makin beruntun makin tinggi nadanya
    const f = (n: number) => n * Math.pow(2, up / 12);
    this.tone(f(N.E5), t, 0.1, { type: "square", vol: 0.2 });
    this.tone(f(N.A5), t + 0.08, 0.18, { type: "square", vol: 0.2 });
    if (streak >= 3) this.tone(f(N.E5) * 2, t + 0.16, 0.2, { type: "triangle", vol: 0.15 });
  }
  wrong() {
    const t = this.now();
    this.tone(220, t, 0.18, { type: "sawtooth", vol: 0.14, slideTo: 150 });
    this.tone(160, t + 0.14, 0.28, { type: "sawtooth", vol: 0.14, slideTo: 90 });
  }
  timeout() {
    const t = this.now();
    [0, 0.12, 0.24].forEach((d) => this.tone(330, t + d, 0.08, { type: "square", vol: 0.15 }));
  }

  /** Jingle hasil sesuai tingkat skor. */
  result(tier: "rendah" | "normal" | "tinggi" | "tertinggi") {
    const t = this.now() + 0.05;
    const seq = (notes: [string, number, number][], type: Wave = "square", vol = 0.2) =>
      notes.forEach(([n, at, dur]) => this.tone(N[n], t + at, dur, { type, vol }));
    if (tier === "rendah") {
      // "wah-wah" menurun, lucu & menyemangati
      this.tone(N.G4, t, 0.3, { type: "sawtooth", vol: 0.12, slideTo: N.F4 });
      this.tone(N.F4, t + 0.3, 0.3, { type: "sawtooth", vol: 0.12, slideTo: N.E4 });
      this.tone(N.E4, t + 0.6, 0.7, { type: "sawtooth", vol: 0.12, slideTo: N.C4 * 0.9 });
    } else if (tier === "normal") {
      seq([["C5", 0, 0.12], ["E5", 0.12, 0.12], ["G5", 0.24, 0.3]]);
      seq([["C4", 0, 0.5]], "triangle", 0.25);
    } else if (tier === "tinggi") {
      seq([["G4", 0, 0.1], ["C5", 0.1, 0.1], ["E5", 0.2, 0.1], ["G5", 0.3, 0.15], ["E5", 0.45, 0.1], ["G5", 0.55, 0.5]]);
      seq([["C4", 0, 0.3], ["G3", 0.3, 0.3], ["C4", 0.55, 0.6]], "triangle", 0.28);
      [0.7, 0.8, 0.9].forEach((d, i) => this.tone(N.C6 * (1 + i * 0.12), t + d, 0.12, { type: "sine", vol: 0.1 }));
    } else {
      // fanfare juara + drum roll + kilau
      for (let i = 0; i < 10; i++) this.hat(t + i * 0.04, 0.08, this.sfx);
      seq([["C5", 0.4, 0.15], ["C5", 0.55, 0.1], ["C5", 0.65, 0.1], ["E5", 0.75, 0.35], ["C5", 1.1, 0.15], ["E5", 1.25, 0.15], ["G5", 1.4, 0.9]], "square", 0.22);
      seq([["C4", 0.4, 0.3], ["G3", 0.75, 0.3], ["C4", 1.1, 0.3], ["C4", 1.4, 1.0]], "triangle", 0.3);
      seq([["E4", 1.4, 1.0], ["G4", 1.4, 1.0]], "triangle", 0.15);
      [1.6, 1.72, 1.84, 1.96, 2.08].forEach((d, i) => this.tone(N.C6 * (1 + i * 0.1), t + d, 0.1, { type: "sine", vol: 0.09 }));
    }
  }
}

let instance: GameAudio | null = null;
export function gameAudio() {
  if (!instance) instance = new GameAudio();
  return instance;
}

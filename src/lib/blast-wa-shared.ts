/** Konstanta & fungsi Blast WhatsApp yang dipakai server & browser (tanpa akses database). */

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draf",
  SCHEDULED: "Terjadwal",
  RUNNING: "Berjalan",
  PAUSED: "Dijeda",
  COMPLETED: "Selesai",
  CANCELLED: "Dibatalkan",
};
export const CAMPAIGN_STATUS_TONE: Record<string, "gray" | "blue" | "yellow" | "green" | "red" | "brand"> = {
  DRAFT: "gray",
  SCHEDULED: "blue",
  RUNNING: "brand",
  PAUSED: "yellow",
  COMPLETED: "green",
  CANCELLED: "red",
};

export const RECIPIENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu",
  QUEUED: "Dikirim…",
  SENT: "Terkirim",
  DELIVERED: "Diterima",
  READ: "Dibaca",
  FAILED: "Gagal",
  SKIPPED: "Dilewati",
};
export const RECIPIENT_STATUS_TONE: Record<string, "gray" | "blue" | "yellow" | "green" | "red" | "brand"> = {
  PENDING: "gray",
  QUEUED: "yellow",
  SENT: "blue",
  DELIVERED: "brand",
  READ: "green",
  FAILED: "red",
  SKIPPED: "gray",
};
/** status yang dihitung "sudah terkirim" */
export const SENT_STATUSES = ["SENT", "DELIVERED", "READ"] as const;

export const NUMBER_AGE_LABEL: Record<string, string> = {
  BARU: "Nomor baru (< 1 bulan)",
  SEDANG: "1–6 bulan",
  LAMA: "Nomor lama (> 6 bulan)",
};

export const WA_CONTACT_STATUS_LABEL: Record<string, string> = { UNKNOWN: "Belum dicek", VALID: "Aktif di WA", INVALID: "Tidak ada WA" };

/* ------------------------------------------------------------------ */
/* Warm-up: kuota harian naik bertahap sejak nomor ditautkan           */
/* ------------------------------------------------------------------ */

const WARMUP: Record<string, number[]> = {
  // [minggu ke-1, ke-2, ke-3–4, > 1 bulan]
  BARU: [20, 40, 80, 120],
  SEDANG: [50, 100, 150, 200],
  LAMA: [100, 150, 220, 300],
};

export function warmup(numberAge: string, firstConnectedAt: Date | string | null, now = new Date()) {
  const steps = WARMUP[numberAge] ?? WARMUP.BARU;
  const days = firstConnectedAt ? Math.max(0, Math.floor((now.getTime() - new Date(firstConnectedAt).getTime()) / 86_400_000)) : 0;
  const stage = days < 7 ? 0 : days < 14 ? 1 : days < 30 ? 2 : 3;
  const label = ["Pemanasan minggu 1", "Pemanasan minggu 2", "Pemanasan minggu 3–4", "Stabil"][stage];
  return { cap: steps[stage], day: days + 1, stage, label, next: stage < 3 ? steps[stage + 1] : null, max: steps[3] };
}

/** batas per jam: seperlima kuota harian (min 10) agar kiriman menyebar sepanjang hari */
export const hourlyCap = (dailyCap: number) => Math.max(10, Math.round(dailyCap / 5));

/* ------------------------------------------------------------------ */
/* Template pesan: variabel {nama} + spintax {Halo|Hai}                */
/* ------------------------------------------------------------------ */

export const MESSAGE_VARS = [
  { key: "nama", label: "Nama lengkap" },
  { key: "nama_depan", label: "Nama depan" },
  { key: "sekolah", label: "Sekolah" },
  { key: "jenjang", label: "Jenjang" },
  { key: "kelas", label: "Kelas" },
  { key: "kota", label: "Kota" },
  { key: "provinsi", label: "Provinsi" },
  { key: "salam", label: "Salam waktu (Selamat pagi/siang/sore/malam)" },
] as const;
const VAR_KEYS = new Set<string>(MESSAGE_VARS.map((v) => v.key));

export type MessageContact = { nama: string; sekolah?: string | null; jenjang?: string | null; kelas?: string | null; kota?: string | null; provinsi?: string | null };

function salam(now: Date) {
  const h = (now.getUTCHours() + 7) % 24;
  return h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
}

/** nama pengganti saat kontak tidak bernama → dianggap kosong (pakai teks cadangan) */
const NO_NAME = /^(\(tanpa nama\)|kak|kakak|-)$/i;

function varValue(key: string, c: MessageContact, now: Date) {
  const clean = (v: string | null | undefined) => (v ?? "").trim();
  const nama = NO_NAME.test(clean(c.nama)) ? "" : clean(c.nama);
  switch (key) {
    case "nama":
      return nama;
    case "nama_depan":
      return nama.split(/\s+/)[0] ?? "";
    case "salam":
      return salam(now);
    default:
      return clean((c as Record<string, string | null | undefined>)[key]);
  }
}

/**
 * Isi template untuk satu kontak.
 * - `{nama}` → variabel; `{sekolah|sekolahmu}` → variabel dengan teks cadangan bila kosong
 * - `{Halo|Hai|Hallo}` → spintax: dipilih acak agar setiap pesan tidak identik
 */
export function renderMessage(template: string, c: MessageContact, opts: { now?: Date; random?: () => number } = {}) {
  const now = opts.now ?? new Date();
  const random = opts.random ?? Math.random;
  return template
    .replace(/\{([^{}\n]{1,200})\}/g, (whole, inner: string) => {
      const parts = inner.split("|");
      const head = parts[0].trim().toLowerCase();
      if (VAR_KEYS.has(head)) {
        const v = varValue(head, c, now);
        return v || (parts.length > 1 ? parts.slice(1).join("|") : "");
      }
      if (parts.length > 1) return parts[Math.floor(random() * parts.length)];
      return whole; // {teks} biasa tanpa | → biarkan
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .replace(/ +\n/g, "\n")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Analisis kualitas pesan (anti-spam)                                 */
/* ------------------------------------------------------------------ */

export type Check = { ok: boolean | "warn"; label: string; tip?: string };

const SHORTENERS = /\b(bit\.ly|s\.id|tinyurl\.com|t\.co|cutt\.ly|shorturl\.at|rb\.gy|is\.gd|lnkd\.in|goo\.gl)\//i;
const SPAMMY = /\b(gratis+|free|100%|dijamin|klik sekarang|buruan|promo gila|menang|hadiah|transfer sekarang|terbatas!+)\b/gi;

export function analyzeMessage(template: string) {
  const t = template.trim();
  const vars = [...t.matchAll(/\{([^{}\n]{1,200})\}/g)].map((m) => m[1]);
  const personal = vars.some((v) => VAR_KEYS.has(v.split("|")[0].trim().toLowerCase()));
  const spins = vars.filter((v) => v.includes("|") && !VAR_KEYS.has(v.split("|")[0].trim().toLowerCase())).length;
  const links = t.match(/https?:\/\/\S+|www\.\S+/gi) ?? [];
  const letters = t.replace(/[^A-Za-z]/g, "");
  const capsRatio = letters.length > 20 ? letters.replace(/[^A-Z]/g, "").length / letters.length : 0;
  const emojis = (t.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  const spammy = [...new Set((t.match(SPAMMY) ?? []).map((w) => w.toLowerCase()))];
  const optOut = /\b(stop|berhenti)\b/i.test(t);
  const unknownVars = vars.filter((v) => !v.includes("|") && !VAR_KEYS.has(v.trim().toLowerCase()));

  const checks: Check[] = [
    { ok: personal, label: "Memakai variabel (mis. {nama}) agar tiap pesan personal", tip: "Sapa penerima dengan namanya: Halo {nama|Kak}," },
    {
      ok: spins >= 2 ? true : spins === 1 ? "warn" : false,
      label: "Variasi kalimat (spintax) agar pesan tidak identik",
      tip: "Contoh: {Halo|Hai|Selamat datang} — pakai minimal 2 bagian bervariasi",
    },
    { ok: t.length >= 30 && t.length <= 1000 ? true : t.length > 1000 && t.length <= 2000 ? "warn" : false, label: "Panjang pesan wajar (30–1.000 karakter)", tip: "Pesan singkat & jelas lebih aman dan lebih banyak dibalas" },
    { ok: links.length === 0 ? true : links.length === 1 ? "warn" : false, label: "Tautan seminimal mungkin (0–1)", tip: "Banyak tautan = ciri spam. Lebih aman: ajak membalas dulu, kirim tautan di chat berikutnya" },
    { ok: !SHORTENERS.test(t), label: "Tidak memakai pemendek tautan (bit.ly, s.id, …)", tip: "Pemendek tautan sering ditandai spam oleh WhatsApp" },
    { ok: capsRatio < 0.3, label: "Tidak banyak HURUF KAPITAL", tip: "Tulisan kapital semua terkesan berteriak/spam" },
    { ok: emojis <= 6 ? true : emojis <= 12 ? "warn" : false, label: "Emoji secukupnya (≤ 6)" },
    { ok: spammy.length === 0 ? true : "warn", label: spammy.length ? `Hindari kata pemicu spam: ${spammy.join(", ")}` : "Tidak ada kata pemicu spam" },
    { ok: optOut ? true : "warn", label: "Ada pilihan berhenti (mis. “Balas STOP bila tidak ingin menerima info lagi”)", tip: "Penerima yang tidak tertarik membalas STOP, bukan melaporkan/memblokir nomor" },
    ...(unknownVars.length ? [{ ok: false as const, label: `Variabel tidak dikenal: ${unknownVars.map((v) => `{${v}}`).join(", ")}` }] : []),
  ];
  const weight = (c: Check) => (c.ok === true ? 1 : c.ok === "warn" ? 0.5 : 0);
  const score = Math.round((checks.reduce((s, c) => s + weight(c), 0) / checks.length) * 100);
  return { score, checks, personal, spins, links: links.length };
}

/* ------------------------------------------------------------------ */
/* Label kontak                                                        */
/* ------------------------------------------------------------------ */

export function parseLabels(v: string | null | undefined) {
  return (v ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** simpan sebagai ",a,b," (maks 255 karakter) agar filter label tepat (tidak cocok sebagian) */
export function joinLabels(list: string[]) {
  const uniq = [...new Set(list.map((x) => x.replace(/[,\s]+/g, " ").trim().slice(0, 40)).filter(Boolean))];
  let out = "";
  for (const l of uniq) {
    if ((out || ",").length + l.length + 1 > 255) break;
    out = `${out || ","}${l},`;
  }
  return out || null;
}

/** Balasan penerima yang berarti berhenti berlangganan */
export function isOptOutReply(text: string) {
  const t = text.trim().toLowerCase();
  return /^(stop|berhenti|unsubscribe|unsub|unreg|stop kirim)\b/.test(t) || /jangan (di)?kirim(i)? (lagi|pesan)/.test(t) || t === "jangan kirim";
}

export const BLAST_MAX_TEXT = 3000;
export const BLAST_IMAGE_MAX = 1024 * 1024;

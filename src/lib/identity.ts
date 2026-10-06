/**
 * Pencocokan identitas orang lintas data (Master Lead, pendaftaran web, akun, chat WA).
 * Satu orang bisa tercatat dengan nama/email/nomor berbeda, jadi dua catatan dianggap orang yang sama bila:
 *  1. nomor WA sama (setelah dinormalisasi, termasuk nomor orang tua / nomor alternatif), ATAU
 *  2. email sama (huruf kecil, +alias diabaikan; Gmail: titik juga diabaikan), ATAU
 *  3. nama mirip (fuzzy per kata, lihat nameSimilarity; minimal 2 kata) dan tidak bertentangan kuat
 *     (bila nomor DAN email sama-sama terisi tetapi berbeda semua → orang lain, kecuali nama identik ≥ 3 kata;
 *      bila hanya salah satu yang berbeda → nama harus identik / beda 1 huruf).
 * Modul murni (tanpa database) agar bisa dipakai di mana saja & mudah diuji.
 */

export type Identity = {
  nama?: string | null;
  /** nomor utama + nomor lain (orang tua, akun, dll) */
  phones?: (string | null | undefined)[];
  emails?: (string | null | undefined)[];
};

export type MatchBy = "wa" | "email" | "nama";
/** weak = nomor/email sama tetapi nama jelas berbeda (mis. saudara kandung memakai WA orang tua yang sama) */
export type Match = { by: MatchBy; score: number; weak?: boolean };

export const MATCH_LABEL: Record<MatchBy, string> = { wa: "No. WA sama", email: "Email sama", nama: "Nama mirip" };

/* ---------- normalisasi ---------- */

export function normPhone(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("0062")) d = d.slice(2);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  // nomor terlalu pendek / placeholder (mis. 0, 62, 0000) tidak dipakai untuk mencocokkan
  if (d.length < 9 || /^62?0*$/.test(d) || /^(\d)\1+$/.test(d.slice(2))) return null;
  return d;
}

export function normEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1) return null;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  local = local.split("+")[0]; // alias "nama+apa@..." = kotak surat yang sama
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/** Sapaan / gelar yang sering ikut tertulis di nama lead atau nama WA */
const NOISE = new Set([
  "kak", "ka", "kakak", "bapak", "bpk", "pak", "ibu", "bu", "bunda", "bun", "mama", "mamah", "mah", "papa", "papah", "ayah", "mas", "mbak", "mba",
  "dek", "adik", "adek", "sdr", "sdri", "saudara", "ortu", "wali", "orang", "tua", "mom", "mommy", "dad", "daddy", "umi", "abi", "hj", "h", "dr", "drs",
  "ir", "st", "spd", "s", "pd", "se", "mm", "mpd", "official", "admin",
  // placeholder nama kosong
  "tanpa", "nama", "noname", "unknown", "anonim", "anonymous", "tidak", "ada", "belum", "diisi", "customer", "pelanggan", "user", "test", "tes",
]);

/** Variasi ejaan umum → bentuk baku */
const ALIAS: Record<string, string> = Object.fromEntries(
  ["m", "muh", "moh", "moch", "mhd", "muhamad", "muhammed", "mohammad", "mohamad", "mochammad", "mochamad", "muchammad", "muchamad"].map((v) => [v, "muhammad"]),
);

export function normName(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t))
    .map((t) => ALIAS[t] ?? t)
    .join(" ");
}

/** Nama cukup informatif untuk dicocokkan tanpa nomor/email: ≥ 2 kata dan ≥ 7 huruf */
const informative = (n: string) => n.split(" ").length >= 2 && n.replace(/ /g, "").length >= 7;

/* ---------- kemiripan nama ---------- */

/** Jarak Levenshtein dengan batas: berhenti lebih awal bila pasti > max */
function lev(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Skor 0..1, dibandingkan per kata (urutan kata bebas, mis. "Rizky Ahmad" = "Ahmad Rizky"):
 * - setiap kata nama yang lebih pendek (min. 2 kata) harus ada padanannya di nama lain;
 * - salah ketik maksimal 1 huruf per kata (hanya untuk kata ≥ 5 huruf) dan maksimal 2 per nama
 *   → "Rizky"≈"Rizki", tetapi "Fauzi"≠"Fauzan", "Pratama"≠"Pratomo";
 * - nama lain boleh punya 1 kata tambahan ("Siti Aisyah" ≈ "Siti Aisyah Putri").
 * 1 = identik, 0.97 = 1 salah ketik, 0.95 = 1 kata tambahan, 0 = bukan orang yang sama.
 */
export function nameSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = a.split(" ");
  const tb = b.split(" ");
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length < 2 || long.length - short.length > 1) return 0;
  const used = new Array<boolean>(long.length).fill(false);
  let edits = 0;
  for (const s of short) {
    let best = -1;
    let bestD = 9;
    for (let j = 0; j < long.length && bestD > 0; j++) {
      if (used[j]) continue;
      const d = s === long[j] ? 0 : Math.min(s.length, long[j].length) >= 5 ? lev(s, long[j], 1) : 9;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best < 0 || bestD > 1) return 0;
    used[best] = true;
    edits += bestD;
  }
  if (edits > 2) return 0;
  return Math.round((1 - edits * 0.03 - (long.length - short.length) * 0.05) * 100) / 100;
}

/* ---------- pencocokan ---------- */

type Prepared = { name: string; phones: Set<string>; emails: Set<string> };

export function prepare(p: Identity): Prepared {
  return {
    name: normName(p.nama),
    phones: new Set((p.phones ?? []).map(normPhone).filter((x): x is string => !!x)),
    emails: new Set((p.emails ?? []).map((e) => normEmail(e)).filter((x): x is string => !!x)),
  };
}

const intersects = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x));

/** Kedua nama jelas (≥ 2 kata) tetapi tidak ada satu kata pun yang sama/mirip */
function namesDisjoint(a: string, b: string) {
  if (!informative(a) || !informative(b)) return false;
  const tb = b.split(" ");
  return !a.split(" ").some((x) => tb.some((y) => x === y || (Math.min(x.length, y.length) >= 5 && lev(x, y, 1) <= 1)));
}

export function matchPrepared(a: Prepared, b: Prepared): Match | null {
  const contact: MatchBy | null = intersects(a.phones, b.phones) ? "wa" : intersects(a.emails, b.emails) ? "email" : null;
  if (contact) return namesDisjoint(a.name, b.name) ? { by: contact, score: 0.5, weak: true } : { by: contact, score: 1 };
  if (!informative(a.name) || !informative(b.name)) return null;
  const phoneConflict = a.phones.size > 0 && b.phones.size > 0;
  const emailConflict = a.emails.size > 0 && b.emails.size > 0;
  // nomor DAN email berbeda → hanya nama identik yang panjang (≥ 3 kata) yang masih dianggap orang yang sama
  if (phoneConflict && emailConflict) return a.name === b.name && a.name.split(" ").length >= 3 && a.name.length >= 15 ? { by: "nama", score: 1 } : null;
  const s = nameSimilarity(a.name, b.name);
  // nomor ATAU email berbeda → nama harus identik / beda 1 huruf tanpa kata tambahan
  const need = phoneConflict || emailConflict ? 0.97 : 0.9;
  return s >= need ? { by: "nama", score: s } : null;
}

export function matchIdentity(a: Identity, b: Identity) {
  return matchPrepared(prepare(a), prepare(b));
}

/**
 * Indeks untuk mencari banyak catatan sekaligus dengan cepat:
 * nomor & email lewat peta langsung, nama lewat "blok" (pasangan 3 huruf awal dari dua kata) agar tidak
 * membandingkan semua pasangan catatan.
 */
export class IdentityIndex<T> {
  private items: { item: T; p: Prepared }[] = [];
  private byPhone = new Map<string, number[]>();
  private byEmail = new Map<string, number[]>();
  private byBlock = new Map<string, number[]>();

  constructor(items: T[] = [], private toIdentity: (t: T) => Identity) {
    for (const it of items) this.add(it);
  }

  private push(map: Map<string, number[]>, key: string, i: number) {
    const arr = map.get(key);
    if (arr) arr.push(i);
    else map.set(key, [i]);
  }

  private blocks(name: string) {
    const t = [...new Set(name.split(" ").map((x) => x.slice(0, 3)))].sort();
    const keys: string[] = [];
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) keys.push(`${t[i]}|${t[j]}`);
    return keys;
  }

  add(item: T) {
    const i = this.items.length;
    const p = prepare(this.toIdentity(item));
    this.items.push({ item, p });
    for (const ph of p.phones) this.push(this.byPhone, ph, i);
    for (const em of p.emails) this.push(this.byEmail, em, i);
    if (informative(p.name)) for (const b of this.blocks(p.name)) this.push(this.byBlock, b, i);
  }

  /** Semua catatan yang cocok, urut dari yang paling kuat (WA/email dulu, lalu skor nama). */
  find(who: Identity, accept?: (t: T) => boolean): { item: T; match: Match }[] {
    const q = prepare(who);
    const cand = new Set<number>();
    for (const ph of q.phones) for (const i of this.byPhone.get(ph) ?? []) cand.add(i);
    for (const em of q.emails) for (const i of this.byEmail.get(em) ?? []) cand.add(i);
    if (informative(q.name)) for (const b of this.blocks(q.name)) for (const i of this.byBlock.get(b) ?? []) cand.add(i);
    const out: { item: T; match: Match }[] = [];
    for (const i of cand) {
      const { item, p } = this.items[i];
      if (accept && !accept(item)) continue;
      const m = matchPrepared(q, p);
      if (m) out.push({ item, match: m });
    }
    const rank = (m: Match) => (m.weak ? 0.5 : m.by === "nama" ? m.score : 2);
    return out.sort((x, y) => rank(y.match) - rank(x.match));
  }
}

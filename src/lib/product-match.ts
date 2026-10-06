/**
 * Mencocokkan teks bebas kolom "Paket / bidang / jenjang" Master Lead (mis. dari Google Form)
 * ke produk kelas di sistem. Aturan: mapel HARUS sama, jenjang (bila tertulis) harus sama;
 * bila masih lebih dari satu kandidat, dipilih yang namanya paling mirip — kalau selisihnya tipis,
 * dianggap ragu dan admin diminta memilih sendiri (supaya tidak salah kelas).
 */

export type MatchProduct = { id: number; name: string; bidang: string; jenjang: string; gradeLabel?: string | null };
export type ProductMatch = { productId: number | null; confidence: "exact" | "high" | "ambiguous" | "none"; suggestions: number[] };

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** mapel → pola penulisan yang sering dipakai (dicocokkan per kata utuh) */
const SUBJECTS: Record<string, string[]> = {
  "bahasa indonesia": ["bahasa indonesia", "b indonesia", "b indo", "bindo", "bhs indonesia", "bhs indo"],
  "bahasa inggris": ["bahasa inggris", "b inggris", "bing", "bhs inggris", "inggris", "english"],
  matematika: ["matematika", "matematik", "mtk", "mat", "math", "maths"],
  ipa: ["ipa", "sains", "science"],
  ips: ["ips", "social"],
  fisika: ["fisika", "physics"],
  kimia: ["kimia", "chemistry"],
  biologi: ["biologi", "bio", "biology"],
  astronomi: ["astronomi", "astronomy"],
  kebumian: ["kebumian", "geosains", "ilmu kebumian"],
  geografi: ["geografi", "geography"],
  ekonomi: ["ekonomi", "economics"],
  informatika: ["informatika", "komputer", "computer", "coding", "programming", "tik"],
  ai: ["ai", "kecerdasan artifisial", "kecerdasan buatan", "artificial intelligence"],
};

const JENJANG: Record<string, RegExp> = {
  SD: /\b(sd|mi|sekolah dasar|kelas [1-6])\b/,
  SMP: /\b(smp|mts|kelas [7-9])\b/,
  SMA: /\b(sma|ma|smk|kelas 1[0-2])\b/,
};

/** frasa muncul sebagai kata utuh */
const has = (text: string, phrase: string) => new RegExp(`(^| )${phrase}( |$)`).test(text);

function subjectsOf(text: string) {
  const found = new Set<string>();
  for (const [key, pats] of Object.entries(SUBJECTS)) if (pats.some((p) => has(text, p))) found.add(key);
  return found;
}

function jenjangOf(text: string) {
  return Object.entries(JENJANG)
    .filter(([, re]) => re.test(text))
    .map(([j]) => j);
}

const productSubjects = (p: MatchProduct) => subjectsOf(norm(`${p.bidang} ${p.name}`));

/** kemiripan kata (Jaccard) antara teks & nama produk */
function similarity(a: string, b: string) {
  const A = new Set(a.split(" ").filter((w) => w.length > 1));
  const B = new Set(b.split(" ").filter((w) => w.length > 1));
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / new Set([...A, ...B]).size;
}

export function matchProduct(raw: string | null | undefined, products: MatchProduct[]): ProductMatch {
  const text = norm(raw);
  if (!text) return { productId: null, confidence: "none", suggestions: [] };
  const exact = products.find((p) => norm(p.name) === text);
  if (exact) return { productId: exact.id, confidence: "exact", suggestions: [exact.id] };

  const subj = subjectsOf(text);
  const jen = jenjangOf(text);
  let cands = products.filter((p) => [...productSubjects(p)].some((s) => subj.has(s)));
  if (jen.length) cands = cands.filter((p) => p.jenjang === "UMUM" || jen.includes(p.jenjang));
  const ranked = cands
    .map((p) => ({ p, s: similarity(text, norm(`${p.name} ${p.bidang} ${p.jenjang} ${p.gradeLabel ?? ""}`)) }))
    .sort((a, b) => b.s - a.s);
  if (!ranked.length) return { productId: null, confidence: "none", suggestions: [] };
  const suggestions = ranked.slice(0, 5).map((r) => r.p.id);
  if (ranked.length === 1) return { productId: ranked[0].p.id, confidence: "high", suggestions };
  // beberapa kandidat: yakin hanya bila jenjang tertulis & yang teratas jelas unggul
  if (jen.length && ranked[0].s - ranked[1].s >= 0.15) return { productId: ranked[0].p.id, confidence: "high", suggestions };
  return { productId: null, confidence: "ambiguous", suggestions };
}

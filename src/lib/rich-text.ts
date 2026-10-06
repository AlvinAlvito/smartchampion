/**
 * Teks kaya soal worksheet (dipakai web & PDF), tetap berupa teks biasa agar kompatibel dengan soal lama:
 * - rumus: $...$ / $$...$$ (KaTeX di web, MathJax→vektor di PDF)
 * - gambar: baris sendiri `![keterangan](/api/worksheet-img/<file>)`
 * - tabel: baris berurutan diawali `|` (baris pemisah `|---|` menandai baris pertama sebagai judul)
 */

export type RichBlock = { type: "p"; text: string } | { type: "img"; src: string; alt: string } | { type: "table"; header: boolean; rows: string[][] };

/** Hanya gambar worksheet milik sistem (bukan URL luar) */
export const WORKSHEET_IMG_SRC = /^\/api\/worksheet-img\/[a-f0-9-]+\.(?:jpg|png|webp)$/;
const IMG_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const SEP_ROW = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

function splitRow(line: string) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  // pisah di | yang tidak di-escape
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

/** `allowData` hanya untuk pratinjau impor (gambar belum tersimpan) */
export function parseRich(text: string | null | undefined, opts: { allowData?: boolean } = {}): RichBlock[] {
  const out: RichBlock[] = [];
  const lines = (text ?? "").replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  const flush = () => {
    const t = para.join("\n").replace(/^\n+|\n+$/g, "");
    if (t.trim()) out.push({ type: "p", text: t });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    const img = t.match(IMG_LINE);
    if (img && (WORKSHEET_IMG_SRC.test(img[2]) || (opts.allowData && /^data:image\/(png|jpeg|webp);base64,/.test(img[2])))) {
      flush();
      out.push({ type: "img", src: img[2], alt: img[1] || "gambar" });
      continue;
    }
    if (t.startsWith("|") && t.length > 1) {
      flush();
      const rows: string[][] = [];
      let header = false;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const r = lines[i].trim();
        if (SEP_ROW.test(r)) {
          if (rows.length === 1) header = true;
        } else rows.push(splitRow(r));
        i++;
      }
      i--;
      const width = Math.max(...rows.map((r) => r.length));
      out.push({ type: "table", header, rows: rows.map((r) => [...r, ...Array(width - r.length).fill("")]) });
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

/** Semua URL gambar worksheet di dalam teks (untuk hak akses & pembersihan file) */
export function richImageUrls(text: string | null | undefined): string[] {
  return [...(text ?? "").matchAll(/!\[[^\]]*\]\((\/api\/worksheet-img\/[a-f0-9-]+\.(?:jpg|png|webp))\)/g)].map((m) => m[1]);
}

/** Teks polos singkat (mis. untuk ringkasan/daftar): buang token gambar & tabel */
export function richPlain(text: string | null | undefined, max = 200) {
  const s = parseRich(text)
    .map((b) => (b.type === "p" ? b.text : b.type === "img" ? "[gambar]" : "[tabel]"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Tabel → teks pipa (dipakai saat impor dari Word) */
export function tableToRich(rows: string[][]) {
  if (!rows.length) return "";
  const esc = (c: string) => c.replace(/\|/g, "\\|").replace(/\n+/g, " ");
  const line = (r: string[]) => `| ${r.map(esc).join(" | ")} |`;
  return [line(rows[0]), `|${rows[0].map(() => " --- ").join("|")}|`, ...rows.slice(1).map(line)].join("\n");
}

/** Semua gambar milik satu soal: gambar utama + gambar sisipan di teks/opsi/pembahasan */
export function questionImageUrls(q: { imageUrl: string | null; text: string; options: unknown; explanation: string | null }) {
  const opts = Array.isArray(q.options) ? (q.options as string[]) : [];
  return [q.imageUrl, ...[q.text, q.explanation, ...opts].flatMap((t) => richImageUrls(t))].filter((u): u is string => !!u);
}

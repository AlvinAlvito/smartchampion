import "server-only";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { OmmlConverter } from "./omml-latex";
import { tableToRich } from "./rich-text";
import { LETTERS } from "./worksheet-shared";

/**
 * Baca file Word (.docx) template soal worksheet → daftar soal.
 * Label yang dikenali (baris sendiri, huruf besar/kecil bebas):
 *   SOAL n / QUESTION n (awal soal) · SOAL / PERTANYAAN · JAWABAN A–E (atau OPSI A–E) · KUNCI JAWABAN · POIN · PEMBAHASAN
 *   NOMOR & KATEGORI (template POSI) dikenali lalu diabaikan.
 * Isi blok: teks, rumus Word Equation (→ LaTeX $...$), gambar (PNG/JPG/WebP), tabel (→ tabel pipa).
 */

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const M = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const MC = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const VML = "urn:schemas-microsoft-com:vml";

export const MAX_DOCX_BYTES = 10 * 1024 * 1024;
const MAX_IMG = 3 * 1024 * 1024;
const MAX_QUESTIONS = 200;

export type DocxImage = { data: Buffer; ext: "png" | "jpg" | "webp" };
export type ImportedQuestion = {
  no: number;
  text: string;
  options: string[];
  answerIndex: number;
  points: number;
  explanation: string | null;
  issues: string[];
  /** false = tidak bisa diimpor (teks kosong / opsi < 2 / kunci tidak valid) */
  valid: boolean;
};
export type ParsedDocx = { questions: ImportedQuestion[]; images: DocxImage[]; warnings: string[] };

type Field = "text" | "key" | "points" | "explanation" | "skip" | { option: number };
type Draft = { no: number; text: string[]; options: Map<number, string[]>; key: string[]; points: string[]; explanation: string[]; issues: Set<string> };

const els = (n: { childNodes: ArrayLike<unknown> }) => (Array.from(n.childNodes) as Node[]).filter((c) => c.nodeType === 1) as unknown as Element[];

function imageExt(buf: Buffer): DocxImage["ext"] | "gif" | "emf" | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.length > 6 && buf.toString("ascii", 0, 3) === "GIF") return "gif";
  if (buf.length > 44 && buf.readUInt32LE(40) === 0x464d4520) return "emf";
  return null;
}

/** Label baris → bidang yang sedang diisi */
function labelOf(raw: string): { start: number } | { field: Field } | null {
  const t = raw.replace(/\s+/g, " ").replace(/[:.]$/, "").trim().toUpperCase();
  if (!t || t.length > 30) return null;
  let m = t.match(/^(?:SOAL|QUESTION|NOMOR SOAL|NO\.? SOAL)\s+(\d{1,3})$/);
  if (m) return { start: Number(m[1]) };
  if (t === "SOAL" || t === "PERTANYAAN" || t === "TEKS SOAL" || t === "QUESTION") return { field: "text" };
  m = t.match(/^(?:JAWABAN|OPSI|PILIHAN|OPTION)\s+([A-F])$/);
  if (m) return { field: { option: m[1].charCodeAt(0) - 65 } };
  if (t === "KUNCI JAWABAN" || t === "KUNCI" || t === "JAWABAN BENAR" || t === "ANSWER KEY") return { field: "key" };
  if (t === "POIN" || t === "BOBOT" || t === "SKOR" || t === "NILAI") return { field: "points" };
  if (t === "PEMBAHASAN" || t === "PENJELASAN" || t === "SOLUSI") return { field: "explanation" };
  if (t === "NOMOR" || t === "KATEGORI" || t === "NO" || t === "TOPIK") return { field: "skip" };
  return null;
}

export async function parseWorksheetDocx(buffer: Buffer): Promise<ParsedDocx> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error("File bukan dokumen Word (.docx) yang valid.");
  }
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) throw new Error("File bukan dokumen Word (.docx) yang valid.");
  const relsXml = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const rels = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g)) rels.set(m[1], m[2]);
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*\bTarget="([^"]+)"[^>]*\bId="([^"]+)"/g)) rels.set(m[2], m[1]);

  const dom = new DOMParser().parseFromString(docXml, "text/xml");
  const body = dom.getElementsByTagNameNS(W, "body")[0];
  if (!body) throw new Error("Isi dokumen tidak terbaca.");

  const images: DocxImage[] = [];
  const warnings = new Set<string>();
  const omml = new OmmlConverter();
  let issues = new Set<string>();

  async function image(rid: string | null): Promise<string> {
    const target = rid ? rels.get(rid) : null;
    if (!target) return "";
    const file = zip.file(`word/${target.replace(/^\.?\//, "").replace(/^\/word\//, "")}`) ?? zip.file(target.replace(/^\//, ""));
    if (!file) return "";
    const data = Buffer.from(await file.async("uint8array"));
    const ext = imageExt(data);
    if (ext === "gif" || ext === "emf" || !ext) {
      issues.add(`gambar format ${ext === "emf" ? "EMF/WMF" : (ext ?? "tidak dikenal").toUpperCase()} dilewati — simpan ulang sebagai PNG/JPG`);
      return "";
    }
    if (data.length > MAX_IMG) {
      issues.add("gambar > 3 MB dilewati — kecilkan ukurannya");
      return "";
    }
    images.push({ data, ext });
    return `\n![gambar](@@IMG${images.length - 1}@@)\n`;
  }

  /** Isi paragraf (urutan asli) → teks kaya */
  async function inline(node: Element): Promise<string> {
    let out = "";
    for (const c of els(node)) {
      const ns = c.namespaceURI;
      const n = c.localName;
      if (ns === M && n === "oMathPara") {
        for (const om of els(c).filter((x) => x.localName === "oMath")) out += `\n$$${omml.convert(om as never)}$$\n`;
      } else if (ns === M && n === "oMath") {
        out += `$${omml.convert(c as never)}$`;
      } else if (ns === W && n === "r") {
        const rPr = els(c).find((x) => x.localName === "rPr");
        const va = rPr
          ? els(rPr)
              .find((x) => x.localName === "vertAlign")
              ?.getAttributeNS(W, "val")
          : null;
        for (const rc of els(c)) {
          if (rc.localName === "t") {
            const t = rc.textContent ?? "";
            if ((va === "superscript" || va === "subscript") && t.trim() && !t.includes("$"))
              out += `$${va === "superscript" ? "^" : "_"}{${t.trim().replace(/[{}\\]/g, "")}}$`;
            else out += t;
          } else if (rc.localName === "tab") out += " ";
          else if (rc.localName === "br" || rc.localName === "cr") out += rc.getAttributeNS(W, "type") === "page" ? "" : "\n";
          else if (rc.localName === "drawing") out += await drawing(rc);
          else if (rc.localName === "pict") out += await pict(rc);
          else if (rc.localName === "object") {
            const vml = await pict(rc);
            if (vml) out += vml;
            else issues.add("objek Word (mis. Equation Editor 3.0) tidak terbaca — gunakan Insert › Equation");
          } else if (rc.namespaceURI === MC && rc.localName === "AlternateContent") out += await alternate(rc);
        }
      } else if (ns === MC && n === "AlternateContent") {
        out += await alternate(c);
      } else if (
        ns === W &&
        (n === "hyperlink" || n === "smartTag" || n === "ins" || n === "fldSimple" || n === "sdt" || n === "sdtContent" || n === "customXml")
      ) {
        out += await inline(c);
      }
    }
    return out;
  }
  async function drawing(d: Element) {
    let out = "";
    const blips = d.getElementsByTagNameNS(A, "blip");
    for (let i = 0; i < blips.length; i++) out += await image(blips[i].getAttributeNS(R, "embed"));
    return out;
  }
  async function pict(p: Element) {
    let out = "";
    const imgs = p.getElementsByTagNameNS(VML, "imagedata");
    for (let i = 0; i < imgs.length; i++) out += await image(imgs[i].getAttributeNS(R, "id"));
    return out;
  }
  async function alternate(ac: Element) {
    const choice = els(ac).find((x) => x.localName === "Choice") ?? els(ac).find((x) => x.localName === "Fallback");
    return choice ? inline(choice) : "";
  }
  /** teks polos paragraf (untuk deteksi label) */
  const plain = (p: Element) =>
    Array.from(p.getElementsByTagNameNS(W, "t"))
      .map((t) => t.textContent ?? "")
      .join("");
  const hasRich = (p: Element) => p.getElementsByTagNameNS(M, "oMath").length > 0 || p.getElementsByTagNameNS(W, "drawing").length > 0;

  async function table(tbl: Element) {
    const rows: string[][] = [];
    let after = "";
    for (const tr of els(tbl).filter((x) => x.localName === "tr")) {
      const row: string[] = [];
      for (const tc of els(tr).filter((x) => x.localName === "tc")) {
        const parts: string[] = [];
        for (const p of els(tc).filter((x) => x.localName === "p")) {
          const t = await inline(p);
          // gambar di dalam sel tabel ditaruh di bawah tabel
          const imgs = t.match(/!\[gambar\]\(@@IMG\d+@@\)/g);
          if (imgs) {
            after += `\n${imgs.join("\n")}\n`;
            issues.add("gambar di dalam tabel dipindah ke bawah tabel");
          }
          parts.push(
            t
              .replace(/\n?!\[gambar\]\(@@IMG\d+@@\)\n?/g, " ")
              .replace(/\n+/g, " ")
              .trim(),
          );
        }
        row.push(parts.filter(Boolean).join(" "));
      }
      if (row.some((c) => c)) rows.push(row);
    }
    return rows.length ? `\n${tableToRich(rows)}\n${after}` : after;
  }

  const drafts: Draft[] = [];
  let cur: Draft | null = null;
  let field: Field | null = null;
  const newDraft = (no: number) => {
    if (cur) cur.issues = new Set([...cur.issues, ...issues]);
    issues = new Set();
    cur = { no, text: [], options: new Map(), key: [], points: [], explanation: [], issues: new Set() };
    drafts.push(cur);
    return cur;
  };
  const push = (content: string) => {
    if (!cur || !field || field === "skip") return;
    if (field === "text") cur.text.push(content);
    else if (field === "key") cur.key.push(content);
    else if (field === "points") cur.points.push(content);
    else if (field === "explanation") cur.explanation.push(content);
    else {
      const arr = cur.options.get(field.option) ?? [];
      arr.push(content);
      cur.options.set(field.option, arr);
    }
  };

  for (const node of els(body)) {
    if (node.namespaceURI !== W) continue;
    if (node.localName === "p") {
      const label = hasRich(node) ? null : labelOf(plain(node));
      if (label && "start" in label) {
        newDraft(label.start);
        field = null;
        continue;
      }
      if (label) {
        // template tanpa "SOAL n": label SOAL kedua memulai soal baru
        if (label.field === "text" && (!cur || (cur as Draft).text.join("").trim())) newDraft(drafts.length + 1);
        field = label.field;
        continue;
      }
      if (!cur || !field) continue;
      push(await inline(node));
    } else if (node.localName === "tbl") {
      if (cur && field) push(await table(node));
    } else if (node.localName === "sdt") {
      // blok konten (mis. daftar isi) — ambil paragrafnya
      const content = els(node).find((x) => x.localName === "sdtContent");
      if (content && cur && field) for (const p of els(content).filter((x) => x.localName === "p")) push(await inline(p));
    }
  }
  if (cur) (cur as Draft).issues = new Set([...(cur as Draft).issues, ...issues]);
  if (omml.unknown.size) warnings.add(`Sebagian elemen rumus tidak dikenali (${[...omml.unknown].join(", ")}) — periksa hasil rumusnya.`);

  const tidy = (parts: string[]) =>
    parts
      .join("\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const questions: ImportedQuestion[] = [];
  for (const d of drafts) {
    const text = tidy(d.text);
    const optionIdx = [...d.options.keys()].sort((a, b) => a - b);
    const filled = optionIdx.map((i) => ({ i, v: tidy(d.options.get(i)!) })).filter((o) => o.v);
    // blok kosong dari template → lewati diam-diam
    if (!text && !filled.length && !tidy(d.key) && !tidy(d.explanation)) continue;
    const issues = [...d.issues];
    if (filled.some((o) => o.i >= LETTERS.length)) issues.push(`maksimal ${LETTERS.length} opsi (A–${LETTERS.at(-1)}), opsi lebih dari itu diabaikan`);
    const opts = filled.filter((o) => o.i < LETTERS.length);
    // opsi dipadatkan berurutan; kunci mengikuti huruf asli
    const keyLetter = tidy(d.key).toUpperCase().match(/[A-F]/)?.[0];
    const keyOrig = keyLetter ? keyLetter.charCodeAt(0) - 65 : -1;
    const answerIndex = opts.findIndex((o) => o.i === keyOrig);
    const pts = Number(tidy(d.points).match(/\d+/)?.[0]);
    const points = Number.isInteger(pts) && pts >= 1 && pts <= 100 ? pts : 10;
    if (tidy(d.points) && points !== pts) issues.push("poin tidak valid → dipakai 10");
    if (!text) issues.push("teks soal kosong");
    if (opts.length < 2) issues.push("minimal 2 opsi jawaban");
    if (!keyLetter) issues.push("kunci jawaban belum diisi");
    else if (answerIndex < 0) issues.push(`kunci ${keyLetter} tidak cocok dengan opsi yang terisi`);
    if (/\$[^$]*$/.test(text.replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$/g, ""))) issues.push("tanda $ rumus tidak berpasangan");
    questions.push({
      no: d.no,
      text,
      options: opts.map((o) => o.v),
      answerIndex: Math.max(0, answerIndex),
      points,
      explanation: tidy(d.explanation) || null,
      issues,
      valid: !!text && opts.length >= 2 && answerIndex >= 0,
    });
    if (questions.length >= MAX_QUESTIONS) {
      warnings.add(`Maksimal ${MAX_QUESTIONS} soal per impor — sisanya diabaikan.`);
      break;
    }
  }
  if (!drafts.length) warnings.add('Label soal tidak ditemukan. Pakai template dari tombol "Unduh template" dan jangan ubah labelnya.');
  return { questions, images, warnings: [...warnings] };
}

/** Ganti penanda gambar @@IMGn@@ dengan URL/data hasil penyimpanan */
export function fillImages(text: string, urls: (string | null)[]) {
  return text.replace(/!\[gambar\]\(@@IMG(\d+)@@\)/g, (_, i) => (urls[Number(i)] ? `![gambar](${urls[Number(i)]})` : "")).replace(/\n{3,}/g, "\n\n");
}

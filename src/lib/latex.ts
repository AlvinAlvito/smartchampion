import katex from "katex";

/**
 * Teks soal dengan rumus LaTeX: `$...$` (sebaris) dan `$$...$$` (baris sendiri); `\(...\)` & `\[...\]` juga didukung.
 * `\$` = tanda dolar biasa. Dipakai di server & browser (soal game, worksheet, opsi, pembahasan).
 */

export type MathPart = { type: "text"; value: string } | { type: "math"; value: string; display: boolean };

const RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$((?:\\\$|[^$\n])+?)\$/g;

export function splitMath(input: string): MathPart[] {
  const parts: MathPart[] = [];
  let last = 0;
  for (const m of input.matchAll(RE)) {
    if (m.index > last) parts.push({ type: "text", value: input.slice(last, m.index) });
    const display = m[1] != null || m[2] != null;
    parts.push({ type: "math", value: (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").trim(), display });
    last = m.index + m[0].length;
  }
  if (last < input.length) parts.push({ type: "text", value: input.slice(last) });
  return parts.map((p) => (p.type === "text" ? { ...p, value: p.value.replace(/\\\$/g, "$") } : p));
}

/** Opsi aman: perintah berisiko (\href, \url, \includegraphics, dll.) ditolak & ukuran dibatasi. */
const OPTIONS = { throwOnError: false, trust: false, strict: "ignore" as const, maxSize: 20, maxExpand: 200, output: "html" as const };

export function renderMath(tex: string, display: boolean) {
  return katex.renderToString(tex, { ...OPTIONS, displayMode: display });
}

export function hasMath(text: string) {
  return splitMath(text).some((p) => p.type === "math");
}

/** Semua rumus di teks valid? (dipakai untuk menyaring soal AI & memberi tahu admin) */
export function latexErrors(text: string): string[] {
  const errs: string[] = [];
  for (const p of splitMath(text)) {
    if (p.type !== "math") continue;
    try {
      katex.renderToString(p.value, { ...OPTIONS, throwOnError: true, displayMode: p.display });
    } catch (e) {
      errs.push(`${p.value.slice(0, 40)}: ${(e as Error).message.replace(/^KaTeX parse error:\s*/, "").slice(0, 120)}`);
    }
  }
  return errs;
}

/* Perintah LaTeX umum yang sering kehilangan backslash di keluaran AI (mis. `30^circ`). */
const BARE_CMDS = "circ|times|div|cdot|pm|frac|sqrt|text|mathrm|leq|geq|neq|approx|infty|degree|rightarrow|Delta|theta|alpha|beta|lambda|omega|pi";
const BARE_RE = new RegExp(`(^|[\\^_{(\\s\\d$])(${BARE_CMDS})(?![a-zA-Z])`, "g");
const BS = "\\";

/**
 * Perbaiki escape LaTeX yang rusak dari JSON AI — hanya di dalam `$...$`:
 * tab (dari `\t`ext), form feed (`\f`rac), backspace (`\b`eta), `\r`, `\v`, dan baris baru sebelum huruf (`\n`eq)
 * dikembalikan menjadi backslash; perintah umum yang kehilangan backslash (`^circ`) dilengkapi (`^\circ`).
 */
export function repairLatex(text: string): string {
  if (!text.includes("$")) return text;
  return text.replace(/\$\$[\s\S]+?\$\$|\$[^$]+?\$/g, (seg) =>
    seg
      .replace(/\t/g, BS + "t")
      .replace(/\f/g, BS + "f")
      .replace(/\x08/g, BS + "b")
      .replace(/\v/g, BS + "v")
      .replace(/\r(?=[a-zA-Z])/g, BS + "r")
      .replace(/\n(?=[a-zA-Z]{2})/g, BS + "n")
      .replace(BARE_RE, (_m, pre: string, cmd: string) => pre + BS + cmd),
  );
}

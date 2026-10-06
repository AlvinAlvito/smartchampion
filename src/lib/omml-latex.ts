/**
 * Konversi rumus Word (Office Math Markup / OMML, elemen m:*) → LaTeX untuk KaTeX/MathJax.
 * Elemen yang tidak dikenali tetap diambil isinya dan dicatat di `unknown` agar soal ditandai untuk dicek.
 */

type El = { localName: string | null; namespaceURI?: string | null; childNodes: ArrayLike<Node>; getAttribute?: (n: string) => string | null } & Node;

const M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Simbol Unicode yang umum di Word Equation → perintah LaTeX */
const SYMBOLS: Record<string, string> = {
  "×": "\\times ",
  "÷": "\\div ",
  "±": "\\pm ",
  "∓": "\\mp ",
  "·": "\\cdot ",
  "⋅": "\\cdot ",
  "≤": "\\le ",
  "≥": "\\ge ",
  "≠": "\\neq ",
  "≈": "\\approx ",
  "≡": "\\equiv ",
  "∼": "\\sim ",
  "∝": "\\propto ",
  "→": "\\to ",
  "←": "\\leftarrow ",
  "↔": "\\leftrightarrow ",
  "⇒": "\\Rightarrow ",
  "⇔": "\\Leftrightarrow ",
  "∞": "\\infty ",
  "∂": "\\partial ",
  "∇": "\\nabla ",
  "∈": "\\in ",
  "∉": "\\notin ",
  "⊂": "\\subset ",
  "⊆": "\\subseteq ",
  "∪": "\\cup ",
  "∩": "\\cap ",
  "∅": "\\emptyset ",
  "∀": "\\forall ",
  "∃": "\\exists ",
  "∠": "\\angle ",
  "△": "\\triangle ",
  "∥": "\\parallel ",
  "⊥": "\\perp ",
  "°": "^{\\circ}",
  "′": "'",
  "″": "''",
  "…": "\\ldots ",
  "⋯": "\\cdots ",
  "∑": "\\sum ",
  "∏": "\\prod ",
  "∫": "\\int ",
  "√": "\\surd ",
  "−": "-",
  α: "\\alpha ",
  β: "\\beta ",
  γ: "\\gamma ",
  δ: "\\delta ",
  ε: "\\varepsilon ",
  ϵ: "\\epsilon ",
  ζ: "\\zeta ",
  η: "\\eta ",
  θ: "\\theta ",
  ϑ: "\\vartheta ",
  ι: "\\iota ",
  κ: "\\kappa ",
  λ: "\\lambda ",
  μ: "\\mu ",
  ν: "\\nu ",
  ξ: "\\xi ",
  π: "\\pi ",
  ρ: "\\rho ",
  σ: "\\sigma ",
  τ: "\\tau ",
  υ: "\\upsilon ",
  φ: "\\varphi ",
  ϕ: "\\phi ",
  χ: "\\chi ",
  ψ: "\\psi ",
  ω: "\\omega ",
  Γ: "\\Gamma ",
  Δ: "\\Delta ",
  Θ: "\\Theta ",
  Λ: "\\Lambda ",
  Ξ: "\\Xi ",
  Π: "\\Pi ",
  Σ: "\\Sigma ",
  Φ: "\\Phi ",
  Ψ: "\\Psi ",
  Ω: "\\Omega ",
};
const ESCAPE: Record<string, string> = { "%": "\\%", "#": "\\#", "&": "\\&", $: "\\$", "{": "\\{", "}": "\\}", _: "\\_", "\\": "\\backslash " };
const FUNCS = new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "log",
  "ln",
  "lg",
  "exp",
  "lim",
  "max",
  "min",
  "sinh",
  "cosh",
  "tanh",
  "arcsin",
  "arccos",
  "arctan",
  "det",
  "gcd",
]);
const NARY: Record<string, string> = {
  "∑": "\\sum",
  "∏": "\\prod",
  "∫": "\\int",
  "∬": "\\iint",
  "∭": "\\iiint",
  "∮": "\\oint",
  "⋃": "\\bigcup",
  "⋂": "\\bigcap",
};
const ACCENT: Record<string, string> = {
  "̂": "\\hat",
  "^": "\\hat",
  "̃": "\\tilde",
  "~": "\\tilde",
  "̄": "\\bar",
  "¯": "\\bar",
  "⃗": "\\vec",
  "→": "\\vec",
  "̇": "\\dot",
  "̈": "\\ddot",
  "̆": "\\breve",
  "̌": "\\check",
};
const DELIM: Record<string, string> = {
  "(": "(",
  ")": ")",
  "[": "[",
  "]": "]",
  "{": "\\{",
  "}": "\\}",
  "|": "|",
  "‖": "\\|",
  "⟨": "\\langle",
  "⟩": "\\rangle",
  "⌊": "\\lfloor",
  "⌋": "\\rfloor",
  "⌈": "\\lceil",
  "⌉": "\\rceil",
  "": ".",
};

const kids = (el: El) => Array.from(el.childNodes).filter((n) => n.nodeType === 1) as unknown as El[];
const child = (el: El, name: string) => kids(el).find((c) => c.localName === name && c.namespaceURI === M_NS);
const val = (el: El | undefined, prop: string, attr = "val") => {
  const p = el ? child(el, prop) : undefined;
  return p?.getAttribute?.(`m:${attr}`) ?? p?.getAttribute?.(attr) ?? null;
};

function textToLatex(s: string) {
  let out = "";
  for (const ch of s) out += SYMBOLS[ch] ?? ESCAPE[ch] ?? ch;
  return out;
}

export class OmmlConverter {
  unknown = new Set<string>();

  /** Isi elemen sebagai grup LaTeX */
  private g(el: El | undefined) {
    return el ? this.children(el) : "";
  }

  private children(el: El): string {
    return kids(el)
      .map((c) => this.node(c))
      .join("");
  }

  private run(el: El) {
    const text = kids(el)
      .filter((c) => c.localName === "t")
      .map((t) => t.textContent ?? "")
      .join("");
    if (!text) return "";
    const rPr = child(el, "rPr");
    const plain = rPr && kids(rPr).some((c) => c.localName === "nor");
    if (plain && /[A-Za-z]{2,}/.test(text)) return `\\text{${text.replace(/[{}\\]/g, "")}}`;
    // nama fungsi dalam teks biasa (mis. "sin x") → \sin
    if (FUNCS.has(text.trim())) return `\\${text.trim()} `;
    return textToLatex(text);
  }

  node(el: El): string {
    if (el.namespaceURI === W_NS) {
      // teks Word di dalam rumus (w:r/w:t)
      if (el.localName === "t") return textToLatex(el.textContent ?? "");
      return this.children(el);
    }
    if (el.namespaceURI !== M_NS) return "";
    switch (el.localName) {
      case "oMath":
      case "e":
      case "num":
      case "den":
      case "sub":
      case "sup":
      case "deg":
      case "lim":
      case "fName":
      case "box":
      case "borderBox":
      case "phant":
        return this.children(el);
      case "r":
        return this.run(el);
      case "rPr":
      case "ctrlPr":
      case "fPr":
      case "sSupPr":
      case "sSubPr":
      case "sSubSupPr":
      case "radPr":
      case "dPr":
      case "naryPr":
      case "funcPr":
      case "accPr":
      case "barPr":
      case "limLowPr":
      case "limUppPr":
      case "eqArrPr":
      case "mPr":
      case "mcs":
      case "groupChrPr":
      case "sPrePr":
      case "boxPr":
      case "borderBoxPr":
      case "argPr":
      case "oMathParaPr":
        return "";
      case "f": {
        const type = val(child(el, "fPr"), "type");
        const n = this.g(child(el, "num"));
        const d = this.g(child(el, "den"));
        if (type === "lin") return `${n}/${d}`;
        if (type === "noBar") return `\\genfrac{}{}{0pt}{}{${n}}{${d}}`;
        return `\\frac{${n}}{${d}}`;
      }
      case "sSup":
        return `{${this.g(child(el, "e"))}}^{${this.g(child(el, "sup"))}}`;
      case "sSub":
        return `{${this.g(child(el, "e"))}}_{${this.g(child(el, "sub"))}}`;
      case "sSubSup":
        return `{${this.g(child(el, "e"))}}_{${this.g(child(el, "sub"))}}^{${this.g(child(el, "sup"))}}`;
      case "sPre":
        return `{}_{${this.g(child(el, "sub"))}}^{${this.g(child(el, "sup"))}}{${this.g(child(el, "e"))}}`;
      case "rad": {
        const deg = this.g(child(el, "deg"));
        const hide = val(child(el, "radPr"), "degHide");
        return deg && hide !== "1" && hide !== "on" ? `\\sqrt[${deg}]{${this.g(child(el, "e"))}}` : `\\sqrt{${this.g(child(el, "e"))}}`;
      }
      case "d": {
        const pr = child(el, "dPr");
        const beg = val(pr, "begChr") ?? "(";
        const end = val(pr, "endChr") ?? ")";
        const sep = val(pr, "sepChr") ?? "|";
        const parts = kids(el)
          .filter((c) => c.localName === "e")
          .map((e) => this.g(e));
        const l = DELIM[beg] ?? textToLatex(beg);
        const r = DELIM[end] ?? textToLatex(end);
        return `\\left${l}${parts.join(sep === "|" ? "\\mid " : textToLatex(sep))}\\right${r}`;
      }
      case "nary": {
        const pr = child(el, "naryPr");
        const chr = val(pr, "chr") ?? "∫";
        const op = NARY[chr] ?? textToLatex(chr);
        const sub = this.g(child(el, "sub"));
        const sup = this.g(child(el, "sup"));
        return `${op}${sub ? `_{${sub}}` : ""}${sup ? `^{${sup}}` : ""}{${this.g(child(el, "e"))}}`;
      }
      case "func": {
        const name = this.g(child(el, "fName")).trim();
        const fn = name.replace(/\\/g, "");
        const head = FUNCS.has(fn) ? `\\${fn}` : name.startsWith("\\") ? name : `\\operatorname{${name}}`;
        return `${head}{${this.g(child(el, "e"))}}`;
      }
      case "acc": {
        const chr = val(child(el, "accPr"), "chr") ?? "̂";
        return `${ACCENT[chr] ?? "\\hat"}{${this.g(child(el, "e"))}}`;
      }
      case "bar": {
        const pos = val(child(el, "barPr"), "pos");
        return pos === "bot" ? `\\underline{${this.g(child(el, "e"))}}` : `\\overline{${this.g(child(el, "e"))}}`;
      }
      case "groupChr": {
        const pr = child(el, "groupChrPr");
        const chr = val(pr, "chr") ?? "⏟";
        const top = val(pr, "pos") === "top";
        if (chr === "⏟" || chr === "⏞") return `${top || chr === "⏞" ? "\\overbrace" : "\\underbrace"}{${this.g(child(el, "e"))}}`;
        return `\\${top ? "overset" : "underset"}{${textToLatex(chr)}}{${this.g(child(el, "e"))}}`;
      }
      case "limLow":
        return `{${this.g(child(el, "e"))}}_{${this.g(child(el, "lim"))}}`;
      case "limUpp":
        return `{${this.g(child(el, "e"))}}^{${this.g(child(el, "lim"))}}`;
      case "eqArr":
        return `\\begin{aligned}${kids(el)
          .filter((c) => c.localName === "e")
          .map((e) => this.g(e).replace(/=/, "&="))
          .join("\\\\")}\\end{aligned}`;
      case "m":
        return `\\begin{matrix}${kids(el)
          .filter((c) => c.localName === "mr")
          .map((r) =>
            kids(r)
              .filter((c) => c.localName === "e")
              .map((e) => this.g(e))
              .join("&"),
          )
          .join("\\\\")}\\end{matrix}`;
      case "t":
        return textToLatex(el.textContent ?? "");
      default:
        this.unknown.add(el.localName ?? "?");
        return this.children(el);
    }
  }

  /** m:oMath → LaTeX (dirapikan) */
  convert(oMath: El) {
    return this.node(oMath)
      .replace(/\s+/g, " ")
      .replace(/\s+([}^_])/g, "$1")
      .trim();
  }
}

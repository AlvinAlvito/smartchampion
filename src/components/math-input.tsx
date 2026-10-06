"use client";

import { useRef, useState } from "react";
import { Sigma } from "lucide-react";
import { hasMath, latexErrors } from "@/lib/latex";
import { cn } from "@/lib/utils";
import { MathText } from "./math-text";

/** Tombol rumus cepat: `|` = posisi kursor setelah disisipkan */
const SNIPPETS: { label: string; tex: string; title: string }[] = [
  { label: "a/b", tex: "\\frac{|}{}", title: "Pecahan" },
  { label: "√", tex: "\\sqrt{|}", title: "Akar" },
  { label: "ⁿ√", tex: "\\sqrt[n]{|}", title: "Akar pangkat n" },
  { label: "x²", tex: "^{|}", title: "Pangkat" },
  { label: "xₙ", tex: "_{|}", title: "Indeks bawah" },
  { label: "×", tex: "\\times ", title: "Kali" },
  { label: "÷", tex: "\\div ", title: "Bagi" },
  { label: "±", tex: "\\pm ", title: "Plus minus" },
  { label: "≤", tex: "\\le ", title: "Kurang dari sama dengan" },
  { label: "≥", tex: "\\ge ", title: "Lebih dari sama dengan" },
  { label: "≠", tex: "\\neq ", title: "Tidak sama dengan" },
  { label: "π", tex: "\\pi ", title: "Pi" },
  { label: "θ", tex: "\\theta ", title: "Theta" },
  { label: "°", tex: "^{\\circ}", title: "Derajat" },
  { label: "∞", tex: "\\infty ", title: "Tak hingga" },
  { label: "lim", tex: "\\lim_{x \\to |}", title: "Limit" },
  { label: "Σ", tex: "\\sum_{i=1}^{n} |", title: "Sigma" },
  { label: "∫", tex: "\\int_{a}^{b} | \\, dx", title: "Integral" },
  { label: "log", tex: "\\log_{|}", title: "Logaritma" },
  { label: "sin", tex: "\\sin ", title: "Sinus" },
  { label: "( )", tex: "\\left( | \\right)", title: "Kurung menyesuaikan tinggi" },
  { label: "→", tex: "\\rightarrow ", title: "Panah" },
];

/**
 * Textarea soal dengan dukungan LaTeX: tombol rumus cepat + pratinjau langsung.
 * Rumus ditulis di antara $...$ (sebaris) atau $$...$$ (baris sendiri).
 */
export function MathInput({
  name,
  defaultValue,
  rows = 3,
  placeholder,
  id,
  single = false,
  className,
}: {
  name: string;
  defaultValue?: string | null;
  rows?: number;
  placeholder?: string;
  id?: string;
  /** satu baris (untuk opsi jawaban) */
  single?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [tools, setTools] = useState(false);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const errors = hasMath(value) ? latexErrors(value) : [];

  const insert = (tex: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    // di luar $...$ → otomatis dibungkus $ agar langsung jadi rumus
    const before = value.slice(0, start);
    const inside = (before.match(/(?<!\\)\$/g)?.length ?? 0) % 2 === 1;
    const body = tex.replace("|", selected);
    const snippet = inside ? body : `$${body}$`;
    const caret = start + (inside ? 0 : 1) + (tex.includes("|") ? tex.indexOf("|") + selected.length : body.length);
    const next = before + snippet + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const common = {
    ref,
    id,
    name,
    value,
    placeholder,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement & HTMLInputElement>) => setValue(e.target.value),
    className: cn("input", !single && "font-mono text-[13px]", className),
  };

  return (
    <div className="space-y-1.5">
      <div className={cn("flex gap-2", single ? "items-center" : "flex-col")}>
        {single ? <input {...common} /> : <textarea {...common} rows={rows} />}
        <button
          type="button"
          onClick={() => setTools((t) => !t)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 self-start rounded-xl px-2.5 py-1.5 text-xs font-semibold transition",
            tools ? "bg-brand-600 text-white" : "bg-navy-50 text-navy-600 hover:bg-brand-50 hover:text-brand-700",
          )}
          title="Tombol rumus (LaTeX)"
        >
          <Sigma className="h-3.5 w-3.5" /> {single ? "" : "Rumus"}
        </button>
      </div>
      {tools && (
        <div className="flex flex-wrap gap-1 rounded-2xl bg-navy-50/70 p-2">
          {SNIPPETS.map((s) => (
            <button
              key={s.label}
              type="button"
              title={s.title}
              onClick={() => insert(s.tex)}
              className="min-w-8 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-navy-700 ring-1 ring-navy-100 transition hover:bg-brand-50 hover:text-brand-700"
            >
              {s.label}
            </button>
          ))}
          <p className="w-full px-1 pt-1 text-[11px] text-navy-400">
            Rumus ditulis di antara <code className="rounded bg-white px-1">$...$</code>, atau <code className="rounded bg-white px-1">$$...$$</code> untuk baris sendiri. Contoh:{" "}
            <code className="rounded bg-white px-1">{"$\\frac{1}{2}x^{2}$"}</code>
          </p>
        </div>
      )}
      {hasMath(value) && (
        <div className={cn("rounded-2xl px-3 py-2 text-sm ring-1", errors.length ? "bg-rose-50 ring-rose-100" : "bg-emerald-50/50 ring-emerald-100")}>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-navy-400">Pratinjau</p>
          <MathText text={value} className="text-navy-900" />
          {errors.length > 0 && <p className="mt-1 text-xs font-medium text-rose-600">Rumus belum benar: {errors[0]}</p>}
        </div>
      )}
    </div>
  );
}

import "katex/dist/katex.min.css";
import { Fragment } from "react";
import { renderMath, splitMath } from "@/lib/latex";
import { cn } from "@/lib/utils";

/**
 * Menampilkan teks + rumus LaTeX ($...$ / $$...$$). Teks biasa tetap di-escape React;
 * hanya keluaran KaTeX (yang meng-escape isinya sendiri, trust=false) yang disisipkan sebagai HTML.
 */
export function MathText({ text, className, as: Tag = "span" }: { text: string | null | undefined; className?: string; as?: "span" | "div" | "p" }) {
  if (!text) return null;
  const parts = splitMath(text);
  return (
    <Tag className={cn("math-text whitespace-pre-wrap break-words", className)}>
      {parts.map((p, i) =>
        p.type === "text" ? (
          <Fragment key={i}>{p.value}</Fragment>
        ) : (
          <span
            key={i}
            className={p.display ? "my-1 block overflow-x-auto overflow-y-hidden py-1 text-center" : "inline-block max-w-full overflow-x-auto overflow-y-hidden align-middle"}
            dangerouslySetInnerHTML={{ __html: renderMath(p.value, p.display) }}
          />
        ),
      )}
    </Tag>
  );
}

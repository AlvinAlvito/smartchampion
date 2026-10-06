import Link from "next/link";
import { Fragment } from "react";

/** Render teks balasan bot: **tebal**, daftar "- " / "1. ", [tautan](url) dan URL polos — tanpa HTML mentah. */
const TOKEN = /(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\((?:https?:\/\/|\/)[^)\s]+\)|https?:\/\/[^\s)]+)/g;

function Inline({ text }: { text: string }) {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (p.startsWith("**") && p.endsWith("**")) return <b key={i}>{p.slice(2, -2)}</b>;
        const md = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        const href = md ? md[2] : /^https?:\/\//.test(p) ? p : null;
        if (href) {
          const label = md ? md[1] : p.replace(/^https?:\/\//, "");
          const cls = "font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-900";
          return href.startsWith("/") ? (
            <Link key={i} href={href} className={cls}>
              {label}
            </Link>
          ) : (
            <a key={i} href={href} target="_blank" rel="noreferrer noopener" className={cls}>
              {label}
            </a>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

export function ChatText({ text }: { text: string }) {
  const blocks: { type: "p" | "ul" | "ol"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-•*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const type = ul ? "ul" : ol ? "ol" : "p";
    const content = ul ? ul[1] : ol ? ol[1] : line;
    if (!content.trim()) {
      blocks.push({ type: "p", lines: [] });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last && last.type === type && (type !== "p" || last.lines.length)) last.lines.push(content);
    else blocks.push({ type, lines: [content] });
  }
  return (
    <div className="space-y-1.5">
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.type === "p" ? (
            <p key={i}>
              {b.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  <Inline text={l} />
                </Fragment>
              ))}
            </p>
          ) : b.type === "ul" ? (
            <ul key={i} className="list-disc space-y-0.5 pl-4 marker:text-brand-400">
              {b.lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l} />
                </li>
              ))}
            </ul>
          ) : (
            <ol key={i} className="list-decimal space-y-0.5 pl-4 marker:font-semibold marker:text-brand-500">
              {b.lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l} />
                </li>
              ))}
            </ol>
          ),
        )}
    </div>
  );
}

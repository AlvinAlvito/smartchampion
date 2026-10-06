import { Fragment } from "react";

/** Ubah link YouTube (watch / youtu.be / shorts) ke URL embed. Link lain dikembalikan apa adanya. */
export function toEmbedUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "about:blank"; // tolak javascript:/data:
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v") ?? u.pathname.split("/shorts/")[1]?.split("/")[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith("/embed/")) return url;
    }
    if (u.hostname === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (u.hostname.includes("drive.google.com")) return url.replace(/\/view.*$/, "/preview");
    return url;
  } catch {
    return url.startsWith("/api/files/") ? url : "about:blank";
  }
}

function inline(text: string) {
  // **tebal** dan *miring*; teks lain dirender apa adanya (React meng-escape HTML)
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
      <em key={i}>{p.slice(1, -1)}</em>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

/** Markdown sederhana (## judul, ### subjudul, - list, 1. list, paragraf) tanpa HTML mentah. */
export function SimpleMarkdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="prose-article text-navy-700">
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (!lines.length) return null;
        if (lines[0].startsWith("### ")) return <h3 key={i}>{inline(lines[0].slice(4))}</h3>;
        if (lines[0].startsWith("## ")) return <h2 key={i}>{inline(lines[0].slice(3))}</h2>;
        if (lines.every((l) => /^[-*] /.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
        if (lines.every((l) => /^\d+\. /.test(l))) return <ol key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\. /, ""))}</li>)}</ol>;
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

import { parseRich } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import { MathText } from "./math-text";

/**
 * Tampilan teks kaya soal worksheet: paragraf + rumus, gambar (hanya /api/worksheet-img), dan tabel.
 * Soal lama (teks + rumus saja) tampil sama seperti MathText.
 */
export function RichText({
  text,
  className,
  imgClassName,
  allowData = false,
}: {
  text: string | null | undefined;
  className?: string;
  imgClassName?: string;
  allowData?: boolean;
}) {
  const blocks = parseRich(text, { allowData });
  if (!blocks.length) return null;
  return (
    <div className={cn("space-y-2", className)}>
      {blocks.map((b, i) =>
        b.type === "p" ? (
          <MathText key={i} as="div" text={b.text} />
        ) : b.type === "img" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={b.src} alt={b.alt} loading="lazy" className={cn("max-h-80 max-w-full rounded-2xl ring-1 ring-navy-100", imgClassName)} />
        ) : (
          <div key={i} className="max-w-full overflow-x-auto">
            <table className="border-collapse text-sm">
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri} className={b.header && ri === 0 ? "bg-brand-50 font-semibold text-navy-900" : undefined}>
                    {r.map((c, ci) => (
                      <td key={ci} className="border border-navy-200 px-3 py-1.5 align-top font-normal">
                        <MathText text={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
      )}
    </div>
  );
}

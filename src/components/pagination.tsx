import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const PER_PAGE = 30;

type SearchParams = Record<string, string | string[] | undefined>;

/** Baca nomor halaman dari query (?page=2) dan hitung skip/take untuk Prisma. */
export function readPage(sp: SearchParams, perPage = PER_PAGE) {
  const raw = typeof sp.page === "string" ? Number(sp.page) : 1;
  // batasi agar ?page=999999999 tidak memicu query offset raksasa
  const page = Number.isFinite(raw) && raw >= 1 ? Math.min(Math.floor(raw), 10_000) : 1;
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}

/** Nomor halaman yang ditampilkan: 1 … 4 5 [6] 7 8 … 20 */
function pageList(page: number, pages: number) {
  const set = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => set.add(n));
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

/**
 * Navigasi halaman (server component). Mempertahankan semua query lain (filter, pencarian).
 */
export function Pagination({
  basePath,
  searchParams,
  page,
  perPage = PER_PAGE,
  total,
  noun = "data",
  anchor,
}: {
  basePath: string;
  searchParams: SearchParams;
  page: number;
  perPage?: number;
  total: number;
  noun?: string;
  /** id elemen tujuan scroll setelah pindah halaman (mis. awal tabel) */
  anchor?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = total ? (page - 1) * perPage + 1 : 0;
  const to = Math.min(page * perPage, total);

  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k === "page" || k === "open" || k === "edit" || v == null) continue;
      (Array.isArray(v) ? v : [v]).forEach((x) => x !== "" && q.append(k, x));
    }
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `${s ? `${basePath}?${s}` : basePath}${anchor ? `#${anchor}` : ""}`;
  };

  return (
    <nav className="mt-5 flex flex-col items-center justify-between gap-3 sm:flex-row" aria-label="Navigasi halaman">
      <p className="text-sm text-navy-500">
        {total ? (
          <>
            Menampilkan <b className="text-navy-800">{from}–{to}</b> dari <b className="text-navy-800">{total.toLocaleString("id-ID")}</b> {noun}
          </>
        ) : (
          `Tidak ada ${noun}`
        )}
      </p>
      {pages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <PageLink href={href(page - 1)} disabled={page <= 1} label="Halaman sebelumnya">
            <ChevronLeft className="h-4 w-4" />
          </PageLink>
          {pageList(page, pages).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1.5 text-sm text-navy-300">
                …
              </span>
            ) : (
              <PageLink key={n} href={href(n)} active={n === page} label={`Halaman ${n}`}>
                {n}
              </PageLink>
            ),
          )}
          <PageLink href={href(page + 1)} disabled={page >= pages} label="Halaman berikutnya">
            <ChevronRight className="h-4 w-4" />
          </PageLink>
        </div>
      )}
    </nav>
  );
}

function PageLink({ href, children, active, disabled, label }: { href: string; children: React.ReactNode; active?: boolean; disabled?: boolean; label: string }) {
  const cls = cn(
    "grid h-9 min-w-9 place-items-center rounded-xl px-2.5 text-sm font-semibold transition",
    active ? "bg-linear-to-br from-brand-600 to-navy-700 text-white shadow-md shadow-brand-500/30" : "bg-white text-navy-600 ring-1 ring-navy-100 hover:bg-brand-50 hover:text-brand-700",
    disabled && "pointer-events-none opacity-40",
  );
  if (disabled) {
    return (
      <span className={cls} aria-disabled aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={cls} aria-label={label} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}

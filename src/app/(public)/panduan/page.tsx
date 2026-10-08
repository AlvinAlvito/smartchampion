import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, LifeBuoy, ListOrdered, MessageCircle, PlayCircle, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/page-hero";
import { EmptyState } from "@/components/ui";
import { pageMeta } from "@/lib/seo";
import { videoInfo } from "@/lib/video";
import { cn } from "@/lib/utils";

export const metadata: Metadata = pageMeta({
  title: "Panduan Pengguna",
  description: "Panduan lengkap memakai website Pelatihan POSI: membuat akun, mendaftar kelas, membayar lewat Midtrans, hingga belajar di kelas.",
  path: "/panduan",
});
export const dynamic = "force-dynamic";

type GuideCard = {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  coverUrl: string | null;
  infographicUrl: string | null;
  videoUrl: string | null;
  videoFileUrl: string | null;
  videoFileMobileUrl: string | null;
  steps: { imageUrl: string | null }[];
  _count: { steps: number };
};

function Thumb({ g, className }: { g: GuideCard; className?: string }) {
  const vi = videoInfo(g.videoUrl);
  // sampul → thumbnail video → gambar langkah pertama
  const src = g.coverUrl ?? g.infographicUrl ?? vi?.thumb ?? g.steps[0]?.imageUrl;
  return (
    <div className={cn("relative overflow-hidden bg-linear-to-br from-brand-500 via-brand-700 to-navy-900", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
      ) : (
        <>
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
          <LifeBuoy className="absolute bottom-4 right-4 h-16 w-16 -rotate-12 text-white/15" />
        </>
      )}
      {(vi || g.videoFileUrl || g.videoFileMobileUrl) && (
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-navy-950/70 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
          <PlayCircle className="h-3.5 w-3.5" /> Video
        </span>
      )}
    </div>
  );
}

export default async function PanduanPage({ searchParams }: PageProps<"/panduan">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const kat = typeof sp.kategori === "string" ? sp.kategori.slice(0, 60) : "";
  const [all, guides] = await Promise.all([
    prisma.guide.findMany({ where: { isPublished: true }, select: { category: true } }),
    prisma.guide.findMany({
      where: {
        isPublished: true,
        ...(kat ? { category: kat } : {}),
        ...(q ? { OR: [{ title: { contains: q } }, { summary: { contains: q } }, { content: { contains: q } }, { steps: { some: { body: { contains: q } } } }] } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, slug: true, title: true, summary: true, category: true, coverUrl: true, infographicUrl: true, videoUrl: true, videoFileUrl: true, videoFileMobileUrl: true, isFeatured: true,
        steps: { where: { imageUrl: { not: null } }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1, select: { imageUrl: true } },
        _count: { select: { steps: true } },
      },
    }),
  ]);
  const cats = [...new Set(all.map((g) => g.category))];
  const filtering = !!(q || kat);
  const featured = filtering ? null : (guides.find((g) => g.isFeatured) ?? null);
  const rest = guides.filter((g) => g.id !== featured?.id);
  const href = (k: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (k) p.set("kategori", k);
    const s = p.toString();
    return s ? `/panduan?${s}` : "/panduan";
  };

  return (
    <>
      <PageHero
        eyebrow="Pusat bantuan"
        icon={LifeBuoy}
        title="Panduan Pengguna"
        subtitle="Langkah demi langkah memakai Pelatihan POSI — dari membuat akun, mendaftar kelas, membayar, sampai belajar di kelas."
      >
        <form action="/panduan" className="relative mt-6 max-w-xl">
          {kat && <input type="hidden" name="kategori" value={kat} />}
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-300" />
          <input name="q" defaultValue={q} placeholder="Cari panduan, mis. cara bayar" className="input h-13 rounded-2xl pl-12 text-base text-navy-900 shadow-xl" aria-label="Cari panduan" />
        </form>
      </PageHero>

      <div className="container-page relative z-10 -mt-10 space-y-6 pb-14">
        {cats.length > 1 && (
          <nav className="flex flex-wrap gap-2" aria-label="Kategori panduan">
            {["", ...cats].map((c) => (
              <Link
                key={c || "all"}
                href={href(c)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition",
                  kat === c ? "bg-navy-900 text-white" : "bg-white text-navy-600 ring-1 ring-navy-100 hover:bg-brand-50 hover:text-brand-700",
                )}
              >
                {c || "Semua"}
              </Link>
            ))}
          </nav>
        )}

        {featured && (
          <Link href={`/panduan/${featured.slug}`} className="card card-hover group grid overflow-hidden p-0! md:grid-cols-2">
            <Thumb g={featured} className="aspect-video md:aspect-auto md:min-h-64" />
            <div className="flex flex-col justify-center p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Mulai dari sini · {featured.category}</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-navy-900">{featured.title}</h2>
              {featured.summary && <p className="mt-2 text-navy-500">{featured.summary}</p>}
              <p className="mt-5 inline-flex items-center gap-2 font-bold text-brand-600 transition group-hover:gap-3">
                Baca panduan <ArrowRight className="h-4 w-4" />
              </p>
            </div>
          </Link>
        )}

        {rest.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((g) => (
              <Link key={g.id} href={`/panduan/${g.slug}`} className="card card-hover group flex flex-col overflow-hidden p-0!">
                <Thumb g={g} className="aspect-video" />
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">{g.category}</p>
                  <h3 className="mt-1 font-bold leading-snug text-navy-900">{g.title}</h3>
                  {g.summary && <p className="mt-1.5 line-clamp-2 flex-1 text-sm text-navy-500">{g.summary}</p>}
                  {g._count.steps > 0 && (
                    <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-navy-400">
                      <ListOrdered className="h-3.5 w-3.5" /> {g._count.steps} langkah
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          !featured && (
            <EmptyState
              icon={LifeBuoy}
              title={filtering ? "Panduan tidak ditemukan" : "Panduan segera hadir"}
              desc={filtering ? "Coba kata kunci atau kategori lain." : "Tim kami sedang menyiapkan panduan. Butuh bantuan sekarang? Hubungi admin lewat WhatsApp."}
            />
          )
        )}

        <div className="card flex flex-col items-start gap-4 bg-linear-to-br from-brand-50 to-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-navy-900">Masih bingung?</p>
            <p className="text-sm text-navy-500">Admin kami siap membantu Senin–Sabtu, 08.00–20.00 WIB.</p>
          </div>
          <a href="https://wa.me/6282276994359" target="_blank" rel="noreferrer" className="btn-primary">
            <MessageCircle className="h-4 w-4" /> Chat admin
          </a>
        </div>
      </div>
    </>
  );
}

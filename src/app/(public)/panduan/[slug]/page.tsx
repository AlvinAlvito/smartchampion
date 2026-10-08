import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { ArrowLeft, ArrowRight, CircleCheck, LifeBuoy, ListOrdered, MessageCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { SimpleMarkdown } from "@/lib/content";
import { videoInfo } from "@/lib/video";
import { NOINDEX, pageMeta } from "@/lib/seo";
import { formatDate } from "@/lib/utils";
import { GuideVideo } from "@/components/guide-video";
import { ZoomImage } from "@/components/class-showcase";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/panduan/[slug]">) {
  const { slug } = await params;
  const g = await prisma.guide.findUnique({ where: { slug }, select: { title: true, summary: true, isPublished: true } });
  if (!g || !g.isPublished) return { title: "Panduan tidak ditemukan", ...NOINDEX };
  return pageMeta({ title: `${g.title} — Panduan`, description: g.summary ?? `Panduan: ${g.title}`, path: `/panduan/${slug}` });
}

/** Sisipkan baris kosong di sekitar daftar "- …" / "1. …" agar dikenali sebagai daftar meski ditulis tepat di bawah kalimat */
function tidyLists(text: string) {
  const isList = (l: string) => /^\s*([-*]|\d+\.) /.test(l);
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.trim() && line.trim() && isList(line) !== isList(prev)) out.push("");
    out.push(isList(line) ? line.trimStart() : line);
  }
  return out.join("\n");
}

/** Teks langkah: baris baru dipertahankan, **tebal** & daftar didukung lewat SimpleMarkdown */
function StepBody({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-relaxed text-navy-600 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
      <SimpleMarkdown source={tidyLists(text)} />
    </div>
  );
}

export default async function PanduanDetailPage({ params }: PageProps<"/panduan/[slug]">) {
  const { slug } = await params;
  const guide = await prisma.guide.findUnique({
    where: { slug },
    include: { steps: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
  });
  if (!guide || !guide.isPublished) notFound();
  // hitung kunjungan setelah respons terkirim (tidak memperlambat halaman)
  after(() => prisma.guide.update({ where: { id: guide.id }, data: { viewCount: { increment: 1 } } }).catch(() => {}));

  const others = await prisma.guide.findMany({
    where: { isPublished: true, NOT: { id: guide.id } },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { slug: true, title: true, category: true },
    take: 6,
  });
  const vi = videoInfo(guide.videoUrl);

  return (
    <>
      <section className="relative overflow-hidden bg-hero pb-24 pt-8 text-white">
        <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
        <div className="container-page relative animate-fade-up">
          <Link href="/panduan" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-200 transition hover:gap-2.5 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Semua panduan
          </Link>
          <p className="mt-6 text-xs font-bold uppercase tracking-wider text-brand-200">{guide.category}</p>
          <h1 className="mt-1 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">{guide.title}</h1>
          {guide.summary && <p className="mt-3 max-w-2xl text-navy-200">{guide.summary}</p>}
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-navy-300">
            {guide.steps.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <ListOrdered className="h-3.5 w-3.5" /> {guide.steps.length} langkah
              </span>
            )}
            <span>Diperbarui {formatDate(guide.updatedAt)}</span>
          </p>
        </div>
      </section>

      <div className="container-page relative z-10 -mt-14 grid gap-6 pb-14 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-6">
          {vi && (
            <div className="card">
              <GuideVideo video={vi} title={guide.title} />
            </div>
          )}

          {guide.content && (
            <div className="card text-navy-600 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-navy-900 [&_li]:my-1 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
              <SimpleMarkdown source={tidyLists(guide.content)} />
            </div>
          )}

          {guide.steps.length > 0 && (
            <ol className="space-y-5">
              {guide.steps.map((s, i) => (
                <li key={s.id} id={`langkah-${i + 1}`} className="card scroll-mt-24">
                  <div className="flex items-start gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-brand-700 text-lg font-extrabold text-white shadow-md shadow-brand-200">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-bold leading-snug text-navy-900">{s.title}</h2>
                      <StepBody text={s.body} />
                    </div>
                  </div>
                  {s.imageUrl && (
                    <div className="mt-4 sm:ml-14">
                      <ZoomImage src={s.imageUrl} alt={`Langkah ${i + 1}: ${s.title}`} className="rounded-2xl bg-navy-50 ring-1 ring-navy-100" />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}

          <div className="card flex items-start gap-3 bg-linear-to-br from-emerald-50 to-white">
            <CircleCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            <div className="flex-1">
              <p className="font-bold text-navy-900">Selesai! Masih ada kendala?</p>
              <p className="text-sm text-navy-500">Kirim pesan ke admin, sertakan judul panduan ini & screenshot kendalanya supaya cepat dibantu.</p>
            </div>
            <a href="https://wa.me/6282276994359" target="_blank" rel="noreferrer" className="btn-primary btn-sm shrink-0">
              <MessageCircle className="h-4 w-4" /> Chat admin
            </a>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {guide.steps.length > 1 && (
            <nav className="card" aria-label="Daftar langkah">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-navy-400">Daftar langkah</p>
              <ol className="space-y-1">
                {guide.steps.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#langkah-${i + 1}`} className="flex gap-2.5 rounded-xl px-2 py-1.5 text-sm text-navy-600 transition hover:bg-brand-50 hover:text-brand-700">
                      <span className="w-5 shrink-0 text-right font-bold text-brand-600">{i + 1}.</span>
                      <span className="line-clamp-2">{s.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {others.length > 0 && (
            <div className="card">
              <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy-400">
                <LifeBuoy className="h-3.5 w-3.5" /> Panduan lainnya
              </p>
              <ul className="space-y-1">
                {others.map((o) => (
                  <li key={o.slug}>
                    <Link href={`/panduan/${o.slug}`} className="group flex items-center gap-2 rounded-xl px-2 py-2 text-sm transition hover:bg-brand-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-navy-800 group-hover:text-brand-700">{o.title}</span>
                        <span className="text-xs text-navy-400">{o.category}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-navy-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

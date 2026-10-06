import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, FileText, Newspaper, UserRound, Video } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatDate, safeUrl } from "@/lib/utils";
import { SimpleMarkdown, toEmbedUrl } from "@/lib/content";

export const dynamic = "force-dynamic";

const TYPE = { PDF: { icon: FileText, label: "PDF" }, VIDEO: { icon: Video, label: "Video" }, ARTICLE: { icon: Newspaper, label: "Artikel" } } as const;

export default async function MateriPage({ params }: PageProps<"/dashboard/materi/[id]">) {
  const { id } = await params;
  const session = await requireUser(["PESERTA"]);
  const material = await prisma.material.findUnique({
    where: { id: Number(id) || 0 },
    include: { product: true, author: { select: { name: true } } },
  });
  if (!material || !material.isPublished) notFound();

  // Hanya peserta lunas di kelas ini yang boleh membuka materi
  const allowed = await prisma.registration.count({ where: { userId: session.userId, productId: material.productId, status: "PAID" } });
  if (!allowed) notFound();
  const T = TYPE[material.type];

  return (
    <article className="mx-auto max-w-3xl animate-fade-up">
      <Link href={`/dashboard/kelas/${material.product.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:gap-2.5">
        <ArrowLeft className="h-4 w-4" /> {material.product.name}
      </Link>

      <header className="relative mt-4 overflow-hidden rounded-[28px] bg-hero p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
          <T.icon className="h-3.5 w-3.5" /> {T.label}
        </span>
        <h1 className="relative mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">{material.title}</h1>
        {material.summary && <p className="relative mt-2 text-navy-200">{material.summary}</p>}
        <p className="relative mt-4 flex items-center gap-2 text-xs text-brand-200">
          <UserRound className="h-3.5 w-3.5" /> {material.author?.name ?? "Tim POSI"} · {formatDate(material.createdAt)}
        </p>
      </header>

      <div className="mt-6 space-y-6">
        {material.type === "ARTICLE" && (
          <div className="card p-6 text-[15px] sm:p-8">
            <SimpleMarkdown source={material.content ?? ""} />
          </div>
        )}

        {material.type === "VIDEO" && material.url && (
          <div className="space-y-3">
            <div className="aspect-video overflow-hidden rounded-[28px] bg-navy-950 shadow-2xl ring-1 ring-navy-100">
              <iframe
                src={toEmbedUrl(material.url)}
                title={material.title}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <a href={safeUrl(material.url) ?? "#"} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
              <ExternalLink className="h-3.5 w-3.5" /> Buka di tab baru
            </a>
          </div>
        )}

        {material.type === "PDF" && material.url && (
          <div className="space-y-3">
            <iframe src={toEmbedUrl(material.url)} title={material.title} className="h-[75vh] w-full rounded-[28px] border border-navy-100 bg-white shadow-lg" />
            <a href={safeUrl(material.url) ?? "#"} target="_blank" rel="noreferrer" className="btn-primary">
              <Download className="h-4 w-4" /> Unduh / buka PDF
            </a>
          </div>
        )}

        {material.type !== "ARTICLE" && material.content && (
          <div className="card p-6">
            <SimpleMarkdown source={material.content} />
          </div>
        )}
      </div>
    </article>
  );
}

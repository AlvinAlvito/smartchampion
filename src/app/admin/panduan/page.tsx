import Link from "next/link";
import { Eye, LifeBuoy, ListOrdered, PlayCircle, Plus, Star } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { videoInfo } from "@/lib/video";
import { Badge, EmptyState, PageTitle } from "@/components/ui";
import { GuideRowActions } from "./row-actions";

export const metadata = { title: "Panduan" };
export const dynamic = "force-dynamic";

export default async function AdminGuidesPage() {
  await requirePanel();
  const guides = await prisma.guide.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      _count: { select: { steps: true } },
      steps: { where: { imageUrl: { not: null } }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1, select: { imageUrl: true } },
    },
  });

  return (
    <>
      <PageTitle
        icon={LifeBuoy}
        eyebrow="Bantuan pengguna"
        title="Panduan"
        subtitle="Tutorial cara memakai website (tampil di halaman publik /panduan): judul, isi, langkah bergambar, dan video YouTube / Drive."
        action={
          <Link href="/admin/panduan/baru" className="btn-primary">
            <Plus className="h-4 w-4" /> Tambah panduan
          </Link>
        }
      />
      {guides.length ? (
        <div className="space-y-3">
          {guides.map((g, i) => {
            const vi = videoInfo(g.videoUrl);
            const thumb = g.coverUrl ?? vi?.thumb ?? g.steps[0]?.imageUrl;
            return (
              <div key={g.id} className="card flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link href={`/admin/panduan/${g.id}`} className="relative aspect-video w-full shrink-0 overflow-hidden rounded-2xl bg-linear-to-br from-brand-500 to-navy-800 sm:w-44">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <LifeBuoy className="absolute inset-0 m-auto h-10 w-10 text-white/40" />
                  )}
                  {vi && <PlayCircle className="absolute bottom-2 right-2 h-6 w-6 text-white drop-shadow" />}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone="blue">{g.category}</Badge>
                    <Badge tone={g.isPublished ? "green" : "gray"}>{g.isPublished ? "Tayang" : "Draft"}</Badge>
                    {g.isFeatured && (
                      <Badge tone="yellow">
                        <Star className="mr-1 inline h-3 w-3" />
                        Unggulan
                      </Badge>
                    )}
                  </div>
                  <Link href={`/admin/panduan/${g.id}`} className="block truncate font-bold text-navy-900 hover:text-brand-700">
                    {g.title}
                  </Link>
                  {g.summary && <p className="truncate text-sm text-navy-500">{g.summary}</p>}
                  <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-navy-400">
                    <span className="inline-flex items-center gap-1">
                      <ListOrdered className="h-3.5 w-3.5" /> {g._count.steps} langkah
                    </span>
                    {vi && (
                      <span className="inline-flex items-center gap-1">
                        <PlayCircle className="h-3.5 w-3.5" /> video {vi.kind === "youtube" ? "YouTube" : "Drive"}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" /> {g.viewCount}x dilihat
                    </span>
                    <span>diubah {formatDate(g.updatedAt)}</span>
                  </p>
                </div>
                <GuideRowActions id={g.id} title={g.title} slug={g.slug} first={i === 0} last={i === guides.length - 1} />
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={LifeBuoy} title="Belum ada panduan" desc="Buat tutorial pertama lewat tombol Tambah panduan." />
      )}
    </>
  );
}

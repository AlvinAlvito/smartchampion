import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { abs } from "@/lib/seo";

// dibuat saat diminta (bukan saat build) agar selalu memakai data kelas & game di server produksi
export const dynamic = "force-dynamic";

/** /sitemap.xml — daftar halaman publik untuk Google */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, games, lastTutor, guides] = await Promise.all([
    prisma.product.findMany({ where: { status: { not: "DRAFT" } }, select: { slug: true, updatedAt: true, status: true } }),
    prisma.game.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }),
    prisma.tutor.findFirst({ where: { isPublished: true }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.guide.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }),
  ]);
  const newest = (dates: Date[]) => (dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : new Date());
  return [
    { url: abs("/"), lastModified: newest(products.map((p) => p.updatedAt)), changeFrequency: "daily", priority: 1 },
    { url: abs("/kelas"), lastModified: newest(products.map((p) => p.updatedAt)), changeFrequency: "daily", priority: 0.9 },
    ...products.map((p) => ({
      url: abs(`/kelas/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: ["OPEN", "RUNNING"].includes(p.status) ? 0.8 : 0.4,
    })),
    { url: abs("/tutor"), lastModified: lastTutor?.updatedAt ?? new Date(), changeFrequency: "weekly", priority: 0.6 },
    { url: abs("/games"), lastModified: newest(games.map((g) => g.updatedAt)), changeFrequency: "weekly", priority: 0.6 },
    ...games.map((g) => ({ url: abs(`/games/${g.slug}`), lastModified: g.updatedAt, changeFrequency: "monthly" as const, priority: 0.5 })),
    { url: abs("/panduan"), lastModified: newest(guides.map((g) => g.updatedAt)), changeFrequency: "weekly", priority: 0.5 },
    ...guides.map((g) => ({ url: abs(`/panduan/${g.slug}`), lastModified: g.updatedAt, changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
}

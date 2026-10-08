import { notFound } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { GuideForm } from "../guide-form";

export const metadata = { title: "Edit Panduan" };
export const dynamic = "force-dynamic";

export default async function EditGuidePage({ params }: PageProps<"/admin/panduan/[id]">) {
  await requirePanel();
  const { id } = await params;
  const [guide, cats] = await Promise.all([
    prisma.guide.findUnique({
      where: { id: Number(id) || 0 },
      include: { steps: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, title: true, body: true, imageUrl: true } } },
    }),
    prisma.guide.findMany({ distinct: ["category"], select: { category: true } }),
  ]);
  if (!guide) notFound();
  return (
    <>
      <PageTitle icon={LifeBuoy} eyebrow="Panduan" title={guide.title} subtitle={`Dilihat ${guide.viewCount}x · tampil di /panduan/${guide.slug}`} />
      <GuideForm
        key={guide.updatedAt.toISOString()}
        guide={{ ...guide, steps: guide.steps }}
        categories={cats.map((c) => c.category)}
      />
    </>
  );
}

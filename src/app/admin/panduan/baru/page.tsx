import { LifeBuoy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { PageTitle } from "@/components/ui";
import { GuideForm } from "../guide-form";

export const metadata = { title: "Tambah Panduan" };
export const dynamic = "force-dynamic";

export default async function NewGuidePage() {
  await requirePanel();
  const cats = await prisma.guide.findMany({ distinct: ["category"], select: { category: true } });
  return (
    <>
      <PageTitle icon={LifeBuoy} eyebrow="Panduan" title="Tambah panduan" subtitle="Isi judul, video (opsional), lalu susun langkah-langkah bergambar." />
      <GuideForm guide={null} categories={cats.map((c) => c.category)} />
    </>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Award, Presentation, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHero } from "@/components/page-hero";
import { EmptyState } from "@/components/ui";
import { TutorCard } from "./tutor-card";
import { pageMeta } from "@/lib/seo";

export const metadata: Metadata = pageMeta({
  title: "Tutor Olimpiade Berprestasi",
  description: "Kenali tutor Champion Online Class POSI: pengajar berprestasi dan berpengalaman membimbing siswa SD, SMP, SMA menuju olimpiade (OSN, KSN).",
  path: "/tutor",
});
export const dynamic = "force-dynamic";

export default async function TutorPage() {
  const tutors = await prisma.tutor.findMany({
    where: { isPublished: true },
    orderBy: [{ urutan: "asc" }, { id: "asc" }],
    select: {
      id: true,
      nama: true,
      foto: true,
      bidang: true,
      pengalaman: true,
      prestasi: true,
      riwayatPendidikan: true,
      // kelas draft belum bisa dibuka peserta → tidak ditampilkan
      classes: { where: { status: { not: "DRAFT" } }, select: { id: true, name: true, slug: true, jenjang: true }, orderBy: [{ jenjang: "asc" }, { name: "asc" }] },
    },
  });

  return (
    <>
      <PageHero
        eyebrow="Tutor Champion Online Class"
        icon={Award}
        title={
          <>
            Belajar langsung dari <span className="text-gradient">tutor terbaik</span>
          </>
        }
        subtitle="Setiap kelas didampingi tutor berprestasi dan berpengalaman membina siswa olimpiade — dari konsep dasar hingga strategi menaklukkan soal kompetisi."
      />

      <div className="container-page relative z-10 -mt-10 pb-12">
        {tutors.length ? (
          <>
            <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4!">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy-600">
                <Sparkles className="h-4 w-4 text-brand-500" /> {tutors.length} tutor siap mendampingimu
              </p>
              <Link href="/kelas" className="btn-primary btn-sm">
                Lihat kelas <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {tutors.map((t) => (
                <TutorCard key={t.id} tutor={t} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon={Presentation}
            title="Profil tutor segera hadir"
            desc="Kami sedang menyiapkan profil para tutor. Sementara itu, lihat dulu kelas yang tersedia."
            action={
              <Link href="/kelas" className="btn-primary mt-2">
                Lihat katalog kelas
              </Link>
            }
          />
        )}
      </div>
    </>
  );
}

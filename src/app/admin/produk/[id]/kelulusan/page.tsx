import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Award, BarChart3, CircleCheck, GraduationCap, MessageSquareHeart, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { getClassRecap } from "@/lib/class-recap";
import { readCertificateConfig } from "@/lib/certificate";
import { StatCard } from "@/components/ui";
import { CertificateTemplate, GraduationTable, ReportPublishToggle, type GradRow } from "./graduation-admin";

export const metadata = { title: "Sertifikat & Rapor" };
export const dynamic = "force-dynamic";

export default async function GraduationPage({ params }: PageProps<"/admin/produk/[id]/kelulusan">) {
  await requirePanel();
  const { id } = await params;
  const pid = Number(id) || 0;
  const [product, recap, results] = await Promise.all([
    prisma.product.findUnique({ where: { id: pid }, select: { id: true, name: true, certificateBgUrl: true, certificateConfig: true, reportPublished: true } }),
    getClassRecap(pid),
    prisma.classResult.findMany({ where: { productId: pid } }),
  ]);
  if (!product || !recap) notFound();
  const byUser = new Map(results.map((r) => [r.userId, r]));
  const rows: GradRow[] = recap.rows.map((r) => {
    const res = byUser.get(r.userId);
    return {
      userId: r.userId,
      name: r.name,
      school: r.school,
      average: r.average,
      grade: r.grade,
      worksheetsDone: r.worksheetsDone,
      present: r.present,
      attendanceRate: r.attendanceRate,
      note: res?.note ?? null,
      certificate: res?.certificateNo ? { number: res.certificateNo, name: res.certificateName ?? r.name, issuedAt: res.certificateIssuedAt! } : null,
    };
  });
  const issued = rows.filter((r) => r.certificate).length;
  const done = recap.meetings.length > 0 && recap.startedCount === recap.meetings.length;

  return (
    <>
      <Link href={`/admin/produk/${pid}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:gap-2.5">
        <ArrowLeft className="h-4 w-4" /> {product.name}
      </Link>

      <section className="relative my-5 animate-fade-up overflow-hidden rounded-[32px] bg-hero p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-200">Kelulusan</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
              <GraduationCap className="h-7 w-7" /> Sertifikat & Rapor
            </h1>
            <p className="mt-1 text-sm text-navy-200">
              {product.name} · {recap.meetings.length} pertemuan ({recap.startedCount} sudah berjalan)
              {!done && recap.meetings.length > 0 && " — pelatihan belum selesai, nilai masih bisa berubah"}
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs">
              {product.reportPublished ? (
                <>
                  <CircleCheck className="h-3.5 w-3.5 text-emerald-300" /> Rapor sudah tampil ke peserta
                </>
              ) : (
                "Rapor belum tampil ke peserta"
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/produk/${pid}/rekap`} className="btn-outline-light">
              <BarChart3 className="h-4 w-4" /> Rekap nilai & absensi
            </Link>
            <Link href={`/admin/feedback?produk=${pid}`} className="btn-outline-light">
              <MessageSquareHeart className="h-4 w-4" /> Feedback peserta
            </Link>
            <ReportPublishToggle productId={pid} published={product.reportPublished} />
          </div>
        </div>
      </section>

      <div className="stagger mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Peserta lunas" value={rows.length} icon={Users} tone="navy" />
        <StatCard label="Sertifikat terbit" value={`${issued}/${rows.length}`} icon={Award} tone="green" />
        <StatCard label="Rata-rata nilai kelas" value={recap.classAvg ?? "-"} icon={GraduationCap} tone="brand" />
      </div>

      <div className="space-y-6">
        <CertificateTemplate productId={pid} config={readCertificateConfig(product.certificateConfig)} bgUrl={product.certificateBgUrl} />
        <GraduationTable productId={pid} rows={rows} startedCount={recap.startedCount} />
      </div>
    </>
  );
}

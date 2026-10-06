import Link from "next/link";
import { ArrowRight, Award, Presentation } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { TutorAvatar, listItems } from "@/components/tutor-avatar";
import { SectionTitle } from "@/components/ui";

/**
 * Tutor yang mengajar sebuah kelas (hanya tutor yang tampil publik).
 * variant "full" = halaman kelas publik; "compact" = sidebar kelas di dashboard peserta.
 * Tidak merender apa pun bila kelas belum punya tutor.
 */
export async function ClassTutors({ productId, variant = "full" }: { productId: number; variant?: "full" | "compact" }) {
  const tutors = await prisma.tutor.findMany({
    where: { isPublished: true, classes: { some: { id: productId } } },
    orderBy: [{ urutan: "asc" }, { id: "asc" }],
    select: { id: true, nama: true, foto: true, bidang: true, prestasi: true, pengalaman: true },
  });
  if (!tutors.length) return null;

  if (variant === "compact") {
    return (
      <div>
        <SectionTitle title={tutors.length > 1 ? `Tutor kelas ini (${tutors.length})` : "Tutor kelas ini"} icon={Presentation} />
        <div className="card space-y-3">
          {tutors.map((t) => {
            const top = listItems(t.prestasi)[0] ?? listItems(t.pengalaman)[0];
            return (
              <div key={t.id} className="flex items-center gap-3">
                <TutorAvatar name={t.nama} src={t.foto} className="h-12 w-12 shrink-0 rounded-2xl text-sm shadow-md" />
                <div className="min-w-0">
                  <p className="font-bold leading-snug text-navy-900">{t.nama}</p>
                  {t.bidang && <p className="truncate text-xs font-semibold text-brand-600">{t.bidang}</p>}
                  {top && <p className="line-clamp-1 text-xs text-navy-400">{top}</p>}
                </div>
              </div>
            );
          })}
          <Link href="/tutor" className="flex items-center gap-1 pt-1 text-xs font-bold text-brand-600 hover:text-brand-800">
            Lihat profil lengkap tutor <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy-900">
        <Presentation className="h-5 w-5 text-brand-600" /> {tutors.length > 1 ? "Tutor pengajar" : "Tutor pengajar kelas ini"}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {tutors.map((t) => {
          const prestasi = listItems(t.prestasi).slice(0, 2);
          const pengalaman = listItems(t.pengalaman)[0];
          return (
            <div key={t.id} className="flex gap-4 rounded-3xl bg-linear-to-br from-brand-50/70 to-white p-4 ring-1 ring-brand-100">
              <TutorAvatar name={t.nama} src={t.foto} className="h-16 w-16 shrink-0 rounded-2xl text-lg shadow-md ring-2 ring-white" />
              <div className="min-w-0">
                <p className="font-extrabold leading-snug text-navy-900">{t.nama}</p>
                {t.bidang && <p className="text-xs font-semibold text-brand-600">{t.bidang}</p>}
                {prestasi.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {prestasi.map((x, i) => (
                      <li key={i} className="flex gap-1.5 text-xs leading-snug text-navy-600">
                        <Award className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span className="min-w-0">{x}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  pengalaman && <p className="mt-2 text-xs leading-snug text-navy-600">{pengalaman}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Link href="/tutor" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-600 hover:text-brand-800">
        Kenali tutor kami lebih lanjut <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

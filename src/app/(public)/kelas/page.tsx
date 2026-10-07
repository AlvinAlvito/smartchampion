import Link from "next/link";
import type { Metadata } from "next";
import type { Jenjang } from "@prisma/client";
import { Award, BookOpen, ChevronRight, Crown, GraduationCap, Layers, School, Search, Shapes, Sparkles, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { TutorAvatar } from "@/components/tutor-avatar";
import { getCatalog } from "@/lib/queries";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/ui";
import { PageHero } from "@/components/page-hero";
import { cn } from "@/lib/utils";
import { byFillDesc } from "@/lib/quota";
import { abs, breadcrumbLd, pageMeta } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";

export const metadata: Metadata = pageMeta({
  title: "Katalog Kelas Olimpiade Online SD, SMP, SMA",
  description:
    "Pilih kelas pelatihan olimpiade online: Matematika, IPA, Fisika, Bahasa Inggris, dan lainnya untuk SD, SMP, SMA. Kelas grup COC bersama tutor medalis atau VIP privat 1-on-1.",
  path: "/kelas",
});
export const dynamic = "force-dynamic";

const TYPE_FILTERS = [
  { v: "", l: "Semua produk", icon: Layers },
  { v: "COC", l: "Kelas Grup (COC)", icon: Users },
  { v: "PRIVATE", l: "VIP Privat", icon: Crown },
  { v: "OTHER", l: "Lainnya", icon: Shapes },
];

const FILTERS = [
  { v: "", l: "Semua", icon: Layers },
  { v: "SD", l: "SD", icon: School },
  { v: "SMP", l: "SMP", icon: BookOpen },
  { v: "SMA", l: "SMA", icon: GraduationCap },
  { v: "UMUM", l: "Umum", icon: Users },
];

export default async function KatalogPage({ searchParams }: PageProps<"/kelas">) {
  const sp = await searchParams;
  const jenjang = typeof sp.jenjang === "string" ? sp.jenjang : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const tipe = sp.tipe === "PRIVATE" || sp.tipe === "COC" || sp.tipe === "OTHER" ? sp.tipe : "";

  const [catalog, tutorCount, tutors] = await Promise.all([
    getCatalog({
      ...(FILTERS.some((f) => f.v && f.v === jenjang) ? { jenjang: jenjang as Jenjang } : {}),
      ...(q
        ? { OR: [{ name: { contains: q } }, { bidang: { contains: q } }, { shortDesc: { contains: q } }, { gradeLabel: { contains: q } }, { level: { contains: q } }] }
        : {}),
      ...(tipe ? { type: tipe } : {}),
    }),
    prisma.tutor.count({ where: { isPublished: true } }),
    prisma.tutor.findMany({ where: { isPublished: true }, orderBy: [{ urutan: "asc" }, { id: "asc" }], take: 4, select: { id: true, nama: true, foto: true } }),
  ]);
  // kelas yang paling mendekati kuota tampil paling atas
  const products = [...catalog].sort(byFillDesc);

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Beranda", path: "/" },
            { name: "Kelas", path: "/kelas" },
          ]),
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Katalog kelas Pelatihan POSI",
            itemListElement: products.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/kelas/${p.slug}`), name: p.name })),
          },
        ]}
      />
      <PageHero
        eyebrow="Champion Online Class 2026"
        icon={Sparkles}
        title={
          <>
            Temukan kelas <span className="text-gradient">olimpiademu</span>
          </>
        }
        subtitle={
          tipe === "PRIVATE"
            ? "Belajar 1-on-1 bersama tutor. Pilih paket pertemuan, bayar sekali, jadwal diatur fleksibel."
            : "Pilih bidang & jenjang. Kelas grup COC dimulai setelah minimal 15 peserta lunas, atau pilih VIP Privat untuk belajar 1-on-1."
        }
      >
        {tutorCount > 0 && (
          <Link
            href="/tutor"
            className="glass group mt-7 inline-flex max-w-xl items-center gap-3 rounded-3xl py-2.5 pl-2.5 pr-4 text-left transition hover:bg-white/15"
          >
            <span className="flex shrink-0 -space-x-3">
              {tutors.map((t) => (
                <TutorAvatar key={t.id} name={t.nama} src={t.foto} className="h-10 w-10 rounded-full text-xs ring-2 ring-navy-900" />
              ))}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-bold text-white">
                <Award className="h-4 w-4 shrink-0 text-amber-300" /> Didampingi tutor berprestasi & berpengalaman
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-brand-200 transition group-hover:text-white">
                Kenali {tutorCount} tutor kami <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
              </span>
            </span>
          </Link>
        )}
      </PageHero>

      <div className="container-page relative z-10 -mt-10 pb-10">
        <div className="mb-3 flex flex-wrap gap-2">
          {TYPE_FILTERS.map((t) => {
            const active = tipe === t.v;
            return (
              <Link
                key={t.l}
                href={{ pathname: "/kelas", query: { ...(t.v ? { tipe: t.v } : {}), ...(jenjang ? { jenjang } : {}), ...(q ? { q } : {}) } }}
                className={cn(
                  "flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold shadow-sm transition",
                  active
                    ? t.v === "PRIVATE"
                      ? "bg-linear-to-r from-amber-300 to-amber-500 text-navy-950 shadow-amber-500/30"
                      : "bg-white text-brand-700 ring-2 ring-brand-300"
                    : "bg-white/90 text-navy-500 ring-1 ring-navy-100 hover:text-brand-700",
                )}
              >
                <t.icon className="h-4 w-4" /> {t.l}
              </Link>
            );
          })}
        </div>
        <div className="card relative mb-8 flex flex-wrap gap-1.5 p-2! sm:gap-2">
          {FILTERS.map((f) => {
            const active = jenjang === f.v;
            return (
              <Link
                key={f.l}
                href={{ pathname: "/kelas", query: { ...(f.v ? { jenjang: f.v } : {}), ...(q ? { q } : {}), ...(tipe ? { tipe } : {}) } }}
                className={cn(
                  "flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-semibold transition sm:gap-2 sm:px-4 sm:py-2.5",
                  active ? "bg-linear-to-r from-brand-600 to-navy-700 text-white shadow-lg shadow-brand-500/30" : "text-navy-500 hover:bg-brand-50 hover:text-brand-700",
                )}
              >
                <f.icon className="h-4 w-4" /> {f.l}
              </Link>
            );
          })}
          <form action="/kelas" className="flex w-full min-w-0 gap-2 lg:ml-auto lg:w-auto">
            {jenjang && <input type="hidden" name="jenjang" value={jenjang} />}
            {tipe && <input type="hidden" name="tipe" value={tipe} />}
            <div className="relative min-w-0 flex-1 lg:w-72">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Cari kelas, mis. Matematika SMP…"
                aria-label="Cari kelas"
                className="input py-2! pl-10"
              />
            </div>
            <button className="btn-primary px-4! py-2!">Cari</button>
          </form>
        </div>
        <p className="-mt-5 mb-5 flex flex-wrap items-center gap-x-2 px-1 text-sm text-navy-400">
          <b className="text-navy-700">{products.length} kelas</b>
          {q && (
            <>
              untuk “{q}”
              <Link href={{ pathname: "/kelas", query: { ...(jenjang ? { jenjang } : {}), ...(tipe ? { tipe } : {}) } }} className="font-semibold text-brand-600 hover:underline">
                hapus pencarian
              </Link>
            </>
          )}
          <span>· diurutkan dari yang paling diminati</span>
        </p>

        {products.length ? (
          <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Search}
            title="Kelas tidak ditemukan"
            desc="Coba ubah filter jenjang atau kata kunci pencarian."
            action={
              <Link href="/kelas" className="btn-secondary mt-2">
                Tampilkan semua kelas
              </Link>
            }
          />
        )}
      </div>
    </>
  );
}

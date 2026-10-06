import Link from "next/link";
import { Filter, Presentation, RotateCcw, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { JENJANG_LABEL } from "@/lib/constants";
import { readTutorFilters, tutorFilterQuery, tutorWhere } from "@/lib/tutor-filters";
import { PageTitle } from "@/components/ui";
import { Pagination, readPage } from "@/components/pagination";
import { TutorAdmin } from "./tutor-admin";

export const metadata = { title: "Tutor" };
export const dynamic = "force-dynamic";

const PER_PAGE = 12;

export default async function TutorAdminPage({ searchParams }: PageProps<"/admin/tutor">) {
  await requirePanel();
  const sp = await searchParams;
  const { page, skip, take } = readPage(sp, PER_PAGE);
  const filters = readTutorFilters((k) => (typeof sp[k] === "string" ? (sp[k] as string) : null));
  const where = tutorWhere(filters);
  const query = tutorFilterQuery(filters);
  const [rows, total, all, shown, classes] = await Promise.all([
    prisma.tutor.findMany({
      where,
      orderBy: [{ urutan: "asc" }, { id: "asc" }],
      include: { classes: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
      skip,
      take,
    }),
    prisma.tutor.count({ where }),
    prisma.tutor.count(),
    prisma.tutor.count({ where: { isPublished: true } }),
    prisma.product.findMany({ orderBy: [{ jenjang: "asc" }, { name: "asc" }], select: { id: true, name: true, jenjang: true, status: true } }),
  ]);
  const tutors = rows.map(({ classes: c, ...t }) => ({ ...t, classIds: c.map((x) => x.id), classNames: c.map((x) => x.name) }));
  return (
    <>
      <PageTitle
        icon={Presentation}
        eyebrow="Pengajar"
        title="Tutor"
        subtitle={
          <>
            Profil tutor ditampilkan di halaman publik{" "}
            <a href="/tutor" target="_blank" className="font-semibold text-brand-600 hover:underline">
              /tutor
            </a>
            . {shown} dari {all} tutor sedang tampil.
          </>
        }
      />
      <form className="card mb-4 grid gap-3 md:grid-cols-[1fr_170px_150px_220px_auto]" action="/admin/tutor">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
          <input name="q" defaultValue={filters.q} placeholder="Cari nama / bidang tutor" className="input pl-10" aria-label="Cari tutor" />
        </div>
        <select name="status" defaultValue={filters.status} className="input" aria-label="Filter status">
          <option value="">Semua status</option>
          <option value="tampil">Tampil di publik</option>
          <option value="sembunyi">Disembunyikan</option>
        </select>
        <select name="jenjang" defaultValue={filters.jenjang} className="input" aria-label="Filter jenjang kelas">
          <option value="">Semua jenjang</option>
          {Object.entries(JENJANG_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              Mengajar {v}
            </option>
          ))}
        </select>
        <select name="kelas" defaultValue={filters.kelas} className="input" aria-label="Filter kelas">
          <option value="">Semua kelas</option>
          <option value="none">Belum memegang kelas</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Link href="/admin/tutor" className="btn-ghost" aria-label="Reset filter">
            <RotateCcw className="h-4 w-4" />
          </Link>
          <button className="btn-primary flex-1">
            <Filter className="h-4 w-4" /> Filter
          </button>
        </div>
      </form>
      <TutorAdmin key={`${query}|${page}`} tutors={tutors} classes={classes} total={total} query={query} filtered={!!query} />
      <Pagination basePath="/admin/tutor" searchParams={sp} page={page} perPage={PER_PAGE} total={total} noun="tutor" />
    </>
  );
}

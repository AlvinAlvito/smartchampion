import Link from "next/link";
import { BookOpen, CalendarDays, CalendarRange, ChevronRight, FileText, Filter, RotateCcw, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { paidCountByProduct } from "@/lib/queries";
import { JENJANG_LABEL, PRODUCT_STATUS_LABEL } from "@/lib/constants";
import { formatRupiah } from "@/lib/utils";
import { Badge, EmptyState, PageTitle, statusTone } from "@/components/ui";
import { subjectVisual } from "@/components/product-card";
import { ProductDialogButton } from "./product-form";
import { quotaVisible } from "@/lib/quota";
import { Pagination, readPage } from "@/components/pagination";
import { productWhere, readProductFilters } from "@/lib/product-filters";
import { SelectableCard, SelectableGrid } from "@/components/selectable-grid";
import { deleteProductsAction, deleteProductsByFilterAction } from "@/app/actions/products";

const PER_PAGE = 12;

export const metadata = { title: "Produk COC" };
export const dynamic = "force-dynamic";

export default async function ProdukPage({ searchParams }: PageProps<"/admin/produk">) {
  await requirePanel();
  const sp = await searchParams;
  const { page, skip, take } = readPage(sp, PER_PAGE);
  const filters = readProductFilters((k) => (typeof sp[k] === "string" ? (sp[k] as string) : null));
  const where = productWhere(filters);
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ jenjang: "asc" }, { name: "asc" }],
      include: { _count: { select: { materials: true, sessions: true } } },
      skip,
      take,
    }),
  ]);
  const [paid, spans] = await Promise.all([
    paidCountByProduct(products.map((p) => p.id)),
    // periode pelaksanaan: pertemuan pertama → pertemuan terakhir
    prisma.classSession.groupBy({ by: ["productId"], where: { productId: { in: products.map((p) => p.id) } }, _min: { startAt: true }, _max: { endAt: true } }),
  ]);
  const spanOf = (id: number) => spans.find((x) => x.productId === id);

  return (
    <>
      <PageTitle
        icon={BookOpen}
        eyebrow="Katalog"
        title="Produk & Materi"
        subtitle="Kelola kelas COC, jadwal pertemuan, dan materi (PDF, video, artikel)."
        action={<ProductDialogButton product={null} />}
      />
      <form className="card mb-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]" action="/admin/produk">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
          <input name="q" defaultValue={filters.q} placeholder="Cari nama kelas / bidang" className="input pl-10" aria-label="Cari kelas" />
        </div>
        <select name="jenjang" defaultValue={filters.jenjang} className="input" aria-label="Filter jenjang">
          <option value="">Semua jenjang</option>
          {Object.entries(JENJANG_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Link href="/admin/produk" className="btn-ghost" aria-label="Reset filter">
            <RotateCcw className="h-4 w-4" />
          </Link>
          <button className="btn-primary flex-1">
            <Filter className="h-4 w-4" /> Filter
          </button>
        </div>
      </form>
      {!products.length && (
        <EmptyState
          icon={BookOpen}
          title={query ? "Tidak ada kelas yang cocok" : "Belum ada kelas"}
          desc={query ? "Coba kata kunci atau jenjang lain." : "Tambahkan kelas pertama lewat tombol Tambah kelas."}
        />
      )}
      <SelectableGrid
        key={`${query}|${page}`}
        ids={products.map((p) => p.id)}
        total={total}
        noun="kelas"
        pageName="Produk & Materi"
        note="Kelas yang sudah punya pendaftar tidak dihapus (riwayat pembayaran dijaga) — statusnya diubah menjadi Ditutup. Jadwal, materi, worksheet, nilai, dan absensi kelas yang dihapus ikut terhapus."
        deleteSelected={deleteProductsAction}
        deleteByFilter={deleteProductsByFilterAction.bind(null, query, total)}
      >
        {products.map((p) => {
          const filled = paid.get(p.id) ?? 0;
          const pct = Math.min(100, Math.round((filled / p.minQuota) * 100));
          const { icon: Icon, gradient } = subjectVisual(p.bidang);
          return (
            <SelectableCard key={p.id} id={p.id} name={p.name}>
              <Link href={`/admin/produk/${p.id}`} className="card card-hover group flex h-full flex-col gap-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br ${gradient} text-white shadow-lg transition group-hover:scale-110`}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-snug text-navy-900 group-hover:text-brand-700">
                      {p.name}
                      {p.type === "PRIVATE" && (
                        <span className="ml-1.5 inline-block rounded-md bg-amber-400 px-1.5 py-0.5 align-middle text-[10px] font-extrabold text-navy-950">
                          VIP
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-navy-400">
                      {JENJANG_LABEL[p.jenjang]} · {formatRupiah(p.price)}/{p.priceUnit}
                    </p>
                    <ClassPeriod first={spanOf(p.id)?._min.startAt ?? null} last={spanOf(p.id)?._max.endAt ?? null} startDate={p.startDate} />
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-navy-200 transition group-hover:translate-x-1 group-hover:text-brand-600" />
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="font-semibold text-navy-600">
                      {p.type === "PRIVATE" ? `${filled} peserta VIP aktif` : `${filled}/${p.minQuota} peserta lunas`}
                      {p.type !== "PRIVATE" && (
                        <span className="ml-1.5 font-normal text-navy-400" title="Tampilan progres kuota di katalog publik">
                          · {quotaVisible({ ...p, paidCount: filled }) ? "kuota tampil" : "kuota disembunyikan"}
                        </span>
                      )}
                    </span>
                    <Badge tone={statusTone(p.status)}>{PRODUCT_STATUS_LABEL[p.status]}</Badge>
                  </div>
                  <div className={`h-2 overflow-hidden rounded-full bg-navy-50 ${p.type === "PRIVATE" ? "hidden" : ""}`}>
                    <div
                      className={`h-full rounded-full ${filled >= p.minQuota ? "bg-linear-to-r from-emerald-400 to-teal-500" : "bg-linear-to-r from-brand-500 to-navy-600"}`}
                      style={{ width: `${Math.max(pct, 3)}%` }}
                    />
                  </div>
                </div>
                <div className="flex gap-4 border-t border-navy-50 pt-3 text-xs font-semibold text-navy-500">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 text-brand-500" /> {p._count.sessions} jadwal
                  </span>
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-brand-500" /> {p._count.materials} materi
                  </span>
                </div>
              </Link>
            </SelectableCard>
          );
        })}
      </SelectableGrid>
      <Pagination basePath="/admin/produk" searchParams={sp} page={page} perPage={PER_PAGE} total={total} noun="kelas" />
    </>
  );
}

const fmt = (d: Date, year = true) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "Asia/Jakarta" }).format(d);

/** Periode pelaksanaan kelas: pertemuan pertama → terakhir (atau tanggal mulai bila jadwal belum dibuat) */
function ClassPeriod({ first, last, startDate }: { first: Date | null; last: Date | null; startDate: Date | null }) {
  const start = first ?? startDate;
  if (!start)
    return (
      <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-amber-600">
        <CalendarRange className="h-3.5 w-3.5" /> Tanggal pelaksanaan belum diatur
      </p>
    );
  const end = first && last ? last : null;
  const sameYear = end && fmt(start).slice(-4) === fmt(end).slice(-4);
  return (
    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand-700" title={first ? "Pertemuan pertama – pertemuan terakhir" : "Tanggal mulai kelas (jadwal pertemuan belum dibuat)"}>
      <CalendarRange className="h-3.5 w-3.5 shrink-0" />
      {end ? (
        fmt(start, true) === fmt(end, true) ? (
          fmt(start)
        ) : (
          `${fmt(start, !sameYear)} – ${fmt(end)}`
        )
      ) : (
        <>
          Mulai {fmt(start)} <span className="font-normal text-navy-400">· jadwal belum dibuat</span>
        </>
      )}
    </p>
  );
}

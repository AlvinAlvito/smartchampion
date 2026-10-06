import type { Jenjang, Prisma } from "@prisma/client";

const JENJANG: Jenjang[] = ["SD", "SMP", "SMA", "UMUM"];

export type ProductFilters = { q: string; jenjang: Jenjang | "" };

/** Baca filter halaman Produk & Materi dari query (?q=&jenjang=) */
export function readProductFilters(get: (key: string) => string | null | undefined): ProductFilters {
  const q = (get("q") ?? "").trim().slice(0, 100);
  const j = (get("jenjang") ?? "").toUpperCase() as Jenjang;
  return { q, jenjang: JENJANG.includes(j) ? j : "" };
}

export function productWhere(f: ProductFilters): Prisma.ProductWhereInput {
  return {
    ...(f.jenjang ? { jenjang: f.jenjang } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q } }, { bidang: { contains: f.q } }, { slug: { contains: f.q } }] } : {}),
  };
}

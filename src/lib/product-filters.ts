import type { Jenjang, Prisma, ProductType } from "@prisma/client";

const JENJANG: Jenjang[] = ["SD", "SMP", "SMA", "UMUM"];
const TYPES: ProductType[] = ["COC", "PRIVATE", "OTHER"];

export type ProductFilters = { q: string; jenjang: Jenjang | ""; tipe: ProductType | "" };

/** Baca filter halaman Produk & Materi dari query (?q=&jenjang=&tipe=) */
export function readProductFilters(get: (key: string) => string | null | undefined): ProductFilters {
  const q = (get("q") ?? "").trim().slice(0, 100);
  const j = (get("jenjang") ?? "").toUpperCase() as Jenjang;
  const t = (get("tipe") ?? "").toUpperCase() as ProductType;
  return { q, jenjang: JENJANG.includes(j) ? j : "", tipe: TYPES.includes(t) ? t : "" };
}

export function productWhere(f: ProductFilters): Prisma.ProductWhereInput {
  return {
    ...(f.jenjang ? { jenjang: f.jenjang } : {}),
    ...(f.tipe ? { type: f.tipe } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q } }, { bidang: { contains: f.q } }, { slug: { contains: f.q } }] } : {}),
  };
}

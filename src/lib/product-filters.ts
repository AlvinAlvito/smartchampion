import type { Jenjang, Prisma, ProductStatus, ProductType } from "@prisma/client";

const JENJANG: Jenjang[] = ["SD", "SMP", "SMA", "UMUM"];
const TYPES: ProductType[] = ["COC", "PRIVATE", "OTHER"];
const STATUSES: ProductStatus[] = ["DRAFT", "OPEN", "RUNNING", "CLOSED"];

export type ProductFilters = { q: string; jenjang: Jenjang | ""; tipe: ProductType | ""; status: ProductStatus | "" };

/** Baca filter halaman Produk & Materi dari query (?q=&jenjang=&tipe=&status=) */
export function readProductFilters(get: (key: string) => string | null | undefined): ProductFilters {
  const q = (get("q") ?? "").trim().slice(0, 100);
  const j = (get("jenjang") ?? "").toUpperCase() as Jenjang;
  const t = (get("tipe") ?? "").toUpperCase() as ProductType;
  const s = (get("status") ?? "").toUpperCase() as ProductStatus;
  return { q, jenjang: JENJANG.includes(j) ? j : "", tipe: TYPES.includes(t) ? t : "", status: STATUSES.includes(s) ? s : "" };
}

export function productWhere(f: ProductFilters): Prisma.ProductWhereInput {
  return {
    ...(f.jenjang ? { jenjang: f.jenjang } : {}),
    ...(f.tipe ? { type: f.tipe } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q } }, { bidang: { contains: f.q } }, { slug: { contains: f.q } }] } : {}),
  };
}

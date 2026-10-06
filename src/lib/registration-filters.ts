import type { Prisma, ProductType, RegistrationStatus } from "@prisma/client";
import { PRODUCT_TYPE_LABEL, REG_STATUS_LABEL } from "./constants";

export type RegistrationFilters = { q: string; status: string; product: string; type: string };

export function readRegistrationFilters(get: (k: string) => string | null | undefined): RegistrationFilters {
  const v = (k: string) => (get(k) ?? "").trim();
  return { q: v("q"), status: v("status"), product: v("product"), type: v("type") in PRODUCT_TYPE_LABEL ? v("type") : "" };
}

export function buildRegistrationWhere(f: RegistrationFilters): Prisma.RegistrationWhereInput {
  return {
    ...(f.q ? { OR: [{ fullName: { contains: f.q } }, { code: { contains: f.q } }, { phone: { contains: f.q } }, { school: { contains: f.q } }] } : {}),
    ...(f.status && f.status in REG_STATUS_LABEL ? { status: f.status as RegistrationStatus } : {}),
    ...(f.product && Number(f.product) ? { productId: Number(f.product) } : {}),
    ...(f.type ? { product: { type: f.type as ProductType } } : {}),
  };
}

export function registrationFiltersToQuery(f: RegistrationFilters) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p.toString();
}

import type { Prisma } from "@prisma/client";

export type LeadFilters = {
  q: string;
  status: string;
  sumber: string;
  kategori: string;
  produk: string;
  owner: string;
  akun: string;
  due: boolean;
  /** rentang tanggal (yyyy-mm-dd, WIB, inklusif) menurut kolom `tgl` */
  from: string;
  to: string;
  tgl: "masuk" | "bayar";
};

/** Kolom tanggal untuk filter rentang: tanggal masuk lead atau tanggal bayar (dasar grafik penjualan) */
export const LEAD_DATE_FIELDS = [
  { v: "masuk", l: "Tanggal masuk" },
  { v: "bayar", l: "Tanggal bayar" },
] as const;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** yyyy-mm-dd → 00:00 WIB */
const wibDay = (ymd: string, addDays = 0) => new Date(new Date(`${ymd}T00:00:00+07:00`).getTime() + addDays * 86_400_000);

function dateWhere(f: LeadFilters): Prisma.LeadWhereInput {
  if (!f.from && !f.to) return {};
  const range = { ...(f.from ? { gte: wibDay(f.from) } : {}), ...(f.to ? { lt: wibDay(f.to, 1) } : {}) };
  return f.tgl === "bayar" ? { tanggalBayar: range } : { tanggalMasuk: range };
}

/**
 * Filter akun peserta: "belum" = punya email tapi belum ada akun (bisa registrasi akun),
 * "kelas" = lunas & sudah punya akun tapi belum didaftarkan ke kelas, "aktif" = sudah punya akun.
 */
export const LEAD_ACCOUNT_FILTERS = [
  { v: "belum", l: "Belum punya akun" },
  { v: "kelas", l: "Lunas, belum masuk kelas" },
  { v: "aktif", l: "Akun aktif" },
] as const;

/** Data penaut lead ↔ akun/pendaftaran (web: invoice = kode; aktivasi: sourceLeadId; akun: email) */
export type LinkedLeads = { codes: string[]; leadIds: number[]; emails: string[] };

function akunWhere(akun: string, linked: LinkedLeads): Prisma.LeadWhereInput {
  const inClass: Prisma.LeadWhereInput = { OR: [{ invoiceId: { in: linked.codes } }, { id: { in: linked.leadIds } }] };
  if (akun === "aktif") return { OR: [{ email: { in: linked.emails } }, inClass] };
  if (akun === "belum") return { AND: [{ email: { not: null } }, { NOT: { email: "" } }, { email: { notIn: linked.emails } }, { NOT: inClass }] };
  // "kelas": sama dengan syarat tombol Daftarkan ke kelas — Paid, sudah punya akun peserta, produk kelas (bukan Mimpi.mu saja), belum tertaut pendaftaran
  return {
    statusFunnel: "Paid",
    email: { in: linked.emails },
    AND: [
      { OR: [{ invoiceId: null }, { invoiceId: { notIn: linked.codes } }] },
      { id: { notIn: linked.leadIds } },
      { OR: [{ produk: null }, { NOT: { produk: { contains: "Mimpi" } } }, { produk: { contains: "COC" } }, { produk: { contains: "VIP" } }] },
    ],
  };
}

/**
 * Pilihan filter produk. COC & Mimpi.mu ikut menampilkan lead bundling "Mimpi.mu & COC";
 * pilihan bundling hanya menampilkan lead yang berisi keduanya.
 */
export const LEAD_PRODUCT_FILTERS = [
  { v: "COC", l: "COC" },
  { v: "Mimpi.mu", l: "Mimpi.mu" },
  { v: "bundling", l: "Mimpi.mu & COC" },
  { v: "VIP Privat", l: "VIP Privat" },
  { v: "Olimpiade", l: "Olimpiade" },
  { v: "none", l: "Produk kosong" },
] as const;

function produkWhere(produk: string): Prisma.LeadWhereInput {
  switch (produk) {
    case "COC":
      return { produk: { contains: "COC" } };
    case "Mimpi.mu":
      return { produk: { contains: "Mimpi" } };
    case "bundling":
      return { AND: [{ produk: { contains: "Mimpi" } }, { produk: { contains: "COC" } }] };
    case "VIP Privat":
      return { OR: [{ produk: { contains: "VIP" } }, { produk: { contains: "Privat" } }] };
    case "Olimpiade":
      return { produk: { contains: "Olimpiade" } };
    case "none":
      return { OR: [{ produk: null }, { produk: "" }] };
    default:
      return {};
  }
}

export function readLeadFilters(get: (k: string) => string | null | undefined): LeadFilters {
  const v = (k: string) => (get(k) ?? "").trim();
  const akun = v("akun");
  return {
    q: v("q"),
    status: v("status"),
    sumber: v("sumber"),
    kategori: v("kategori"),
    produk: v("produk"),
    owner: v("owner"),
    akun: LEAD_ACCOUNT_FILTERS.some((o) => o.v === akun) ? akun : "",
    due: v("due") === "1",
    from: YMD.test(v("from")) ? v("from") : "",
    to: YMD.test(v("to")) ? v("to") : "",
    tgl: v("tgl") === "bayar" ? "bayar" : "masuk",
  };
}

export function endOfTodayWib() {
  const now = new Date(Date.now() + 7 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - 7 * 3600_000);
}

/** `linked` wajib diisi bila filter akun dipakai (lihat buildLeadWhereWithAccounts) */
export function buildLeadWhere(f: LeadFilters, linked?: LinkedLeads): Prisma.LeadWhereInput {
  // pencarian, produk & akun sama-sama memakai OR → digabung lewat AND agar tidak saling menimpa
  const and = [
    ...(f.q ? [{ OR: [{ nama: { contains: f.q } }, { noWa: { contains: f.q } }, { email: { contains: f.q } }, { invoiceId: { contains: f.q } }] }] : []),
    ...(f.produk ? [produkWhere(f.produk)] : []),
    ...(f.akun && linked ? [akunWhere(f.akun, linked)] : []),
    ...(f.from || f.to ? [dateWhere(f)] : []),
  ];
  return {
    ...(and.length ? { AND: and } : {}),
    ...(f.status ? { statusFunnel: f.status } : {}),
    ...(f.sumber ? { sumberLead: f.sumber } : {}),
    ...(f.kategori ? { kategori: f.kategori } : {}),
    ...(f.owner === "none" ? { ownerId: null } : f.owner && Number(f.owner) ? { ownerId: Number(f.owner) } : {}),
    ...(f.due ? { nextFollowUp: { lt: endOfTodayWib() }, statusFunnel: { notIn: ["Paid", "Lost"] } } : {}),
  };
}

export function leadFiltersToQuery(f: LeadFilters, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams();
  // tgl hanya relevan bila rentang diisi (default "masuk" tidak perlu ditulis)
  const all: Record<string, string | number> = { ...f, due: f.due ? "1" : "", tgl: (f.from || f.to) && f.tgl === "bayar" ? "bayar" : "", ...extra };
  for (const [k, v] of Object.entries(all)) if (v !== "" && v != null) p.set(k, String(v));
  if (p.get("page") === "1") p.delete("page");
  return p.toString();
}

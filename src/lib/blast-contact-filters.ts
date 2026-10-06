import type { Prisma } from "@prisma/client";

export type ContactFilters = { q: string; label: string; jenjang: string; provinsi: string; status: string; owner: string };

/** status: aktif | optout | invalid | never (belum pernah di-blast) | replied (pernah membalas) */
export const CONTACT_STATUS_FILTERS: Record<string, string> = {
  aktif: "Bisa dikirimi",
  never: "Belum pernah di-blast",
  replied: "Pernah membalas",
  optout: "Berhenti berlangganan",
  invalid: "Tidak ada WhatsApp",
};

export function readContactFilters(get: (k: string) => string | null | undefined): ContactFilters {
  const v = (k: string) => (get(k) ?? "").trim().slice(0, 100);
  return { q: v("q"), label: v("label"), jenjang: v("jenjang"), provinsi: v("provinsi"), status: v("status") in CONTACT_STATUS_FILTERS ? v("status") : "", owner: v("owner") };
}

/** `scope` = batas hak akses (kontak milik sendiri untuk admin) */
export function buildContactWhere(f: ContactFilters, scope: Prisma.BlastContactWhereInput): Prisma.BlastContactWhereInput {
  return {
    AND: [
      scope,
      ...(f.q
        ? [{ OR: [{ nama: { contains: f.q } }, { noHp: { contains: f.q.replace(/^0/, "62").replace(/\D/g, "") || f.q } }, { email: { contains: f.q } }, { sekolah: { contains: f.q } }, { kota: { contains: f.q } }] }]
        : []),
      ...(f.label ? [{ labels: { contains: `,${f.label},` } }] : []),
      ...(f.jenjang ? [{ jenjang: f.jenjang }] : []),
      ...(f.provinsi ? [{ provinsi: f.provinsi }] : []),
      ...(f.status === "aktif" ? [{ optOut: false, NOT: { waStatus: "INVALID" } }] : []),
      ...(f.status === "optout" ? [{ optOut: true }] : []),
      ...(f.status === "invalid" ? [{ waStatus: "INVALID" }] : []),
      ...(f.status === "never" ? [{ lastBlastAt: null }] : []),
      ...(f.status === "replied" ? [{ lastReplyAt: { not: null } }] : []),
      ...(f.owner && Number(f.owner) ? [{ ownerId: Number(f.owner) }] : []),
    ],
  };
}

export function contactFiltersToQuery(f: ContactFilters) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p.toString();
}

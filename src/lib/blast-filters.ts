import type { Prisma } from "@prisma/client";

export type BlastFilters = { q: string; asal: string; jenjang: string; provinsi: string; owner: string; from: string; to: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function readBlastFilters(get: (k: string) => string | null | undefined): BlastFilters {
  const v = (k: string) => (get(k) ?? "").trim();
  return {
    q: v("q"),
    asal: v("asal"),
    jenjang: v("jenjang"),
    provinsi: v("provinsi"),
    owner: v("owner"),
    from: YMD.test(v("from")) ? v("from") : "",
    to: YMD.test(v("to")) ? v("to") : "",
  };
}

export function buildBlastWhere(f: BlastFilters): Prisma.BlastWhereInput {
  const tanggal: Prisma.DateTimeFilter = {};
  if (f.from) tanggal.gte = new Date(`${f.from}T00:00:00+07:00`);
  if (f.to) tanggal.lt = new Date(new Date(`${f.to}T00:00:00+07:00`).getTime() + 86_400_000); // "sampai" inklusif
  return {
    ...(f.q
      ? {
          OR: [
            { nama: { contains: f.q } },
            { noHp: { contains: f.q } },
            { email: { contains: f.q } },
            { sekolah: { contains: f.q } },
            { kota: { contains: f.q } },
          ],
        }
      : {}),
    ...(f.asal ? { asalBlast: f.asal } : {}),
    ...(f.jenjang ? { jenjang: f.jenjang } : {}),
    ...(f.provinsi ? { provinsi: f.provinsi } : {}),
    ...(f.owner === "none" ? { ownerId: null } : f.owner && Number(f.owner) ? { ownerId: Number(f.owner) } : {}),
    ...(f.from || f.to ? { tanggal } : {}),
  };
}

export function blastFiltersToQuery(f: BlastFilters, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v !== "" && v != null) p.set(k, String(v));
  if (p.get("page") === "1") p.delete("page");
  return p.toString();
}

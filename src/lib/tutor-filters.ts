import type { Jenjang, Prisma } from "@prisma/client";

const JENJANG: Jenjang[] = ["SD", "SMP", "SMA", "UMUM"];

/** kelas: id kelas, "none" = belum memegang kelas, "" = semua */
export type TutorFilters = { q: string; status: "" | "tampil" | "sembunyi"; jenjang: Jenjang | ""; kelas: string };

/** Baca filter halaman Tutor dari query (?q=&status=&jenjang=&kelas=) */
export function readTutorFilters(get: (key: string) => string | null | undefined): TutorFilters {
  const q = (get("q") ?? "").trim().slice(0, 100);
  const st = get("status");
  const j = (get("jenjang") ?? "").toUpperCase() as Jenjang;
  const k = get("kelas") ?? "";
  return {
    q,
    status: st === "tampil" || st === "sembunyi" ? st : "",
    jenjang: JENJANG.includes(j) ? j : "",
    kelas: k === "none" || /^\d{1,9}$/.test(k) ? k : "",
  };
}

export function tutorWhere(f: TutorFilters): Prisma.TutorWhereInput {
  const and: Prisma.TutorWhereInput[] = [];
  if (f.q) and.push({ OR: [{ nama: { contains: f.q } }, { bidang: { contains: f.q } }] });
  if (f.status) and.push({ isPublished: f.status === "tampil" });
  if (f.jenjang) and.push({ classes: { some: { jenjang: f.jenjang } } });
  if (f.kelas === "none") and.push({ classes: { none: {} } });
  else if (f.kelas) and.push({ classes: { some: { id: Number(f.kelas) } } });
  return and.length ? { AND: and } : {};
}

/** Query string filter aktif (tanpa nilai kosong) */
export function tutorFilterQuery(f: TutorFilters) {
  return new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
}

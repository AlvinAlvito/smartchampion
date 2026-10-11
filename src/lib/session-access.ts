import type { Prisma } from "@prisma/client";

/**
 * Pertemuan yang boleh dilihat & diikuti seorang peserta: jadwal umum kelas,
 * atau jadwal khusus (restricted — dipakai VIP Privat) yang mencantumkan peserta ini.
 * Cek "lunas di kelasnya" tetap dilakukan terpisah oleh pemanggil.
 */
export function visibleSessionWhere(userId: number): Prisma.ClassSessionWhereInput {
  return { OR: [{ restricted: false }, { viewers: { some: { userId } } }] };
}

/** true bila pertemuan ini berlaku untuk peserta tsb (dipakai rekap nilai/absensi) */
export function sessionAppliesTo(s: { restricted: boolean; viewers: { userId: number }[] }, userId: number | null) {
  return !s.restricted || (userId != null && s.viewers.some((v) => v.userId === userId));
}

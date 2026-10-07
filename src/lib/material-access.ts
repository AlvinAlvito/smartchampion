import type { Prisma } from "@prisma/client";

/**
 * Materi yang boleh dilihat seorang peserta: sudah tayang, lalu
 * tidak dibatasi (semua peserta kelas) atau peserta ini termasuk yang dicentang admin.
 * Cek lunas di kelasnya tetap dilakukan terpisah oleh pemanggil.
 */
export function visibleMaterialWhere(userId: number): Prisma.MaterialWhereInput {
  return { isPublished: true, OR: [{ restricted: false }, { viewers: { some: { userId } } }] };
}

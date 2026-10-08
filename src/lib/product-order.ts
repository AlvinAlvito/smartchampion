import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Urutan daftar Produk & Materi (admin) berdasarkan jadwal — yang relevan sekarang di atas:
 * 0. masih berjalan / akan datang (punya pertemuan yang belum selesai) → jadwal terdekat dulu
 * 1. belum ada pertemuan tapi tanggal mulai (startDate) hari ini / ke depan → terdekat dulu
 * 2. masih dibuka/berjalan tanpa jadwal berikutnya, atau belum ada tanggal & belum ditutup → nama A–Z
 * 3. sudah selesai (semua pertemuan / tanggal mulai lewat & tidak dibuka lagi) → yang paling baru selesai dulu
 * 4. arsip: ditutup tanpa tanggal → nama A–Z
 */
export async function productIdsBySchedule(where: Prisma.ProductWhereInput) {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const rows = await prisma.product.findMany({ where, select: { id: true, name: true, status: true, startDate: true } });
  const ids = rows.map((r) => r.id);
  const [next, last] = ids.length
    ? await Promise.all([
        prisma.classSession.groupBy({ by: ["productId"], where: { productId: { in: ids }, endAt: { gte: now } }, _min: { startAt: true } }),
        prisma.classSession.groupBy({ by: ["productId"], where: { productId: { in: ids } }, _max: { endAt: true } }),
      ])
    : [[], []];
  const nextOf = new Map(next.map((x) => [x.productId, x._min.startAt]));
  const lastOf = new Map(last.map((x) => [x.productId, x._max.endAt]));

  const keyed = rows.map((r) => {
    const upcoming = nextOf.get(r.id);
    const lastEnd = lastOf.get(r.id);
    if (upcoming) return { r, rank: 0, t: upcoming.getTime() };
    if (!lastEnd && r.startDate && r.startDate >= today) return { r, rank: 1, t: r.startDate.getTime() };
    // masih dibuka/berjalan tapi belum ada jadwal berikutnya (mis. VIP yang dijadwalkan per sesi) → bukan "selesai"
    if (r.status === "OPEN" || r.status === "RUNNING") return { r, rank: 2, t: 0 };
    const ended = lastEnd ?? r.startDate;
    if (ended) return { r, rank: 3, t: -ended.getTime() };
    return { r, rank: r.status === "CLOSED" ? 4 : 2, t: 0 };
  });
  keyed.sort((a, b) => a.rank - b.rank || a.t - b.t || a.r.name.localeCompare(b.r.name, "id"));
  return { ids: keyed.map((k) => k.r.id), finished: new Set(keyed.filter((k) => k.rank === 3).map((k) => k.r.id)) };
}

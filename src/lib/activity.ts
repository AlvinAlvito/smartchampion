import "server-only";
import { prisma } from "./prisma";
import { getSession } from "./session";
import type { ActivityAction, ActivityEntity } from "./activity-shared";

export type ActivityInput = {
  entity: ActivityEntity;
  action: ActivityAction;
  entityId?: number | null;
  label?: string | null;
  productId?: number | null;
  gameId?: number | null;
  count?: number;
  detail?: string | null;
};

/**
 * Catat aktivitas admin di panel (tutor, produk & materi, pertemuan/worksheet, games).
 * Dipanggil setelah aksi berhasil; pelakunya diambil dari sesi login. Tidak pernah menggagalkan aksi utama.
 */
export async function logActivity(entry: ActivityInput | ActivityInput[]) {
  try {
    const session = await getSession();
    if (!session) return;
    const userId = session.userId; // "masuk sebagai" → tercatat atas akun yang sedang dipakai
    const rows = (Array.isArray(entry) ? entry : [entry]).filter((e) => (e.count ?? 1) > 0);
    if (!rows.length) return;
    await prisma.activityLog.createMany({
      data: rows.map((e) => ({
        userId,
        entity: e.entity,
        action: e.action,
        entityId: e.entityId ?? null,
        label: e.label ? e.label.slice(0, 200) : null,
        productId: e.productId ?? null,
        gameId: e.gameId ?? null,
        count: Math.max(1, Math.min(10_000, Math.round(e.count ?? 1))),
        detail: e.detail ? e.detail.slice(0, 255) : null,
      })),
    });
  } catch (e) {
    console.error("[activity]", (e as Error).message);
  }
}

import "server-only";
import { prisma } from "@/lib/prisma";
import { isPanel, type getSession } from "@/lib/session";

/**
 * Akses mode game berbayar (lihat PREMIUM_MODES): staf panel, atau peserta yang punya minimal 1 pendaftaran lunas
 * (produk apa pun: COC, VIP Privat, ACLB, …). Belum masuk = terkunci.
 */
export async function hasGameAccess(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) return false;
  if (isPanel(session.role)) return true;
  const paid = await prisma.registration.findFirst({ where: { userId: session.userId, status: "PAID" }, select: { id: true } });
  return !!paid;
}

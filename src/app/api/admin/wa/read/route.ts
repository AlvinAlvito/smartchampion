import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { crossSite, gateway, gatewayId, json, resolveChat } from "@/lib/wa";
import { guardRoute } from "@/lib/security";

export const dynamic = "force-dynamic";

/** Tandai chat dibaca — hanya pemilik nomor. Saat superadmin memantau, customer TIDAK melihat centang biru. */
export async function POST(request: Request) {
  if (crossSite(request)) return json({ error: "Permintaan ditolak." }, 403);
  const session = await getSession();
  if (!session) return json({ error: "Tidak diizinkan." }, 403);
  const limited = guardRoute(`wa-read:${session.userId}`, 60, 60_000);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { chatId?: number };
  const chat = await resolveChat(session, Number(body.chatId), true);
  if (!chat) return json({ ok: false });
  if (chat.unread > 0) {
    const unread = await prisma.waMessage.findMany({
      where: { chatId: chat.id, fromMe: false, waId: { not: null } },
      orderBy: { id: "desc" },
      take: Math.min(chat.unread, 20),
      select: { waId: true },
    });
    await prisma.waChat.update({ where: { id: chat.id }, data: { unread: 0 } });
    if (unread.length && chat.account.status === "CONNECTED") {
      await gateway(`/sessions/${gatewayId(chat.accountId)}/read`, { jid: chat.jid, ids: unread.map((m) => m.waId) });
    }
  }
  return json({ ok: true });
}

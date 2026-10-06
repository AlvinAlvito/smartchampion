import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { json, resolveChat } from "@/lib/wa";
import { guardRoute } from "@/lib/security";

export const dynamic = "force-dynamic";

/** Pesan satu chat: ?after=<id> (pesan baru, untuk polling) atau ?before=<id> (memuat pesan lama) */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return json({ error: "Tidak diizinkan." }, 403);
  const limited = guardRoute(`wa-poll-m:${session.userId}`, 240, 60_000);
  if (limited) return limited;
  const sp = new URL(request.url).searchParams;
  const chat = await resolveChat(session, Number(sp.get("chat")));
  if (!chat) return json({ error: "Chat tidak ditemukan." }, 404);
  const after = Number(sp.get("after")) || 0;
  const before = Number(sp.get("before")) || 0;
  const select = {
    id: true,
    fromMe: true,
    type: true,
    body: true,
    status: true,
    error: true,
    timestamp: true,
    byAi: true,
    hasMedia: true,
    senderName: true,
    senderPhone: true,
    sentBy: { select: { name: true } },
  } as const;
  const messages = after
    ? await prisma.waMessage.findMany({ where: { chatId: chat.id, id: { gt: after } }, orderBy: { id: "asc" }, take: 200, select })
    : (
        await prisma.waMessage.findMany({ where: { chatId: chat.id, ...(before ? { id: { lt: before } } : {}) }, orderBy: { id: "desc" }, take: 60, select })
      ).reverse();
  // status pesan keluar 3 hari terakhir (antre → terkirim → diterima → dibaca) untuk memperbarui centang di layar
  const statuses = await prisma.waMessage.findMany({
    where: { chatId: chat.id, fromMe: true, timestamp: { gte: new Date(Date.now() - 3 * 86_400_000) } },
    orderBy: { id: "desc" },
    select: { id: true, status: true, error: true },
    take: 100,
  });
  return json({
    chat: {
      id: chat.id,
      name: chat.name,
      phone: chat.phone,
      isGroup: chat.isGroup,
      hasIncoming: chat.hasIncoming,
      unread: chat.unread,
      aiPaused: chat.aiPaused,
      aiNote: chat.aiNote,
      autoReply: chat.account.autoReply,
    },
    messages,
    statuses,
    hasMore: !after && messages.length === 60,
  });
}

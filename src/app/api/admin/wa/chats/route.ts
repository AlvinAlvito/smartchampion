import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canChat, canMonitor, json, resolveAccount } from "@/lib/wa";
import { guardRoute } from "@/lib/security";

export const dynamic = "force-dynamic";

/** Daftar chat (terbaru di atas), dengan pencarian nama / nomor / isi pesan terakhir */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !(canChat(session.role) || canMonitor(session.role))) return json({ error: "Tidak diizinkan." }, 403);
  const limited = guardRoute(`wa-poll:${session.userId}`, 240, 60_000);
  if (limited) return limited;
  const sp = new URL(request.url).searchParams;
  const account = await resolveAccount(session, sp.get("account"));
  if (!account) return json({ chats: [], unreadTotal: 0 });
  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  const digits = q.replace(/\D/g, "");
  const where: Prisma.WaChatWhereInput = {
    accountId: account.id,
    lastMessageAt: { not: null },
    ...(sp.get("unread") === "1" ? { unread: { gt: 0 } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            ...(digits.length >= 3 ? [{ phone: { contains: digits.startsWith("0") ? "62" + digits.slice(1) : digits } }] : []),
            { lastMessageText: { contains: q } },
          ],
        }
      : {}),
  };
  const [chats, unreadTotal] = await Promise.all([
    prisma.waChat.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      take: 80,
      select: { id: true, name: true, phone: true, lastMessageAt: true, lastMessageText: true, lastFromMe: true, unread: true, aiPaused: true },
    }),
    prisma.waChat.aggregate({ where: { accountId: account.id }, _sum: { unread: true } }),
  ]);
  return json({ chats, unreadTotal: unreadTotal._sum.unread ?? 0 });
}

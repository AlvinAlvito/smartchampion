import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canChat, canMonitor, json, resolveAccount } from "@/lib/wa";
import { guardRoute } from "@/lib/security";
import { leadsByPhone, phonesOfLeadsNamed } from "@/lib/wa-leads";
import { normPhone } from "@/lib/identity";

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
  // nama di daftar memakai nama Master Lead → pencarian juga harus menemukan nama itu
  const leadPhones = q ? await phonesOfLeadsNamed(q) : [];
  const where: Prisma.WaChatWhereInput = {
    accountId: account.id,
    lastMessageAt: { not: null },
    ...(sp.get("unread") === "1" ? { unread: { gt: 0 } } : {}),
    ...(sp.get("kind") === "group" ? { isGroup: true } : sp.get("kind") === "private" ? { isGroup: false } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            ...(digits.length >= 3 ? [{ phone: { contains: digits.startsWith("0") ? "62" + digits.slice(1) : digits } }] : []),
            { lastMessageText: { contains: q } },
            ...(leadPhones.length ? [{ phone: { in: leadPhones } }] : []),
          ],
        }
      : {}),
  };
  const [chats, unreadTotal] = await Promise.all([
    prisma.waChat.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      take: 80,
      select: { id: true, name: true, phone: true, isGroup: true, lastMessageAt: true, lastMessageText: true, lastFromMe: true, unread: true, aiPaused: true },
    }),
    prisma.waChat.aggregate({ where: { accountId: account.id }, _sum: { unread: true } }),
  ]);
  const leads = await leadsByPhone();
  const tagged = chats.map((c) => {
    const lead = c.isGroup ? undefined : leads.get(normPhone(c.phone) ?? "");
    // nama Master Lead menggantikan nama bawaan WA; nama WA tetap dikirim sebagai keterangan
    return { ...c, name: lead?.nama ?? c.name, waName: lead && c.name && c.name !== lead.nama ? c.name : null, tag: c.isGroup ? null : (lead?.tag ?? "BUKAN") };
  });
  return json({ chats: tagged, unreadTotal: unreadTotal._sum.unread ?? 0 });
}

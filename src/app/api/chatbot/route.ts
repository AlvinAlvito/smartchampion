import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { askChatbot } from "@/lib/chatbot";
import { groqConfigured } from "@/lib/groq";
import { CHAT_LIMITS } from "@/lib/chatbot-config";
import { bodyTooLarge, ipFrom, rateLimit } from "@/lib/security";

export const runtime = "nodejs";

const FALLBACK = "Maaf Kak, asisten sedang mengalami gangguan. Untuk sementara silakan langsung chat admin kami lewat tombol di bawah ya 🙏";
const BUSY =
  "Maaf Kak, asisten sedang melayani banyak pertanyaan 🙏 Coba kirim ulang pesannya sebentar lagi, atau langsung chat admin kami lewat tombol di bawah ya.";

type Body = { conversationId?: string; message?: string; page?: string };

export async function POST(request: NextRequest) {
  if (bodyTooLarge(request, 32 * 1024)) return NextResponse.json({ error: "Pesan terlalu panjang." }, { status: 413 });
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Format permintaan tidak valid." }, { status: 400 });
  }
  const message = String(body.message ?? "")
    .trim()
    .slice(0, CHAT_LIMITS.messageChars);
  if (!message) return NextResponse.json({ error: "Pesan kosong." }, { status: 400 });

  // per IP (jendela pendek & harian) + batas global semua pengunjung (melindungi kuota Groq dari botnet)
  const ip = ipFrom(request.headers);
  const limited =
    !rateLimit(`chat-ip:${ip}`, CHAT_LIMITS.perWindow, CHAT_LIMITS.windowMs).ok ||
    !rateLimit(`chat-ip-day:${ip}`, CHAT_LIMITS.perDay, 86_400_000).ok ||
    !rateLimit("chat-global", CHAT_LIMITS.globalPerMinute, 60_000).ok;
  if (limited) {
    return NextResponse.json({
      reply: "Wah, pesannya banyak sekali 😊 Tunggu beberapa menit ya Kak, atau langsung chat admin kami lewat tombol di bawah.",
      answered: false,
      handoff: true,
      limited: true,
    });
  }

  const session = await getSession();
  let conversationId = /^[a-f0-9-]{36}$/.test(body.conversationId ?? "") ? body.conversationId! : crypto.randomUUID();
  const convo = await prisma.chatConversation.findUnique({ where: { id: conversationId }, select: { id: true, _count: { select: { messages: true } } } });
  if (convo && convo._count.messages >= 120) conversationId = crypto.randomUUID(); // percakapan terlalu panjang → mulai baru
  const page = String(body.page ?? "").slice(0, 160) || null;
  await prisma.chatConversation.upsert({
    where: { id: conversationId },
    create: { id: conversationId, userId: session?.userId ?? null, userName: session?.name ?? null, page },
    update: { ...(session ? { userId: session.userId, userName: session.name } : {}) },
  });
  await prisma.chatMessage.create({ data: { conversationId, role: "user", content: message } });

  // Riwayat diambil dari database (bukan dari browser) → pengguna tidak bisa menyisipkan "balasan asisten" palsu
  const recent = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { id: "desc" },
    take: CHAT_LIMITS.historyTurns + 1,
    select: { role: true, content: true },
  });
  const history = recent
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 1500) }));

  let result: { reply: string; answered: boolean; handoff: boolean };
  let systemError = false; // gangguan/limit ≠ "AI tidak tahu" → tidak masuk daftar belum terjawab
  try {
    if (!groqConfigured()) throw new Error("GROQ_API_KEY kosong");
    result = await askChatbot(history, session?.name);
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[chatbot]", msg);
    result = { reply: /limit/i.test(msg) ? BUSY : FALLBACK, answered: false, handoff: true };
    systemError = true;
  }

  await prisma.chatMessage.create({ data: { conversationId, role: "assistant", content: result.reply, answered: systemError ? null : result.answered } });
  await prisma.chatConversation.update({
    where: { id: conversationId },
    data: { ...(result.answered || systemError ? {} : { unanswered: { increment: 1 } }), updatedAt: new Date() },
  });
  return NextResponse.json({ conversationId, ...result });
}

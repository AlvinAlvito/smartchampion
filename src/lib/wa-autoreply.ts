import "server-only";
import { after } from "next/server";
import { prisma } from "./prisma";
import { askWaChatbot } from "./chatbot";
import { groqConfigured } from "./groq";
import { abs } from "./seo";
import { WA_AI_APOLOGY, WA_AI_FOOTER, WA_AI_MEDIA, WA_AI_UNKNOWN, WA_MAX_TEXT, waPreview } from "./wa-shared";

/**
 * Auto-balas AI untuk Chat WA (saklar per nomor). Memakai otak chatbot situs (basis pengetahuan + data sistem).
 * Aman: hanya pesan baru (≤ 5 menit, bukan sinkron riwayat), menunggu sebentar agar pesan beruntun dijawab sekali,
 * maks. balasan per chat per jam, dan AI langsung dijeda di chat itu bila tidak tahu jawabannya / customer kesal / admin ikut membalas.
 */

const FRESH_MS = 5 * 60_000;
const DEBOUNCE_MS = 6_000;
const MAX_PER_CHAT_HOUR = 12;
const HISTORY = 14;
const MEDIA_TYPES = new Set(["image", "video", "gif", "document", "voice", "audio"]);
const running = new Set<number>(); // chat yang sedang diproses (hindari balasan ganda)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ChatWithAccount = { id: number; jid: string; accountId: number; hasIncoming: boolean; account: { status: string } };

/** Kirim teks ke chat lewat wa-gateway + catat di database (dipakai panel admin & auto-balas AI) */
export async function sendWaText(chat: ChatWithAccount, text: string, opts: { sentById?: number | null; byAi?: boolean } = {}) {
  const { gateway, gatewayId } = await import("./wa"); // impor saat dipakai (wa.ts juga mengimpor modul ini)
  const msg = await prisma.waMessage.create({
    data: {
      chatId: chat.id,
      fromMe: true,
      type: "text",
      body: text,
      status: "PENDING",
      sentById: opts.sentById ?? null,
      byAi: !!opts.byAi,
      timestamp: new Date(),
    },
  });
  const r = await gateway(`/sessions/${gatewayId(chat.accountId)}/send`, { jid: chat.jid, text, ref: `m${msg.id}` });
  if (!r.ok) {
    const error = r.data.error ?? "Gagal mengirim.";
    await prisma.waMessage.update({ where: { id: msg.id }, data: { status: "FAILED", error: error.slice(0, 255) } });
    return { ok: false as const, error, status: r.status, messageId: msg.id };
  }
  await prisma.waChat.update({
    where: { id: chat.id },
    data: { lastMessageAt: msg.timestamp, lastMessageText: waPreview("text", text).slice(0, 255), lastFromMe: true, unread: 0 },
  });
  return { ok: true as const, messageId: msg.id };
}

/** Jeda AI di satu chat (admin mengambil alih) */
export async function pauseAi(chatId: number, note: string) {
  await prisma.waChat.updateMany({ where: { id: chatId, aiPaused: false }, data: { aiPaused: true, aiNote: note.slice(0, 160) } });
}

/** Dipanggil untuk setiap pesan yang dicatat dari gateway */
export async function onIncomingForAutoReply(chatId: number, messageId: number, fromMe: boolean, ts: Date) {
  const chat = await prisma.waChat.findUnique({ where: { id: chatId }, select: { aiPaused: true, account: { select: { autoReply: true } } } });
  if (!chat?.account.autoReply) return;
  // admin membalas langsung dari HP → AI berhenti di chat ini agar tidak tumpang tindih
  if (fromMe) {
    if (!chat.aiPaused) await pauseAi(chatId, "Admin membalas dari HP");
    return;
  }
  if (chat.aiPaused || Date.now() - ts.getTime() > FRESH_MS || !groqConfigured()) return;
  after(() => runAutoReply(chatId, messageId).catch((e) => console.error("[wa-ai]", chatId, (e as Error).message)));
}

/** Markdown chatbot situs → format WhatsApp */
function toWhatsApp(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, (_m, t: string, p: string) => `${t}: ${abs(p)}`)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2")
    .replace(/(^|[\s(])(\/(?:kelas|tutor|games|register|login|dashboard)[^\s)]*)/g, (_m, pre: string, p: string) => `${pre}${abs(p)}`)
    .trim();
}

const stripFooter = (t: string) => t.replace(WA_AI_FOOTER, "").trim();

async function runAutoReply(chatId: number, messageId: number) {
  await sleep(DEBOUNCE_MS); // pesan beruntun → jawab sekali, setelah customer selesai mengetik
  if (running.has(chatId)) return;
  running.add(chatId);
  try {
    const chat = await prisma.waChat.findUnique({ where: { id: chatId }, include: { account: true } });
    if (!chat || chat.isGroup || chat.aiPaused || !chat.hasIncoming || !chat.account.autoReply || chat.account.status !== "CONNECTED") return;
    const recent = await prisma.waMessage.findMany({
      where: { chatId },
      orderBy: { id: "desc" },
      take: HISTORY,
      select: { id: true, fromMe: true, type: true, body: true, byAi: true, timestamp: true },
    });
    const last = recent[0];
    // ada pesan yang lebih baru (akan diproses pemanggil berikutnya) atau sudah dibalas
    if (!last || last.id !== messageId || last.fromMe) return;
    const sentLastHour = await prisma.waMessage.count({ where: { chatId, byAi: true, timestamp: { gte: new Date(Date.now() - 3600_000) } } });
    if (sentLastHour >= MAX_PER_CHAT_HOUR) {
      await pauseAi(chatId, `Batas ${MAX_PER_CHAT_HOUR} balasan AI per jam tercapai`);
      return;
    }

    // pesan media (gambar, suara, dokumen) tidak bisa dibaca AI → alihkan ke admin
    if (MEDIA_TYPES.has(last.type)) {
      await reply(
        chat,
        WA_AI_MEDIA,
        "Customer mengirim " +
          waPreview(last.type, null)
            .replace(/^\S+\s/, "")
            .toLowerCase(),
      );
      return;
    }
    if (last.type !== "text" || !last.body?.trim()) return; // stiker, lokasi, dll. → diam

    const history = recent
      .slice()
      .reverse()
      .filter((m) => m.body?.trim())
      .map((m) => ({ role: m.fromMe ? ("assistant" as const) : ("user" as const), content: stripFooter(m.body!).slice(0, 1500) }));
    // riwayat harus diawali pesan customer
    while (history.length && history[0].role === "assistant") history.shift();

    let bot;
    try {
      bot = await askWaChatbot(history, chat.name ?? undefined);
    } catch (e) {
      console.error("[wa-ai] AI gagal:", (e as Error).message);
      return; // tidak membalas; admin tetap melihat chat belum terjawab
    }
    if (bot.frustrated) return reply(chat, WA_AI_APOLOGY, "Customer terlihat kurang puas — dialihkan ke admin");
    // pertanyaan customer (pesan beruntun setelah balasan terakhir kita)
    const question = customerQuestion(recent);
    if (!bot.answered || !bot.reply) {
      await logUnanswered(chat, question, bot.reply ? `(AI tidak yakin) ${bot.reply}` : WA_AI_UNKNOWN);
      return reply(chat, WA_AI_UNKNOWN, "AI belum tahu jawabannya — dialihkan ke admin");
    }
    // jawaban tidak lolos cek fakta (kutipan/angka tidak cocok dengan data) → jangan dikirim
    if (!bot.grounded) {
      console.warn("[wa-ai] jawaban ditahan:", bot.why);
      await logUnanswered(chat, question, `(jawaban AI ditahan karena tidak cocok dengan data: ${bot.why ?? "-"}) ${bot.reply}`);
      return reply(chat, WA_AI_UNKNOWN, "Jawaban AI tidak lolos cek fakta — dialihkan ke admin");
    }
    // terjawab, tetapi customer butuh admin manusia (mis. urusan pembayaran pribadi) → kirim jawaban lalu alihkan
    if (bot.handoff) {
      const newestH = await prisma.waMessage.findFirst({ where: { chatId }, orderBy: { id: "desc" }, select: { id: true } });
      if (newestH?.id !== messageId) return;
      return reply(chat, toWhatsApp(bot.reply), "Customer butuh admin — dialihkan ke admin");
    }

    // ada pesan baru selama AI berpikir → jangan kirim jawaban yang sudah basi
    const newest = await prisma.waMessage.findFirst({ where: { chatId }, orderBy: { id: "desc" }, select: { id: true } });
    if (newest?.id !== messageId) return;
    const text = `${toWhatsApp(bot.reply)}\n\n${WA_AI_FOOTER}`.slice(0, WA_MAX_TEXT);
    await sendWaText(chat, text, { byAi: true });
  } finally {
    running.delete(chatId);
  }
}

type RecentMsg = { fromMe: boolean; type: string; body: string | null };

/** Pesan teks customer setelah balasan terakhir kita (urut lama → baru), digabung jadi satu pertanyaan */
function customerQuestion(recent: RecentMsg[]) {
  const parts: string[] = [];
  for (const m of recent) {
    if (m.fromMe) break;
    if (m.type === "text" && m.body?.trim()) parts.unshift(m.body.trim());
  }
  // sapaan saja ("halo kak", "permisi min") tidak perlu ikut dicatat bila ada pertanyaan lain
  const GREETING = /^(halo+|hal+o|hai+|hi+|hallo+|p+|ping|permisi|assalamu'?alaikum[\w\s.]*|selamat (pagi|siang|sore|malam))[\s,.!]*(kak|kakak|min|admin)?[\s,.!🙏😊]*$/i;
  const real = parts.filter((p) => !GREETING.test(p));
  return (real.length ? real : parts).join("\n").slice(0, 1500);
}

/**
 * Catat pertanyaan yang tidak bisa dijawab AI ke "Belum terjawab" di menu Chatbot AI
 * (tabel percakapan chatbot yang sama; satu percakapan per chat WA) agar admin menambah basis pengetahuan.
 */
async function logUnanswered(chat: ChatWithAccount & { name?: string | null; phone?: string | null }, question: string, botText: string) {
  if (!question) return;
  try {
    const owner = await prisma.waAccount.findUnique({ where: { id: chat.accountId }, select: { user: { select: { name: true } } } });
    const id = `wa-${chat.id}`;
    const who = (chat.name?.trim() || (chat.phone ? `+${chat.phone}` : "Customer")).slice(0, 100);
    await prisma.chatConversation.upsert({
      where: { id },
      create: { id, userName: `${who} (WhatsApp)`, page: `Chat WA · ${owner?.user.name ?? "admin"}`.slice(0, 160), unanswered: 1 },
      update: { unanswered: { increment: 1 }, userName: `${who} (WhatsApp)` },
    });
    await prisma.chatMessage.create({ data: { conversationId: id, role: "user", content: question } });
    await prisma.chatMessage.create({ data: { conversationId: id, role: "assistant", content: botText.slice(0, 2000), answered: false } });
  } catch (e) {
    console.error("[wa-ai] gagal mencatat belum terjawab:", (e as Error).message);
  }
}

/** Kirim pesan pengalihan lalu jeda AI di chat ini (admin yang melanjutkan) */
async function reply(chat: ChatWithAccount, text: string, pauseNote: string) {
  await sendWaText(chat, `${text}\n\n${WA_AI_FOOTER}`, { byAi: true });
  await pauseAi(chat.id, pauseNote);
  // tetap tandai belum dibaca agar admin melihatnya
  await prisma.waChat.update({ where: { id: chat.id }, data: { unread: { increment: 1 } } }).catch(() => undefined);
}

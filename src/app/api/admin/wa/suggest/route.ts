import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { crossSite, json, resolveChat } from "@/lib/wa";
import { guardRoute } from "@/lib/security";
import { GroqError, groqConfigured } from "@/lib/groq";
import { cloneFor } from "@/lib/admin-bot";
import { askWaChatbot } from "@/lib/chatbot";
import { stripFooter, toWhatsApp } from "@/lib/wa-autoreply";
import { leadForChat } from "@/lib/wa-leads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONTEXT = 8; // jumlah pesan terakhir yang dibaca AI

/**
 * Saran jawaban untuk admin: AI membaca 8 pesan terakhir chat ini, memahami konteksnya, lalu menulis draf balasan
 * (dengan gaya klon AI admin bila sudah dianalisis). TIDAK mengirim apa pun — admin yang memutuskan.
 */
export async function POST(request: Request) {
  if (crossSite(request)) return json({ error: "Permintaan ditolak." }, 403);
  const session = await getSession();
  if (!session) return json({ error: "Tidak diizinkan." }, 403);
  const limited = guardRoute(`wa-suggest:${session.userId}`, 10, 60_000);
  if (limited) return limited;
  if (!groqConfigured()) return json({ error: "AI belum aktif di server (GROQ_API_KEY belum diisi)." }, 400);
  const body = (await request.json().catch(() => ({}))) as { chatId?: number };
  const chat = await resolveChat(session, Number(body.chatId), true);
  if (!chat) return json({ error: "Chat tidak ditemukan." }, 404);
  if (chat.isGroup) return json({ error: "Saran AI hanya untuk chat pribadi." }, 400);

  const recent = await prisma.waMessage.findMany({
    where: { chatId: chat.id, type: "text" },
    orderBy: { id: "desc" },
    take: CONTEXT,
    select: { fromMe: true, body: true },
  });
  const history = recent
    .reverse()
    .filter((m) => m.body?.trim())
    .map((m) => ({ role: m.fromMe ? ("assistant" as const) : ("user" as const), content: stripFooter(m.body!).slice(0, 1500) }));
  while (history.length && history[0].role === "assistant") history.shift();
  if (!history.length) return json({ error: "Belum ada pesan teks dari customer di chat ini." }, 400);
  // pesan terakhir dari admin → minta AI menulis tindak lanjut yang sopan
  if (history[history.length - 1].role === "assistant") {
    history.push({ role: "user", content: "(customer belum membalas — tulis pesan tindak lanjut singkat yang sopan sesuai konteks di atas)" });
  }

  try {
    const query = history.filter((m) => m.role === "user").slice(-3).map((m) => m.content).join(" ");
    const [clone, lead] = await Promise.all([cloneFor(chat.accountId, query), leadForChat(chat)]);
    const r = await askWaChatbot(history, lead?.nama ?? chat.name ?? undefined, clone, { draftForAdmin: true });
    const text = toWhatsApp(r.reply);
    if (!text) return json({ error: "AI belum bisa menyusun saran untuk chat ini. Coba lagi." }, 502);
    return json({
      ok: true,
      text,
      // admin tetap perlu memeriksa: tandai bila AI sendiri tidak yakin / tidak cocok dengan data
      sure: r.answered && r.grounded,
      note: !r.answered ? "Jawabannya tidak ada di data sistem — ini draf penahan; lengkapi dulu sebelum dikirim." : !r.grounded ? `Periksa faktanya dulu (${r.why ?? "tidak cocok dengan data"}).` : null,
      clone: clone ? clone.adminName : null,
    });
  } catch (e) {
    if (!(e instanceof GroqError)) console.error("[wa-suggest]", (e as Error).message);
    return json({ error: e instanceof GroqError ? e.message : "AI gagal menyusun saran. Coba lagi." }, 502);
  }
}

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canChat, crossSite, json, resolveChat } from "@/lib/wa";
import { guardRoute } from "@/lib/security";
import { groqConfigured } from "@/lib/groq";

export const dynamic = "force-dynamic";

/**
 * Auto-balas AI.
 * { enabled } → saklar untuk nomor WA milik admin sendiri.
 * { chatId, paused } → jeda / lanjutkan AI di satu chat (mis. setelah admin selesai menangani).
 */
export async function POST(request: Request) {
  if (crossSite(request)) return json({ error: "Permintaan ditolak." }, 403);
  const session = await getSession();
  if (!session || !canChat(session.role)) return json({ error: "Hanya pemilik nomor WhatsApp yang bisa mengatur auto-balas." }, 403);
  const limited = guardRoute(`wa-ai:${session.userId}`, 30, 60_000);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { enabled?: boolean; chatId?: number; paused?: boolean };

  if (typeof body.enabled === "boolean") {
    if (body.enabled && !groqConfigured()) return json({ error: "AI belum aktif di server (GROQ_API_KEY belum diisi)." }, 400);
    const r = await prisma.waAccount.updateMany({ where: { userId: session.userId }, data: { autoReply: body.enabled } });
    if (!r.count) return json({ error: "Tautkan WhatsApp terlebih dahulu." }, 404);
    console.info(`[wa-ai] ${session.name} ${body.enabled ? "mengaktifkan" : "mematikan"} auto-balas AI`);
    return json({ ok: true, autoReply: body.enabled });
  }

  if (typeof body.paused === "boolean") {
    const chat = await resolveChat(session, Number(body.chatId), true);
    if (!chat) return json({ error: "Chat tidak ditemukan." }, 404);
    await prisma.waChat.update({
      where: { id: chat.id },
      data: { aiPaused: body.paused, aiNote: body.paused ? `Dijeda oleh ${session.name}`.slice(0, 160) : null },
    });
    return json({ ok: true, aiPaused: body.paused });
  }
  return json({ error: "Permintaan tidak valid." }, 400);
}

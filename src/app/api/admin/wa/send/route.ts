import { getSession } from "@/lib/session";
import { crossSite, json, resolveChat } from "@/lib/wa";
import { pauseAi, sendWaText } from "@/lib/wa-autoreply";
import { WA_MAX_TEXT } from "@/lib/wa-shared";
import { guardRoute } from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * Balas chat. Aturan aman: hanya ke chat yang pernah mengirim pesan ke nomor ini (tidak ada kirim ke nomor baru / broadcast),
 * lalu tetap melewati antrean + batas kirim di wa-gateway.
 */
export async function POST(request: Request) {
  if (crossSite(request)) return json({ error: "Permintaan ditolak." }, 403);
  const session = await getSession();
  if (!session) return json({ error: "Tidak diizinkan." }, 403);
  const limited = guardRoute(`wa-send:${session.userId}`, 20, 60_000);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { chatId?: number; text?: string };
  const chat = await resolveChat(session, Number(body.chatId), true);
  if (!chat) return json({ error: "Chat tidak ditemukan, atau akun Anda hanya bisa memantau." }, 404);
  const text = String(body.text ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!text) return json({ error: "Pesan masih kosong." }, 400);
  if (text.length > WA_MAX_TEXT) return json({ error: `Pesan maksimal ${WA_MAX_TEXT.toLocaleString("id-ID")} karakter.` }, 400);
  if (!chat.hasIncoming) return json({ error: "Demi keamanan nomor, balasan hanya untuk chat yang sudah pernah menghubungi Anda." }, 400);
  if (chat.account.status !== "CONNECTED") return json({ error: "WhatsApp belum tersambung. Hubungkan dulu di bagian atas halaman." }, 409);

  const r = await sendWaText(chat, text, { sentById: session.userId });
  if (!r.ok) return json({ error: r.error, messageId: r.messageId }, r.status === 429 ? 429 : 400);
  // admin ikut membalas → AI berhenti di chat ini (bisa diaktifkan lagi dari panel)
  if (chat.account.autoReply && !chat.aiPaused) await pauseAi(chat.id, `Ditangani ${session.name}`);
  return json({ ok: true, messageId: r.messageId });
}

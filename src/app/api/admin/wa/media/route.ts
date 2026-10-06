import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { gatewayConfigured, gatewayId, resolveChat } from "@/lib/wa";
import { guardRoute } from "@/lib/security";

export const dynamic = "force-dynamic";

const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Gambar pesan WA (disimpan wa-gateway). Akses sama dengan membaca chatnya: pemilik nomor atau root/superadmin (pantau). */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Not found", { status: 404 });
  const limited = guardRoute(`wa-media:${session.userId}`, 240, 60_000);
  if (limited) return limited;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0 || !gatewayConfigured()) return new Response("Not found", { status: 404 });
  const msg = await prisma.waMessage.findUnique({ where: { id }, select: { chatId: true, waId: true, type: true, hasMedia: true } });
  if (!msg || msg.type !== "image" || !msg.hasMedia || !msg.waId || !/^[A-Za-z0-9]{6,64}$/.test(msg.waId)) return new Response("Not found", { status: 404 });
  const chat = await resolveChat(session, msg.chatId);
  if (!chat) return new Response("Not found", { status: 404 });
  try {
    const r = await fetch(`${process.env.WA_GATEWAY_URL}/sessions/${gatewayId(chat.accountId)}/media/${msg.waId}`, {
      headers: { authorization: `Bearer ${process.env.WA_GATEWAY_SECRET}` },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !MIME.has(type)) return new Response("Gambar tidak tersedia", { status: 404 });
    return new Response(await r.arrayBuffer(), {
      headers: {
        "content-type": type,
        "cache-control": "private, max-age=86400",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'",
      },
    });
  } catch {
    return new Response("Layanan WhatsApp tidak aktif", { status: 503 });
  }
}

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { crossSite, gateway, json } from "@/lib/wa";
import { blastGatewayId, canBlast, mySender } from "@/lib/blast-wa";
import { guardRoute } from "@/lib/security";

export const dynamic = "force-dynamic";

/** Tautkan nomor WhatsApp khusus blast: QR (default) atau kode tautan 8 digit */
export async function POST(request: Request) {
  if (crossSite(request)) return json({ error: "Permintaan ditolak." }, 403);
  const session = await getSession();
  if (!session || !canBlast(session.role)) return json({ error: "Hanya Admin Pelatihan & Root yang bisa menautkan nomor blast." }, 403);
  const limited = guardRoute(`blast-connect:${session.userId}`, 8, 10 * 60_000);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { phone?: string };
  let pairingPhone: string | undefined;
  if (body.phone) {
    let d = String(body.phone).replace(/\D/g, "");
    if (d.startsWith("0")) d = "62" + d.slice(1);
    if (d.length < 10 || d.length > 15) return json({ error: "Nomor WhatsApp tidak valid. Contoh: 081234567890" }, 400);
    pairingPhone = d;
  }
  const chat = await prisma.waAccount.findUnique({ where: { userId: session.userId }, select: { phone: true, status: true } });
  if (pairingPhone && chat?.phone === pairingPhone && chat.status === "CONNECTED")
    return json({ error: "Nomor ini sedang dipakai untuk Chat WA. Gunakan nomor lain khusus blast agar nomor CS tetap aman." }, 400);
  const sender = (await mySender(session.userId)) ?? (await prisma.blastSender.create({ data: { userId: session.userId } }));
  const r = await gateway<{ status?: string }>(`/sessions/${blastGatewayId(sender.id)}/start`, { pairingPhone });
  if (!r.ok) return json({ error: r.data.error ?? "Gagal menghubungkan." }, r.status === 400 ? 400 : 503);
  await prisma.blastSender.update({ where: { id: sender.id }, data: { status: String(r.data.status ?? "CONNECTING"), lastError: null } });
  return json({ ok: true });
}

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canChat, crossSite, gateway, gatewayId, json } from "@/lib/wa";
import { guardRoute } from "@/lib/security";

export const dynamic = "force-dynamic";

/** Mulai menautkan nomor WA admin: QR (default) atau kode tautan 8 digit ke nomor tertentu */
export async function POST(request: Request) {
  if (crossSite(request)) return json({ error: "Permintaan ditolak." }, 403);
  const session = await getSession();
  if (!session || !canChat(session.role)) return json({ error: "Hanya Admin Pelatihan & Admin SmartChampion yang bisa menautkan WhatsApp." }, 403);
  const limited = guardRoute(`wa-connect:${session.userId}`, 8, 10 * 60_000);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { phone?: string };
  let pairingPhone: string | undefined;
  if (body.phone) {
    let d = String(body.phone).replace(/\D/g, "");
    if (d.startsWith("0")) d = "62" + d.slice(1);
    if (d.length < 10 || d.length > 15) return json({ error: "Nomor WhatsApp tidak valid. Contoh: 081234567890" }, 400);
    pairingPhone = d;
  }
  const account = await prisma.waAccount.upsert({ where: { userId: session.userId }, update: {}, create: { userId: session.userId } });
  const r = await gateway<{ status?: string }>(`/sessions/${gatewayId(account.id)}/start`, { pairingPhone });
  if (!r.ok) return json({ error: r.data.error ?? "Gagal menghubungkan." }, r.status === 400 ? 400 : 503);
  await prisma.waAccount.update({ where: { id: account.id }, data: { status: String(r.data.status ?? "CONNECTING"), lastError: null } });
  return json({ ok: true });
}

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { crossSite, gateway, json } from "@/lib/wa";
import { blastGatewayId, canBlast, mySender, pauseSenderCampaigns } from "@/lib/blast-wa";
import { guardRoute } from "@/lib/security";

export const dynamic = "force-dynamic";

/** Lepas tautan nomor blast. Kampanye berjalan otomatis dijeda; kontak & riwayat tetap tersimpan. */
export async function POST(request: Request) {
  if (crossSite(request)) return json({ error: "Permintaan ditolak." }, 403);
  const session = await getSession();
  if (!session || !canBlast(session.role)) return json({ error: "Tidak diizinkan." }, 403);
  const limited = guardRoute(`blast-connect:${session.userId}`, 8, 10 * 60_000);
  if (limited) return limited;
  const sender = await mySender(session.userId);
  if (!sender) return json({ ok: true });
  const r = await gateway(`/sessions/${blastGatewayId(sender.id)}/logout`, {});
  if (!r.ok) return json({ error: r.data.error ?? "Gagal memutuskan." }, 503);
  await prisma.blastSender.update({ where: { id: sender.id }, data: { status: "LOGGED_OUT", restricted: false, lastError: null, nextSendAt: null } });
  await pauseSenderCampaigns(sender.id, "Dijeda: nomor blast diputus oleh admin.");
  return json({ ok: true });
}

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canChat, crossSite, gateway, gatewayId, json } from "@/lib/wa";
import { guardRoute } from "@/lib/security";

export const dynamic = "force-dynamic";

/** Lepas tautan WA (logout perangkat tertaut). Riwayat chat di panel tetap tersimpan. */
export async function POST(request: Request) {
  if (crossSite(request)) return json({ error: "Permintaan ditolak." }, 403);
  const session = await getSession();
  if (!session || !canChat(session.role)) return json({ error: "Tidak diizinkan." }, 403);
  const limited = guardRoute(`wa-connect:${session.userId}`, 8, 10 * 60_000);
  if (limited) return limited;
  const account = await prisma.waAccount.findUnique({ where: { userId: session.userId } });
  if (!account) return json({ ok: true });
  const r = await gateway(`/sessions/${gatewayId(account.id)}/logout`, {});
  if (!r.ok) return json({ error: r.data.error ?? "Gagal memutuskan." }, 503);
  await prisma.waAccount.update({ where: { id: account.id }, data: { status: "LOGGED_OUT", restricted: false, lastError: null } });
  return json({ ok: true });
}

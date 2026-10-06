import QRCode from "qrcode";
import { getSession } from "@/lib/session";
import { gateway, gatewayConfigured, json } from "@/lib/wa";
import { blastGatewayId, canBlast, mySender } from "@/lib/blast-wa";
import { guardRoute } from "@/lib/security";

export const dynamic = "force-dynamic";

type Live = { status?: string; qr?: string | null; pairingCode?: string | null; lastError?: string | null; restricted?: boolean };

/** Status koneksi nomor blast milik admin + QR / kode tautan saat menautkan */
export async function GET() {
  const session = await getSession();
  if (!session || !canBlast(session.role)) return json({ error: "Tidak diizinkan." }, 403);
  const limited = guardRoute(`blast-state:${session.userId}`, 120, 60_000);
  if (limited) return limited;
  const sender = await mySender(session.userId);
  if (!sender) return json({ configured: gatewayConfigured(), sender: null });
  const r = await gateway<Live>(`/sessions/${blastGatewayId(sender.id)}`);
  const live = r.ok ? r.data : null;
  const status = live?.status && live.status !== "DISCONNECTED" ? live.status : sender.status;
  return json({
    configured: gatewayConfigured(),
    gatewayUp: r.ok,
    sender: { id: sender.id, status, phone: sender.phone, waName: sender.waName, lastError: live?.lastError ?? sender.lastError, restricted: live?.restricted ?? sender.restricted },
    qr: status === "QR" && live?.qr ? await QRCode.toDataURL(live.qr, { margin: 1, width: 280 }) : null,
    pairingCode: status === "PAIRING" ? (live?.pairingCode ?? null) : null,
  });
}

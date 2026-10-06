import QRCode from "qrcode";
import { getSession } from "@/lib/session";
import { canChat, canMonitor, gateway, gatewayConfigured, gatewayId, json, resolveAccount } from "@/lib/wa";
import { guardRoute } from "@/lib/security";
import { groqConfigured } from "@/lib/groq";

export const dynamic = "force-dynamic";

type Live = {
  status?: string;
  qr?: string | null;
  pairingCode?: string | null;
  usage?: { minute: number; hour: number; day: number };
  limits?: Record<string, number>;
  queue?: number;
  restricted?: boolean;
  lastError?: string | null;
};

/** Status koneksi WA + QR (bila sedang menunggu scan) */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !(canChat(session.role) || canMonitor(session.role))) return json({ error: "Tidak diizinkan." }, 403);
  const limited = guardRoute(`wa-state:${session.userId}`, 120, 60_000);
  if (limited) return limited;
  const account = await resolveAccount(session, new URL(request.url).searchParams.get("account"));
  if (!account) return json({ account: null, configured: gatewayConfigured() });

  const r = await gateway<Live>(`/sessions/${gatewayId(account.id)}`);
  const live = r.ok ? r.data : null;
  const status = live?.status && live.status !== "DISCONNECTED" ? live.status : account.status;
  // QR / kode tautan hanya untuk pemilik nomor (superadmin tidak menautkan nomor admin)
  const own = account.userId === session.userId;
  const qr = own && status === "QR" && live?.qr ? await QRCode.toDataURL(live.qr, { margin: 1, width: 280 }) : null;
  return json({
    configured: gatewayConfigured(),
    aiConfigured: groqConfigured(),
    gatewayUp: r.ok,
    account: {
      id: account.id,
      status,
      phone: account.phone,
      waName: account.waName,
      lastError: live?.lastError ?? account.lastError,
      restricted: live?.restricted ?? account.restricted,
      connectedAt: account.connectedAt,
      autoReply: account.autoReply,
    },
    qr,
    pairingCode: own && status === "PAIRING" ? (live?.pairingCode ?? null) : null,
    usage: live?.usage ?? null,
    limits: live?.limits ?? null,
    queue: live?.queue ?? 0,
  });
}

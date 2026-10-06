import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapMidtransStatus, verifySignature, type MidtransStatus } from "@/lib/midtrans";
import { applyRegistrationStatus } from "@/lib/payments";
import { bodyTooLarge, ipFrom, rateLimit } from "@/lib/security";

// Set URL ini di dashboard Midtrans → Settings → Payment → Notification URL:
//   https://<domain>/api/midtrans/notification
export async function POST(request: Request) {
  // notifikasi Midtrans kecil (< 10 KB); batasi ukuran & frekuensi agar endpoint publik ini tidak disalahgunakan
  if (bodyTooLarge(request, 64 * 1024)) return NextResponse.json({ message: "payload too large" }, { status: 413 });
  if (!rateLimit(`midtrans:${ipFrom(request.headers)}`, 300, 60_000).ok) return NextResponse.json({ message: "too many requests" }, { status: 429 });
  let body: MidtransStatus;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "invalid body" }, { status: 400 });
  }
  if (!body || typeof body.order_id !== "string" || !verifySignature(body)) return NextResponse.json({ message: "invalid signature" }, { status: 403 });

  const reg = await prisma.registration.findUnique({ where: { midtransOrderId: body.order_id } });
  if (!reg) return NextResponse.json({ message: "order not found" }, { status: 404 });

  if (Number(body.gross_amount) !== reg.amount) return NextResponse.json({ message: "amount mismatch" }, { status: 400 });

  const status = mapMidtransStatus(body);
  if (status) await applyRegistrationStatus(reg.id, status, body.payment_type);
  return NextResponse.json({ message: "ok" });
}

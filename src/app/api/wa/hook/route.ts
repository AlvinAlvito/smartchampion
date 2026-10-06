import { applyGatewayEvent, type GatewayEvent } from "@/lib/wa";
import { bodyTooLarge, safeEqual } from "@/lib/security";

export const dynamic = "force-dynamic";

/**
 * Event dari wa-gateway (pesan masuk, status koneksi, status kirim).
 * Hanya untuk panggilan internal: wajib secret, dan ditolak bila datang lewat nginx (nginx selalu memasang X-Real-IP;
 * X-Forwarded-For tidak dipakai karena Next.js sendiri menambahkannya ke setiap request).
 */
export async function POST(request: Request) {
  const secret = process.env.WA_GATEWAY_SECRET ?? "";
  const auth = request.headers.get("authorization") ?? "";
  if (request.headers.get("x-real-ip") || secret.length < 24 || !safeEqual(auth, `Bearer ${secret}`)) {
    return new Response("Not found", { status: 404 });
  }
  if (bodyTooLarge(request, 128 * 1024)) return new Response("Too large", { status: 413 });
  let ev: GatewayEvent | { type: "tick" };
  try {
    ev = (await request.json()) as GatewayEvent | { type: "tick" };
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  try {
    const ok = await applyGatewayEvent(ev);
    return Response.json({ ok }, { status: ok ? 200 : 422 });
  } catch (e) {
    console.error("[wa-hook]", e);
    return Response.json({ ok: false }, { status: 500 });
  }
}

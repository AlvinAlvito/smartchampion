import "server-only";
import crypto from "node:crypto";

const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
const serverKey = process.env.MIDTRANS_SERVER_KEY ?? "";

const SNAP_URL = isProduction
  ? "https://app.midtrans.com/snap/v1/transactions"
  : "https://app.sandbox.midtrans.com/snap/v1/transactions";
const CORE_URL = isProduction ? "https://api.midtrans.com/v2" : "https://api.sandbox.midtrans.com/v2";

export const SNAP_JS_URL = isProduction
  ? "https://app.midtrans.com/snap/snap.js"
  : "https://app.sandbox.midtrans.com/snap/snap.js";

/** Tanpa server key → mode simulasi (khusus lokal/dev) */
export const midtransEnabled = () => Boolean(serverKey);

/**
 * Simulasi pembayaran hanya jika Midtrans belum dikonfigurasi DAN
 * (mode development ATAU diizinkan eksplisit lewat ALLOW_PAYMENT_SIMULATION="true").
 * Jangan set variabel itu di server produksi sungguhan.
 */
export const simulationEnabled = () =>
  !midtransEnabled() && (process.env.NODE_ENV !== "production" || process.env.ALLOW_PAYMENT_SIMULATION === "true");

function authHeader() {
  return "Basic " + Buffer.from(serverKey + ":").toString("base64");
}

type SnapParams = {
  orderId: string;
  amount: number;
  itemName: string;
  customer: { name: string; email: string; phone: string };
  finishUrl: string;
  /** Webhook khusus untuk transaksi ini (menggantikan URL global merchant hanya pada order ini). */
  notificationUrl?: string;
};

export async function createSnapTransaction(p: SnapParams): Promise<{ token: string; redirect_url: string }> {
  const res = await fetch(SNAP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: authHeader(),
      ...(p.notificationUrl ? { "X-Override-Notification": p.notificationUrl } : {}),
    },
    body: JSON.stringify({
      transaction_details: { order_id: p.orderId, gross_amount: p.amount },
      item_details: [{ id: p.orderId, price: p.amount, quantity: 1, name: p.itemName.slice(0, 50) }],
      customer_details: { first_name: p.customer.name, email: p.customer.email, phone: p.customer.phone },
      callbacks: { finish: p.finishUrl },
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Midtrans error ${res.status}: ${await res.text()}`);
  return res.json();
}

export type MidtransStatus = {
  order_id: string;
  status_code: string;
  gross_amount: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type?: string;
  signature_key?: string;
};

export async function getTransactionStatus(orderId: string): Promise<MidtransStatus | null> {
  const res = await fetch(`${CORE_URL}/${encodeURIComponent(orderId)}/status`, {
    headers: { Accept: "application/json", Authorization: authHeader() },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as MidtransStatus;
  return data.status_code === "404" ? null : data;
}

export function verifySignature(n: MidtransStatus) {
  const expected = crypto
    .createHash("sha512")
    .update(n.order_id + n.status_code + n.gross_amount + serverKey)
    .digest("hex");
  const got = String(n.signature_key ?? "");
  // perbandingan waktu-konstan (cegah timing attack)
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Map status Midtrans → status pendaftaran */
export function mapMidtransStatus(n: MidtransStatus) {
  const s = n.transaction_status;
  if (s === "capture") return n.fraud_status === "accept" || !n.fraud_status ? "PAID" : "PENDING";
  if (s === "settlement") return "PAID";
  if (s === "pending") return "PENDING";
  if (s === "expire") return "EXPIRED";
  if (s === "cancel") return "CANCELLED";
  if (s === "deny" || s === "failure") return "FAILED";
  return null;
}

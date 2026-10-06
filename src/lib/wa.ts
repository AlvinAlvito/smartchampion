import "server-only";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import type { SessionPayload } from "./session";
import { waPreview } from "./wa-shared";
import { onIncomingForAutoReply } from "./wa-autoreply";

/**
 * Chat WA: aplikasi web ⇄ wa-gateway (proses terpisah, 127.0.0.1).
 * - Admin Pelatihan & Admin SmartChampion: menautkan nomor WA sendiri & membalas chat.
 * - Superadmin: memantau chat semua admin (hanya baca, tidak menandai "dibaca").
 */

export const canChat = (role?: Role) => role === "ADMIN" || role === "SMARTCHAMPION";
export const canMonitor = (role?: Role) => role === "ROOT" || role === "SUPERADMIN";

export const gatewayId = (accountId: number) => `acc-${accountId}`;
export const accountIdFromGateway = (id: unknown) => {
  const m = /^acc-(\d{1,9})$/.exec(String(id ?? ""));
  return m ? Number(m[1]) : null;
};

export function gatewayConfigured() {
  return Boolean(process.env.WA_GATEWAY_URL && (process.env.WA_GATEWAY_SECRET ?? "").length >= 24);
}

type GatewayResult<T> = { ok: boolean; status: number; data: T & { error?: string } };

/** Panggil wa-gateway. Gagal terhubung → status 503 dengan pesan ramah. */
export async function gateway<T = Record<string, unknown>>(path: string, body?: unknown): Promise<GatewayResult<T>> {
  if (!gatewayConfigured())
    return {
      ok: false,
      status: 503,
      data: { error: "Layanan WhatsApp belum dikonfigurasi di server (WA_GATEWAY_URL / WA_GATEWAY_SECRET)." } as T & { error: string },
    };
  try {
    const r = await fetch(`${process.env.WA_GATEWAY_URL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${process.env.WA_GATEWAY_SECRET}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const data = (await r.json().catch(() => ({}))) as T & { error?: string };
    return { ok: r.ok, status: r.status, data };
  } catch {
    return {
      ok: false,
      status: 503,
      data: { error: "Layanan WhatsApp sedang tidak aktif. Coba lagi sebentar atau hubungi superadmin." } as T & { error: string },
    };
  }
}

/** Akun WA yang boleh dilihat: milik sendiri, atau (superadmin) akun mana pun. */
export async function resolveAccount(session: SessionPayload, accountParam?: string | null) {
  if (canMonitor(session.role)) {
    const id = Number(accountParam);
    return Number.isInteger(id) && id > 0 ? prisma.waAccount.findUnique({ where: { id } }) : null;
  }
  if (!canChat(session.role)) return null;
  return prisma.waAccount.findUnique({ where: { userId: session.userId } });
}

/** Chat + hak akses: `write` hanya pemilik akun (superadmin hanya memantau). */
export async function resolveChat(session: SessionPayload, chatId: number, write = false) {
  if (!Number.isInteger(chatId) || chatId <= 0) return null;
  const chat = await prisma.waChat.findUnique({ where: { id: chatId }, include: { account: true } });
  if (!chat) return null;
  const own = chat.account.userId === session.userId && canChat(session.role);
  if (own) return chat;
  if (!write && canMonitor(session.role)) return chat;
  return null;
}

/** Tolak POST lintas situs (lapisan tambahan di atas cookie SameSite=Lax). */
export function crossSite(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/* ------------------------------------------------------------------ */
/* Event dari wa-gateway                                               */
/* ------------------------------------------------------------------ */

type StatusEvent = {
  type: "status";
  session: string;
  state: { status: string; phone?: string | null; name?: string | null; lastError?: string | null; restricted?: boolean };
};
type MessageEvent = {
  type: "message";
  session: string;
  message: {
    id: string;
    jid: string;
    lid?: string | null;
    phone?: string | null;
    fromMe: boolean;
    pushName?: string | null;
    type: string;
    text: string;
    timestamp: number;
    /** gambar tersimpan di gateway */
    media?: { ext: string; size?: number } | null;
  };
};
type SentEvent = { type: "sent"; session: string; ref: string; id?: string; timestamp?: number };
type FailedEvent = { type: "failed"; session: string; ref: string; error?: string };
type AckEvent = { type: "ack"; session: string; id: string; status: number };
export type GatewayEvent = StatusEvent | MessageEvent | SentEvent | FailedEvent | AckEvent;

const STATUSES = new Set(["DISCONNECTED", "CONNECTING", "QR", "PAIRING", "CONNECTED", "RECONNECTING", "LOGGED_OUT", "BANNED", "REPLACED"]);
const TYPES = new Set(["text", "image", "video", "gif", "document", "voice", "audio", "sticker", "location", "contact", "poll"]);
const ACK_STATUS: Record<number, string> = { 2: "SENT", 3: "DELIVERED", 4: "READ", 5: "READ" };
const ACK_RANK: Record<string, number> = { PENDING: 0, FAILED: 0, SENT: 1, DELIVERED: 2, READ: 3 };
const cut = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));
const validJid = (j: unknown) => typeof j === "string" && /^[0-9]{5,20}(:\d+)?@(s\.whatsapp\.net|lid)$/.test(j);

export async function applyGatewayEvent(ev: GatewayEvent | { type: "tick" }) {
  // Blast WhatsApp: tick pengiriman & event sesi "blast-<id>" ditangani modul blast
  if (ev.type === "tick") {
    const { runBlastTick } = await import("./blast-wa");
    await runBlastTick();
    return true;
  }
  if (String(ev.session ?? "").startsWith("blast-")) {
    const { applyBlastEvent } = await import("./blast-wa");
    return applyBlastEvent(ev as Parameters<typeof applyBlastEvent>[0]);
  }
  const accountId = accountIdFromGateway(ev.session);
  if (!accountId) return false;
  const account = await prisma.waAccount.findUnique({ where: { id: accountId }, select: { id: true, status: true } });
  if (!account) return false;

  if (ev.type === "status") {
    const st = ev.state ?? ({} as StatusEvent["state"]);
    if (!STATUSES.has(st.status)) return false;
    await prisma.waAccount.update({
      where: { id: accountId },
      data: {
        status: st.status,
        lastError: cut(st.lastError, 255),
        restricted: !!st.restricted,
        ...(st.status === "CONNECTED"
          ? { phone: cut(st.phone, 30), waName: cut(st.name, 120), ...(account.status !== "CONNECTED" ? { connectedAt: new Date() } : {}) }
          : {}),
      },
    });
    return true;
  }

  if (ev.type === "message") {
    const m = ev.message;
    if (!m || !validJid(m.jid) || !m.id) return false;
    const type = TYPES.has(m.type) ? m.type : "text";
    const phone = m.phone && /^\d{6,20}$/.test(m.phone) ? m.phone : null;
    const lid = validJid(m.lid) ? m.lid! : null;
    const or = [{ jid: m.jid }, ...(phone ? [{ phone }] : []), ...(lid ? [{ lid }] : [])];
    let chat = await prisma.waChat.findFirst({ where: { accountId, OR: or }, orderBy: { id: "asc" } });
    if (!chat) {
      try {
        chat = await prisma.waChat.create({ data: { accountId, jid: m.jid, lid, phone, name: m.fromMe ? null : cut(m.pushName, 120) } });
      } catch {
        chat = await prisma.waChat.findFirst({ where: { accountId, jid: m.jid } });
        if (!chat) return false;
      }
    }
    const ts = new Date(Number.isFinite(m.timestamp) ? m.timestamp : Date.now());
    let saved;
    try {
      saved = await prisma.waMessage.create({
        data: {
          chatId: chat.id,
          waId: cut(m.id, 100),
          fromMe: !!m.fromMe,
          type,
          body: cut(m.text, 8000),
          status: m.fromMe ? "SENT" : "RECEIVED",
          hasMedia: type === "image" && !!m.media,
          timestamp: ts,
        },
      });
    } catch {
      return true; // pesan sudah tercatat (duplikat dari gateway)
    }
    const newer = !chat.lastMessageAt || ts >= chat.lastMessageAt;
    await prisma.waChat
      .update({
        where: { id: chat.id },
        data: {
          ...(newer ? { lastMessageAt: ts, lastMessageText: cut(waPreview(type, m.text), 255), lastFromMe: !!m.fromMe } : {}),
          // pesan dari customer → belum dibaca; admin membalas dari HP → dianggap sudah dibaca
          ...(m.fromMe ? { unread: 0 } : { unread: { increment: 1 }, hasIncoming: true, ...(m.pushName ? { name: cut(m.pushName, 120) } : {}) }),
          ...(phone && !chat.phone ? { phone } : {}),
          ...(lid && !chat.lid ? { lid } : {}),
          // chat yang semula hanya dikenal lewat LID → pakai jid nomor bila sudah diketahui
          ...(phone && chat.jid.endsWith("@lid") && m.jid.endsWith("@s.whatsapp.net") ? { jid: m.jid } : {}),
        },
      })
      .catch(() => undefined);
    // auto-balas AI (dijalankan setelah respons ke gateway) / admin membalas dari HP → AI dijeda di chat ini
    await onIncomingForAutoReply(chat.id, saved.id, !!m.fromMe, ts);
    return true;
  }

  const msgId = (ref: string) => {
    const x = /^m(\d{1,10})$/.exec(String(ref ?? ""));
    return x ? Number(x[1]) : null;
  };

  if (ev.type === "sent") {
    const id = msgId(ev.ref);
    if (!id) return false;
    const msg = await prisma.waMessage.findFirst({ where: { id, chat: { accountId } } });
    if (!msg) return false;
    await prisma.waMessage
      .update({
        where: { id },
        data: { waId: cut(ev.id, 100), status: msg.status === "PENDING" ? "SENT" : msg.status, timestamp: new Date(ev.timestamp ?? Date.now()) },
      })
      .catch(() => undefined);
    return true;
  }
  if (ev.type === "failed") {
    const id = msgId(ev.ref);
    if (!id) return false;
    await prisma.waMessage.updateMany({
      where: { id, chat: { accountId }, status: "PENDING" },
      data: { status: "FAILED", error: cut(ev.error ?? "Gagal terkirim", 255) },
    });
    return true;
  }
  if (ev.type === "ack") {
    const status = ACK_STATUS[ev.status];
    if (!status || !ev.id) return false;
    const msg = await prisma.waMessage.findFirst({ where: { waId: String(ev.id).slice(0, 100), fromMe: true, chat: { accountId } } });
    if (msg && ACK_RANK[status] > (ACK_RANK[msg.status] ?? 0)) await prisma.waMessage.update({ where: { id: msg.id }, data: { status } });
    return true;
  }
  return false;
}

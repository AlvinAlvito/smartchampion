/**
 * Gateway WhatsApp (tidak resmi, protokol WhatsApp Web via Baileys) untuk menu "Chat WA" Pelatihan POSI.
 *
 * - Proses terpisah dari web (pm2: pelatihan-wa) → bila WA bermasalah, situs tetap jalan.
 * - Hanya mendengarkan 127.0.0.1 + wajib header Authorization: Bearer <WA_GATEWAY_SECRET>.
 * - Tidak menyimpan chat: setiap pesan/status dikirim ke aplikasi (WA_APP_HOOK_URL) yang menyimpannya di database.
 * - Sesi login WA disimpan di WA_AUTH_DIR/<id>/ (izin 700).
 *
 * Pengaman anti-blokir (akun WA tidak resmi rawan diblokir bila perilakunya seperti bot/spam):
 *  - hanya chat pribadi (grup, status, saluran diabaikan); tidak ada fitur broadcast;
 *  - antrean kirim per nomor: jeda acak 3–7 dtk antar pesan + indikator "mengetik…" sesuai panjang pesan;
 *  - batas kirim per menit / jam / hari (bisa diatur lewat env) dan tolak teks identik ke banyak chat (pola broadcast);
 *  - tidak tampil "online" terus (markOnlineOnConnect=false), tidak menarik riwayat chat lama;
 *  - tanda "dibaca" hanya dikirim saat admin benar-benar membuka chat;
 *  - reconnect bertahap (backoff) & berhenti total bila logout/diblokir/dipakai di tempat lain — tidak memaksa login ulang;
 *  - hormati "reachout timelock" (WA sedang membatasi nomor) → kiriman ditahan.
 *
 * Sesi Blast WhatsApp ("blast-<id>", nomor terpisah dari Chat WA):
 *  - jadwal/jeda/kuota diatur aplikasi; gateway memanggil hook {type:"tick"} tiap 15 dtk selama ada sesi blast tersambung;
 *  - sebelum kirim, nomor tujuan dicek terdaftar di WhatsApp (tidak kirim ke nomor non-WA = sinyal spam);
 *  - boleh berisi teks berbeda per penerima (spintax) → cek "teks identik" tidak berlaku, tetapi batas per menit/jam/hari tetap.
 */
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pino from "pino";
import {
  makeWASocket,
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  getContentType,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  isLidUser,
  isPnUser,
  jidDecode,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  useMultiFileAuthState,
} from "baileys";

const HERE = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(HERE, ".env"));

const PORT = Number(process.env.WA_GATEWAY_PORT ?? 3031);
const SECRET = process.env.WA_GATEWAY_SECRET ?? "";
const HOOK_URL = process.env.WA_APP_HOOK_URL ?? "http://127.0.0.1:3000/api/wa/hook";
const AUTH_DIR = path.resolve(HERE, process.env.WA_AUTH_DIR ?? "auth");
/** gambar masuk (JPG/PNG/WebP ≤ 5 MB) disimpan di sini, hanya dibaca aplikasi lewat GET /sessions/:id/media/:msgId */
const MEDIA_DIR = path.resolve(HERE, process.env.WA_MEDIA_DIR ?? "media");
const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
const MEDIA_KEEP_MS = 90 * 86_400_000;
const MEDIA_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MEDIA_MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const validMsgId = (v) => typeof v === "string" && /^[A-Za-z0-9]{6,64}$/.test(v);
const LIMITS = {
  perMinute: Number(process.env.WA_MAX_PER_MINUTE ?? 12),
  perHour: Number(process.env.WA_MAX_PER_HOUR ?? 120),
  perDay: Number(process.env.WA_MAX_PER_DAY ?? 500),
  sameTextChats: Number(process.env.WA_MAX_SAME_TEXT_CHATS ?? 4), // teks identik ke > n chat berbeda / 30 menit → ditolak
  queue: 25,
};
const GAP_MS = [3000, 7000]; // jeda acak antar kiriman
const MAX_QR = 5; // QR kedaluwarsa ±20 dtk; setelah 5x tidak dipindai → berhenti (tidak terus-menerus minta QR)
const OLD_MSG_MS = 3 * 86_400_000; // pesan lebih tua dari 3 hari (sinkron riwayat) tidak diteruskan

if (SECRET.length < 24) {
  console.error("[wa] WA_GATEWAY_SECRET wajib diisi (min. 24 karakter). Gateway tidak dijalankan.");
  process.exit(1);
}

const logger = pino({ level: process.env.WA_LOG_LEVEL ?? "error" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a));
const log = (...a) => console.log(new Date().toISOString(), "[wa]", ...a);

/* ---------------- kirim event ke aplikasi (dengan antrean ulang) ---------------- */
const outbox = [];
let flushing = false;
function emit(event) {
  outbox.push({ ...event, at: Date.now() });
  if (outbox.length > 5000) outbox.splice(0, outbox.length - 5000);
  void flush();
}
async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    while (outbox.length) {
      const ev = outbox[0];
      if (Date.now() - ev.at > 3600_000) {
        outbox.shift();
        continue;
      }
      try {
        const r = await fetch(HOOK_URL, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
          body: JSON.stringify(ev),
          signal: AbortSignal.timeout(15_000),
        });
        if (r.status >= 500 || r.status === 429) throw new Error(`hook ${r.status}`);
        outbox.shift(); // 2xx/4xx: selesai (4xx = data tidak valid, tidak diulang)
      } catch (e) {
        log("hook gagal, dicoba lagi:", e.message);
        await sleep(3000);
      }
    }
  } finally {
    flushing = false;
  }
}

/* ---------------- tick Blast WhatsApp ---------------- */
let ticking = false;
/** Minta aplikasi mengirim pesan blast berikutnya (hanya bila ada sesi blast tersambung). Tidak lewat outbox: tick yang gagal cukup dilewati. */
async function blastTick() {
  if (ticking || ![...sessions.values()].some((s) => isBlast(s.id) && s.status === "CONNECTED")) return;
  ticking = true;
  try {
    await fetch(HOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ type: "tick" }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    log("tick blast gagal:", e.message);
  } finally {
    ticking = false;
  }
}

/* ---------------- sesi ---------------- */
/** @type {Map<string, any>} */
const sessions = new Map();
let waVersion = null;

const validId = (id) => typeof id === "string" && /^[a-z0-9-]{1,40}$/.test(id);
const isBlast = (id) => id.startsWith("blast-");
const BLAST_IMAGE_MAX = 1024 * 1024;
const authPath = (id) => path.join(AUTH_DIR, id);

function publicState(s) {
  return {
    id: s.id,
    status: s.status,
    qr: s.status === "QR" ? s.qr : null,
    pairingCode: s.status === "PAIRING" ? s.pairingCode : null,
    phone: s.phone ?? null,
    name: s.name ?? null,
    lastError: s.lastError ?? null,
    restricted: !!s.restricted,
    queue: s.queue.length,
    usage: usage(s),
    limits: LIMITS,
  };
}

function setStatus(s, status, extra = {}) {
  Object.assign(s, extra, { status });
  emit({ type: "status", session: s.id, state: publicState(s) });
}

function usage(s) {
  const now = Date.now();
  s.sentLog = s.sentLog.filter((t) => now - t < 86_400_000);
  return {
    minute: s.sentLog.filter((t) => now - t < 60_000).length,
    hour: s.sentLog.filter((t) => now - t < 3600_000).length,
    day: s.sentLog.length,
  };
}

function newSession(id) {
  return { id, status: "DISCONNECTED", sock: null, qr: null, qrCount: 0, pairingCode: null, pairingPhone: null, retries: 0, queue: [], sending: false, sentLog: [], texts: [], cache: new Map(), selfSent: new Set(), stopped: false, restricted: false, reconnectTimer: null };
}

async function start(id, { pairingPhone } = {}) {
  let s = sessions.get(id);
  if (s?.sock && ["CONNECTED", "CONNECTING", "QR", "PAIRING", "RECONNECTING"].includes(s.status)) return s;
  if (!s) {
    s = newSession(id);
    sessions.set(id, s);
  }
  clearTimeout(s.reconnectTimer);
  s.stopped = false;
  s.qrCount = 0;
  s.pairingCode = null;
  s.pairingPhone = pairingPhone ? String(pairingPhone).replace(/\D/g, "") : null;
  s.lastError = null;
  await connect(s);
  return s;
}

async function connect(s) {
  await fsp.mkdir(authPath(s.id), { recursive: true, mode: 0o700 });
  const { state, saveCreds } = await useMultiFileAuthState(authPath(s.id));
  if (!waVersion) {
    try {
      waVersion = (await fetchLatestBaileysVersion()).version;
    } catch {
      waVersion = undefined; // pakai versi bawaan Baileys
    }
  }
  setStatus(s, s.retries ? "RECONNECTING" : "CONNECTING");
  const sock = makeWASocket({
    ...(waVersion ? { version: waVersion } : {}),
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    browser: Browsers.macOS("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false,
    shouldIgnoreJid: (jid) => isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid) || isJidStatusBroadcast(jid),
    // dipakai WA untuk kirim ulang pesan yang gagal didekripsi penerima
    getMessage: async (key) => s.cache.get(key.id),
  });
  s.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    if (s.sock !== sock) return;
    if (u.reachoutTimeLock) {
      s.restricted = !!u.reachoutTimeLock.isActive;
      setStatus(s, s.status);
    }
    if (u.qr) {
      if (s.pairingPhone && !sock.authState.creds.account) {
        if (!s.pairingCode) {
          try {
            const code = await sock.requestPairingCode(s.pairingPhone);
            setStatus(s, "PAIRING", { pairingCode: code });
          } catch (e) {
            setStatus(s, "DISCONNECTED", { lastError: `Gagal membuat kode tautan: ${e.message}` });
            stopSocket(s);
          }
        }
        return;
      }
      s.qrCount++;
      if (s.qrCount > MAX_QR) {
        setStatus(s, "DISCONNECTED", { lastError: "QR tidak dipindai. Klik Hubungkan untuk mencoba lagi.", qr: null });
        stopSocket(s);
        await wipeAuth(s);
        return;
      }
      setStatus(s, "QR", { qr: u.qr });
    }
    if (u.connection === "open") {
      const me = sock.user;
      s.retries = 0;
      setStatus(s, "CONNECTED", { qr: null, pairingCode: null, phone: jidDecode(me?.id)?.user ?? null, name: me?.name ?? me?.notify ?? null, lastError: null });
      log(s.id, "terhubung", s.phone);
    }
    if (u.connection === "close") {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      s.sock = null;
      if (s.stopped) return;
      if (code === DisconnectReason.loggedOut) {
        await wipeAuth(s);
        setStatus(s, "LOGGED_OUT", { lastError: "Perangkat ditautkan dilepas dari HP. Hubungkan ulang bila perlu." });
      } else if (code === DisconnectReason.forbidden) {
        await wipeAuth(s);
        setStatus(s, "BANNED", { lastError: "WhatsApp menolak nomor ini (kemungkinan diblokir/dibatasi). Gateway berhenti." });
      } else if (code === DisconnectReason.connectionReplaced) {
        setStatus(s, "REPLACED", { lastError: "Sesi dipakai di tempat lain. Hubungkan ulang dari halaman Chat WA." });
      } else if (code === DisconnectReason.restartRequired) {
        void connect(s);
      } else if (!sock.authState.creds.account && !s.pairingPhone) {
        // belum pernah login & koneksi putus saat menunggu QR → berhenti, admin klik Hubungkan lagi
        setStatus(s, "DISCONNECTED", { lastError: s.lastError ?? "Koneksi terputus sebelum QR dipindai.", qr: null });
        await wipeAuth(s);
      } else {
        s.retries++;
        const delay = Math.min(300_000, 5000 * 2 ** Math.min(s.retries - 1, 6)) + rand(0, 3000);
        setStatus(s, "RECONNECTING", { lastError: `Koneksi terputus (${code ?? "?"}), menyambung ulang dalam ${Math.round(delay / 1000)} dtk.` });
        s.reconnectTimer = setTimeout(() => !s.stopped && void connect(s), delay);
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const m of messages) {
      try {
        await onMessage(s, sock, m);
      } catch (e) {
        log(s.id, "gagal memproses pesan:", e.message);
      }
    }
  });

  sock.ev.on("messages.update", (updates) => {
    for (const { key, update } of updates) {
      if (!key?.fromMe || update?.status == null) continue;
      emit({ type: "ack", session: s.id, id: key.id, status: update.status });
    }
  });
}

function stopSocket(s) {
  s.stopped = true;
  clearTimeout(s.reconnectTimer);
  try {
    s.sock?.end(undefined);
  } catch {}
  s.sock = null;
}

function loggedIn(id) {
  try {
    return !!JSON.parse(fs.readFileSync(path.join(authPath(id), "creds.json"), "utf8"))?.account;
  } catch {
    return false;
  }
}

async function wipeAuth(s) {
  await fsp.rm(authPath(s.id), { recursive: true, force: true });
}

/** Ambil teks & jenis pesan (pesan media hanya dicatat jenis + keterangannya) */
function describe(message) {
  const content = normalizeMessageContent(message);
  if (!content) return null;
  const type = getContentType(content);
  const c = content[type];
  switch (type) {
    case "conversation":
      return { type: "text", text: content.conversation };
    case "extendedTextMessage":
      return { type: "text", text: c?.text ?? "" };
    case "imageMessage":
      return { type: "image", text: c?.caption ?? "" };
    case "videoMessage":
      return { type: c?.gifPlayback ? "gif" : "video", text: c?.caption ?? "" };
    case "documentMessage":
    case "documentWithCaptionMessage":
      return { type: "document", text: c?.caption || c?.fileName || c?.message?.documentMessage?.fileName || "" };
    case "audioMessage":
      return { type: c?.ptt ? "voice" : "audio", text: "" };
    case "stickerMessage":
      return { type: "sticker", text: "" };
    case "locationMessage":
    case "liveLocationMessage":
      return { type: "location", text: c?.name || c?.address || `${c?.degreesLatitude ?? ""},${c?.degreesLongitude ?? ""}` };
    case "contactMessage":
      return { type: "contact", text: c?.displayName ?? "" };
    case "contactsArrayMessage":
      return { type: "contact", text: c?.displayName ?? "" };
    case "buttonsResponseMessage":
      return { type: "text", text: c?.selectedDisplayText ?? "" };
    case "listResponseMessage":
      return { type: "text", text: c?.title ?? "" };
    case "templateButtonReplyMessage":
      return { type: "text", text: c?.selectedDisplayText ?? "" };
    case "pollCreationMessage":
    case "pollCreationMessageV3":
      return { type: "poll", text: c?.name ?? "" };
    default:
      return null; // protokol, reaksi, kunci enkripsi, dll → abaikan
  }
}

async function phoneOf(sock, jid, alt) {
  if (isPnUser(jid)) return jidDecode(jid)?.user ?? null;
  if (alt && isPnUser(alt)) return jidDecode(alt)?.user ?? null;
  if (isLidUser(jid)) {
    try {
      const pn = await sock.signalRepository?.lidMapping?.getPNForLID(jid);
      if (pn) return jidDecode(pn)?.user ?? null;
    } catch {}
  }
  return null;
}

async function onMessage(s, sock, m) {
  const key = m.key;
  const jid = key?.remoteJid;
  if (!jid || !m.message || isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid) || isJidStatusBroadcast(jid)) return;
  if (!isPnUser(jid) && !isLidUser(jid)) return;
  const ts = Number(m.messageTimestamp ?? 0) * 1000 || Date.now();
  if (Date.now() - ts > OLD_MSG_MS) return;
  if (key.fromMe && s.selfSent.has(key.id)) return; // dikirim dari panel → sudah dicatat lewat event "sent"
  const d = describe(m.message);
  if (!d) return;
  const media = d.type === "image" && !isBlast(s.id) ? await saveImage(s, m) : null;
  const phone = await phoneOf(sock, jid, key.remoteJidAlt);
  const lid = isLidUser(jid) ? jidNormalizedUser(jid) : key.remoteJidAlt && isLidUser(key.remoteJidAlt) ? jidNormalizedUser(key.remoteJidAlt) : null;
  // jid kanonik: pakai nomor bila diketahui agar chat LID & nomor tidak terpecah
  const canonical = phone ? `${phone}@s.whatsapp.net` : jidNormalizedUser(jid);
  emit({
    type: "message",
    session: s.id,
    message: {
      id: key.id,
      jid: canonical,
      sendJid: jidNormalizedUser(jid),
      lid,
      phone,
      fromMe: !!key.fromMe,
      pushName: key.fromMe ? null : (m.pushName ?? null),
      type: d.type,
      text: String(d.text ?? "").slice(0, 8000),
      timestamp: ts,
      ...(media ? { media } : {}),
    },
  });
}

/** Unduh & simpan gambar masuk (maks. 5 MB, JPG/PNG/WebP). Gagal → pesan tetap diteruskan tanpa gambar. */
async function saveImage(s, m) {
  try {
    const img = normalizeMessageContent(m.message)?.imageMessage;
    const ext = MEDIA_TYPES[String(img?.mimetype ?? "").split(";")[0].trim()];
    if (!img || !ext || !validMsgId(m.key?.id) || Number(img.fileLength ?? 0) > MEDIA_MAX_BYTES) return null;
    const buf = await Promise.race([
      downloadMediaMessage(m, "buffer", {}, { logger, reuploadRequest: s.sock?.updateMediaMessage }),
      sleep(30_000).then(() => null),
    ]);
    if (!buf || buf.length > MEDIA_MAX_BYTES) return null;
    const dir = path.join(MEDIA_DIR, s.id);
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    await fsp.writeFile(path.join(dir, `${m.key.id}.${ext}`), buf, { mode: 0o600 });
    return { ext, size: buf.length };
  } catch (e) {
    log("gagal menyimpan gambar", s.id, e?.message ?? e);
    return null;
  }
}

/** Hapus gambar yang lebih tua dari 90 hari */
async function sweepMedia() {
  const now = Date.now();
  const sessDirs = await fsp.readdir(MEDIA_DIR, { withFileTypes: true }).catch(() => []);
  for (const d of sessDirs) {
    if (!d.isDirectory() || !validId(d.name)) continue;
    const dir = path.join(MEDIA_DIR, d.name);
    for (const f of await fsp.readdir(dir).catch(() => [])) {
      const st = await fsp.stat(path.join(dir, f)).catch(() => null);
      if (st && now - st.mtimeMs > MEDIA_KEEP_MS) await fsp.unlink(path.join(dir, f)).catch(() => {});
    }
  }
}

/* ---------------- antrean kirim ---------------- */
function checkLimits(s, jid, text) {
  const u = usage(s);
  if (s.restricted) return "WhatsApp sedang membatasi nomor ini (reachout timelock). Tunggu beberapa saat sebelum mengirim.";
  if (u.minute >= LIMITS.perMinute) return `Batas ${LIMITS.perMinute} pesan/menit tercapai. Tunggu sebentar agar nomor aman.`;
  if (u.hour >= LIMITS.perHour) return `Batas ${LIMITS.perHour} pesan/jam tercapai. Coba lagi nanti.`;
  if (u.day >= LIMITS.perDay) return `Batas ${LIMITS.perDay} pesan/hari tercapai. Coba lagi besok.`;
  if (s.queue.length >= LIMITS.queue) return "Antrean kirim penuh. Tunggu pesan sebelumnya terkirim.";
  if (isBlast(s.id)) return null; // blast: pesan dipersonalisasi & dijeda aplikasi
  const now = Date.now();
  s.texts = s.texts.filter((t) => now - t.at < 30 * 60_000);
  const hash = crypto.createHash("sha1").update(text.trim().toLowerCase()).digest("hex");
  const chats = new Set(s.texts.filter((t) => t.hash === hash && text.trim().length > 20).map((t) => t.jid));
  chats.delete(jid);
  if (chats.size >= LIMITS.sameTextChats) return "Teks yang sama sudah dikirim ke banyak chat. Kirim pesan yang dipersonalisasi agar nomor tidak dianggap spam.";
  s.texts.push({ hash, jid, at: now });
  return null;
}

async function runQueue(s) {
  if (s.sending) return;
  s.sending = true;
  try {
    while (s.queue.length) {
      const job = s.queue[0];
      if (!s.sock || s.status !== "CONNECTED") {
        // tunggu tersambung lagi maksimal 2 menit, lalu gagalkan
        if (Date.now() - job.at > 120_000) {
          s.queue.shift();
          emit({ type: "failed", session: s.id, ref: job.ref, error: "WhatsApp tidak tersambung." });
          continue;
        }
        await sleep(2000);
        continue;
      }
      const wait = s.lastSend ? s.lastSend + rand(...GAP_MS) - Date.now() : 0;
      if (wait > 0) await sleep(wait);
      const sock = s.sock;
      try {
        if (job.checkNumber) {
          // blast: pastikan nomor terdaftar di WhatsApp sebelum dikirimi
          let found;
          try {
            [found] = await sock.onWhatsApp(job.jid);
          } catch (e) {
            s.queue.shift();
            emit({ type: "failed", session: s.id, ref: job.ref, error: `RETRY: cek nomor gagal (${String(e?.message ?? e).slice(0, 120)})` });
            continue;
          }
          if (!found?.exists) {
            s.queue.shift();
            s.lastSend = Date.now() - GAP_MS[0]; // tidak ada kiriman → tidak perlu jeda penuh
            emit({ type: "failed", session: s.id, ref: job.ref, error: "NOT_ON_WA" });
            continue;
          }
          if (found.jid && isPnUser(found.jid)) job.jid = found.jid;
        }
        await sock.presenceSubscribe(job.jid).catch(() => {});
        await sock.sendPresenceUpdate("composing", job.jid).catch(() => {});
        await sleep(Math.min(6000, 1000 + job.text.length * 35) + rand(0, 800));
        await sock.sendPresenceUpdate("paused", job.jid).catch(() => {});
        const sent = await sock.sendMessage(job.jid, job.image ? { image: job.image.buf, mimetype: job.image.mime, caption: job.text } : { text: job.text });
        const id = sent?.key?.id;
        if (id) {
          s.selfSent.add(id);
          if (s.selfSent.size > 2000) s.selfSent.delete(s.selfSent.values().next().value);
          s.cache.set(id, sent.message);
          if (s.cache.size > 500) s.cache.delete(s.cache.keys().next().value);
        }
        s.sentLog.push(Date.now());
        s.lastSend = Date.now();
        emit({ type: "sent", session: s.id, ref: job.ref, id, timestamp: Date.now() });
      } catch (e) {
        emit({ type: "failed", session: s.id, ref: job.ref, error: String(e?.message ?? e).slice(0, 200) });
      }
      s.queue.shift();
    }
  } finally {
    s.sending = false;
  }
}

/* ---------------- HTTP API (127.0.0.1) ---------------- */
function authorized(req) {
  const h = String(req.headers.authorization ?? "");
  const a = Buffer.from(h);
  const b = Buffer.from(`Bearer ${SECRET}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function readJson(req, max = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Object.assign(new Error("Body terlalu besar"), { code: 413 });
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function send(res, code, body) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    if (!authorized(req)) return send(res, 401, { error: "unauthorized" });
    const url = new URL(req.url, "http://x");
    const parts = url.pathname.split("/").filter(Boolean);
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, sessions: sessions.size });
    if (parts[0] !== "sessions" || !validId(parts[1])) return send(res, 404, { error: "not found" });
    const id = parts[1];
    const action = parts[2] ?? "";
    const s = sessions.get(id);

    if (req.method === "GET" && !action) return send(res, 200, s ? publicState(s) : { id, status: "DISCONNECTED" });

    if (req.method === "GET" && action === "media") {
      const mid = parts[3];
      if (!validMsgId(mid) || parts.length !== 4) return send(res, 404, { error: "not found" });
      for (const ext of Object.keys(MEDIA_MIME)) {
        const file = path.join(MEDIA_DIR, id, `${mid}.${ext}`);
        const buf = await fsp.readFile(file).catch(() => null);
        if (buf) {
          res.writeHead(200, { "content-type": MEDIA_MIME[ext], "content-length": buf.length });
          return res.end(buf);
        }
      }
      return send(res, 404, { error: "Gambar tidak tersimpan." });
    }

    if (req.method !== "POST") return send(res, 405, { error: "method" });
    // kiriman blast boleh membawa gambar (≤ 1 MB → base64 ± 1,4 MB)
    const body = await readJson(req, action === "send" && isBlast(id) ? 2 * 1024 * 1024 : 64 * 1024);

    if (action === "start") {
      const phone = body.pairingPhone ? String(body.pairingPhone).replace(/\D/g, "") : null;
      if (phone && (phone.length < 10 || phone.length > 15)) return send(res, 400, { error: "Nomor untuk kode tautan tidak valid." });
      const ss = await start(id, { pairingPhone: phone });
      return send(res, 200, publicState(ss));
    }
    if (action === "logout") {
      if (s) {
        s.stopped = true;
        clearTimeout(s.reconnectTimer);
        try {
          await s.sock?.logout();
        } catch {}
        stopSocket(s);
        s.queue = [];
        await wipeAuth(s);
        setStatus(s, "LOGGED_OUT", { qr: null, pairingCode: null, lastError: null });
      } else {
        await wipeAuth({ id });
      }
      return send(res, 200, { ok: true });
    }
    if (action === "send") {
      if (!s || s.status !== "CONNECTED") return send(res, 409, { error: "WhatsApp belum tersambung." });
      const jid = String(body.jid ?? "");
      const text = String(body.text ?? "").trim();
      if (!(isPnUser(jid) || isLidUser(jid))) return send(res, 400, { error: "Tujuan tidak valid (hanya chat pribadi)." });
      if (!text || text.length > 4096) return send(res, 400, { error: "Pesan kosong atau terlalu panjang (maks 4.096 karakter)." });
      let image = null;
      if (isBlast(id) && body.image) {
        const mime = String(body.image.mime ?? "");
        const buf = Buffer.from(String(body.image.data ?? ""), "base64");
        if (!["image/jpeg", "image/png"].includes(mime) || !buf.length || buf.length > BLAST_IMAGE_MAX) return send(res, 400, { error: "Gambar tidak valid (JPG/PNG maks 1 MB)." });
        image = { buf, mime };
      }
      const why = checkLimits(s, jid, text);
      if (why) return send(res, 429, { error: why });
      s.queue.push({ jid, text, ref: String(body.ref ?? ""), at: Date.now(), checkNumber: isBlast(id) && !!body.checkNumber && isPnUser(jid), image });
      void runQueue(s);
      return send(res, 202, { queued: true, position: s.queue.length });
    }
    if (action === "read") {
      if (!s?.sock || s.status !== "CONNECTED") return send(res, 200, { ok: false });
      const jid = String(body.jid ?? "");
      const ids = Array.isArray(body.ids) ? body.ids.slice(-20).map(String) : [];
      if ((isPnUser(jid) || isLidUser(jid)) && ids.length) {
        await s.sock.readMessages(ids.map((mid) => ({ remoteJid: jid, id: mid, fromMe: false }))).catch(() => {});
      }
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, e.code === 413 ? 413 : 500, { error: String(e.message ?? e).slice(0, 200) });
  }
});

server.listen(PORT, "127.0.0.1", async () => {
  log(`gateway siap di 127.0.0.1:${PORT}, hook → ${HOOK_URL}`);
  // sambungkan ulang sesi yang sudah pernah login (bertahap agar tidak serentak)
  await fsp.mkdir(AUTH_DIR, { recursive: true, mode: 0o700 });
  await fsp.mkdir(MEDIA_DIR, { recursive: true, mode: 0o700 });
  void sweepMedia();
  setInterval(() => void sweepMedia(), 12 * 3600_000).unref();
  setInterval(() => void blastTick(), 15_000).unref();
  const dirs = (await fsp.readdir(AUTH_DIR, { withFileTypes: true })).filter((d) => d.isDirectory() && validId(d.name));
  for (const d of dirs) {
    // hanya sesi yang benar-benar sudah login (creds.account terisi setelah QR/kode berhasil); sisa percobaan QR yang tidak selesai dibersihkan
    if (!loggedIn(d.name)) {
      await wipeAuth({ id: d.name });
      continue;
    }
    log("memulihkan sesi", d.name);
    void start(d.name).catch((e) => log("gagal memulihkan", d.name, e.message));
    await sleep(rand(3000, 6000));
  }
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log("berhenti…");
    for (const s of sessions.values()) {
      s.stopped = true;
      try {
        s.sock?.end(undefined);
      } catch {}
    }
    setTimeout(() => process.exit(0), 500);
  });
}
process.on("unhandledRejection", (e) => log("unhandledRejection:", e?.message ?? e));

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

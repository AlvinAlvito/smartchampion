import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma, type BlastSender, type Role } from "@prisma/client";
import { prisma } from "./prisma";
import type { SessionPayload } from "./session";
import { gateway } from "./wa";
import { BLAST_IMAGE_MAX, hourlyCap, isOptOutReply, renderMessage, warmup, type Check } from "./blast-wa-shared";

/**
 * Blast WhatsApp: nomor khusus blast (terpisah dari Chat WA) → sesi gateway "blast-<id>".
 * Pengiriman dikendalikan dari database: wa-gateway memanggil hook "tick" tiap ±15 dtk, lalu aplikasi
 * mengirim SATU pesan per nomor bila jeda acak, jam kirim, kuota warm-up, dan batas per jam mengizinkan.
 */

/** Admin Pelatihan & Root boleh menautkan nomor & menjalankan blast; Superadmin hanya memantau. */
export const canBlast = (role?: Role) => role === "ADMIN" || role === "ROOT";
export const canSeeAllBlast = (role?: Role) => role === "ROOT" || role === "SUPERADMIN";

export const blastGatewayId = (senderId: number) => `blast-${senderId}`;
export const senderIdFromGateway = (id: unknown) => {
  const m = /^blast-(\d{1,9})$/.exec(String(id ?? ""));
  return m ? Number(m[1]) : null;
};

export const contactScope = (s: SessionPayload): Prisma.BlastContactWhereInput => (canSeeAllBlast(s.role) ? {} : { ownerId: s.userId });
export const campaignScope = (s: SessionPayload): Prisma.BlastCampaignWhereInput => (canSeeAllBlast(s.role) ? {} : { ownerId: s.userId });

export async function mySender(userId: number) {
  return prisma.blastSender.findFirst({ where: { userId }, orderBy: { id: "asc" } });
}

/* ------------------------------------------------------------------ */
/* Waktu WIB                                                           */
/* ------------------------------------------------------------------ */

const WIB_MS = 7 * 3600_000;
export const wibHour = (d: Date) => new Date(d.getTime() + WIB_MS).getUTCHours();
export function startOfWibDay(d: Date) {
  const x = new Date(d.getTime() + WIB_MS);
  x.setUTCHours(0, 0, 0, 0);
  return new Date(x.getTime() - WIB_MS);
}

/* ------------------------------------------------------------------ */
/* Gambar lampiran                                                     */
/* ------------------------------------------------------------------ */

export const BLAST_IMAGE_DIR = path.join(process.cwd(), "storage", "blast");
const IMG_NAME = /^[a-f0-9-]{36}\.(jpg|png)$/;

export async function saveBlastImage(file: File) {
  if (file.size > BLAST_IMAGE_MAX) throw new Error("Ukuran gambar maksimal 1 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ? "jpg" : buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? "png" : null;
  if (!ext) throw new Error("Gambar harus berformat JPG atau PNG.");
  await fs.mkdir(BLAST_IMAGE_DIR, { recursive: true });
  const name = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(BLAST_IMAGE_DIR, name), buf);
  return name;
}

export async function readBlastImage(name: string | null | undefined) {
  if (!name || !IMG_NAME.test(name)) return null;
  const buf = await fs.readFile(path.join(BLAST_IMAGE_DIR, name)).catch(() => null);
  return buf ? { buf, mime: name.endsWith(".png") ? "image/png" : "image/jpeg" } : null;
}

/* ------------------------------------------------------------------ */
/* Data Blast (/admin/blast): setiap kontak blast WA tercatat otomatis */
/* ------------------------------------------------------------------ */

/** Buat baris Data Blast (asal WhatsApp, owner = pemilik kontak) untuk kontak yang belum tertaut, lalu tautkan. */
export async function linkContactsToDataBlast(ownerId: number) {
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO blasts (tanggal, nama, email, noHp, provinsi, kota, jenjang, sekolah, ownerId, asalBlast, createdAt, updatedAt)
    SELECT ${now}, c.nama, c.email, c.noHp, c.provinsi, c.kota, c.jenjang, c.sekolah, c.ownerId, 'WhatsApp', ${now}, ${now}
    FROM blast_contacts c
    WHERE c.ownerId = ${ownerId} AND c.blastId IS NULL
      AND NOT EXISTS (SELECT 1 FROM blasts b WHERE b.ownerId = c.ownerId AND b.noHp = c.noHp AND b.asalBlast = 'WhatsApp')`;
  await prisma.$executeRaw`
    UPDATE blast_contacts c
    SET c.blastId = (SELECT MIN(b.id) FROM blasts b WHERE b.ownerId = c.ownerId AND b.noHp = c.noHp AND b.asalBlast = 'WhatsApp')
    WHERE c.ownerId = ${ownerId} AND c.blastId IS NULL`;
}

type ContactForBlast = { id: number; ownerId: number; nama: string; noHp: string; email: string | null; provinsi: string | null; kota: string | null; jenjang: string | null; sekolah: string | null; blastId: number | null };

/** Perbarui baris Data Blast milik kontak (tanggal = tanggal blast terakhir); dibuat ulang bila sudah dihapus admin. */
export async function touchDataBlast(c: ContactForBlast, tanggal?: Date) {
  const data = { nama: c.nama, email: c.email, provinsi: c.provinsi, kota: c.kota, jenjang: c.jenjang, sekolah: c.sekolah, ...(tanggal ? { tanggal } : {}) };
  if (c.blastId) {
    const r = await prisma.blast.updateMany({ where: { id: c.blastId }, data });
    if (r.count) return;
  }
  const b = await prisma.blast.create({ data: { ...data, tanggal: tanggal ?? new Date(), noHp: c.noHp, ownerId: c.ownerId, asalBlast: "WhatsApp" } });
  await prisma.blastContact.update({ where: { id: c.id }, data: { blastId: b.id } }).catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* Pemakaian & kesehatan nomor                                         */
/* ------------------------------------------------------------------ */

const ATTEMPTED = ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED"];

export async function senderUsage(senderId: number, now = new Date()) {
  const base = { campaign: { senderId }, status: { in: ATTEMPTED } };
  const [today, hour] = await Promise.all([
    prisma.blastRecipient.count({ where: { ...base, queuedAt: { gte: startOfWibDay(now) } } }),
    prisma.blastRecipient.count({ where: { ...base, queuedAt: { gte: new Date(now.getTime() - 3600_000) } } }),
  ]);
  return { today, hour };
}

export type Health = {
  score: number;
  level: "AMAN" | "WASPADA" | "BERISIKO";
  checks: Check[];
  warm: ReturnType<typeof warmup>;
  hourCap: number;
  usage: { today: number; hour: number };
  stats: { sent: number; failed: number; replied: number; optOut: number; replyRate: number; failRate: number };
};

/** Skor kesehatan nomor blast (0–100) + daftar penyebab/saran. */
export async function senderHealth(sender: BlastSender): Promise<Health> {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const base = { campaign: { senderId: sender.id }, queuedAt: { gte: since } };
  const [byStatus, replied, optOut, usage, running] = await Promise.all([
    prisma.blastRecipient.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.blastRecipient.count({ where: { ...base, repliedAt: { not: null } } }),
    prisma.blastContact.count({ where: { ownerId: sender.userId, optOutAt: { gte: since } } }),
    senderUsage(sender.id, now),
    prisma.blastCampaign.findMany({ where: { senderId: sender.id, status: { in: ["RUNNING", "SCHEDULED"] } }, select: { delayMin: true, batchSize: true, hourStart: true, hourEnd: true } }),
  ]);
  const n = (s: string) => byStatus.find((x) => x.status === s)?._count._all ?? 0;
  const sent = n("SENT") + n("DELIVERED") + n("READ");
  const failed = n("FAILED");
  const replyRate = sent ? replied / sent : 0;
  const failRate = sent + failed ? failed / (sent + failed) : 0;
  const warm = warmup(sender.numberAge, sender.firstConnectedAt, now);
  const hourCap = hourlyCap(warm.cap);
  const linkedDays = warm.day;

  let score = 100;
  const checks: Check[] = [];
  const add = (ok: Check["ok"], label: string, tip: string | undefined, penalty: number) => {
    checks.push({ ok, label, tip });
    if (ok !== true) score -= ok === "warn" ? Math.round(penalty / 2) : penalty;
  };

  if (sender.status === "BANNED") add(false, "WhatsApp menolak nomor ini (diblokir/dibatasi)", "Hentikan blast dari nomor ini. Ajukan banding di aplikasi WhatsApp bila perlu.", 100);
  add(!sender.restricted, sender.restricted ? "WhatsApp sedang membatasi nomor ini (reachout timelock)" : "Tidak ada pembatasan dari WhatsApp", "Semua kampanye otomatis dijeda. Tunggu 24–48 jam dan jangan kirim ke nomor baru.", 45);
  add(sender.numberAge === "LAMA" ? true : sender.numberAge === "SEDANG" ? "warn" : false, `Umur nomor: ${sender.numberAge === "LAMA" ? "> 6 bulan" : sender.numberAge === "SEDANG" ? "1–6 bulan" : "< 1 bulan (baru)"}`, "Nomor lama yang aktif chat lebih dipercaya WhatsApp. Nomor baru wajib warm-up pelan.", 15);
  add(linkedDays > 14 ? true : linkedDays > 3 ? "warn" : false, `${warm.label} (hari ke-${linkedDays} sejak ditautkan) · kuota ${warm.cap}/hari`, "Kuota naik otomatis tiap minggu. Jangan memaksa kirim banyak di minggu pertama.", 10);
  const usePct = Math.max(warm.cap ? usage.today / warm.cap : 0, hourCap ? usage.hour / hourCap : 0);
  add(usePct < 0.8 ? true : usePct < 1 ? "warn" : false, `Pemakaian hari ini ${usage.today}/${warm.cap} pesan · jam ini ${usage.hour}/${hourCap}`, "Mendekati/mencapai batas: kiriman otomatis ditahan lalu dilanjutkan di jam/hari berikutnya.", 10);
  if (sent + failed >= 10)
    add(failRate < 0.1 ? true : failRate < 0.25 ? "warn" : false, `Gagal kirim 7 hari: ${Math.round(failRate * 100)}% (${failed} pesan)`, "Banyak nomor tidak terdaftar WA = sinyal spam. Bersihkan kontak berstatus “Tidak ada WA”.", 30);
  else checks.push({ ok: true, label: "Gagal kirim 7 hari: belum cukup data" });
  if (sent >= 30)
    add(replyRate >= 0.15 ? true : replyRate >= 0.05 ? "warn" : false, `Tingkat balasan 7 hari: ${Math.round(replyRate * 100)}% (${replied} balasan)`, "Balasan tinggi = WhatsApp menilai pesan Anda diinginkan. Ajak penerima membalas (pertanyaan singkat).", 20);
  else checks.push({ ok: true, label: `Tingkat balasan: belum cukup data (${replied} balasan)` });
  add(optOut <= Math.max(2, sent * 0.03) ? true : "warn", `Berhenti berlangganan 7 hari: ${optOut} kontak`, "Banyak yang membalas STOP → targetkan audiens yang lebih relevan.", 15);
  const fast = running.some((c) => c.delayMin < 20 || c.batchSize > 40);
  add(!fast, fast ? "Ada kampanye dengan jeda terlalu cepat (< 20 dtk) / batch terlalu besar" : "Jeda kirim kampanye aktif wajar", "Pakai jeda 30–90 detik dan istirahat tiap 15–25 pesan.", 10);

  score = Math.max(0, Math.min(100, score));
  const level = sender.restricted || sender.status === "BANNED" || score < 50 ? "BERISIKO" : score < 75 ? "WASPADA" : "AMAN";
  return { score, level, checks, warm, hourCap, usage, stats: { sent, failed, replied, optOut, replyRate, failRate } };
}

/* ------------------------------------------------------------------ */
/* Kontrol kampanye                                                    */
/* ------------------------------------------------------------------ */

export async function pauseSenderCampaigns(senderId: number, reason: string) {
  await prisma.blastCampaign.updateMany({ where: { senderId, status: { in: ["RUNNING", "SCHEDULED"] } }, data: { status: "PAUSED", pauseReason: reason.slice(0, 255) } });
}

async function completeIfDone(campaignId: number) {
  const left = await prisma.blastRecipient.count({ where: { campaignId, status: { in: ["PENDING", "QUEUED"] } } });
  if (!left) await prisma.blastCampaign.updateMany({ where: { id: campaignId, status: { in: ["RUNNING", "PAUSED"] } }, data: { status: "COMPLETED", finishedAt: new Date(), pauseReason: null } });
}

/* ------------------------------------------------------------------ */
/* Event dari wa-gateway untuk sesi blast                              */
/* ------------------------------------------------------------------ */

type BlastEvent =
  | { type: "status"; session: string; state: { status: string; phone?: string | null; name?: string | null; lastError?: string | null; restricted?: boolean } }
  | { type: "message"; session: string; message: { fromMe: boolean; phone?: string | null; text?: string; type?: string } }
  | { type: "sent"; session: string; ref: string; id?: string; timestamp?: number }
  | { type: "failed"; session: string; ref: string; error?: string }
  | { type: "ack"; session: string; id: string; status: number };

const STATUSES = new Set(["DISCONNECTED", "CONNECTING", "QR", "PAIRING", "CONNECTED", "RECONNECTING", "LOGGED_OUT", "BANNED", "REPLACED"]);
const ACK_STATUS: Record<number, string> = { 3: "DELIVERED", 4: "READ", 5: "READ" };
const RANK: Record<string, number> = { PENDING: 0, QUEUED: 0, FAILED: 0, SENT: 1, DELIVERED: 2, READ: 3 };
const cut = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));
const recipientRef = (ref: unknown) => {
  const m = /^b(\d{1,10})$/.exec(String(ref ?? ""));
  return m ? Number(m[1]) : null;
};

export async function applyBlastEvent(ev: BlastEvent) {
  const senderId = senderIdFromGateway(ev.session);
  if (!senderId) return false;
  const sender = await prisma.blastSender.findUnique({ where: { id: senderId } });
  if (!sender) return false;

  if (ev.type === "status") {
    const st = ev.state ?? ({} as { status: string });
    if (!STATUSES.has(st.status)) return false;
    const connected = st.status === "CONNECTED";
    await prisma.blastSender.update({
      where: { id: senderId },
      data: {
        status: st.status,
        lastError: cut(st.lastError, 255),
        restricted: !!st.restricted,
        ...(connected
          ? {
              ...(st.phone ? { phone: cut(st.phone, 30) } : {}),
              ...(st.name ? { waName: cut(st.name, 120) } : {}),
              ...(sender.status !== "CONNECTED" ? { connectedAt: new Date() } : {}),
              ...(!sender.firstConnectedAt ? { firstConnectedAt: new Date() } : {}),
            }
          : {}),
      },
    });
    if (st.restricted) await pauseSenderCampaigns(senderId, "Dijeda otomatis: WhatsApp sedang membatasi nomor blast. Tunggu 24–48 jam sebelum melanjutkan.");
    else if (st.status === "BANNED") await pauseSenderCampaigns(senderId, "Dijeda otomatis: WhatsApp menolak nomor blast (kemungkinan diblokir).");
    else if (st.status === "LOGGED_OUT" || st.status === "REPLACED") await pauseSenderCampaigns(senderId, "Dijeda otomatis: nomor blast terputus. Tautkan ulang lalu lanjutkan kampanye.");
    return true;
  }

  if (ev.type === "message") {
    const m = ev.message;
    if (!m || m.fromMe) return true;
    const phone = m.phone && /^\d{6,20}$/.test(m.phone) ? m.phone : null;
    if (!phone) return true;
    const text = String(m.text ?? "");
    const now = new Date();
    await prisma.blastRecipient.updateMany({
      where: { noHp: phone, campaign: { senderId }, sentAt: { gte: new Date(now.getTime() - 30 * 86_400_000) }, repliedAt: null },
      data: { repliedAt: now, replyText: cut(text || `(${m.type ?? "pesan"})`, 255) },
    });
    const optOut = isOptOutReply(text);
    await prisma.blastContact.updateMany({
      where: { ownerId: sender.userId, noHp: phone },
      data: { lastReplyAt: now, ...(optOut ? { optOut: true, optOutAt: now, optOutReason: cut(`Membalas "${text.trim()}"`, 160) } : {}) },
    });
    return true;
  }

  if (ev.type === "sent") {
    const id = recipientRef(ev.ref);
    if (!id) return false;
    const r = await prisma.blastRecipient.findFirst({ where: { id, campaign: { senderId } }, include: { contact: true } });
    if (!r) return false;
    const at = new Date(ev.timestamp ?? Date.now());
    await prisma.blastRecipient.update({
      where: { id },
      data: { waId: cut(ev.id, 100), sentAt: at, error: null, ...((RANK[r.status] ?? 0) < 1 ? { status: "SENT" } : {}) },
    });
    if (r.contact) {
      await prisma.blastContact.update({ where: { id: r.contact.id }, data: { blastCount: { increment: 1 }, lastBlastAt: at, waStatus: "VALID" } });
      await touchDataBlast(r.contact, at).catch((e) => console.error("[blast] data blast", (e as Error).message));
    }
    await completeIfDone(r.campaignId);
    return true;
  }

  if (ev.type === "failed") {
    const id = recipientRef(ev.ref);
    if (!id) return false;
    const r = await prisma.blastRecipient.findFirst({ where: { id, campaign: { senderId } }, select: { id: true, campaignId: true, contactId: true, status: true } });
    if (!r || (RANK[r.status] ?? 0) >= 1) return true;
    const raw = String(ev.error ?? "Gagal terkirim");
    if (raw.startsWith("RETRY:")) {
      // gangguan sementara (cek nomor gagal) → kembalikan ke antrean
      await prisma.blastRecipient.update({ where: { id }, data: { status: "PENDING", queuedAt: null, text: null } });
      return true;
    }
    const notOnWa = raw.startsWith("NOT_ON_WA");
    await prisma.blastRecipient.update({ where: { id }, data: { status: "FAILED", error: cut(notOnWa ? "Nomor tidak terdaftar di WhatsApp" : raw, 255) } });
    if (notOnWa && r.contactId) await prisma.blastContact.update({ where: { id: r.contactId }, data: { waStatus: "INVALID" } }).catch(() => undefined);
    // pengaman: ≥ 40% dari 20 percobaan terakhir gagal → jeda semua kampanye nomor ini
    const recent = await prisma.blastRecipient.findMany({
      where: { campaign: { senderId }, status: { in: ["SENT", "DELIVERED", "READ", "FAILED"] }, queuedAt: { gte: new Date(Date.now() - 3 * 3600_000) } },
      orderBy: { queuedAt: "desc" },
      take: 20,
      select: { status: true, error: true },
    });
    const fails = recent.filter((x) => x.status === "FAILED" && !String(x.error ?? "").startsWith("WhatsApp tidak tersambung")).length;
    if (recent.length >= 10 && fails / recent.length >= 0.4)
      await pauseSenderCampaigns(senderId, `Dijeda otomatis: ${fails} dari ${recent.length} kiriman terakhir gagal (banyak nomor tidak aktif di WA). Bersihkan daftar kontak sebelum melanjutkan.`);
    await completeIfDone(r.campaignId);
    return true;
  }

  if (ev.type === "ack") {
    const status = ACK_STATUS[ev.status];
    if (!status || !ev.id) return true;
    const r = await prisma.blastRecipient.findFirst({ where: { waId: String(ev.id).slice(0, 100), campaign: { senderId } }, select: { id: true, status: true } });
    if (r && RANK[status] > (RANK[r.status] ?? 0)) await prisma.blastRecipient.update({ where: { id: r.id }, data: { status } });
    return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Tick: kirim pesan berikutnya                                        */
/* ------------------------------------------------------------------ */

let ticking = false;
const rand = (a: number, b: number) => a + Math.floor(Math.random() * (Math.max(a, b) - a + 1));

export async function runBlastTick() {
  if (ticking) return { busy: true };
  ticking = true;
  let queued = 0;
  try {
    const now = new Date();
    await prisma.blastCampaign.updateMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now } }, data: { status: "RUNNING", startedAt: now } });
    // pesan di antrean gateway tanpa kabar > 10 menit → dianggap gagal
    await prisma.blastRecipient.updateMany({
      where: { status: "QUEUED", queuedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
      data: { status: "FAILED", error: "Tidak ada konfirmasi dari WhatsApp (timeout)." },
    });

    const running = await prisma.blastCampaign.findMany({ where: { status: "RUNNING" }, orderBy: [{ startedAt: "asc" }, { id: "asc" }], include: { sender: true } });
    const doneSenders = new Set<number>();
    for (const c of running) {
      const s = c.sender;
      if (!s) {
        await prisma.blastCampaign.update({ where: { id: c.id }, data: { status: "PAUSED", pauseReason: "Nomor blast tidak ditemukan. Tautkan nomor lalu lanjutkan." } });
        continue;
      }
      if (doneSenders.has(s.id)) continue;
      if (s.status !== "CONNECTED" || s.restricted || (s.nextSendAt && s.nextSendAt > now)) {
        doneSenders.add(s.id);
        continue;
      }
      const inflight = await prisma.blastRecipient.count({ where: { status: "QUEUED", campaign: { senderId: s.id } } });
      if (inflight) {
        doneSenders.add(s.id);
        continue;
      }
      const hour = wibHour(now);
      if (hour < c.hourStart || hour >= c.hourEnd) continue; // di luar jam kirim kampanye ini
      const warm = warmup(s.numberAge, s.firstConnectedAt, now);
      const usage = await senderUsage(s.id, now);
      if (usage.today >= warm.cap || usage.hour >= hourlyCap(warm.cap)) {
        doneSenders.add(s.id);
        continue;
      }
      const campToday = await prisma.blastRecipient.count({ where: { campaignId: c.id, status: { in: ATTEMPTED }, queuedAt: { gte: startOfWibDay(now) } } });
      if (campToday >= c.dailyLimit) continue;

      // penerima berikutnya (lewati yang berhenti berlangganan / tidak ada WA)
      let r = null;
      for (let guard = 0; guard < 200; guard++) {
        const next = await prisma.blastRecipient.findFirst({ where: { campaignId: c.id, status: "PENDING" }, orderBy: { id: "asc" }, include: { contact: true } });
        if (!next) break;
        const skip = next.contact?.optOut ? "Kontak berhenti berlangganan (opt-out)" : next.contact?.waStatus === "INVALID" ? "Nomor tidak terdaftar di WhatsApp" : null;
        if (!skip) {
          r = next;
          break;
        }
        await prisma.blastRecipient.update({ where: { id: next.id }, data: { status: "SKIPPED", error: skip } });
      }
      if (!r) {
        await completeIfDone(c.id);
        continue;
      }

      // kunci nomor: jadwalkan kiriman berikutnya (jeda acak + istirahat per batch)
      let sentInBatch = c.sentInBatch + 1;
      let wait = rand(c.delayMin, c.delayMax) * 1000;
      if (sentInBatch >= c.batchSize) {
        wait += c.batchRestMin * 60_000;
        sentInBatch = 0;
      }
      const lock = await prisma.blastSender.updateMany({
        where: { id: s.id, OR: [{ nextSendAt: null }, { nextSendAt: { lte: now } }] },
        data: { nextSendAt: new Date(now.getTime() + wait) },
      });
      doneSenders.add(s.id);
      if (!lock.count) continue;
      await prisma.blastCampaign.update({ where: { id: c.id }, data: { sentInBatch } });

      const text = renderMessage(c.message, r.contact ?? { nama: r.nama });
      await prisma.blastRecipient.update({ where: { id: r.id }, data: { status: "QUEUED", text, queuedAt: now, error: null } });
      const img = await readBlastImage(c.imageFile);
      const g = await gateway(`/sessions/${blastGatewayId(s.id)}/send`, {
        jid: `${r.noHp}@s.whatsapp.net`,
        text,
        ref: `b${r.id}`,
        checkNumber: true,
        ...(img ? { image: { data: img.buf.toString("base64"), mime: img.mime } } : {}),
      });
      if (!g.ok) {
        if ([429, 409, 503].includes(g.status)) {
          // batas gateway / belum tersambung → coba lagi beberapa menit lagi
          await prisma.blastRecipient.update({ where: { id: r.id }, data: { status: "PENDING", queuedAt: null, text: null } });
          await prisma.blastSender.update({ where: { id: s.id }, data: { nextSendAt: new Date(now.getTime() + 3 * 60_000) } });
        } else {
          await prisma.blastRecipient.update({ where: { id: r.id }, data: { status: "FAILED", error: cut(g.data.error ?? `Gagal (HTTP ${g.status})`, 255) } });
        }
        continue;
      }
      queued++;
    }
  } catch (e) {
    console.error("[blast-tick]", (e as Error).message);
  } finally {
    ticking = false;
  }
  return { queued };
}

/* ------------------------------------------------------------------ */
/* Audiens kampanye                                                    */
/* ------------------------------------------------------------------ */

export type AudienceFilter = { label: string; jenjang: string; provinsi: string; kota: string; sekolah: string; status: string; notBlastedDays: number; ids: number[] };

export function audienceWhere(ownerId: number, f: AudienceFilter): Prisma.BlastContactWhereInput {
  return {
    AND: [
      { ownerId, optOut: false, NOT: { waStatus: "INVALID" } },
      ...(f.ids.length ? [{ id: { in: f.ids } }] : []),
      ...(f.label ? [{ labels: { contains: `,${f.label},` } }] : []),
      ...(f.jenjang ? [{ jenjang: f.jenjang }] : []),
      ...(f.provinsi ? [{ provinsi: f.provinsi }] : []),
      ...(f.kota ? [{ kota: { contains: f.kota } }] : []),
      ...(f.sekolah ? [{ sekolah: { contains: f.sekolah } }] : []),
      ...(f.status === "never" ? [{ lastBlastAt: null }] : f.status === "replied" ? [{ lastReplyAt: { not: null } }] : []),
      ...(f.notBlastedDays > 0 ? [{ OR: [{ lastBlastAt: null }, { lastBlastAt: { lt: new Date(Date.now() - f.notBlastedDays * 86_400_000) } }] }] : []),
    ],
  };
}

export const isUniqueError = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

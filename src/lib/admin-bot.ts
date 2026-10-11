import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { groqJson } from "./groq";
import { WA_AI_FOOTER } from "./wa-shared";

/**
 * "Klon AI" admin: mempelajari SELURUH chat WhatsApp seorang admin (bukan grup, hanya teks) secara bertahap.
 * Tiap langkah (analyzeStep) mengambil pesan yang belum dipelajari, lalu AI mengekstrak:
 *  - QA   : pertanyaan customer (dikelompokkan per kategori) + jawaban admin sebagai contoh
 *  - FACT : informasi yang disampaikan admin (jadwal, harga, kebijakan, promo, dll.)
 *  - catatan gaya bahasa → dirangkum menjadi profil gaya (persona) setelah semua chat selesai
 * Penanda kemajuan disimpan per chat (wa_chats.aiAnalyzedMsgId) → persentase bisa dihitung kapan saja,
 * dan chat baru yang masuk setelah analisis terakhir otomatis menurunkan persentase.
 */

export type Persona = {
  ringkasan: string;
  sapaan: string;
  sebutanDiri: string;
  nada: string[];
  emoji: string;
  pembuka: string[];
  penutup: string[];
  kebiasaan: string[];
  contoh: string[];
  /** jumlah pesan teranalisis saat persona dibuat (untuk tahu kapan perlu dirangkum ulang) */
  basedOn?: number;
};

const BATCH_CHARS = 5200; // transkrip per permintaan AI (muat di kuota token per menit Groq)
const MAX_MSG_CHARS = 700;
const NOTES_MAX = 7000;
const MAX_MEMORIES = 1200;
const ANSWER_MAX = 600; // panjang contoh jawaban yang dikirim ke AI saat menjawab

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const words = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length >= 3));
const clean = (s: string | null) => (s ?? "").replace(WA_AI_FOOTER, "").replace(/\s+\n/g, "\n").trim();

/* ======================= Statistik & kemajuan ======================= */

export type BotStats = {
  botId: number | null;
  enabled: boolean;
  hasPersona: boolean;
  total: number;
  analyzed: number;
  pending: number;
  percent: number;
  chats: number;
  chatsPending: number;
  adminMessages: number;
  lastAnalyzedAt: Date | null;
  qa: number;
  facts: number;
};

export async function botStats(accountId: number): Promise<BotStats> {
  const [row] = await prisma.$queryRaw<{ total: bigint; analyzed: bigint; chats: bigint; chatsPending: bigint; adminMessages: bigint }[]>(Prisma.sql`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(m.id <= c.aiAnalyzedMsgId), 0) AS analyzed,
           COUNT(DISTINCT c.id) AS chats,
           COUNT(DISTINCT CASE WHEN m.id > c.aiAnalyzedMsgId THEN c.id END) AS chatsPending,
           COALESCE(SUM(m.fromMe = 1 AND m.byAi = 0), 0) AS adminMessages
    FROM wa_messages m JOIN wa_chats c ON c.id = m.chatId
    WHERE c.accountId = ${accountId} AND c.isGroup = 0 AND m.type = 'text' AND m.body IS NOT NULL AND m.body <> ''`);
  const bot = await prisma.adminBot.findUnique({ where: { accountId }, select: { id: true, enabled: true, persona: true, lastAnalyzedAt: true } });
  const counts = bot ? await prisma.adminBotMemory.groupBy({ by: ["kind"], where: { botId: bot.id }, _count: { _all: true } }) : [];
  const total = Number(row?.total ?? 0);
  const analyzed = Number(row?.analyzed ?? 0);
  return {
    botId: bot?.id ?? null,
    enabled: bot?.enabled ?? true,
    hasPersona: !!bot?.persona,
    total,
    analyzed,
    pending: total - analyzed,
    percent: total ? Math.floor((analyzed / total) * 100) : 0,
    chats: Number(row?.chats ?? 0),
    chatsPending: Number(row?.chatsPending ?? 0),
    adminMessages: Number(row?.adminMessages ?? 0),
    lastAnalyzedAt: bot?.lastAnalyzedAt ?? null,
    qa: counts.find((c) => c.kind === "QA")?._count._all ?? 0,
    facts: counts.find((c) => c.kind === "FACT")?._count._all ?? 0,
  };
}

/* ======================= Analisis bertahap ======================= */

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["qa", "info", "gaya"],
  properties: {
    qa: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["chat", "kategori", "pertanyaan", "jawaban", "kategoriJawaban"],
        properties: {
          chat: { type: "integer" },
          kategori: { type: "string" },
          pertanyaan: { type: "string" },
          jawaban: { type: "string" },
          kategoriJawaban: { type: "string" },
        },
      },
    },
    info: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["topik", "isi"], properties: { topik: { type: "string" }, isi: { type: "string" } } },
    },
    gaya: { type: "array", items: { type: "string" } },
  },
};

function extractPrompt(adminName: string, categories: string[], answerCategories: string[]) {
  return `Kamu menganalisis transkrip chat WhatsApp antara ADMIN "${adminName}" (layanan pelanggan Pelatihan POSI — kelas olimpiade/COC, VIP Privat, Mimpi.mu) dan para customer.
Tanda di transkrip: [C] = customer, [A] = admin (INI yang dipelajari), [AI] = balasan otomatis AI lama (JANGAN dipelajari gayanya, abaikan isinya).
Baris bertanda "(konteks)" hanya untuk memahami alur — jangan diekstrak ulang.

Ekstrak menjadi JSON:
1. "qa": pasangan pertanyaan/permintaan customer + jawaban admin yang benar-benar menjawabnya.
   - "chat": nomor chat sumber (angka setelah "### Chat").
   - "kategori": kategori pertanyaan, 2–4 kata, Title Case, umum & bisa dipakai ulang (mis. "Jadwal Kelas", "Biaya & Pembayaran", "Cara Daftar", "Akses Akun", "Info Program COC", "Konfirmasi Pembayaran", "Sertifikat", "Kendala Teknis"). ${categories.length ? `Pakai kategori yang sudah ada bila cocok: ${categories.join(", ")}.` : ""}
   - "pertanyaan": pertanyaan customer dirumuskan singkat & umum (tanpa nama orang/nomor HP/email).
   - "jawaban": jawaban admin APA ADANYA dengan gaya bahasanya (emoji, sapaan, singkatan khasnya) — boleh digabung bila admin menjawab dalam beberapa pesan beruntun. Ganti nama customer dengan {nama}; hapus nomor HP, email, dan kode pendaftaran pribadi.
   - "kategoriJawaban": jenis respons admin, 2–4 kata (mis. "Menjelaskan Jadwal", "Memberi Harga", "Mengarahkan Daftar", "Konfirmasi Data", "Menenangkan Customer", "Follow Up"). ${answerCategories.length ? `Pakai yang sudah ada bila cocok: ${answerCategories.join(", ")}.` : ""}
   - Lewati basa-basi murni (salam, "ok", "terima kasih") dan pertanyaan yang tidak dijawab admin.
2. "info": fakta/informasi layanan yang disampaikan admin dan berguna untuk menjawab customer lain (jadwal, tanggal mulai, harga, promo, syarat, kebijakan, alur, link). "topik" 2–4 kata; "isi" 1–2 kalimat lengkap & berdiri sendiri, sebutkan nama kelas/programnya. Jangan masukkan data pribadi customer.
3. "gaya": 2–5 catatan singkat tentang gaya bahasa admin di transkrip ini (sapaan yang dipakai, sebutan diri, emoji favorit, panjang kalimat, kata khas, cara membuka/menutup, tingkat formalitas). Kosongkan bila tidak ada pesan [A].

Jangan mengarang. Bila tidak ada yang layak diekstrak, kembalikan array kosong.`;
}

type Pending = { id: number; chatId: number; fromMe: boolean; byAi: boolean; body: string; timestamp: Date };

/** Satu langkah analisis (±1 permintaan AI). Panggil berulang sampai `done`. */
export async function analyzeStep(accountId: number): Promise<{ done: boolean; learned: { qa: number; facts: number }; stats: BotStats }> {
  const account = await prisma.waAccount.findUnique({ where: { id: accountId }, select: { id: true, user: { select: { name: true } } } });
  if (!account) throw new Error("Akun WhatsApp tidak ditemukan.");
  const bot = await prisma.adminBot.upsert({ where: { accountId }, create: { accountId }, update: {} });

  // chat yang punya pesan belum dipelajari (yang paling lama menunggu dulu)
  const queue = await prisma.$queryRaw<{ id: number; aiAnalyzedMsgId: number }[]>(Prisma.sql`
    SELECT c.id, c.aiAnalyzedMsgId
    FROM wa_chats c JOIN wa_messages m ON m.chatId = c.id AND m.id > c.aiAnalyzedMsgId AND m.type = 'text' AND m.body IS NOT NULL AND m.body <> ''
    WHERE c.accountId = ${accountId} AND c.isGroup = 0
    GROUP BY c.id, c.aiAnalyzedMsgId ORDER BY MIN(m.id) ASC LIMIT 25`);

  const learned = { qa: 0, facts: 0 };
  if (!queue.length) {
    await maybeBuildPersona(bot.id, accountId, account.user.name);
    return { done: true, learned, stats: await botStats(accountId) };
  }

  // susun batch transkrip sampai batas karakter
  const marks = new Map<number, number>(); // chatId → id pesan terakhir yang ikut batch
  const dates = new Map<number, Date>();
  let transcript = "";
  let hasAdmin = false;
  for (const c of queue) {
    if (transcript.length >= BATCH_CHARS) break;
    const rows = (await prisma.waMessage.findMany({
      where: { chatId: c.id, id: { gt: c.aiAnalyzedMsgId }, type: "text" },
      orderBy: { id: "asc" },
      take: 120,
      select: { id: true, chatId: true, fromMe: true, byAi: true, body: true, timestamp: true },
    })) as Pending[];
    const lines: string[] = [];
    let last = 0;
    let adminHere = false;
    for (const m of rows) {
      const body = clean(m.body).slice(0, MAX_MSG_CHARS);
      const line = `${m.fromMe ? (m.byAi ? "[AI]" : "[A]") : "[C]"} ${body}`;
      if (lines.length && transcript.length + lines.join("\n").length + line.length > BATCH_CHARS) break;
      if (body) lines.push(line);
      if (m.fromMe && !m.byAi && body) adminHere = true;
      last = m.id;
      dates.set(c.id, m.timestamp);
    }
    if (!last) continue;
    marks.set(c.id, last);
    // chat tanpa pesan admin tidak perlu dikirim ke AI (tidak ada yang bisa dipelajari) → cukup ditandai selesai
    if (!adminHere) continue;
    hasAdmin = true;
    const ctx = c.aiAnalyzedMsgId
      ? (
          await prisma.waMessage.findMany({ where: { chatId: c.id, id: { lte: c.aiAnalyzedMsgId }, type: "text" }, orderBy: { id: "desc" }, take: 3, select: { fromMe: true, byAi: true, body: true } })
        )
          .reverse()
          .map((m) => `(konteks) ${m.fromMe ? (m.byAi ? "[AI]" : "[A]") : "[C]"} ${clean(m.body).slice(0, 240)}`)
      : [];
    transcript += `\n### Chat ${c.id}\n${[...ctx, ...lines].join("\n")}\n`;
  }

  if (hasAdmin) {
    const existing = await prisma.adminBotMemory.findMany({ where: { botId: bot.id }, select: { id: true, kind: true, category: true, question: true, answer: true, answerCategory: true } });
    const cats = [...new Set(existing.filter((e) => e.kind === "QA").map((e) => e.category))].slice(0, 40);
    const aCats = [...new Set(existing.map((e) => e.answerCategory).filter((x): x is string => !!x))].slice(0, 30);
    type Out = { qa: { chat: number; kategori: string; pertanyaan: string; jawaban: string; kategoriJawaban: string }[]; info: { topik: string; isi: string }[]; gaya: string[] };
    const out = await groqJson<Out>(
      [
        { role: "system", content: extractPrompt(account.user.name, cats, aCats) },
        { role: "user", content: transcript.trim() },
      ],
      "analisis_chat",
      EXTRACT_SCHEMA,
      { temperature: 0.2, reasoningEffort: "low", maxTokens: 3500, timeoutMs: 60_000 },
    );

    const title = (s: string) => s.trim().replace(/\s+/g, " ").slice(0, 80) || "Lainnya";
    const byQ = new Map(existing.filter((e) => e.kind === "QA").map((e) => [norm(e.question ?? ""), e]));
    const byFact = new Set(existing.filter((e) => e.kind === "FACT").map((e) => norm(e.answer)));
    let room = MAX_MEMORIES - existing.length;
    for (const q of out.qa ?? []) {
      const question = String(q.pertanyaan ?? "").trim().slice(0, 500);
      const answer = String(q.jawaban ?? "").trim().slice(0, 2500);
      if (question.length < 4 || answer.length < 2) continue;
      const chatId = marks.has(Number(q.chat)) ? Number(q.chat) : null;
      const learnedAt = (chatId && dates.get(chatId)) || new Date();
      const dup = byQ.get(norm(question));
      if (dup) {
        // pertanyaan sama muncul lagi → tambah hitungan; jawaban terbaru (biasanya paling relevan) yang disimpan
        await prisma.adminBotMemory.update({ where: { id: dup.id }, data: { hits: { increment: 1 }, answer, learnedAt, answerCategory: title(q.kategoriJawaban) } });
      } else if (room > 0) {
        const row = await prisma.adminBotMemory.create({
          data: { botId: bot.id, kind: "QA", category: title(q.kategori), question, answer, answerCategory: title(q.kategoriJawaban), sourceChatId: chatId, learnedAt },
        });
        byQ.set(norm(question), { ...row });
        room--;
        learned.qa++;
      }
    }
    for (const f of out.info ?? []) {
      const answer = String(f.isi ?? "").trim().slice(0, 800);
      if (answer.length < 12 || byFact.has(norm(answer)) || room <= 0) continue;
      const anyChat = [...marks.keys()][0];
      await prisma.adminBotMemory.create({ data: { botId: bot.id, kind: "FACT", category: title(f.topik), answer, learnedAt: dates.get(anyChat) ?? new Date() } });
      byFact.add(norm(answer));
      room--;
      learned.facts++;
    }
    const notes = (out.gaya ?? []).map((g) => `- ${String(g).trim().slice(0, 220)}`).filter((g) => g.length > 4);
    if (notes.length) {
      const all = `${bot.styleNotes ?? ""}\n${notes.join("\n")}`.trim();
      await prisma.adminBot.update({ where: { id: bot.id }, data: { styleNotes: all.length > NOTES_MAX ? all.slice(all.length - NOTES_MAX) : all } });
    }
  }

  // tandai pesan-pesan batch ini sudah dipelajari
  await prisma.$transaction([...marks].map(([id, last]) => prisma.waChat.update({ where: { id }, data: { aiAnalyzedMsgId: last } })));
  await prisma.adminBot.update({ where: { id: bot.id }, data: { lastAnalyzedAt: new Date() } });

  const stats = await botStats(accountId);
  if (stats.pending === 0) await maybeBuildPersona(bot.id, accountId, account.user.name);
  return { done: stats.pending === 0, learned, stats: stats.pending === 0 ? await botStats(accountId) : stats };
}

/* ======================= Profil gaya bahasa (persona) ======================= */

const PERSONA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ringkasan", "sapaan", "sebutanDiri", "nada", "emoji", "pembuka", "penutup", "kebiasaan", "contoh"],
  properties: {
    ringkasan: { type: "string" },
    sapaan: { type: "string" },
    sebutanDiri: { type: "string" },
    nada: { type: "array", items: { type: "string" } },
    emoji: { type: "string" },
    pembuka: { type: "array", items: { type: "string" } },
    penutup: { type: "array", items: { type: "string" } },
    kebiasaan: { type: "array", items: { type: "string" } },
    contoh: { type: "array", items: { type: "string" } },
  },
};

/** Rangkum gaya bahasa admin bila belum ada / sudah ada chat baru yang dipelajari sejak rangkuman terakhir */
async function maybeBuildPersona(botId: number, accountId: number, adminName: string) {
  const bot = await prisma.adminBot.findUnique({ where: { id: botId }, select: { persona: true, styleNotes: true } });
  const stats = await botStats(accountId);
  const current = bot?.persona as Persona | null;
  if (!stats.adminMessages || (current && current.basedOn === stats.analyzed)) return;
  // contoh pesan asli admin: campuran terbaru & acak, panjang sedang
  const samples = await prisma.$queryRaw<{ body: string }[]>(Prisma.sql`
    SELECT m.body FROM wa_messages m JOIN wa_chats c ON c.id = m.chatId
    WHERE c.accountId = ${accountId} AND c.isGroup = 0 AND m.type = 'text' AND m.fromMe = 1 AND m.byAi = 0 AND CHAR_LENGTH(m.body) BETWEEN 25 AND 500
    ORDER BY RAND() LIMIT 45`);
  if (!samples.length) return;
  const persona = await groqJson<Persona>(
    [
      {
        role: "system",
        content: `Kamu merangkum GAYA BAHASA admin layanan pelanggan bernama "${adminName}" dari catatan analisis dan contoh pesan WhatsApp aslinya, supaya AI bisa membalas chat persis seperti dia.
Isi JSON:
- "ringkasan": 2–3 kalimat karakter & nada bicaranya.
- "sapaan": cara ia menyapa customer (mis. "Kak", "kak + nama", "Bunda").
- "sebutanDiri": cara ia menyebut diri (mis. "kami", "aku", "admin", atau tidak menyebut).
- "nada": 3–6 kata sifat gaya (mis. "ramah", "ringkas", "santai", "sigap").
- "emoji": emoji yang sering ia pakai + seberapa sering (mis. "🙏😊 hampir di tiap pesan" / "jarang pakai emoji").
- "pembuka": 3–5 kalimat/pola pembuka khasnya (asli dari contoh).
- "penutup": 3–5 kalimat/pola penutup khasnya (asli dari contoh).
- "kebiasaan": 4–8 kebiasaan menulis (panjang pesan, singkatan khas, huruf kapital, tanda baca, cara menjelaskan langkah, cara menolak/menunda dengan sopan).
- "contoh": 6–10 kalimat ASLI admin yang paling mewakili gayanya (salin dari contoh). WAJIB ganti setiap nama orang/customer dengan {nama} dan hapus nomor HP/email.
- Di "pembuka"/"penutup" juga: nama orang diganti {nama}.
Jangan mengarang gaya yang tidak terlihat di data.`,
      },
      { role: "user", content: `CATATAN ANALISIS:\n${(bot?.styleNotes ?? "").slice(-3500) || "(belum ada)"}\n\nCONTOH PESAN ASLI ADMIN:\n${samples.map((s) => `• ${clean(s.body).slice(0, 380)}`).join("\n").slice(0, 7000)}` },
    ],
    "persona_admin",
    PERSONA_SCHEMA,
    { temperature: 0.3, reasoningEffort: "low", maxTokens: 2200, timeoutMs: 60_000 },
  );
  await prisma.adminBot.update({ where: { id: botId }, data: { persona: { ...persona, basedOn: stats.analyzed } as unknown as Prisma.InputJsonValue } });
}

/* ======================= Konteks untuk menjawab ======================= */

export type CloneContext = { adminName: string; persona: Persona; memory: string; percent: number };

/** Gaya + ingatan klon AI untuk menjawab `query` (null bila admin belum punya klon / dimatikan) */
export async function cloneFor(accountId: number, query: string, opts: { ignoreEnabled?: boolean } = {}): Promise<CloneContext | null> {
  const bot = await prisma.adminBot.findUnique({
    where: { accountId },
    select: { id: true, enabled: true, persona: true, account: { select: { user: { select: { name: true } } } } },
  });
  if (!bot?.persona || (!bot.enabled && !opts.ignoreEnabled)) return null;
  const rows = await prisma.adminBotMemory.findMany({ where: { botId: bot.id }, select: { kind: true, category: true, question: true, answer: true, hits: true, learnedAt: true } });
  const q = words(query);
  const scored = rows
    .map((r) => {
      const w = words(`${r.category} ${r.question ?? ""} ${r.kind === "FACT" ? r.answer : ""}`);
      let score = 0;
      q.forEach((t) => w.has(t) && score++);
      return { r, score: score * 10 + Math.min(r.hits, 5) + r.learnedAt.getTime() / 1e13 };
    })
    .sort((a, b) => b.score - a.score);
  const pick = (kind: string, budget: number, max: number) => {
    const out: typeof rows = [];
    let used = 0;
    for (const { r } of scored) {
      if (r.kind !== kind || out.length >= max) continue;
      const len = (r.question?.length ?? 0) + Math.min(r.answer.length, ANSWER_MAX);
      if (used + len > budget) continue;
      out.push(r);
      used += len;
    }
    return out;
  };
  const day = (d: Date) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(d);
  // hemat token (kuota gratis Groq ±8.000 token/menit per model): hanya ingatan paling relevan
  const qa = pick("QA", 3000, 8);
  const facts = pick("FACT", 1500, 12);
  const memory = [
    facts.length ? `## Informasi yang pernah disampaikan admin\n${facts.map((f) => `- [${f.category} · ${day(f.learnedAt)}] ${f.answer}`).join("\n")}` : "",
    qa.length ? `## Contoh tanya-jawab admin (tiru cara & gaya menjawabnya)\n${qa.map((r) => `### [${r.category}] ${r.question}\nJawaban admin: ${r.answer.slice(0, ANSWER_MAX)}`).join("\n\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const stats = await botStats(accountId);
  return { adminName: bot.account.user.name, persona: bot.persona as unknown as Persona, memory, percent: stats.percent };
}

/** Hapus semua hasil belajar (mulai dari nol) */
export async function resetBot(accountId: number) {
  await prisma.$transaction([
    prisma.adminBot.deleteMany({ where: { accountId } }),
    prisma.waChat.updateMany({ where: { accountId }, data: { aiAnalyzedMsgId: 0 } }),
  ]);
}

import { prisma } from "@/lib/prisma";
import { getSession, type SessionPayload } from "@/lib/session";
import { canChat, canMonitor, crossSite, json } from "@/lib/wa";
import { guardRoute } from "@/lib/security";
import { GroqError, groqConfigured } from "@/lib/groq";
import { analyzeStep, botStats, cloneFor, resetBot } from "@/lib/admin-bot";
import { askWaChatbot } from "@/lib/chatbot";
import { toWhatsApp } from "@/lib/wa-autoreply";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Akun WA yang dituju: milik sendiri (admin) atau ?account=… (Root/Superadmin memantau). `write` = hanya pemilik atau Root. */
async function target(session: SessionPayload, accountParam: unknown, write: boolean) {
  const id = Number(accountParam);
  if (canChat(session.role)) {
    const own = await prisma.waAccount.findUnique({ where: { userId: session.userId } });
    if (own && (!id || id === own.id)) return own;
    return null;
  }
  if (!canMonitor(session.role) || (write && session.role !== "ROOT")) return null;
  return Number.isInteger(id) && id > 0 ? prisma.waAccount.findUnique({ where: { id } }) : null;
}

/** Kemajuan analisis klon AI */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return json({ error: "Tidak diizinkan." }, 403);
  const account = await target(session, new URL(request.url).searchParams.get("account"), false);
  if (!account) return json({ stats: null });
  return json({ stats: await botStats(account.id), aiConfigured: groqConfigured() });
}

/**
 * { action: "step" }                       → satu langkah analisis (dipanggil berulang oleh layar sampai selesai)
 * { action: "toggle", enabled }            → pakai / jangan pakai klon untuk auto-balas & saran
 * { action: "reset" }                      → hapus semua hasil belajar
 * { action: "forget", memoryId }           → hapus satu ingatan yang keliru
 * { action: "test", messages: [{role,content}] } → uji percakapan dengan klon (tidak mengirim apa pun ke WhatsApp)
 */
export async function POST(request: Request) {
  if (crossSite(request)) return json({ error: "Permintaan ditolak." }, 403);
  const session = await getSession();
  if (!session) return json({ error: "Tidak diizinkan." }, 403);
  const b = (await request.json().catch(() => ({}))) as {
    action?: string;
    account?: number;
    enabled?: boolean;
    memoryId?: number;
    messages?: { role: string; content: string }[];
  };
  const isTest = b.action === "test";
  const account = await target(session, b.account, !isTest);
  if (!account) return json({ error: isTest ? "Akun WhatsApp tidak ditemukan." : "Hanya pemilik nomor (atau Root) yang bisa mengubah klon AI ini." }, 403);

  try {
    if (b.action === "step") {
      const limited = guardRoute(`wa-bot-step:${account.id}`, 40, 60_000);
      if (limited) return limited;
      if (!groqConfigured()) return json({ error: "AI belum aktif di server (GROQ_API_KEY belum diisi)." }, 400);
      return json({ ok: true, ...(await analyzeStep(account.id)) });
    }
    if (b.action === "toggle") {
      await prisma.adminBot.updateMany({ where: { accountId: account.id }, data: { enabled: !!b.enabled } });
      return json({ ok: true, stats: await botStats(account.id) });
    }
    if (b.action === "reset") {
      await resetBot(account.id);
      return json({ ok: true, stats: await botStats(account.id) });
    }
    if (b.action === "forget") {
      const r = await prisma.adminBotMemory.deleteMany({ where: { id: Number(b.memoryId), bot: { accountId: account.id } } });
      return r.count ? json({ ok: true }) : json({ error: "Ingatan tidak ditemukan." }, 404);
    }
    if (isTest) {
      const limited = guardRoute(`wa-bot-test:${session.userId}`, 12, 60_000);
      if (limited) return limited;
      const history = (b.messages ?? [])
        .filter((m) => (m.role === "user" || m.role === "assistant") && String(m.content ?? "").trim())
        .slice(-12)
        .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 1500) }));
      while (history.length && history[0].role === "assistant") history.shift();
      if (!history.length || history[history.length - 1].role !== "user") return json({ error: "Tulis pertanyaan dulu." }, 400);
      const query = history.filter((m) => m.role === "user").slice(-3).map((m) => m.content).join(" ");
      const clone = await cloneFor(account.id, query, { ignoreEnabled: true });
      if (!clone) return json({ error: "Klon AI belum punya profil gaya — jalankan “Analisis chat” dulu." }, 400);
      const r = await askWaChatbot(history, undefined, clone);
      return json({ ok: true, reply: toWhatsApp(r.reply), answered: r.answered, grounded: r.grounded, why: r.why ?? null, handoff: r.handoff });
    }
  } catch (e) {
    const msg = e instanceof GroqError ? e.message : "Terjadi kesalahan saat memproses AI. Coba lagi.";
    if (!(e instanceof GroqError)) console.error("[admin-bot]", (e as Error).message);
    return json({ error: msg, retry: true }, 502);
  }
  return json({ error: "Permintaan tidak valid." }, 400);
}

import "server-only";

/**
 * Klien kecil Groq (API kompatibel OpenAI) dengan keluaran JSON terstruktur.
 * Kuota gratis Groq dihitung per model (mis. 8.000 token/menit), jadi permintaan dirotasi ke beberapa model:
 * model yang baru kena limit "diistirahatkan" sampai kuotanya pulih, lalu model berikutnya dipakai.
 */

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_FALLBACKS = ["openai/gpt-oss-20b", "qwen/qwen3.8-27b"];

export class GroqError extends Error {}

export const groqConfigured = () => Boolean(process.env.GROQ_API_KEY);

export type GroqMessage = { role: "system" | "user" | "assistant"; content: string };
type Message = GroqMessage;
export type GroqOptions = { timeoutMs?: number; temperature?: number; reasoningEffort?: "low" | "medium" | "high"; maxTokens?: number };

/** model → waktu (ms) kuotanya diperkirakan pulih */
const cooldown = new Map<string, number>();

function models() {
  const primary = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const extra = (process.env.GROQ_FALLBACK_MODELS ?? DEFAULT_FALLBACKS.join(","))
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...extra])];
}

async function call(model: string, messages: Message[], schemaName: string, schema: object, opts: Required<GroqOptions>) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature,
      max_completion_tokens: opts.maxTokens,
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: opts.reasoningEffort } : {}),
      response_format: { type: "json_schema", json_schema: { name: schemaName, strict: true, schema } },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string; code?: string };
  } | null;
  // lama tunggu dari header / pesan limit ("Please try again in 28.2s")
  const retryAfter = Number(res.headers.get("retry-after")) || Number(body?.error?.message?.match(/try again in ([\d.]+)s/)?.[1]) || 0;
  return { ok: res.ok, status: res.status, body, retryAfter };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Kirim prompt → objek JSON sesuai schema, dengan rotasi model saat kena limit / gangguan. */
export async function groqJson<T>(messages: Message[], schemaName: string, schema: object, options: GroqOptions = {}): Promise<T> {
  const opts: Required<GroqOptions> = { timeoutMs: 90_000, temperature: 0.7, reasoningEffort: "medium", maxTokens: 12000, ...options };
  if (!groqConfigured()) throw new GroqError("GROQ_API_KEY belum diisi di .env server.");

  let last: Awaited<ReturnType<typeof call>> | null = null;
  for (let round = 0; round < 2; round++) {
    const now = Date.now();
    // model yang tidak sedang istirahat didahulukan (urutan prioritas tetap)
    const list = models().sort((a, b) => Number((cooldown.get(a) ?? 0) > now) - Number((cooldown.get(b) ?? 0) > now));
    for (const model of list) {
      if ((cooldown.get(model) ?? 0) > Date.now()) continue;
      try {
        last = await call(model, messages, schemaName, schema, opts);
      } catch (e) {
        if ((e as Error).name === "TimeoutError") throw new GroqError("AI terlalu lama merespons. Coba lagi sebentar lagi.");
        throw new GroqError("Tidak bisa terhubung ke layanan AI (Groq). Periksa koneksi server.");
      }
      if (last.ok) {
        const content = last.body?.choices?.[0]?.message?.content;
        try {
          return JSON.parse(content ?? "") as T;
        } catch {
          continue; // keluaran rusak → coba model lain
        }
      }
      if (last.status === 429) cooldown.set(model, Date.now() + Math.max(5, last.retryAfter || 30) * 1000);
      else if (last.status >= 500 || last.status === 404 || last.body?.error?.code === "model_not_found") cooldown.set(model, Date.now() + 60_000);
      // model gagal menyusun JSON sesuai schema (acak, bukan salah permintaan) → coba model berikutnya
      else if (last.status === 400 && /json_validate_failed|failed to generate json/i.test(`${last.body?.error?.code ?? ""} ${last.body?.error?.message ?? ""}`)) continue;
      else break; // 400/401 dsb. → tidak ada gunanya mencoba model lain
    }
    // semua model sedang limit: tunggu sebentar bila pemulihan terdekat cukup cepat
    const soonest = Math.min(...models().map((m) => cooldown.get(m) ?? 0)) - Date.now();
    if (round === 0 && soonest > 0 && soonest <= 8_000) await sleep(soonest + 250);
    else break;
  }

  if (last && !last.ok) console.error("[groq]", last.status, last.body?.error?.message?.slice(0, 200));
  if (last?.status === 401) throw new GroqError("API key Groq tidak valid atau sudah dicabut.");
  if (!last || last.status === 429) throw new GroqError("Kuota/limit Groq sedang penuh. Tunggu sebentar lalu coba lagi.");
  if (last.ok) throw new GroqError("Jawaban AI tidak bisa dibaca. Coba lagi.");
  throw new GroqError(`Layanan AI menolak permintaan (${last.status}). Coba lagi.`);
}

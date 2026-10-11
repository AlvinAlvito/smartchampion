import "server-only";
import { prisma } from "./prisma";
import { normPhone } from "./identity";
import type { WaCustomerTag } from "./wa-shared";

/**
 * Cocokkan chat WA dengan Master Lead lewat nomor WA (dinormalkan ke 62…):
 * nama di daftar chat memakai nama lead, plus kategori customer untuk badge.
 * Daftar chat dipolling tiap beberapa detik → hasilnya di-cache sebentar.
 */

export type LeadTag = { nama: string; tag: Exclude<WaCustomerTag, "BUKAN"> | "BUKAN"; leadId: number };

const TTL_MS = 30_000;
let cache: { at: number; map: Map<string, LeadTag> } | null = null;

const RANK: Record<string, number> = { BUKAN: 0, CALON: 1, BARU: 2, LAMA: 3 };

function tagOf(kategori: string | null): LeadTag["tag"] {
  const k = (kategori ?? "").toLowerCase();
  if (k.includes("lama")) return "LAMA";
  if (k.includes("baru")) return "BARU";
  if (k.includes("calon")) return "CALON";
  return "BUKAN";
}

/** nomor WA (62…) → lead terbaik (kategori tertinggi; bila sama, lead terbaru) */
export async function leadsByPhone() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const rows = await prisma.lead.findMany({ where: { noWa: { not: null } }, select: { id: true, nama: true, noWa: true, kategori: true }, orderBy: { id: "asc" } });
  const map = new Map<string, LeadTag>();
  for (const r of rows) {
    const phone = normPhone(r.noWa);
    if (!phone || !r.nama?.trim()) continue;
    const tag = tagOf(r.kategori);
    const cur = map.get(phone);
    if (!cur || RANK[tag] >= RANK[cur.tag]) map.set(phone, { nama: r.nama.trim(), tag, leadId: r.id });
  }
  cache = { at: Date.now(), map };
  return map;
}

/** Nama & kategori untuk satu chat (chat grup / tanpa nomor → tidak dicocokkan) */
export async function leadForChat(chat: { phone: string | null; isGroup?: boolean }) {
  if (chat.isGroup) return null;
  const phone = normPhone(chat.phone);
  return phone ? ((await leadsByPhone()).get(phone) ?? null) : null;
}

/** Nomor-nomor lead yang namanya cocok dengan kata kunci (untuk pencarian daftar chat) */
export async function phonesOfLeadsNamed(q: string, limit = 60) {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const out: string[] = [];
  for (const [phone, l] of await leadsByPhone()) {
    if (l.nama.toLowerCase().includes(needle)) out.push(phone);
    if (out.length >= limit) break;
  }
  return out;
}

import "server-only";
import snapshot from "@/data/wilayah.json";

/**
 * Data wilayah Indonesia (provinsi → kabupaten/kota) dari https://wilayah.id
 * (gratis, mengikuti Kepmendagri terbaru: 38 provinsi, 514 kab/kota).
 * Data live di-cache 30 hari; bila API tidak bisa dihubungi, pakai salinan lokal src/data/wilayah.json.
 */

export type Wilayah = { kode: string; nama: string };

const API = "https://wilayah.id/api";
const REVALIDATE = 60 * 60 * 24 * 30;
const KODE = /^\d{2}(\.\d{2})?$/;

async function live(path: string): Promise<Wilayah[] | null> {
  try {
    const res = await fetch(`${API}/${path}`, { next: { revalidate: REVALIDATE }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { code: string; name: string }[] };
    if (!Array.isArray(json.data) || !json.data.length) return null;
    return json.data.map((d) => ({ kode: d.code, nama: d.name }));
  } catch {
    return null;
  }
}

export async function getProvinsi(): Promise<Wilayah[]> {
  return (await live("provinces.json")) ?? snapshot.provinsi.map(({ kode, nama }) => ({ kode, nama }));
}

export async function getKabKota(provinsiKode: string): Promise<Wilayah[]> {
  if (!/^\d{2}$/.test(provinsiKode)) return [];
  return (await live(`regencies/${provinsiKode}.json`)) ?? snapshot.provinsi.find((p) => p.kode === provinsiKode)?.kabKota ?? [];
}

/** Validasi kode pilihan form → nama resmi; null bila tidak valid. */
export async function resolveWilayah(provinsiKode: string, kabKotaKode: string) {
  if (!KODE.test(provinsiKode) || !KODE.test(kabKotaKode) || !kabKotaKode.startsWith(`${provinsiKode}.`)) return null;
  const [prov, kab] = await Promise.all([getProvinsi(), getKabKota(provinsiKode)]);
  const p = prov.find((x) => x.kode === provinsiKode);
  const k = kab.find((x) => x.kode === kabKotaKode);
  return p && k ? { provinsiKode, provinsi: p.nama, kabKotaKode, kabKota: k.nama } : null;
}

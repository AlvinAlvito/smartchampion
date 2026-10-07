/**
 * Aturan tampilan progres kuota kelas (katalog, beranda, detail kelas, chatbot).
 * Angka peserta yang masih sedikit justru membuat calon peserta ragu, jadi defaultnya (AUTO)
 * progres baru ditampilkan setelah ≥ QUOTA_SHOW_MIN peserta lunas. Admin bisa memaksa tampil / sembunyi per kelas.
 */

export const QUOTA_SHOW_MIN = 10;

export const QUOTA_DISPLAY_OPTIONS = [
  { v: "AUTO", l: `Otomatis — tampil bila sudah ≥ ${QUOTA_SHOW_MIN} peserta lunas` },
  { v: "ALWAYS", l: "Selalu tampilkan" },
  { v: "HIDDEN", l: "Sembunyikan" },
] as const;

export const QUOTA_DISPLAY_VALUES = QUOTA_DISPLAY_OPTIONS.map((o) => o.v) as string[];

type QuotaInfo = { paidCount: number; minQuota: number; quotaDisplay?: string | null; type?: string | null };

/** Progres kuota boleh ditampilkan ke publik? (VIP Privat tidak memakai kuota) */
export function quotaVisible(p: QuotaInfo) {
  if (p.type === "PRIVATE" || p.type === "OTHER" || p.quotaDisplay === "HIDDEN") return false;
  if (p.quotaDisplay === "ALWAYS") return true;
  return p.paidCount >= QUOTA_SHOW_MIN;
}

/** Kalimat penyemangat saat progres tampil */
export function quotaHype(p: QuotaInfo): { text: string; tone: "hot" | "star" } | null {
  const left = p.minQuota - p.paidCount;
  if (left <= 0) return { text: "Kelas favorit — yuk ikut bergabung!", tone: "star" };
  if (left <= 5) return { text: "Ayo daftar, kelas sedikit lagi penuh!", tone: "hot" };
  if (p.paidCount >= QUOTA_SHOW_MIN) return { text: "Kelas favorit, sudah banyak yang bergabung!", tone: "star" };
  return null;
}

/** Urutan katalog: paling mendekati/melewati kuota di atas; VIP Privat (tanpa kuota) di akhir */
export function byFillDesc<T extends QuotaInfo & { name: string }>(a: T, b: T) {
  const r = (p: T) => (p.type === "PRIVATE" || p.type === "OTHER" ? -1 : p.paidCount / Math.max(1, p.minQuota));
  return r(b) - r(a) || b.paidCount - a.paidCount || a.name.localeCompare(b.name, "id");
}

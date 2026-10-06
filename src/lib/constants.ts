// Nilai-nilai baku, disamakan dengan Program Kerja & Data Master Lead.xlsx

export const LEAD_SOURCES = [
  "Iklan Web POSI",
  "Blast Email",
  "Blast WA (RFM)",
  "Telepon (RFM)",
  "Bundling POSI",
  "Organic",
  "Lainnya",
] as const;

/** Pilihan "Dapat info dari" di form pendaftaran COC */
export const REGISTRATION_SOURCES = [
  "Iklan Web POSI",
  "Blast Email",
  "Blast WA / Telepon",
  "WhatsApp Admin",
  "Instagram",
  "Tiktok SC",
  "Telegram",
  "Bundling Paket Lengkap",
  "Lainnya",
] as const;

export const LEAD_CATEGORIES = ["Bukan Lead", "Calon Customer", "Customer Baru", "Customer Lama"] as const;

export const LEAD_PRODUCTS = ["Mimpi.mu", "COC", "VIP Privat", "Mimpi.mu & COC", "Olimpiade"] as const;

/** Urutan status funnel (dipakai juga untuk grafik) */
export const FUNNEL_STATUSES = ["Baru", "Dihubungi", "Follow-up", "Trial", "Pending", "Paid", "Lost"] as const;

export const TRIAL_OPTIONS = ["Sudah", "Tidak", "Diarahkan"] as const;

export const PAYMENT_STATUSES = ["Belum Ada", "Pending", "Paid"] as const;

export const JENJANG_LABEL: Record<string, string> = {
  SD: "SD",
  SMP: "SMP",
  SMA: "SMA",
  UMUM: "Umum",
};

export const PRODUCT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  OPEN: "Pendaftaran Dibuka",
  RUNNING: "Kelas Berjalan",
  CLOSED: "Ditutup",
};

export const REG_STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu Pembayaran",
  PAID: "Lunas",
  FAILED: "Gagal",
  EXPIRED: "Kedaluwarsa",
  CANCELLED: "Dibatalkan",
};

export const ROLE_LABEL: Record<string, string> = {
  ROOT: "Root",
  SUPERADMIN: "Superadmin (lihat saja)",
  ADMIN: "Admin Pelatihan",
  SMARTCHAMPION: "Admin SmartChampion",
  PESERTA: "Peserta",
};

/* ---------- Data Blast ---------- */

export const BLAST_CHANNELS = ["WhatsApp", "Email"] as const;

export const BLAST_JENJANG = ["TK", "SD", "SMP", "SMA", "SMK", "Umum"] as const;

export const PROVINSI = [
  "Aceh",
  "Sumatera Utara",
  "Sumatera Barat",
  "Riau",
  "Kepulauan Riau",
  "Jambi",
  "Sumatera Selatan",
  "Kepulauan Bangka Belitung",
  "Bengkulu",
  "Lampung",
  "DKI Jakarta",
  "Jawa Barat",
  "Banten",
  "Jawa Tengah",
  "DI Yogyakarta",
  "Jawa Timur",
  "Bali",
  "Nusa Tenggara Barat",
  "Nusa Tenggara Timur",
  "Kalimantan Barat",
  "Kalimantan Tengah",
  "Kalimantan Selatan",
  "Kalimantan Timur",
  "Kalimantan Utara",
  "Sulawesi Utara",
  "Gorontalo",
  "Sulawesi Tengah",
  "Sulawesi Barat",
  "Sulawesi Selatan",
  "Sulawesi Tenggara",
  "Maluku",
  "Maluku Utara",
  "Papua",
  "Papua Barat",
  "Papua Barat Daya",
  "Papua Tengah",
  "Papua Pegunungan",
  "Papua Selatan",
] as const;

/* ---------- Kelas peserta (bergantung jenjang) ---------- */

const kelasRange = (from: number, to: number, jenjang: string) =>
  Array.from({ length: to - from + 1 }, (_, i) => `Kelas ${from + i} ${jenjang}/sederajat`);

export const KELAS_BY_JENJANG: Record<string, string[]> = {
  SD: kelasRange(1, 6, "SD"),
  SMP: kelasRange(7, 9, "SMP"),
  SMA: kelasRange(10, 12, "SMA"),
  UMUM: ["Mahasiswa", "Guru / pendidik", "Orang tua", "Umum"],
};

/* ---------- Jenis produk ---------- */

export const PRODUCT_TYPE_LABEL: Record<string, string> = {
  COC: "Kelas Grup (COC)",
  PRIVATE: "VIP Privat",
};

/** Nama produk di Master Lead untuk tiap jenis produk (dipakai statistik penjualan). */
export const PRODUCT_TYPE_LEAD: Record<string, string> = { COC: "COC", PRIVATE: "VIP Privat" };

/** Nama sumber di form pendaftaran → nama sumber baku di Master Lead */
export function registrationLeadSource(source: string) {
  if (source === "Blast WA / Telepon") return "Blast WA (RFM)";
  if (source === "Bundling Paket Lengkap") return "Bundling POSI";
  if (["WhatsApp Admin", "Instagram", "Tiktok SC", "Telegram"].includes(source)) return "Organic";
  return source;
}

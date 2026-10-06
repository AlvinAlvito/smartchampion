/** Konstanta Chat WA yang dipakai server & browser. */

export const WA_STATUS_LABEL: Record<string, string> = {
  DISCONNECTED: "Belum terhubung",
  CONNECTING: "Menghubungkan…",
  QR: "Menunggu scan QR",
  PAIRING: "Menunggu kode tautan",
  CONNECTED: "Terhubung",
  RECONNECTING: "Menyambung ulang…",
  LOGGED_OUT: "Terputus",
  BANNED: "Ditolak WhatsApp",
  REPLACED: "Dipakai di tempat lain",
};

export const WA_STATUS_TONE: Record<string, "green" | "yellow" | "red" | "gray" | "blue"> = {
  CONNECTED: "green",
  CONNECTING: "blue",
  QR: "blue",
  PAIRING: "blue",
  RECONNECTING: "yellow",
  DISCONNECTED: "gray",
  LOGGED_OUT: "gray",
  REPLACED: "yellow",
  BANNED: "red",
};

const TYPE_LABEL: Record<string, string> = {
  image: "📷 Foto",
  video: "🎥 Video",
  gif: "GIF",
  document: "📄 Dokumen",
  voice: "🎤 Pesan suara",
  audio: "🎵 Audio",
  sticker: "Stiker",
  location: "📍 Lokasi",
  contact: "👤 Kontak",
  poll: "📊 Polling",
};

/** Teks ringkas untuk daftar chat / isi pesan non-teks */
export function waPreview(type: string, body: string | null | undefined) {
  const text = (body ?? "").trim();
  if (type === "text") return text;
  const label = TYPE_LABEL[type] ?? "Pesan";
  return text ? `${label} · ${text}` : label;
}

/** Format nomor 62812… → +62 812-3456-7890 */
export function formatWaPhone(phone: string | null | undefined) {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (!d.startsWith("62")) return `+${d}`;
  const rest = d.slice(2);
  return `+62 ${rest.slice(0, 3)}-${rest.slice(3, 7)}-${rest.slice(7)}`.replace(/-$/, "");
}

export const WA_MAX_TEXT = 4096;

/* ---------- Auto-balas AI ---------- */

/** Penanda di setiap balasan AI (terkirim ke customer) */
export const WA_AI_FOOTER = "_🤖 Pesan ini dijawab otomatis oleh AI sesuai pengetahuannya._";
/** AI tidak tahu jawabannya → dialihkan ke admin */
export const WA_AI_UNKNOWN = "Wah, untuk yang ini aku cek dulu ke tim ya, Kak 🙏 Sebentar lagi admin kami bantu jawab langsung. Ditunggu sebentar ya 😊";
/** Customer terlihat kesal / jawaban AI dianggap kurang tepat → dialihkan ke admin */
export const WA_AI_APOLOGY = "Mohon maaf ya, Kak, atas ketidaknyamanannya 🙏 Admin kami akan langsung bantu Kakak sebentar lagi.";
/** Pesan bergambar/suara/dokumen → AI tidak bisa membaca */
export const WA_AI_MEDIA = "Terima kasih, Kak, pesannya sudah kami terima 🙏 Admin akan segera cek dan balas ya 😊";

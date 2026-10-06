/** Konfigurasi chatbot yang dipakai server & widget (tanpa rahasia). */

export const BOT_NAME = "Asisten POSI";

export const ADMIN_CONTACTS = [
  { name: "Kak Devia", phone: "6282276994359", url: "https://api.whatsapp.com/send/?phone=6282276994359" },
  { name: "Kak Junhi", phone: "6282319460843", url: "https://api.whatsapp.com/send/?phone=6282319460843" },
] as const;

export const BOT_GREETING =
  "Halo Kak! 👋 Aku **Asisten POSI**, asisten AI dari Pelatihan POSI. Aku bisa bantu info kelas Champion Online Class (COC), harga, jadwal, cara daftar & bayar, sampai Mimpi.mu. Mau tanya apa hari ini?";

export const BOT_SUGGESTIONS = ["Kelas apa saja yang tersedia?", "Berapa biaya kelas COC?", "Cara daftar & bayar", "Apa itu Mimpi.mu?"];

/** Batas pemakaian (melindungi kuota Groq) */
export const CHAT_LIMITS = { messageChars: 600, historyTurns: 12, perWindow: 20, windowMs: 5 * 60_000, perDay: 100, globalPerMinute: 40 } as const;

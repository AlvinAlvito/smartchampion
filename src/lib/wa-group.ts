/** Link undangan grup WhatsApp kelas: hanya https di domain resmi WhatsApp. */
const HOSTS = ["chat.whatsapp.com", "whatsapp.com", "www.whatsapp.com", "wa.me"];

export function parseWaGroupUrl(raw: string): { url: string | null; error?: string } {
  const v = raw.trim();
  if (!v) return { url: null };
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" || !HOSTS.includes(u.hostname.toLowerCase())) throw new Error();
    if (v.length > 500) return { url: null, error: "Link terlalu panjang." };
    return { url: u.toString() };
  } catch {
    return { url: null, error: "Isi dengan link undangan grup WhatsApp, mis. https://chat.whatsapp.com/AbCdEf…" };
  }
}

/** Untuk tampilan: link aman atau null (data lama yang tidak valid tidak ditampilkan) */
export const safeWaGroupUrl = (url: string | null | undefined) => (url ? parseWaGroupUrl(url).url : null);

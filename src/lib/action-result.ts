/** Hasil standar semua server action → selalu ditampilkan sebagai notifikasi (toast) di client. */
export type ActionResult = {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** id data yang baru dibuat (mis. untuk pindah ke halaman detail) */
  id?: number;
  /** URL tujuan setelah sukses (opsional) */
  redirectTo?: string;
};

export type FlashType = "success" | "error" | "info" | "warning";
export const FLASH_COOKIE = "pp_flash";

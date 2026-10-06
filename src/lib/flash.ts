import "server-only";
import { cookies } from "next/headers";
import { FLASH_COOKIE, type FlashType } from "./action-result";

/**
 * Notifikasi untuk aksi yang diakhiri redirect (login, daftar, dll).
 * Cookie dibaca & dihapus oleh <FlashToaster/> di browser setelah halaman berpindah.
 */
export async function setFlash(type: FlashType, message: string) {
  const store = await cookies();
  store.set(FLASH_COOKIE, JSON.stringify({ type, message }), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    httpOnly: false,
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/** Hapus cookie sesi yang sudah tidak sah lalu arahkan ke halaman masuk. */
export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login?expired=1", request.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

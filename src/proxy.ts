import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/* ---------- Pembatas laju global per IP (lapisan aplikasi; nginx tetap lapisan pertama) ---------- */
// Longgar agar satu sekolah di balik satu IP tetap nyaman; cukup untuk menahan banjir bot/DDoS kecil.
const LIMITS = { all: { n: 600, ms: 60_000 }, post: { n: 150, ms: 60_000 } };
const hits = new Map<string, number[]>();
let lastSweep = 0;

function over(key: string, n: number, ms: number, now: number) {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < ms);
  if (arr.length >= n) {
    hits.set(key, arr);
    return true;
  }
  arr.push(now);
  hits.set(key, arr);
  return false;
}

function limited(request: NextRequest) {
  const now = Date.now();
  if (now - lastSweep > 60_000 || hits.size > 50_000) {
    lastSweep = now;
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 60_000) hits.delete(k);
  }
  const ip = (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local").trim();
  if (over(`all:${ip}`, LIMITS.all.n, LIMITS.all.ms, now)) return true;
  return request.method === "POST" && over(`post:${ip}`, LIMITS.post.n, LIMITS.post.ms, now);
}

// Pemeriksaan optimis saja; otorisasi sebenarnya ada di layout & server action.
export async function proxy(request: NextRequest) {
  // event internal wa-gateway (127.0.0.1, tanpa lewat nginx) tidak ikut dibatasi; route-nya sendiri mewajibkan secret
  const internalHook = request.nextUrl.pathname === "/api/wa/hook" && !request.headers.get("x-real-ip");
  if (!internalHook && limited(request)) {
    return new NextResponse("Terlalu banyak permintaan dari jaringan Anda. Tunggu sebentar lalu muat ulang halaman.", {
      status: 429,
      headers: { "Retry-After": "60", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const { pathname } = request.nextUrl;
  const guarded = pathname.startsWith("/admin") || pathname.startsWith("/dashboard") || pathname === "/login" || pathname === "/register";
  if (!guarded) return NextResponse.next();

  const token = request.cookies.get("pp_session")?.value;
  let role: string | null = null;
  if (token && process.env.AUTH_SECRET) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      role = String(payload.role);
    } catch {
      role = null;
    }
  }

  // semua pengguna panel admin (termasuk Admin SmartChampion); pembatasan menu diatur di halaman/aksi
  const isStaff = role === "ROOT" || role === "SUPERADMIN" || role === "ADMIN" || role === "SMARTCHAMPION";

  if ((pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) && !role) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/admin") && !isStaff) return NextResponse.redirect(new URL("/dashboard", request.url));
  if (pathname.startsWith("/dashboard") && isStaff) return NextResponse.redirect(new URL("/admin", request.url));
  if ((pathname === "/login" || pathname === "/register") && role) {
    return NextResponse.redirect(new URL(isStaff ? "/admin" : "/dashboard", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // semua request kecuali aset statis (JS/CSS/gambar build & file publik)
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|css|js|map)$).*)"],
};

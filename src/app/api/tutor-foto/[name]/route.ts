import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { TUTOR_PHOTO_DIR } from "@/lib/storage";
import { guardRoute, ipFrom } from "@/lib/security";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Foto profil tutor bersifat publik; nama file acak (UUID) sehingga aman di-cache lama. */
export async function GET(request: Request, ctx: RouteContext<"/api/tutor-foto/[name]">) {
  const limited = guardRoute(`foto:${ipFrom(request.headers)}`, 600, 60_000);
  if (limited) return limited;
  const { name } = await ctx.params;
  const m = name.match(/^[a-f0-9-]+\.(jpg|png|webp)$/);
  if (!m) return new NextResponse("Not found", { status: 404 });
  try {
    const data = await fs.readFile(path.join(TUTOR_PHOTO_DIR, name));
    return new NextResponse(data, {
      headers: { "Content-Type": TYPES[m[1]], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

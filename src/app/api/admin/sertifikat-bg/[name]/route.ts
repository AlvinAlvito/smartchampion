import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSession, isPanel } from "@/lib/session";
import { CERT_BG_DIR } from "@/lib/storage";

/** Pratinjau gambar latar sertifikat (hanya staf panel) */
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/sertifikat-bg/[name]">) {
  const session = await getSession();
  if (!session || !isPanel(session.role)) return new NextResponse("Unauthorized", { status: 401 });
  const { name } = await ctx.params;
  const m = name.match(/^[a-f0-9-]+\.(jpg|png)$/);
  if (!m) return new NextResponse("Not found", { status: 404 });
  try {
    const data = await fs.readFile(path.join(CERT_BG_DIR, name));
    return new NextResponse(data, {
      headers: { "Content-Type": m[1] === "png" ? "image/png" : "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

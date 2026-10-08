import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { CLASS_MEDIA_DIR } from "@/lib/storage";
import { guardRoute, ipFrom } from "@/lib/security";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4" };
/** potongan maksimal per permintaan video (browser meminta bagian berikutnya sendiri) */
const CHUNK = 4 * 1024 * 1024;

/**
 * Flyer, gambar mading & galeri kelas, serta gambar & video Panduan bersifat publik;
 * nama file acak (UUID) sehingga aman di-cache lama. Video dilayani per potongan (HTTP Range)
 * agar bisa diputar & digeser di semua browser (termasuk Safari/iPhone).
 */
export async function GET(request: Request, ctx: RouteContext<"/api/kelas-media/[name]">) {
  const limited = guardRoute(`kmedia:${ipFrom(request.headers)}`, 600, 60_000);
  if (limited) return limited;
  const { name } = await ctx.params;
  const m = name.match(/^[a-f0-9-]+\.(jpg|png|webp|mp4)$/);
  if (!m) return new NextResponse("Not found", { status: 404 });
  const file = path.join(CLASS_MEDIA_DIR, name);
  const headers = { "Content-Type": TYPES[m[1]], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" };
  try {
    if (m[1] !== "mp4") return new NextResponse(await fs.readFile(file), { headers });

    const size = (await fs.stat(file)).size;
    const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
    if (!range) {
      // tanpa Range: kirim utuh (file video dibatasi 30 MB saat unggah)
      return new NextResponse(await fs.readFile(file), { headers: { ...headers, "Accept-Ranges": "bytes", "Content-Length": String(size) } });
    }
    let start = range[1] ? Number(range[1]) : size - Number(range[2] || 0);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    if (!range[1]) end = size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1, start + CHUNK - 1);
    if (start >= size || start > end) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const fh = await fs.open(file, "r");
    try {
      const buf = Buffer.alloc(end - start + 1);
      await fh.read(buf, 0, buf.length, start);
      return new NextResponse(buf, {
        status: 206,
        headers: { ...headers, "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(buf.length) },
      });
    } finally {
      await fh.close();
    }
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

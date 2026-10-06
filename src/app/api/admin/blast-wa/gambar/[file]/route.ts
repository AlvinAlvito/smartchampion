import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isStaff } from "@/lib/session";
import { campaignScope, readBlastImage } from "@/lib/blast-wa";

/** Gambar lampiran kampanye (hanya untuk staf yang boleh melihat kampanye tsb.) */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/admin/blast-wa/gambar/[file]">) {
  const session = await getSession();
  if (!session || !isStaff(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const { file } = await ctx.params;
  const used = await prisma.blastCampaign.findFirst({ where: { imageFile: file, ...campaignScope(session) }, select: { id: true } });
  const img = used ? await readBlastImage(file) : null;
  if (!img) return NextResponse.json({ message: "not found" }, { status: 404 });
  return new Response(new Uint8Array(img.buf), { headers: { "content-type": img.mime, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
}

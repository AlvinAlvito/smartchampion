import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isPanel } from "@/lib/session";
import { STORAGE_DIR } from "@/lib/storage";
import { guardRoute, ipFrom } from "@/lib/security";
import { visibleMaterialWhere } from "@/lib/material-access";
import { blockReadOnlyDownload } from "@/lib/read-only";

export async function GET(request: Request, ctx: RouteContext<"/api/files/[name]">) {
  const limited = guardRoute(`files:${ipFrom(request.headers)}`, 120, 60_000);
  if (limited) return limited;
  const { name } = await ctx.params;
  if (!/^[a-f0-9-]+\.pdf$/.test(name)) return new NextResponse("Not found", { status: 404 });

  const session = await getSession();
  // Superadmin = mode lihat saja: tidak boleh mengunduh
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  if (!isPanel(session.role)) {
    // Peserta hanya boleh membuka file materi dari kelas yang sudah lunas
    // …dan, untuk materi khusus (VIP), hanya peserta yang dicentang admin
    const material = await prisma.material.findFirst({ where: { url: `/api/files/${name}`, ...visibleMaterialWhere(session.userId) }, select: { productId: true } });
    const allowed = material && (await prisma.registration.count({ where: { userId: session.userId, productId: material.productId, status: "PAID" } }));
    if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const data = await fs.readFile(path.join(STORAGE_DIR, name));
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

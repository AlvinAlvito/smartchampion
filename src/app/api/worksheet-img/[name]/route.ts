import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isPanel } from "@/lib/session";
import { WORKSHEET_IMG_DIR } from "@/lib/storage";
import { guardRoute, ipFrom } from "@/lib/security";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Peserta lunas di kelas pemilik soal (worksheet terbit) boleh melihat gambar soal & opsi.
 * Gambar yang hanya muncul di PEMBAHASAN baru boleh dilihat setelah ia mengumpulkan / batas waktu lewat.
 */
async function participantCanSee(userId: number, url: string, name: string) {
  const like = `%${name}%`;
  const rows = await prisma.$queryRaw<{ sessionId: number; productId: number; inQuestion: number; dueAt: Date | null }[]>`
    SELECT q.sessionId, s.productId, s.worksheetDueAt AS dueAt,
           (q.imageUrl = ${url} OR q.text LIKE ${like} OR JSON_SEARCH(q.options, 'one', ${like}) IS NOT NULL) AS inQuestion
    FROM worksheet_questions q JOIN class_sessions s ON s.id = q.sessionId
    WHERE s.worksheetPublished = 1
      AND (q.imageUrl = ${url} OR q.text LIKE ${like} OR q.explanation LIKE ${like} OR JSON_SEARCH(q.options, 'one', ${like}) IS NOT NULL)
    LIMIT 20`;
  for (const r of rows) {
    const paid = await prisma.registration.count({ where: { userId, productId: r.productId, status: "PAID" } });
    if (!paid) continue;
    if (Number(r.inQuestion)) return true;
    const done = await prisma.worksheetAttempt.count({ where: { sessionId: r.sessionId, userId } });
    if (done || (r.dueAt && r.dueAt.getTime() <= Date.now())) return true;
  }
  return false;
}

/** Gambar soal worksheet: staf panel, atau peserta yang berhak (lihat participantCanSee). */
export async function GET(request: Request, ctx: RouteContext<"/api/worksheet-img/[name]">) {
  const limited = guardRoute(`wsimg:${ipFrom(request.headers)}`, 300, 60_000);
  if (limited) return limited;
  const { name } = await ctx.params;
  const m = name.match(/^[a-f0-9-]+\.(jpg|png|webp)$/);
  if (!m) return new NextResponse("Not found", { status: 404 });

  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  if (!isPanel(session.role) && !(await participantCanSee(session.userId, `/api/worksheet-img/${name}`, name))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  try {
    const data = await fs.readFile(path.join(WORKSHEET_IMG_DIR, name));
    return new NextResponse(data, {
      headers: { "Content-Type": TYPES[m[1]], "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}

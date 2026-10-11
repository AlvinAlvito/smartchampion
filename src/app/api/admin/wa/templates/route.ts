import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { canChat, crossSite, json } from "@/lib/wa";
import { guardRoute } from "@/lib/security";
import { WA_MAX_TEXT } from "@/lib/wa-shared";

export const dynamic = "force-dynamic";

const MAX_PER_ADMIN = 100;
/** "/COC Info " → "coc-info" */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/^\/+/, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Template milik sendiri + template admin lain yang dibagikan */
export async function GET() {
  const session = await getSession();
  if (!session || !canChat(session.role)) return json({ error: "Tidak diizinkan." }, 403);
  const rows = await prisma.waTemplate.findMany({
    where: { OR: [{ ownerId: session.userId }, { isShared: true }] },
    orderBy: [{ useCount: "desc" }, { shortcut: "asc" }],
    select: { id: true, shortcut: true, title: true, body: true, isShared: true, useCount: true, ownerId: true, owner: { select: { name: true } } },
  });
  // pintasan sama: milik sendiri didahulukan
  const mine = new Set(rows.filter((r) => r.ownerId === session.userId).map((r) => r.shortcut));
  return json({
    adminName: session.name,
    templates: rows
      .filter((r) => r.ownerId === session.userId || !mine.has(r.shortcut))
      .map(({ owner, ownerId, ...r }) => ({ ...r, mine: ownerId === session.userId, ownerName: owner.name })),
  });
}

/**
 * { used: id } → hitung pemakaian (untuk urutan "paling sering dipakai").
 * { id?, shortcut, title, body, isShared } → buat / ubah template milik sendiri.
 */
export async function POST(request: Request) {
  if (crossSite(request)) return json({ error: "Permintaan ditolak." }, 403);
  const session = await getSession();
  if (!session || !canChat(session.role)) return json({ error: "Tidak diizinkan." }, 403);
  const limited = guardRoute(`wa-tpl:${session.userId}`, 60, 60_000);
  if (limited) return limited;
  const b = (await request.json().catch(() => ({}))) as { used?: number; id?: number; shortcut?: string; title?: string; body?: string; isShared?: boolean };

  if (b.used) {
    await prisma.waTemplate.updateMany({ where: { id: Number(b.used), OR: [{ ownerId: session.userId }, { isShared: true }] }, data: { useCount: { increment: 1 } } });
    return json({ ok: true });
  }

  const shortcut = slug(String(b.shortcut ?? ""));
  const body = String(b.body ?? "").replace(/\r\n/g, "\n").trim();
  const title = (String(b.title ?? "").trim() || shortcut).slice(0, 120);
  if (!shortcut) return json({ error: "Pintasan wajib diisi (huruf/angka), mis. coc" }, 400);
  if (!body) return json({ error: "Isi template masih kosong." }, 400);
  if (body.length > WA_MAX_TEXT) return json({ error: `Isi template maksimal ${WA_MAX_TEXT.toLocaleString("id-ID")} karakter.` }, 400);

  const id = Number(b.id) || 0;
  const clash = await prisma.waTemplate.findFirst({ where: { ownerId: session.userId, shortcut, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (clash) return json({ error: `Pintasan /${shortcut} sudah dipakai template lain.` }, 400);
  const data = { shortcut, title, body, isShared: !!b.isShared };
  if (id) {
    const r = await prisma.waTemplate.updateMany({ where: { id, ownerId: session.userId }, data });
    if (!r.count) return json({ error: "Template tidak ditemukan (hanya pemilik yang bisa mengubah)." }, 404);
    return json({ ok: true, id });
  }
  if ((await prisma.waTemplate.count({ where: { ownerId: session.userId } })) >= MAX_PER_ADMIN) return json({ error: `Maksimal ${MAX_PER_ADMIN} template per admin.` }, 400);
  const row = await prisma.waTemplate.create({ data: { ...data, ownerId: session.userId } });
  return json({ ok: true, id: row.id });
}

export async function DELETE(request: Request) {
  if (crossSite(request)) return json({ error: "Permintaan ditolak." }, 403);
  const session = await getSession();
  if (!session || !canChat(session.role)) return json({ error: "Tidak diizinkan." }, 403);
  const id = Number(new URL(request.url).searchParams.get("id"));
  const r = await prisma.waTemplate.deleteMany({ where: { id, ownerId: session.userId } });
  if (!r.count) return json({ error: "Template tidak ditemukan (hanya pemilik yang bisa menghapus)." }, 404);
  return json({ ok: true });
}

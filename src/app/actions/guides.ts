"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { optInt, optStr, slugify, str } from "@/lib/utils";
import { removeClassImage, saveClassImage } from "@/lib/storage";
import type { ActionResult } from "@/lib/action-result";
import { logActivity } from "@/lib/activity";
import { videoInfo } from "@/lib/video";

const MAX_STEPS = 40;

type StepInput = { key: string; title: string; body: string; imageUrl?: string | null; removeImage?: boolean };

function revalidateGuides(slug?: string) {
  revalidatePath("/admin/panduan");
  revalidatePath("/panduan");
  if (slug) revalidatePath(`/panduan/${slug}`);
}

const fileOf = (form: FormData, key: string) => {
  const f = form.get(key);
  return f instanceof File && f.size > 0 ? f : null;
};

export async function saveGuideAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const id = optInt(form, "id");
  const title = str(form, "title").slice(0, 160);
  const videoUrl = optStr(form, "videoUrl");
  let steps: StepInput[] = [];
  try {
    steps = (JSON.parse(str(form, "steps") || "[]") as StepInput[]).slice(0, MAX_STEPS);
  } catch {
    return { error: "Data langkah tidak valid, muat ulang halaman." };
  }

  const fe: Record<string, string[]> = {};
  if (!title) fe.title = ["Judul wajib diisi"];
  if (videoUrl && !videoInfo(videoUrl)) fe.videoUrl = ["Gunakan link YouTube (youtube.com / youtu.be) atau Google Drive (drive.google.com/file/d/…)"];
  const badStep = steps.findIndex((s) => !s.title?.trim() || !s.body?.trim());
  if (badStep >= 0) fe.steps = [`Langkah ${badStep + 1}: judul dan penjelasan wajib diisi`];
  if (Object.keys(fe).length) return { fieldErrors: fe };

  const existing = id ? await prisma.guide.findUnique({ where: { id }, include: { steps: true } }) : null;
  if (id && !existing) return { error: "Panduan tidak ditemukan." };

  // slug unik
  let slug = slugify(str(form, "slug") || title) || `panduan-${Date.now()}`;
  const clash = await prisma.guide.findFirst({ where: { slug, ...(existing ? { NOT: { id: existing.id } } : {}) }, select: { id: true } });
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  // unggah gambar (sampul & langkah) — gagal satu → batalkan & hapus yang sudah terunggah
  const uploaded: string[] = [];
  const upload = async (f: File) => {
    const url = await saveClassImage(f);
    uploaded.push(url);
    return url;
  };
  let coverUrl = existing?.coverUrl ?? null;
  const stepRows: { title: string; body: string; imageUrl: string | null }[] = [];
  try {
    const cover = fileOf(form, "cover");
    if (cover) coverUrl = await upload(cover);
    else if (form.get("removeCover") === "1") coverUrl = null;
    const ownUrls = new Set((existing?.steps ?? []).map((s) => s.imageUrl).filter(Boolean));
    for (const s of steps) {
      const f = fileOf(form, `stepImage_${s.key}`);
      // gambar lama hanya dipakai bila memang milik panduan ini (cegah memasukkan URL sembarang)
      const keep = !s.removeImage && s.imageUrl && ownUrls.has(s.imageUrl) ? s.imageUrl : null;
      stepRows.push({ title: s.title.trim().slice(0, 160), body: s.body.trim().slice(0, 10_000), imageUrl: f ? await upload(f) : keep });
    }
  } catch (e) {
    await Promise.all(uploaded.map((u) => removeClassImage(u)));
    return { error: (e as Error).message };
  }

  const data = {
    slug,
    title,
    summary: optStr(form, "summary")?.slice(0, 255) ?? null,
    category: (optStr(form, "category") ?? "Umum").slice(0, 60),
    coverUrl,
    videoUrl,
    content: optStr(form, "content"),
    isPublished: form.get("isPublished") === "on",
    isFeatured: form.get("isFeatured") === "on",
  };
  const saved = await prisma.$transaction(async (tx) => {
    const g = existing
      ? await tx.guide.update({ where: { id: existing.id }, data })
      : await tx.guide.create({ data: { ...data, sortOrder: ((await tx.guide.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1 } });
    await tx.guideStep.deleteMany({ where: { guideId: g.id } });
    if (stepRows.length) await tx.guideStep.createMany({ data: stepRows.map((s, i) => ({ ...s, guideId: g.id, sortOrder: i })) });
    return g;
  });

  // bersihkan gambar lama yang tidak dipakai lagi
  if (existing) {
    const used = new Set([coverUrl, ...stepRows.map((s) => s.imageUrl)].filter(Boolean));
    const stale = [existing.coverUrl, ...existing.steps.map((s) => s.imageUrl)].filter((u): u is string => !!u && !used.has(u));
    await Promise.all(stale.map((u) => removeClassImage(u)));
  }

  await logActivity({ entity: "GUIDE", action: existing ? "UPDATE" : "CREATE", entityId: saved.id, label: title });
  revalidateGuides(saved.slug);
  if (existing && existing.slug !== saved.slug) revalidatePath(`/panduan/${existing.slug}`);
  return existing
    ? { ok: `Panduan "${title}" disimpan.` }
    : { ok: `Panduan "${title}" dibuat${data.isPublished ? " dan langsung tayang" : " sebagai draft"}.`, redirectTo: `/admin/panduan/${saved.id}` };
}

export async function deleteGuideAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const g = await prisma.guide.findUnique({ where: { id }, include: { steps: { select: { imageUrl: true } } } });
  if (!g) return { error: "Panduan tidak ditemukan." };
  await prisma.guide.delete({ where: { id } });
  await Promise.all([g.coverUrl, ...g.steps.map((s) => s.imageUrl)].map((u) => removeClassImage(u)));
  await logActivity({ entity: "GUIDE", action: "DELETE", entityId: id, label: g.title });
  revalidateGuides(g.slug);
  return { ok: `Panduan "${g.title}" dihapus.`, redirectTo: "/admin/panduan" };
}

export async function moveGuideAction(id: number, dir: -1 | 1): Promise<ActionResult> {
  await requirePanel();
  const rows = await prisma.guide.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true } });
  const i = rows.findIndex((r) => r.id === id);
  const j = i + (dir === -1 ? -1 : 1);
  if (i < 0) return { error: "Panduan tidak ditemukan." };
  if (j < 0 || j >= rows.length) return { ok: "Urutan tidak berubah." };
  [rows[i], rows[j]] = [rows[j], rows[i]];
  await prisma.$transaction(rows.map((r, idx) => prisma.guide.update({ where: { id: r.id }, data: { sortOrder: idx } })));
  revalidateGuides();
  return { ok: "Urutan panduan diperbarui." };
}

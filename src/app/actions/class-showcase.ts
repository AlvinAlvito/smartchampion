"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { optInt, optStr, str } from "@/lib/utils";
import { removeClassImage, saveClassImage } from "@/lib/storage";
import type { ActionResult } from "@/lib/action-result";
import { logActivity } from "@/lib/activity";

/** Maks gambar galeri per unggahan (batas body Server Action 35 MB) */
const MAX_GALLERY_UPLOAD = 10;
const MAX_GALLERY_TOTAL = 60;
const MAX_POSTS = 30;

async function revalidateShowcase(productId: number) {
  revalidatePath(`/admin/produk/${productId}`);
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { slug: true } });
  if (p) revalidatePath(`/kelas/${p.slug}`);
}

const imageFile = (form: FormData, key: string) => {
  const f = form.get(key);
  return f instanceof File && f.size > 0 ? f : null;
};

/* ---------------- Flyer / gambar latar ---------------- */

export async function saveFlyerAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const productId = optInt(form, "productId");
  const product = productId ? await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, imageUrl: true } }) : null;
  if (!product) return { error: "Kelas tidak ditemukan." };

  const file = imageFile(form, "file");
  if (!file && form.get("remove") !== "1") return { fieldErrors: { file: ["Pilih gambar flyer terlebih dahulu"] } };
  let url: string | null = null;
  if (file) {
    try {
      url = await saveClassImage(file);
    } catch (e) {
      return { fieldErrors: { file: [(e as Error).message] } };
    }
  }
  await prisma.product.update({ where: { id: product.id }, data: { imageUrl: url } });
  if (product.imageUrl && product.imageUrl !== url) await removeClassImage(product.imageUrl);
  await logActivity({ entity: "SHOWCASE", action: url ? "UPDATE" : "DELETE", productId: product.id, label: product.name, detail: "flyer" });
  await revalidateShowcase(product.id);
  return { ok: url ? "Flyer kelas disimpan dan tampil di halaman kelas." : "Flyer dihapus — halaman kelas kembali memakai latar biasa." };
}

/* ---------------- Mading ---------------- */

export async function savePostAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const productId = optInt(form, "productId");
  const id = optInt(form, "id");
  const title = str(form, "title").slice(0, 160);
  const body = str(form, "body");
  const fe: Record<string, string[]> = {};
  if (!title) fe.title = ["Judul wajib diisi"];
  if (!body) fe.body = ["Teks mading wajib diisi"];
  if (body.length > 5000) fe.body = ["Teks maksimal 5.000 karakter"];
  if (Object.keys(fe).length) return { fieldErrors: fe };
  if (!productId || !(await prisma.product.count({ where: { id: productId } }))) return { error: "Kelas tidak ditemukan." };

  const existing = id ? await prisma.classPost.findFirst({ where: { id, productId } }) : null;
  if (id && !existing) return { error: "Mading tidak ditemukan." };
  if (!existing && (await prisma.classPost.count({ where: { productId } })) >= MAX_POSTS) return { error: `Maksimal ${MAX_POSTS} mading per kelas.` };

  let imageUrl = existing?.imageUrl ?? null;
  const file = imageFile(form, "image");
  if (file) {
    try {
      imageUrl = await saveClassImage(file);
    } catch (e) {
      return { fieldErrors: { image: [(e as Error).message] } };
    }
  } else if (form.get("removeImage") === "1") {
    imageUrl = null;
  }

  const data = {
    title,
    body,
    category: optStr(form, "category")?.slice(0, 60) ?? null,
    imageUrl,
    isPublished: form.get("isPublished") === "on",
  };
  if (existing) {
    await prisma.classPost.update({ where: { id: existing.id }, data });
    if (existing.imageUrl && existing.imageUrl !== imageUrl) await removeClassImage(existing.imageUrl);
  } else {
    const last = await prisma.classPost.aggregate({ where: { productId }, _max: { sortOrder: true } });
    await prisma.classPost.create({ data: { ...data, productId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
  }
  await logActivity({ entity: "SHOWCASE", action: existing ? "UPDATE" : "CREATE", productId, label: title, detail: "mading" });
  await revalidateShowcase(productId);
  return { ok: existing ? `Mading "${title}" diperbarui.` : `Mading "${title}" ditambahkan${data.isPublished ? "" : " sebagai draft"}.` };
}

export async function deletePostAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const p = await prisma.classPost.delete({ where: { id } }).catch(() => null);
  if (!p) return { error: "Mading tidak ditemukan." };
  await removeClassImage(p.imageUrl);
  await logActivity({ entity: "SHOWCASE", action: "DELETE", productId: p.productId, label: p.title, detail: "mading" });
  await revalidateShowcase(p.productId);
  return { ok: `Mading "${p.title}" dihapus.` };
}

/** Geser urutan (mading / galeri): tukar dengan tetangganya, lalu rapikan urutan 0..n */
async function reorder(kind: "post" | "gallery", id: number, dir: -1 | 1) {
  const row =
    kind === "post"
      ? await prisma.classPost.findUnique({ where: { id }, select: { productId: true } })
      : await prisma.classGalleryImage.findUnique({ where: { id }, select: { productId: true } });
  if (!row) return null;
  const order = { where: { productId: row.productId }, orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }], select: { id: true } };
  const rows = kind === "post" ? await prisma.classPost.findMany(order) : await prisma.classGalleryImage.findMany(order);
  const i = rows.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return row.productId;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  await prisma.$transaction(
    rows.map((r, idx) =>
      kind === "post"
        ? prisma.classPost.update({ where: { id: r.id }, data: { sortOrder: idx } })
        : prisma.classGalleryImage.update({ where: { id: r.id }, data: { sortOrder: idx } }),
    ),
  );
  return row.productId;
}

export async function movePostAction(id: number, dir: -1 | 1): Promise<ActionResult> {
  await requirePanel();
  const productId = await reorder("post", id, dir === -1 ? -1 : 1);
  if (!productId) return { error: "Mading tidak ditemukan." };
  await revalidateShowcase(productId);
  return { ok: "Urutan mading diperbarui." };
}

/* ---------------- Galeri ---------------- */

export async function uploadGalleryAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const productId = optInt(form, "productId");
  const product = productId ? await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true } }) : null;
  if (!product) return { error: "Kelas tidak ditemukan." };
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { fieldErrors: { files: ["Pilih minimal 1 gambar"] } };
  if (files.length > MAX_GALLERY_UPLOAD) return { fieldErrors: { files: [`Maksimal ${MAX_GALLERY_UPLOAD} gambar sekali unggah`] } };
  const have = await prisma.classGalleryImage.count({ where: { productId: product.id } });
  if (have + files.length > MAX_GALLERY_TOTAL) return { fieldErrors: { files: [`Galeri maksimal ${MAX_GALLERY_TOTAL} gambar (sekarang ${have}).`] } };

  const saved: string[] = [];
  const failed: string[] = [];
  for (const f of files) {
    try {
      saved.push(await saveClassImage(f));
    } catch (e) {
      failed.push(`${f.name}: ${(e as Error).message}`);
    }
  }
  if (!saved.length) return { fieldErrors: { files: failed.slice(0, 3) } };
  const last = await prisma.classGalleryImage.aggregate({ where: { productId: product.id }, _max: { sortOrder: true } });
  const start = (last._max.sortOrder ?? -1) + 1;
  await prisma.classGalleryImage.createMany({ data: saved.map((url, i) => ({ productId: product.id, url, sortOrder: start + i })) });
  await logActivity({ entity: "SHOWCASE", action: "CREATE", productId: product.id, count: saved.length, label: product.name, detail: "galeri" });
  await revalidateShowcase(product.id);
  return failed.length
    ? { ok: `${saved.length} gambar ditambahkan ke galeri. ${failed.length} gagal: ${failed.slice(0, 2).join("; ")}` }
    : { ok: `${saved.length} gambar ditambahkan ke galeri.` };
}

export async function updateGalleryCaptionAction(id: number, caption: string): Promise<ActionResult> {
  await requirePanel();
  const g = await prisma.classGalleryImage
    .update({ where: { id }, data: { caption: caption.trim().slice(0, 160) || null } })
    .catch(() => null);
  if (!g) return { error: "Gambar tidak ditemukan." };
  await revalidateShowcase(g.productId);
  return { ok: "Keterangan gambar disimpan." };
}

export async function moveGalleryAction(id: number, dir: -1 | 1): Promise<ActionResult> {
  await requirePanel();
  const productId = await reorder("gallery", id, dir === -1 ? -1 : 1);
  if (!productId) return { error: "Gambar tidak ditemukan." };
  await revalidateShowcase(productId);
  return { ok: "Urutan galeri diperbarui." };
}

export async function deleteGalleryAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const g = await prisma.classGalleryImage.delete({ where: { id } }).catch(() => null);
  if (!g) return { error: "Gambar tidak ditemukan." };
  await removeClassImage(g.url);
  await logActivity({ entity: "SHOWCASE", action: "DELETE", productId: g.productId, label: g.caption ?? "gambar galeri", detail: "galeri" });
  await revalidateShowcase(g.productId);
  return { ok: "Gambar dihapus dari galeri." };
}

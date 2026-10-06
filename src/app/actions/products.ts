"use server";

import { revalidatePath } from "next/cache";
import type { Jenjang, MaterialType, ProductStatus, ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { optInt, optStr, parseWibDate, slugify, str, safeUrl } from "@/lib/utils";
import { removeStoredFile, removeWorksheetImage, removeWorksheetPdfBackground, savePdf } from "@/lib/storage";
import { questionImageUrls } from "@/lib/rich-text";
import type { ActionResult } from "@/lib/action-result";
import { QUOTA_DISPLAY_VALUES } from "@/lib/quota";
import { defaultPackages } from "@/lib/packages";
import { parseWaGroupUrl } from "@/lib/wa-group";
import { productWhere, readProductFilters } from "@/lib/product-filters";
import { logActivity } from "@/lib/activity";

const JENJANG: Jenjang[] = ["SD", "SMP", "SMA", "UMUM"];
const STATUS: ProductStatus[] = ["DRAFT", "OPEN", "RUNNING", "CLOSED"];

function revalidateProduct(id?: number) {
  revalidatePath("/admin/produk");
  if (id) revalidatePath(`/admin/produk/${id}`);
  revalidatePath("/kelas", "layout");
  revalidatePath("/");
}

/* ---------------- Produk ---------------- */

export async function saveProductAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const id = optInt(form, "id");
  const name = str(form, "name");
  const price = optInt(form, "price");
  const minQuota = optInt(form, "minQuota") ?? 15;
  const jenjang = str(form, "jenjang") as Jenjang;
  const status = str(form, "status") as ProductStatus;
  const type: ProductType = str(form, "type") === "PRIVATE" ? "PRIVATE" : "COC";
  const vip = type === "PRIVATE";

  const fe: Record<string, string[]> = {};
  if (name.length < 3) fe.name = ["Nama kelas wajib diisi"];
  if (!str(form, "bidang")) fe.bidang = ["Bidang wajib diisi"];
  if (price == null || price < 0) fe.price = ["Harga tidak valid"];
  if (!JENJANG.includes(jenjang)) fe.jenjang = ["Pilih jenjang"];
  if (!STATUS.includes(status)) fe.status = ["Pilih status"];
  if (!str(form, "shortDesc")) fe.shortDesc = ["Deskripsi singkat wajib diisi"];
  const waGroup = parseWaGroupUrl(str(form, "waGroupUrl"));
  if (waGroup.error) fe.waGroupUrl = [waGroup.error];
  if (Object.keys(fe).length) return { fieldErrors: fe };

  let slug = slugify(str(form, "slug") || name);
  const clash = await prisma.product.findFirst({ where: { slug, ...(id ? { NOT: { id } } : {}) } });
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const data = {
    name,
    slug,
    bidang: str(form, "bidang"),
    jenjang,
    level: str(form, "level") || "Advance",
    gradeLabel: optStr(form, "gradeLabel"),
    shortDesc: str(form, "shortDesc"),
    description: str(form, "description") || str(form, "shortDesc"),
    type,
    price: price!,
    // VIP Privat: harga selalu per pertemuan & tanpa kuota minimal
    priceUnit: vip ? "pertemuan" : str(form, "priceUnit") || "bulan",
    minQuota: vip ? 1 : Math.max(1, minQuota),
    maxQuota: vip ? null : optInt(form, "maxQuota"),
    quotaDisplay: QUOTA_DISPLAY_VALUES.includes(str(form, "quotaDisplay")) ? str(form, "quotaDisplay") : "AUTO",
    scheduleInfo: optStr(form, "scheduleInfo"),
    waGroupUrl: waGroup.url,
    startDate: parseWibDate(form.get("startDate")),
    status,
  };

  const saved = id ? await prisma.product.update({ where: { id }, data }) : await prisma.product.create({ data });
  // VIP Privat tanpa paket → buatkan paket bawaan (1x, 4x, 8x) agar langsung bisa dibeli
  if (vip && !(await prisma.productPackage.count({ where: { productId: saved.id } }))) {
    await prisma.productPackage.createMany({ data: defaultPackages(saved.price).map((p) => ({ ...p, productId: saved.id })) });
  }
  await logActivity({ entity: "PRODUCT", action: id ? "UPDATE" : "CREATE", entityId: saved.id, productId: saved.id, label: saved.name });
  revalidateProduct(saved.id);
  return id
    ? { ok: `Kelas "${saved.name}" berhasil diperbarui.`, id: saved.id }
    : { ok: `Kelas "${saved.name}" berhasil dibuat.`, id: saved.id, redirectTo: `/admin/produk/${saved.id}` };
}

/**
 * Hapus satu kelas beserta file materi & gambar worksheet-nya.
 * Kelas yang sudah punya pendaftar TIDAK dihapus (riwayat transaksi dijaga) — cukup ditutup.
 */
async function removeProduct(id: number): Promise<"deleted" | "closed" | null> {
  const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!product) return null;
  const regs = await prisma.registration.count({ where: { productId: id } });
  if (regs > 0) {
    await prisma.product.update({ where: { id }, data: { status: "CLOSED" } });
    return "closed";
  }
  const materials = await prisma.material.findMany({ where: { productId: id }, select: { url: true } });
  const questions = await prisma.worksheetQuestion.findMany({
    where: { session: { productId: id } },
    select: { imageUrl: true, text: true, options: true, explanation: true },
  });
  const bg = await prisma.product.findUnique({ where: { id }, select: { worksheetPdfBg: true } });
  await prisma.product.delete({ where: { id } });
  await Promise.all([
    ...materials.map((m) => removeStoredFile(m.url)),
    ...questions.flatMap((q) => questionImageUrls(q)).map((u) => removeWorksheetImage(u)),
    removeWorksheetPdfBackground(bg?.worksheetPdfBg),
  ]);
  return "deleted";
}

export async function deleteProductAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const product = await prisma.product.findUnique({ where: { id }, select: { name: true } });
  if (!product) return { error: "Kelas tidak ditemukan." };
  const regs = await prisma.registration.count({ where: { productId: id } });
  const r = await removeProduct(id);
  if (r) await logActivity({ entity: "PRODUCT", action: r === "closed" ? "UPDATE" : "DELETE", entityId: id, productId: id, label: product.name, detail: r === "closed" ? "ditutup (sudah ada pendaftar)" : null });
  if (r === "closed") {
    revalidateProduct(id);
    return { ok: `Kelas sudah memiliki ${regs} pendaftar, jadi tidak dihapus — statusnya diubah menjadi Ditutup.` };
  }
  revalidateProduct();
  return { ok: `Kelas "${product.name}" dihapus.`, redirectTo: "/admin/produk" };
}

const MAX_BULK_PRODUCTS = 100;

async function removeProducts(ids: number[]): Promise<ActionResult> {
  let deleted = 0;
  let closed = 0;
  for (const id of ids) {
    const p = await prisma.product.findUnique({ where: { id }, select: { name: true } });
    const r = await removeProduct(id);
    if (r) await logActivity({ entity: "PRODUCT", action: r === "closed" ? "UPDATE" : "DELETE", entityId: id, productId: id, label: p?.name, detail: r === "closed" ? "ditutup (sudah ada pendaftar)" : null });
    if (r === "deleted") deleted++;
    else if (r === "closed") closed++;
  }
  revalidateProduct();
  if (!deleted && !closed) return { error: "Kelas tidak ditemukan." };
  const parts = [deleted && `${deleted} kelas dihapus`, closed && `${closed} kelas ditutup (sudah punya pendaftar, jadi tidak dihapus)`].filter(Boolean);
  return { ok: `${parts.join("; ")}.` };
}

/** Hapus kelas terpilih (centang) */
export async function deleteProductsAction(ids: number[]): Promise<ActionResult> {
  await requirePanel();
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!clean.length) return { error: "Tidak ada kelas yang dipilih." };
  if (clean.length > MAX_BULK_PRODUCTS) return { error: `Maksimal ${MAX_BULK_PRODUCTS} kelas sekali hapus.` };
  return removeProducts(clean);
}

/** Hapus SEMUA kelas yang cocok dengan pencarian/filter aktif */
export async function deleteProductsByFilterAction(query: string, expected: number): Promise<ActionResult> {
  await requirePanel();
  const params = new URLSearchParams(query);
  const where = productWhere(readProductFilters((k) => params.get(k)));
  const rows = await prisma.product.findMany({ where, select: { id: true } });
  if (!rows.length) return { error: "Tidak ada kelas yang cocok dengan filter." };
  // pengaman: data berubah sejak halaman dibuka → minta muat ulang
  if (rows.length !== expected) return { error: `Jumlah kelas berubah (${expected} → ${rows.length}). Muat ulang halaman lalu coba lagi.` };
  if (rows.length > MAX_BULK_PRODUCTS) return { error: `Maksimal ${MAX_BULK_PRODUCTS} kelas sekali hapus. Persempit filter terlebih dahulu.` };
  return removeProducts(rows.map((r) => r.id));
}

/* ---------------- Jadwal ---------------- */

export async function saveSessionAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const productId = optInt(form, "productId");
  const id = optInt(form, "id");
  const title = str(form, "title");
  const startAt = parseWibDate(form.get("startAt"));
  const endAt = parseWibDate(form.get("endAt")) ?? (startAt ? new Date(startAt.getTime() + 90 * 60_000) : null);
  const fe: Record<string, string[]> = {};
  if (!title) fe.title = ["Judul pertemuan wajib diisi"];
  if (!startAt) fe.startAt = ["Waktu mulai wajib diisi"];
  if (startAt && endAt && endAt <= startAt) fe.endAt = ["Waktu selesai harus setelah waktu mulai"];
  const meetingUrl = optStr(form, "meetingUrl");
  if (meetingUrl && !/^https?:\/\//i.test(safeUrl(meetingUrl) ?? "")) fe.meetingUrl = ["Link meeting harus diawali https:// (mis. link Zoom / Google Meet)"];
  const recordingUrl = optStr(form, "recordingUrl");
  if (recordingUrl && !/^https?:\/\//i.test(safeUrl(recordingUrl) ?? ""))
    fe.recordingUrl = ["Link rekaman harus diawali https:// (Zoom recording, YouTube, Google Drive)"];
  if (!productId) return { error: "Kelas tidak valid." };
  if (Object.keys(fe).length) return { fieldErrors: fe };

  const data = { productId, title, startAt: startAt!, endAt: endAt!, meetingUrl, recordingUrl, notes: optStr(form, "notes") };
  const saved = id ? await prisma.classSession.update({ where: { id }, data }) : await prisma.classSession.create({ data });
  await logActivity({ entity: "SESSION", action: id ? "UPDATE" : "CREATE", entityId: saved.id, productId, label: title });
  revalidateProduct(productId);
  revalidatePath(`/admin/produk/${productId}/pertemuan`, "layout");
  return { ok: id ? "Pertemuan diperbarui." : "Pertemuan ditambahkan." };
}

export async function deleteSessionAction(id: number): Promise<ActionResult> {
  await requirePanel();
  // gambar soal worksheet ikut dihapus dari disk (baris soal/nilai/absensi terhapus lewat cascade)
  const questions = await prisma.worksheetQuestion.findMany({
    where: { sessionId: id },
    select: { imageUrl: true, text: true, options: true, explanation: true },
  });
  const s = await prisma.classSession.delete({ where: { id } }).catch(() => null);
  if (!s) return { error: "Pertemuan tidak ditemukan." };
  await Promise.all(questions.flatMap((q) => questionImageUrls(q)).map((u) => removeWorksheetImage(u)));
  await logActivity({ entity: "SESSION", action: "DELETE", entityId: s.id, productId: s.productId, label: s.title });
  revalidateProduct(s.productId);
  return { ok: `Pertemuan "${s.title}" dihapus.` };
}

/* ---------------- Materi ---------------- */

export async function saveMaterialAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const session = await requirePanel();
  const productId = optInt(form, "productId");
  const id = optInt(form, "id");
  const type = str(form, "type") as MaterialType;
  const title = str(form, "title");
  if (!productId) return { error: "Kelas tidak valid." };
  if (!title) return { fieldErrors: { title: ["Judul wajib diisi"] } };
  if (!["PDF", "VIDEO", "ARTICLE"].includes(type)) return { fieldErrors: { type: ["Pilih tipe materi"] } };

  const existing = id ? await prisma.material.findUnique({ where: { id } }) : null;
  let url = optStr(form, "url");
  const content = optStr(form, "content");

  if (type === "PDF") {
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      try {
        url = await savePdf(file);
      } catch (e) {
        return { fieldErrors: { file: [(e as Error).message] } };
      }
      if (existing?.url && existing.url !== url) await removeStoredFile(existing.url);
    } else if (!url) {
      url = existing?.url ?? null;
    }
    if (!url) return { fieldErrors: { file: ["Unggah file PDF atau isi link PDF"] } };
  }
  if (type === "VIDEO" && !url) return { fieldErrors: { url: ["Link video wajib diisi"] } };
  // tautan harus http(s) atau file PDF internal — cegah javascript:/data: (XSS)
  if (type !== "ARTICLE" && url && !url.startsWith("/api/files/") && !/^https?:\/\//i.test(safeUrl(url) ?? "")) {
    return { fieldErrors: { [type === "PDF" ? "file" : "url"]: ["Link harus diawali https://"] } };
  }
  if (type === "ARTICLE" && !content) return { fieldErrors: { content: ["Isi artikel wajib diisi"] } };

  const data = {
    productId,
    type,
    title,
    url: type === "ARTICLE" ? null : url,
    content,
    summary: optStr(form, "summary"),
    isPublished: form.get("isPublished") === "on",
  };
  const savedMat = existing ? await prisma.material.update({ where: { id: existing.id }, data }) : await prisma.material.create({ data: { ...data, authorId: session.userId } });
  await logActivity({ entity: "MATERIAL", action: existing ? "UPDATE" : "CREATE", entityId: savedMat.id, productId, label: title, detail: type === "PDF" ? "PDF" : type === "VIDEO" ? "video" : "artikel" });

  revalidateProduct(productId);
  return { ok: existing ? `Materi "${title}" diperbarui.` : `Materi "${title}" ditambahkan${data.isPublished ? " dan langsung tayang" : " sebagai draft"}.` };
}

export async function deleteMaterialAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const m = await prisma.material.delete({ where: { id } }).catch(() => null);
  if (!m) return { error: "Materi tidak ditemukan." };
  await removeStoredFile(m.url);
  await logActivity({ entity: "MATERIAL", action: "DELETE", entityId: m.id, productId: m.productId, label: m.title });
  revalidateProduct(m.productId);
  return { ok: `Materi "${m.title}" dihapus.` };
}

/* ---------------- Paket pertemuan (VIP Privat) ---------------- */

export async function savePackageAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const id = optInt(form, "id");
  const productId = optInt(form, "productId");
  const sessions = optInt(form, "sessions");
  const price = optInt(form, "price");
  const fe: Record<string, string[]> = {};
  if (!sessions || sessions < 1 || sessions > 100) fe.sessions = ["Jumlah pertemuan 1–100"];
  if (price == null || price < 0 || price > 1_000_000_000) fe.price = ["Harga paket tidak valid"];
  if (Object.keys(fe).length) return { fieldErrors: fe };
  const product = productId ? await prisma.product.findUnique({ where: { id: productId }, select: { id: true, type: true } }) : null;
  if (!product || product.type !== "PRIVATE") return { error: "Paket hanya untuk produk VIP Privat." };
  const clash = await prisma.productPackage.findFirst({ where: { productId: product.id, sessions: sessions!, ...(id ? { NOT: { id } } : {}) } });
  if (clash) return { fieldErrors: { sessions: [`Paket ${sessions}x pertemuan sudah ada`] } };

  const data = { sessions: sessions!, price: price!, label: optStr(form, "label")?.slice(0, 40) ?? null, isActive: form.get("isActive") === "on" };
  if (id) await prisma.productPackage.update({ where: { id }, data });
  else await prisma.productPackage.create({ data: { ...data, productId: product.id } });
  await logActivity({ entity: "PACKAGE", action: id ? "UPDATE" : "CREATE", entityId: id, productId: product.id, label: `Paket ${sessions}x pertemuan` });
  revalidateProduct(product.id);
  return { ok: id ? `Paket ${sessions}x pertemuan diperbarui.` : `Paket ${sessions}x pertemuan ditambahkan.` };
}

export async function togglePackageAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const p = await prisma.productPackage.findUnique({ where: { id } });
  if (!p) return { error: "Paket tidak ditemukan." };
  await prisma.productPackage.update({ where: { id }, data: { isActive: !p.isActive } });
  await logActivity({ entity: "PACKAGE", action: p.isActive ? "UNPUBLISH" : "PUBLISH", entityId: id, productId: p.productId, label: `Paket ${p.sessions}x pertemuan` });
  revalidateProduct(p.productId);
  return { ok: p.isActive ? `Paket ${p.sessions}x disembunyikan dari peserta.` : `Paket ${p.sessions}x ditampilkan kembali.` };
}

export async function deletePackageAction(id: number): Promise<ActionResult> {
  await requirePanel();
  // pendaftaran lama tetap menyimpan jumlah pertemuan & nominal (snapshot), jadi paket aman dihapus
  const p = await prisma.productPackage.delete({ where: { id } }).catch(() => null);
  if (!p) return { error: "Paket tidak ditemukan." };
  await logActivity({ entity: "PACKAGE", action: "DELETE", entityId: id, productId: p.productId, label: `Paket ${p.sessions}x pertemuan` });
  revalidateProduct(p.productId);
  return { ok: `Paket ${p.sessions}x pertemuan dihapus.` };
}

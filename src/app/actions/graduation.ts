"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { certificateNumber, readCertificateConfig } from "@/lib/certificate";
import { removeCertificateBackground, saveCertificateBackground } from "@/lib/storage";
import { optInt, str } from "@/lib/utils";
import { logActivity } from "@/lib/activity";

function revalidate(productId: number, slug?: string) {
  revalidatePath(`/admin/produk/${productId}`);
  revalidatePath(`/admin/produk/${productId}/kelulusan`);
  if (slug) revalidatePath(`/dashboard/kelas/${slug}`, "layout");
  revalidatePath("/dashboard");
}

/** Simpan template sertifikat (gambar latar + teks & posisi) */
export async function saveCertificateTemplateAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const product = await prisma.product.findUnique({ where: { id: optInt(form, "productId") ?? 0 }, select: { id: true, slug: true, certificateBgUrl: true } });
  if (!product) return { error: "Kelas tidak ditemukan." };
  let bg = product.certificateBgUrl;
  const file = form.get("background");
  if (file instanceof File && file.size > 0) {
    try {
      bg = await saveCertificateBackground(file);
    } catch (e) {
      return { fieldErrors: { background: [(e as Error).message] } };
    }
    await removeCertificateBackground(product.certificateBgUrl);
  } else if (form.get("removeBackground") === "1") {
    await removeCertificateBackground(product.certificateBgUrl);
    bg = null;
  }
  const signers = [0, 1].map((i) => ({ name: str(form, `signerName${i}`), title: str(form, `signerTitle${i}`) }));
  const config = readCertificateConfig({
    title: str(form, "title"),
    subtitle: str(form, "subtitle"),
    intro: str(form, "intro"),
    body: str(form, "body"),
    nameTop: Number(form.get("nameTop")),
    nameFont: str(form, "nameFont"),
    nameColor: str(form, "nameColor"),
    textColor: str(form, "textColor"),
    showNumber: form.get("showNumber") === "1",
    place: str(form, "place"),
    showDate: form.get("showDate") === "1",
    signers,
    signTop: Number(form.get("signTop")),
  });
  await prisma.product.update({ where: { id: product.id }, data: { certificateBgUrl: bg, certificateConfig: config as unknown as Prisma.InputJsonValue } });
  await logActivity({ entity: "GRADUATION", action: "UPDATE", productId: product.id, detail: "template sertifikat" });
  revalidate(product.id, product.slug);
  return { ok: "Template sertifikat disimpan. Klik Pratinjau PDF untuk melihat hasilnya." };
}

export async function setReportPublishedAction(productId: number, published: boolean): Promise<ActionResult> {
  await requirePanel();
  const p = await prisma.product
    .update({ where: { id: Number(productId) || 0 }, data: { reportPublished: !!published }, select: { id: true, slug: true } })
    .catch(() => null);
  if (!p) return { error: "Kelas tidak ditemukan." };
  await logActivity({ entity: "GRADUATION", action: published ? "PUBLISH" : "UNPUBLISH", productId: p.id, detail: "rapor" });
  revalidate(p.id, p.slug);
  return { ok: published ? "Rapor diterbitkan — peserta kini bisa melihat & mengunduh rapornya." : "Rapor ditarik dari halaman peserta." };
}

/** Terbitkan sertifikat untuk peserta terpilih (yang sudah punya sertifikat dilewati) */
export async function issueCertificatesAction(productId: number, userIds: number[]): Promise<ActionResult> {
  await requirePanel();
  const product = await prisma.product.findUnique({ where: { id: Number(productId) || 0 }, select: { id: true, slug: true } });
  if (!product) return { error: "Kelas tidak ditemukan." };
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
  if (!ids.length) return { error: "Pilih peserta yang akan diterbitkan sertifikatnya." };
  const regs = await prisma.registration.findMany({
    where: { productId: product.id, status: "PAID", userId: { in: ids } },
    select: { userId: true, fullName: true },
    orderBy: { paidAt: "asc" },
  });
  const names = new Map(regs.map((r) => [r.userId, r.fullName]));
  const existing = await prisma.classResult.findMany({
    where: { productId: product.id, certificateNo: { not: null } },
    select: { userId: true, certificateNo: true },
  });
  const has = new Set(existing.map((e) => e.userId));
  const todo = ids.filter((id) => names.has(id) && !has.has(id));
  if (!todo.length) return { ok: "Semua peserta terpilih sudah punya sertifikat." };
  const now = new Date();
  // nomor urut berlanjut lintas semua kelas (format POSI tanpa id kelas), dari nomor tertinggi yang masih aktif
  const allNos = await prisma.classResult.findMany({ where: { certificateNo: { not: null } }, select: { certificateNo: true } });
  let seq = Math.max(0, ...allNos.map((e) => Number(e.certificateNo?.match(/^\d+/)?.[0] ?? 0)));
  await prisma.$transaction(
    todo.map((userId) => {
      seq++;
      const data = { certificateNo: certificateNumber(seq, now), certificateName: names.get(userId)!.slice(0, 120), certificateIssuedAt: now };
      return prisma.classResult.upsert({
        where: { productId_userId: { productId: product.id, userId } },
        create: { productId: product.id, userId, ...data },
        update: data,
      });
    }),
  );
  await logActivity({ entity: "GRADUATION", action: "ISSUE", productId: product.id, count: todo.length, detail: "sertifikat" });
  revalidate(product.id, product.slug);
  const skipped = ids.length - todo.length;
  return { ok: `${todo.length} sertifikat diterbitkan${skipped ? ` (${skipped} dilewati: sudah punya/bukan peserta lunas)` : ""}.` };
}

export async function revokeCertificateAction(productId: number, userId: number): Promise<ActionResult> {
  await requirePanel();
  const r = await prisma.classResult.findUnique({
    where: { productId_userId: { productId: Number(productId) || 0, userId: Number(userId) || 0 } },
    include: { product: { select: { slug: true } } },
  });
  if (!r?.certificateNo) return { error: "Sertifikat tidak ditemukan." };
  await prisma.classResult.update({ where: { id: r.id }, data: { certificateNo: null, certificateIssuedAt: null } });
  await logActivity({ entity: "GRADUATION", action: "REVOKE", productId: r.productId, detail: `sertifikat ${r.certificateNo}` });
  revalidate(r.productId, r.product.slug);
  return { ok: `Sertifikat ${r.certificateNo} dicabut.` };
}

/** Catatan tutor untuk rapor + koreksi nama di sertifikat */
export async function saveResultAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const productId = optInt(form, "productId") ?? 0;
  const userId = optInt(form, "userId") ?? 0;
  const paid = await prisma.registration.findFirst({ where: { productId, userId, status: "PAID" }, include: { product: { select: { slug: true } } } });
  if (!paid?.product) return { error: "Peserta tidak terdaftar lunas di kelas ini." };
  const note = str(form, "note").slice(0, 2000) || null;
  const name = str(form, "certificateName").slice(0, 120);
  await prisma.classResult.upsert({
    where: { productId_userId: { productId, userId } },
    create: { productId, userId, note, ...(name ? { certificateName: name } : {}) },
    update: { note, ...(name ? { certificateName: name } : {}) },
  });
  await logActivity({ entity: "GRADUATION", action: "UPDATE", productId, label: paid.fullName, detail: "catatan rapor" });
  revalidate(productId, paid.product.slug);
  return { ok: "Catatan & nama sertifikat disimpan." };
}

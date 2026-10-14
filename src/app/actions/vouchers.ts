"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePanel, requireUser } from "@/lib/session";
import { optInt, optStr, parseWibDate, str } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { logActivity } from "@/lib/activity";
import { limitAction } from "@/lib/security";
import { checkVoucher } from "@/lib/voucher";
import { normalizeVoucherCode } from "@/lib/voucher-shared";
import { currentPrice } from "@/lib/pricing";

/** Tambah / ubah voucher (Root, Admin Pelatihan, Admin SmartChampion) */
export async function saveVoucherAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const session = await requirePanel();
  const id = optInt(form, "id");
  const code = normalizeVoucherCode(str(form, "code"));
  const type = str(form, "type") === "AMOUNT" ? "AMOUNT" : "PERCENT";
  const value = optInt(form, "value");
  const maxDiscount = type === "PERCENT" ? optInt(form, "maxDiscount") : null;
  const minAmount = optInt(form, "minAmount");
  const quota = optInt(form, "quota");
  const validFrom = parseWibDate(form.get("validFrom"));
  const validUntil = parseWibDate(form.get("validUntil"));
  const allProducts = str(form, "scope") !== "SELECTED";
  const productIds = [...new Set(form.getAll("productIds").map(Number).filter((n) => Number.isInteger(n) && n > 0))];

  const fe: Record<string, string[]> = {};
  if (code.length < 3) fe.code = ["Kode minimal 3 karakter (huruf/angka)"];
  if (value == null || value <= 0) fe.value = ["Isi besar potongan"];
  else if (type === "PERCENT" && value > 100) fe.value = ["Persentase maksimal 100"];
  if (maxDiscount != null && maxDiscount <= 0) fe.maxDiscount = ["Batas potongan tidak valid"];
  if (minAmount != null && minAmount < 0) fe.minAmount = ["Harga minimal tidak valid"];
  if (quota != null && quota <= 0) fe.quota = ["Kuota minimal 1 (kosongkan bila tanpa batas)"];
  if (validFrom && validUntil && validFrom > validUntil) fe.validUntil = ["Tanggal berakhir harus setelah tanggal mulai"];
  if (!allProducts && !productIds.length) fe.productIds = ["Centang minimal 1 kelas"];
  if (!fe.code) {
    const clash = await prisma.voucher.findFirst({ where: { code, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
    if (clash) fe.code = ["Kode ini sudah dipakai voucher lain"];
  }
  if (Object.keys(fe).length) return { fieldErrors: fe };

  const data = {
    code,
    description: optStr(form, "description")?.slice(0, 255) ?? null,
    type,
    value: value!,
    maxDiscount,
    minAmount,
    quota,
    validFrom,
    validUntil,
    isActive: form.get("isActive") === "on",
    allProducts,
  } as const;
  const products = { set: allProducts ? [] : productIds.map((pid) => ({ id: pid })) };
  const saved = id
    ? await prisma.voucher.update({ where: { id }, data: { ...data, products } })
    : await prisma.voucher.create({ data: { ...data, createdById: session.userId, products: { connect: products.set } } });
  await logActivity({ entity: "VOUCHER", action: id ? "UPDATE" : "CREATE", entityId: saved.id, label: saved.code });
  revalidatePath("/admin/voucher");
  return { ok: `Voucher ${saved.code} ${id ? "diperbarui" : "dibuat"}.` };
}

export async function toggleVoucherAction(id: number, isActive: boolean): Promise<ActionResult> {
  await requirePanel();
  const v = await prisma.voucher.update({ where: { id }, data: { isActive } }).catch(() => null);
  if (!v) return { error: "Voucher tidak ditemukan." };
  await logActivity({ entity: "VOUCHER", action: "UPDATE", entityId: v.id, label: `${v.code} ${isActive ? "diaktifkan" : "dinonaktifkan"}` });
  revalidatePath("/admin/voucher");
  return { ok: `Voucher ${v.code} ${isActive ? "diaktifkan" : "dinonaktifkan"}.` };
}

/** Voucher yang sudah pernah dipakai tidak dihapus (riwayat transaksi tetap mencatat kodenya) — cukup dinonaktifkan */
export async function deleteVoucherAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const v = await prisma.voucher.findUnique({ where: { id }, select: { id: true, code: true, _count: { select: { registrations: true } } } });
  if (!v) return { error: "Voucher tidak ditemukan." };
  if (v._count.registrations) {
    await prisma.voucher.update({ where: { id }, data: { isActive: false } });
    revalidatePath("/admin/voucher");
    return { ok: `Voucher ${v.code} sudah pernah dipakai, jadi dinonaktifkan (tidak dihapus) agar riwayat transaksi tetap utuh.` };
  }
  await prisma.voucher.delete({ where: { id } });
  await logActivity({ entity: "VOUCHER", action: "DELETE", entityId: id, label: v.code });
  revalidatePath("/admin/voucher");
  return { ok: `Voucher ${v.code} dihapus.` };
}

/** Peserta menekan "Pakai" di form pendaftaran → pratinjau potongan (dihitung ulang saat pendaftaran disimpan) */
export async function previewVoucherAction(input: { code: string; productId: number; packageId?: number }) {
  const session = await requireUser(["PESERTA"]);
  // cegah menebak-nebak kode
  const limited = await limitAction("voucher-check", session.userId, 15, 10 * 60_000);
  if (limited) return { ok: false as const, error: limited };
  const product = await prisma.product.findUnique({ where: { id: Number(input.productId) || 0 } });
  if (!product) return { ok: false as const, error: "Kelas tidak ditemukan." };
  let base = currentPrice(product);
  if (product.type === "PRIVATE") {
    const pkg = await prisma.productPackage.findFirst({ where: { id: Number(input.packageId) || 0, productId: product.id, isActive: true } });
    if (!pkg) return { ok: false as const, error: "Pilih paket pertemuan dulu." };
    base = pkg.price;
  }
  const r = await checkVoucher({ code: String(input.code ?? ""), productId: product.id, base, userId: session.userId });
  return r.ok ? { ok: true as const, code: r.code, label: r.label, discount: r.discount, total: r.total, base } : r;
}

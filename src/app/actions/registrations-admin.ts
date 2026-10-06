"use server";

import { revalidatePath } from "next/cache";
import type { RegistrationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { applyRegistrationStatus } from "@/lib/payments";
import { REG_STATUS_LABEL } from "@/lib/constants";
import { optInt, optStr, str } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

const STATUSES: RegistrationStatus[] = ["PENDING", "PAID", "FAILED", "EXPIRED", "CANCELLED"];

export async function updateRegistrationAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const session = await requirePanel();
  const id = optInt(form, "id");
  if (!id) return { error: "Pendaftaran tidak valid." };
  const reg = await prisma.registration.findUnique({ where: { id } });
  if (!reg) return { error: "Pendaftaran tidak ditemukan." };

  // Admin SmartChampion tidak boleh mengubah admin penanggung jawab (= owner lead di Master Lead / data sales)
  const canAssign = session.role !== "SMARTCHAMPION";
  const adminId = canAssign ? optInt(form, "adminId") : reg.adminId;
  const requestedProductId = optInt(form, "productId");
  const targetProduct = requestedProductId
    ? await prisma.product.findFirst({ where: { id: requestedProductId, status: { not: "DRAFT" } }, select: { id: true, name: true, type: true } })
    : null;
  if (requestedProductId && !targetProduct) return { fieldErrors: { productId: ["Kelas tujuan tidak ditemukan atau masih berupa draf."] } };
  if (targetProduct && targetProduct.id !== reg.productId && targetProduct.type === "COC") {
    const duplicate = await prisma.registration.findFirst({
      where: { id: { not: id }, userId: reg.userId, productId: targetProduct.id, status: "PAID" },
      select: { code: true, fullName: true },
    });
    if (duplicate) {
      const sibling = duplicate.fullName.trim().toLowerCase() !== reg.fullName.trim().toLowerCase();
      return {
        error: sibling
          ? `Akun ini dipakai juga oleh ${duplicate.fullName}, yang sudah terdaftar di kelas tujuan (${duplicate.code}). Klik "Pisahkan akun" di baris Akun agar ${reg.fullName} punya akun sendiri, lalu pindahkan kelasnya.`
          : `Peserta sudah terdaftar lunas di kelas tujuan (${duplicate.code}).`,
      };
    }
  }
  // VIP Privat: catat jumlah pertemuan yang sudah terlaksana (0..jumlah paket)
  const sessionsDone = reg.sessionsBought ? Math.min(reg.sessionsBought, Math.max(0, optInt(form, "sessionsDone") ?? reg.sessionsDone)) : reg.sessionsDone;
  await prisma.registration.update({
    where: { id },
    data: {
      adminId,
      notes: optStr(form, "notes"),
      sessionsDone,
      productId: targetProduct?.id ?? null,
      packageId: targetProduct?.type === "PRIVATE" ? reg.packageId : null,
      ...(targetProduct?.type === "COC" ? { sessionsBought: null, sessionsDone: 0 } : {}),
    },
  });
  await prisma.lead.updateMany({
    where: { OR: [{ invoiceId: reg.code }, { id: reg.sourceLeadId ?? -1 }] },
    data: { ...(canAssign ? { ownerId: adminId } : {}), paket: targetProduct?.name ?? null },
  });

  const status = str(form, "status") as RegistrationStatus;
  let statusMsg = "";
  if (STATUSES.includes(status) && status !== reg.status) {
    if (reg.status === "PAID") {
      // Koreksi manual dari status lunas (mis. refund) — langsung set tanpa guard
      await prisma.registration.update({ where: { id }, data: { status, paidAt: null } });
      await prisma.lead.updateMany({
        where: { invoiceId: reg.code },
        data: { statusFunnel: status === "PENDING" ? "Pending" : "Lost", statusBayar: status === "PENDING" ? "Pending" : "Belum Ada", tanggalBayar: null },
      });
    } else {
      await applyRegistrationStatus(id, status, status === "PAID" ? (reg.paymentType ?? "manual (admin)") : undefined);
    }
    statusMsg = ` Status → ${REG_STATUS_LABEL[status]}.`;
  }
  revalidatePath("/admin/pendaftar");
  revalidatePath("/admin/leads");
  if (reg.productId) revalidatePath(`/admin/produk/${reg.productId}`);
  if (targetProduct) revalidatePath(`/admin/produk/${targetProduct.id}`);
  return { ok: `Pendaftaran ${reg.code} disimpan.${statusMsg}` };
}

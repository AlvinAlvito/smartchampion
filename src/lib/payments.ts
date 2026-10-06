import "server-only";
import type { RegistrationStatus } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Terapkan status pembayaran ke pendaftaran dan sinkronkan ke Master Lead
 * (lead terhubung lewat invoiceId = kode pendaftaran).
 */
export async function applyRegistrationStatus(registrationId: number, status: RegistrationStatus, paymentType?: string | null) {
  const reg = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!reg) return null;
  // Jangan turunkan status yang sudah lunas
  if (reg.status === "PAID" && status !== "PAID") return reg;

  const updated = await prisma.registration.update({
    where: { id: reg.id },
    data: {
      status,
      paymentType: paymentType ?? reg.paymentType,
      paidAt: status === "PAID" ? (reg.paidAt ?? new Date()) : reg.paidAt,
    },
  });

  const leadData =
    status === "PAID"
      ? { statusFunnel: "Paid", statusBayar: "Paid", kategori: "Customer Baru", nextAction: "Kirim info grup kelas & jadwal", tanggalBayar: updated.paidAt }
      : status === "PENDING"
        ? { statusFunnel: "Pending", statusBayar: "Pending" }
        : { statusFunnel: "Lost", statusBayar: "Belum Ada", objection: `Pembayaran ${status.toLowerCase()}`, tanggalBayar: null };

  await prisma.lead.updateMany({ where: { invoiceId: reg.code }, data: { ...leadData, lastContact: new Date() } });
  return updated;
}

export function generateRegistrationCode() {
  const d = new Date(Date.now() + 7 * 3600_000);
  const ymd = d.toISOString().slice(2, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `COC-${ymd}-${rand}`;
}

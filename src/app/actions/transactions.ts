"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { limitAction } from "@/lib/security";
import { getTransactionStatus, mapMidtransStatus, midtransEnabled } from "@/lib/midtrans";
import { applyRegistrationStatus } from "@/lib/payments";
import { REG_STATUS_LABEL } from "@/lib/constants";
import { paymentLabel } from "@/lib/transaction-filters";
import type { ActionResult } from "@/lib/action-result";

/**
 * Cek status transaksi langsung ke Midtrans lalu sinkronkan ke pendaftaran & Master Lead
 * (berguna bila webhook terlambat / gagal menjangkau server). Status lunas tidak pernah diturunkan.
 */
export async function syncTransactionAction(registrationId: number): Promise<ActionResult> {
  const me = await requireStaff();
  const limited = await limitAction("tx-sync", me.userId, 60, 10 * 60_000);
  if (limited) return { error: limited };
  const reg = await prisma.registration.findUnique({
    where: { id: Number(registrationId) || 0 },
    select: { id: true, code: true, status: true, midtransOrderId: true },
  });
  if (!reg) return { error: "Transaksi tidak ditemukan." };
  if (!reg.midtransOrderId) return { error: "Peserta belum membuka pembayaran Midtrans (belum ada Order ID)." };
  if (!midtransEnabled()) return { error: "Midtrans belum dikonfigurasi di server ini." };
  let st;
  try {
    st = await getTransactionStatus(reg.midtransOrderId);
  } catch {
    return { error: "Tidak bisa menghubungi Midtrans. Coba lagi." };
  }
  if (!st) return { error: "Midtrans belum mencatat transaksi ini (peserta belum memilih metode bayar)." };
  const mapped = mapMidtransStatus(st);
  if (!mapped) return { error: `Status Midtrans: ${st.transaction_status} (belum bisa dipetakan).` };
  await applyRegistrationStatus(reg.id, mapped, st.payment_type);
  revalidatePath("/admin/transaksi");
  revalidatePath("/admin/pendaftar");
  revalidatePath("/admin/leads");
  const changed = mapped !== reg.status && !(reg.status === "PAID");
  return {
    ok: `${reg.code}: Midtrans "${st.transaction_status}" (${paymentLabel(st.payment_type ?? null)}) → ${REG_STATUS_LABEL[mapped]}${changed ? " — status diperbarui." : " — tidak ada perubahan."}`,
  };
}

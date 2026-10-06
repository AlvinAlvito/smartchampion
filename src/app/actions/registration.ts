"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, getSession, isPanel } from "@/lib/session";
import { REGISTRATION_SOURCES } from "@/lib/constants";
import { normalizePhone } from "@/lib/utils";
import { applyRegistrationStatus, generateRegistrationCode } from "@/lib/payments";
import { createSnapTransaction, getTransactionStatus, mapMidtransStatus, midtransEnabled, simulationEnabled } from "@/lib/midtrans";
import { setFlash } from "@/lib/flash";
import type { ActionResult } from "@/lib/action-result";
import { limitAction } from "@/lib/security";

const Schema = z.object({
  productId: z.coerce.number().int().positive(),
  packageId: z.coerce.number().int().positive().optional(),
  fullName: z.string().trim().min(3, "Nama lengkap wajib diisi").max(120, "Nama maksimal 120 karakter"),
  school: z.string().trim().min(2, "Asal sekolah wajib diisi").max(160, "Nama sekolah maksimal 160 karakter"),
  phone: z.string().trim().min(9, "Nomor WhatsApp tidak valid").max(20, "Nomor WhatsApp tidak valid"),
  email: z.string().trim().toLowerCase().max(160, "Email terlalu panjang").email("Format email tidak valid"),
  parentPhone: z.string().trim().max(20, "Nomor tidak valid").optional(),
  source: z.enum(REGISTRATION_SOURCES, { message: "Pilih dari mana kamu mendapat info" }),
});

/** Nama sumber di form → nama sumber baku di Master Lead */
function toLeadSource(source: string) {
  if (source === "Blast WA / Telepon") return "Blast WA (RFM)";
  if (source === "Bundling Paket Lengkap") return "Bundling POSI";
  if (["WhatsApp Admin", "Instagram", "Tiktok SC", "Telegram"].includes(source)) return "Organic";
  return source;
}

export async function registerCocAction(_prev: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const session = await requireUser(["PESERTA"]);
  const limited = await limitAction("register-coc", session.userId, 15, 60 * 60_000);
  if (limited) return { error: limited };
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const d = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: d.productId } });
  if (!product || !["OPEN", "RUNNING"].includes(product.status)) return { error: "Kelas ini sedang tidak menerima pendaftaran." };

  // VIP Privat: harga & jumlah pertemuan diambil dari paket di database (bukan dari browser)
  const vip = product.type === "PRIVATE";
  const pkg = vip && d.packageId ? await prisma.productPackage.findFirst({ where: { id: d.packageId, productId: product.id, isActive: true } }) : null;
  if (vip && !pkg) return { error: "Pilih paket pertemuan yang tersedia terlebih dahulu." };
  const amount = pkg ? pkg.price : product.price;

  const existing = await prisma.registration.findFirst({
    where: { userId: session.userId, productId: product.id, status: vip ? "PENDING" : { in: ["PENDING", "PAID"] } },
  });
  // COC: satu kali daftar per kelas. VIP: boleh beli paket lagi, asal pesanan sebelumnya sudah dibayar.
  if (existing?.status === "PAID") return { error: "Kamu sudah terdaftar dan lunas di kelas ini." };
  if (existing) {
    await setFlash("info", vip ? "Selesaikan dulu pembayaran paket VIP sebelumnya ya." : "Kamu sudah punya pendaftaran untuk kelas ini. Lanjutkan pembayarannya ya.");
    redirect(`/pembayaran/${existing.code}`);
  }

  const phone = normalizePhone(d.phone)!;
  // Owner sengaja dikosongkan: diisi oleh admin yang benar-benar melayani peserta ini
  const adminId = null;
  const code = generateRegistrationCode();

  await prisma.$transaction([
    prisma.registration.create({
      data: {
        code,
        userId: session.userId,
        productId: product.id,
        fullName: d.fullName,
        school: d.school,
        phone,
        email: d.email,
        parentPhone: normalizePhone(d.parentPhone),
        source: d.source,
        adminId,
        amount,
        packageId: pkg?.id ?? null,
        sessionsBought: pkg?.sessions ?? null,
      },
    }),
    // Otomatis masuk Data Master Lead agar funnel & performa admin tercatat
    prisma.lead.create({
      data: {
        tanggalMasuk: new Date(),
        nama: d.fullName,
        noWa: phone,
        email: d.email,
        sumberLead: toLeadSource(d.source),
        campaign: `Web pendaftaran (${d.source})`,
        kategori: "Calon Customer",
        produk: vip ? "VIP Privat" : "COC",
        paket: pkg ? `${product.name} · ${pkg.sessions}x pertemuan` : product.name,
        ownerId: adminId,
        statusFunnel: "Pending",
        invoiceId: code,
        statusBayar: "Pending",
        nominal: amount,
        lastContact: new Date(),
        nextAction: "Pantau pembayaran; follow-up jika belum bayar H+1",
        catatan: `Asal sekolah: ${d.school}`,
      },
    }),
  ]);

  await setFlash("success", vip ? `Pesanan ${pkg!.sessions}x pertemuan VIP berhasil dibuat! Selesaikan pembayaran sekali untuk seluruh paket.` : "Pendaftaran berhasil dibuat! Selesaikan pembayaran untuk mengamankan kursimu.");
  redirect(`/pembayaran/${code}`);
}

async function loadOwnRegistration(code: string) {
  const session = await getSession();
  if (!session) return null;
  const reg = await prisma.registration.findUnique({ where: { code }, include: { product: true } });
  if (!reg) return null;
  if (reg.userId !== session.userId && !isPanel(session.role)) return null;
  return reg;
}

/** Membuat / mengambil Snap token untuk pembayaran */
export async function startPaymentAction(code: string): Promise<{ token?: string; error?: string }> {
  const limited = await limitAction("pay-start", null, 30, 60 * 60_000);
  if (limited) return { error: limited };
  const reg = await loadOwnRegistration(String(code).slice(0, 40));
  if (!reg) return { error: "Pendaftaran tidak ditemukan." };
  if (!reg.product) return { error: "Pendaftaran ini sedang tidak terhubung ke kelas. Hubungi admin." };
  if (reg.status === "PAID") return { error: "Pendaftaran ini sudah lunas." };
  if (!midtransEnabled()) return { error: "Midtrans belum dikonfigurasi (MIDTRANS_SERVER_KEY kosong)." };
  if (reg.snapToken && reg.status === "PENDING") return { token: reg.snapToken };

  // order_id Midtrans harus unik per percobaan
  const orderId = `${reg.code}-${Date.now().toString(36)}`;
  try {
    const snap = await createSnapTransaction({
      orderId,
      amount: reg.amount,
      itemName: reg.sessionsBought ? `VIP ${reg.product.name} ${reg.sessionsBought}x` : `COC ${reg.product.name}`,
      customer: { name: reg.fullName, email: reg.email, phone: reg.phone },
      finishUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/pembayaran/${reg.code}`,
      // Hanya order COC ini yang dikirim ke webhook pelatihan; webhook global posi.id tidak diubah.
      notificationUrl: process.env.MIDTRANS_NOTIFICATION_URL,
    });
    await prisma.registration.update({
      where: { id: reg.id },
      data: { midtransOrderId: orderId, snapToken: snap.token, status: "PENDING" },
    });
    return { token: snap.token };
  } catch (e) {
    console.error(e);
    return { error: "Gagal membuat transaksi Midtrans. Periksa server key." };
  }
}

/** Cek status ke Midtrans (dipakai saat webhook tidak bisa menjangkau localhost) */
export async function syncPaymentAction(code: string): Promise<ActionResult> {
  const limited = await limitAction("pay-sync", null, 40, 10 * 60_000);
  if (limited) return { error: limited };
  const reg = await loadOwnRegistration(String(code).slice(0, 40));
  if (!reg) return { error: "Pendaftaran tidak ditemukan." };
  if (!reg.midtransOrderId || !midtransEnabled()) return { error: "Belum ada transaksi pembayaran untuk dicek." };
  const st = await getTransactionStatus(reg.midtransOrderId);
  const mapped = st && mapMidtransStatus(st);
  if (!mapped) return { error: "Status pembayaran belum tersedia. Coba beberapa saat lagi." };
  await applyRegistrationStatus(reg.id, mapped, st.payment_type);
  if (mapped === "PAID") return { ok: "Pembayaran diterima. Kamu resmi terdaftar! 🎉" };
  if (mapped === "PENDING") return { ok: "Pembayaran masih menunggu. Selesaikan sesuai instruksi Midtrans." };
  return { error: `Status pembayaran: ${mapped.toLowerCase()}.` };
}

/** Mode simulasi (hanya jika Midtrans belum dikonfigurasi & bukan production) */
export async function simulatePaymentAction(code: string): Promise<ActionResult> {
  if (!simulationEnabled()) return { error: "Mode simulasi pembayaran tidak aktif di server ini." };
  const reg = await loadOwnRegistration(code);
  if (!reg) return { error: "Pendaftaran tidak ditemukan." };
  await applyRegistrationStatus(reg.id, "PAID", "simulasi");
  return { ok: "Pembayaran berhasil (simulasi). Selamat bergabung! 🎉" };
}

export async function cancelRegistrationAction(code: string): Promise<ActionResult> {
  const reg = await loadOwnRegistration(code);
  if (!reg || reg.status !== "PENDING") return { error: "Pendaftaran ini tidak bisa dibatalkan." };
  await applyRegistrationStatus(reg.id, "CANCELLED");
  return { ok: "Pendaftaran dibatalkan.", redirectTo: "/dashboard" };
}

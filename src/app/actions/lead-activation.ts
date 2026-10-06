"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { normalizePhone } from "@/lib/utils";
import { generateRegistrationCode } from "@/lib/payments";
import { limitAction } from "@/lib/security";
import type { ActionResult } from "@/lib/action-result";

/** Password awal akun yang dibuat dari Master Lead (peserta diminta menggantinya di menu Akun) */
const DEFAULT_PASSWORD = "smartchampion";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const schoolOf = (catatan: string | null) => catatan?.match(/Asal sekolah:\s*([^\n]+)/i)?.[1]?.trim().slice(0, 160) ?? null;
const linkedWhere = (lead: { id: number; invoiceId: string | null }) => ({ OR: [{ sourceLeadId: lead.id }, ...(lead.invoiceId ? [{ code: lead.invoiceId }] : [])] });

/* ------------------------------------------------------------------ */
/* Langkah 1: registrasi akun (semua lead yang punya email)            */
/* ------------------------------------------------------------------ */

export async function registerLeadAccountAction(leadId: number): Promise<ActionResult> {
  const admin = await requirePanel();
  const limited = await limitAction("lead-account", admin.userId, 60, 10 * 60_000);
  if (limited) return { error: limited };
  const lead = await prisma.lead.findUnique({ where: { id: Number(leadId) || 0 } });
  if (!lead) return { error: "Lead tidak ditemukan." };
  const email = (lead.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 160) return { error: "Lead ini belum punya email yang valid. Isi email lewat Edit lead terlebih dahulu." };

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, name: true } });
  if (existing) {
    return existing.role === "PESERTA"
      ? { ok: `Akun ${email} (${existing.name}) sudah ada — tidak dibuat ulang, password tidak diubah.`, id: existing.id }
      : { error: "Email ini dipakai akun staf/admin. Ganti email lead dengan email peserta." };
  }
  const user = await prisma.user.create({
    data: {
      name: lead.nama.slice(0, 120),
      email,
      password: await bcrypt.hash(DEFAULT_PASSWORD, 10),
      role: "PESERTA",
      phone: normalizePhone(lead.noWa),
      school: schoolOf(lead.catatan),
    },
  });
  revalidatePath("/admin/leads");
  return { ok: `Akun ${email} dibuat dengan password awal "${DEFAULT_PASSWORD}".`, id: user.id };
}

/* ------------------------------------------------------------------ */
/* Langkah 2: daftarkan ke kelas (lead lunas yang sudah punya akun)    */
/* ------------------------------------------------------------------ */

export type EnrollInfo = {
  email: string;
  account: { name: string } | null;
  paidProductIds: number[];
  linked: { code: string; product: string } | null;
};

export async function enrollInfoAction(leadId: number): Promise<EnrollInfo | { error: string }> {
  await requirePanel();
  const lead = await prisma.lead.findUnique({ where: { id: Number(leadId) || 0 }, select: { id: true, email: true, invoiceId: true } });
  if (!lead) return { error: "Lead tidak ditemukan." };
  const email = (lead.email ?? "").trim().toLowerCase();
  const [user, linked] = await Promise.all([
    email ? prisma.user.findUnique({ where: { email }, select: { id: true, name: true, role: true } }) : null,
    prisma.registration.findFirst({ where: linkedWhere(lead), select: { code: true, product: { select: { name: true } } } }),
  ]);
  const peserta = user?.role === "PESERTA" ? user : null;
  const paid = peserta ? await prisma.registration.findMany({ where: { userId: peserta.id, status: "PAID", productId: { not: null } }, select: { productId: true } }) : [];
  return {
    email,
    account: peserta ? { name: peserta.name } : null,
    paidProductIds: [...new Set(paid.map((p) => p.productId).filter((id): id is number => id !== null))],
    linked: linked ? { code: linked.code, product: linked.product?.name ?? "Belum ditempatkan" } : null,
  };
}

/**
 * Daftarkan akun peserta (email lead) ke kelas dengan status LUNAS (tanpa Midtrans),
 * lalu rapikan lead: Paket = nama kelas resmi, invoice ditautkan bila kosong.
 */
export async function enrollLeadAction(input: { leadId: number; productId: number; sessions?: number }): Promise<ActionResult> {
  const admin = await requirePanel();
  const limited = await limitAction("lead-enroll", admin.userId, 60, 10 * 60_000);
  if (limited) return { error: limited };

  const lead = await prisma.lead.findUnique({ where: { id: Number(input.leadId) || 0 } });
  if (!lead) return { error: "Lead tidak ditemukan." };
  if (lead.statusFunnel !== "Paid") return { error: "Hanya lead berstatus Paid (sudah lunas) yang bisa didaftarkan ke kelas." };
  const email = (lead.email ?? "").trim().toLowerCase();
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user || user.role !== "PESERTA") return { error: "Lead ini belum punya akun peserta. Registrasi akun terlebih dahulu." };
  if (!user.isActive) return { error: "Akun peserta ini sedang dinonaktifkan. Aktifkan dulu di menu Pengguna." };
  const product = await prisma.product.findUnique({ where: { id: Number(input.productId) || 0 } });
  if (!product || product.status === "DRAFT") return { fieldErrors: { productId: ["Pilih kelas tujuan."] } };
  const vip = product.type === "PRIVATE";
  const sessions = vip ? Math.min(100, Math.max(1, Math.round(Number(input.sessions) || 1))) : null;

  const linked = await prisma.registration.findFirst({ where: linkedWhere(lead), select: { code: true } });
  if (linked) return { error: `Lead ini sudah terhubung ke pendaftaran ${linked.code}.` };
  if (!vip && (await prisma.registration.count({ where: { userId: user.id, productId: product.id, status: "PAID" } }))) {
    return { error: `${user.name} sudah terdaftar lunas di kelas ${product.name}.` };
  }

  const code = generateRegistrationCode();
  const phone = normalizePhone(lead.noWa);
  await prisma.$transaction([
    prisma.registration.create({
      data: {
        code,
        userId: user.id,
        productId: product.id,
        fullName: lead.nama.slice(0, 120),
        school: schoolOf(lead.catatan) ?? user.school ?? "-",
        phone: phone ?? user.phone ?? "-",
        email,
        source: "Master Lead (aktivasi)",
        adminId: lead.ownerId,
        amount: lead.nominal ?? product.price * (sessions ?? 1),
        sessionsBought: sessions,
        status: "PAID",
        paidAt: lead.tanggalBayar ?? new Date(),
        paymentType: "manual (Master Lead)",
        sourceLeadId: lead.id,
        notes: `Didaftarkan dari Master Lead #${lead.id} oleh ${admin.name}${lead.paket ? ` · paket di lead: "${lead.paket}"` : ""}`,
      },
    }),
    prisma.lead.update({
      where: { id: lead.id },
      data: { paket: product.name, produk: lead.produk || (vip ? "VIP Privat" : "COC"), invoiceId: lead.invoiceId || code, statusBayar: "Paid" },
    }),
    // lengkapi jenjang akun bila masih kosong
    ...(!user.jenjang && ["SD", "SMP", "SMA"].includes(product.jenjang)
      ? [prisma.user.update({ where: { id: user.id }, data: { jenjang: product.jenjang } })]
      : []),
  ]);

  revalidatePath("/admin/leads");
  revalidatePath("/admin/pendaftar");
  revalidatePath(`/admin/produk/${product.id}`);
  return { ok: `${user.name} terdaftar di kelas ${product.name} (Lunas).` };
}

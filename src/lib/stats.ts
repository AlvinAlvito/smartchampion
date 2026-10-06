import "server-only";
import { prisma } from "./prisma";
import { attributeOwners, creditedOwner, detectPaidAcrossData } from "./attribution";
import type { ProductType } from "@prisma/client";
import { FUNNEL_STATUSES, PRODUCT_TYPE_LABEL } from "./constants";
import { inRange, prismaRange, type DateRange } from "./date-range";

const DAY = 86_400_000;

function startOfTodayWib() {
  const now = new Date(Date.now() + 7 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 7 * 3600_000);
}

function countBy<T>(items: T[], key: (t: T) => string | null | undefined) {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it) || "(kosong)";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** ownerId diisi → hanya lead milik admin tsb (akun ADMIN hanya boleh melihat statistiknya sendiri) */
export async function getLeadStats(ownerId?: number) {
  const leads = await prisma.lead.findMany({
    where: ownerId ? { ownerId } : undefined,
    select: { tanggalMasuk: true, statusFunnel: true, sumberLead: true, produk: true, kategori: true, nextFollowUp: true, nominal: true },
  });
  const today = startOfTodayWib();
  const tomorrow = new Date(today.getTime() + DAY);
  const open = (s: string) => !["Paid", "Lost"].includes(s);

  const funnel = FUNNEL_STATUSES.map((s) => ({ name: s, value: leads.filter((l) => l.statusFunnel === s).length }));

  // Tren 8 minggu terakhir (berdasarkan tanggal masuk)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = new Date(tomorrow.getTime() - (7 - i) * 7 * DAY);
    const start = new Date(end.getTime() - 7 * DAY);
    const inRange = leads.filter((l) => l.tanggalMasuk >= start && l.tanggalMasuk < end);
    return {
      label: new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" }).format(start),
      lead: inRange.length,
      paid: inRange.filter((l) => l.statusFunnel === "Paid").length,
    };
  });

  return {
    total: leads.length,
    realLeads: leads.filter((l) => l.kategori !== "Bukan Lead").length,
    paid: leads.filter((l) => l.statusFunnel === "Paid").length,
    lost: leads.filter((l) => l.statusFunnel === "Lost").length,
    followUpToday: leads.filter((l) => l.nextFollowUp && l.nextFollowUp >= today && l.nextFollowUp < tomorrow && open(l.statusFunnel)).length,
    overdue: leads.filter((l) => l.nextFollowUp && l.nextFollowUp < today && open(l.statusFunnel)).length,
    funnel,
    bySource: countBy(leads, (l) => l.sumberLead),
    byProduct: countBy(leads, (l) => l.produk),
    byCategory: countBy(leads, (l) => l.kategori),
    weekly: weeks,
  };
}

/**
 * adminId diisi → angka pendaftar/pendapatan hanya yang ditangani admin tsb.
 * Progres kuota per kelas tetap dihitung dari semua pendaftar (data kelas, bukan kinerja admin).
 */
/** Statistik pendaftaran web semua produk kelas; productType diisi → hanya jenis produk tsb (COC, VIP Privat, …) */
export async function getRegistrationStats(adminId?: number, productType?: ProductType) {
  const [allRegs, products] = await Promise.all([
    prisma.registration.findMany({
      where: productType ? { product: { type: productType } } : undefined,
      select: { status: true, amount: true, source: true, createdAt: true, productId: true, adminId: true, product: { select: { jenjang: true, type: true } } },
    }),
    // VIP Privat tidak memakai kuota minimal → tidak ikut progres kuota
    productType && productType !== "COC"
      ? []
      : prisma.product.findMany({ where: { status: { not: "DRAFT" }, type: "COC" }, orderBy: [{ jenjang: "asc" }, { name: "asc" }] }),
  ]);
  const regs = adminId ? allRegs.filter((r) => r.adminId === adminId) : allRegs;
  const paid = regs.filter((r) => r.status === "PAID");
  const today = startOfTodayWib();

  const daily = Array.from({ length: 30 }, (_, i) => {
    const start = new Date(today.getTime() - (29 - i) * DAY);
    const end = new Date(start.getTime() + DAY);
    const r = regs.filter((x) => x.createdAt >= start && x.createdAt < end);
    return {
      label: new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" }).format(start),
      daftar: r.length,
      lunas: r.filter((x) => x.status === "PAID").length,
    };
  });

  const quota = products.map((p) => {
    const pr = allRegs.filter((r) => r.productId === p.id);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      jenjang: p.jenjang,
      status: p.status,
      minQuota: p.minQuota,
      paid: pr.filter((r) => r.status === "PAID").length,
      pending: pr.filter((r) => r.status === "PENDING").length,
    };
  });

  return {
    total: regs.length,
    paid: paid.length,
    pending: regs.filter((r) => r.status === "PENDING").length,
    revenue: paid.reduce((s, r) => s + r.amount, 0),
    conversion: regs.length ? Math.round((paid.length / regs.length) * 100) : 0,
    classesReady: quota.filter((q) => q.paid >= q.minQuota).length,
    bySource: countBy(regs, (r) => r.source),
    byJenjang: countBy(paid, (r) => r.product?.jenjang ?? "Belum ditempatkan"),
    byType: countBy(paid, (r) => r.product ? (PRODUCT_TYPE_LABEL[r.product.type] ?? r.product.type) : "Belum ditempatkan"),
    daily,
    quota,
  };
}

export type ProductKey = "COC" | "VIP Privat" | "Mimpi.mu" | "Lainnya";
export const SALES_PRODUCTS: ProductKey[] = ["COC", "VIP Privat", "Mimpi.mu", "Lainnya"];

/** Produk di Master Lead → produk yang dihitung terjual. "Mimpi.mu & COC" dihitung di keduanya. */
export function productsOf(produk: string | null): ProductKey[] {
  const p = (produk ?? "").toLowerCase();
  const out: ProductKey[] = [];
  if (p.includes("coc")) out.push("COC");
  if (p.includes("vip") || p.includes("privat")) out.push("VIP Privat");
  if (p.includes("mimpi")) out.push("Mimpi.mu");
  return out.length ? out : ["Lainnya"];
}

type SalesCell = { units: number; revenue: number };
const emptyCell = (): SalesCell => ({ units: 0, revenue: 0 });
const emptyRow = (): Record<ProductKey, SalesCell> => ({ COC: emptyCell(), "VIP Privat": emptyCell(), "Mimpi.mu": emptyCell(), Lainnya: emptyCell() });

/**
 * Penjualan = lead berstatus Paid dengan tanggal bayar di dalam rentang.
 * Pendaftaran COC dari web otomatis tercatat sebagai lead, jadi ikut terhitung di sini.
 */
export async function getProductSales(range: Pick<DateRange, "start" | "end">, ownerId?: number) {
  const [allSold, staff] = await Promise.all([
    prisma.lead.findMany({
      // tanpa owner ikut diambil: bisa jadi milik admin ini setelah dicocokkan dengan lead lain orang yang sama
      where: {
        statusFunnel: "Paid",
        ...(ownerId ? { OR: [{ ownerId }, { ownerId: null }] } : {}),
        ...(prismaRange(range) ? { tanggalBayar: prismaRange(range) } : {}),
      },
      select: {
        id: true,
        nama: true,
        noWa: true,
        email: true,
        statusFunnel: true,
        tanggalMasuk: true,
        invoiceId: true,
        ownerId: true,
        produk: true,
        paket: true,
        nominal: true,
        tanggalBayar: true,
        sumberLead: true,
      },
    }),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPERADMIN"] } },
      select: { id: true, name: true, role: true },
      orderBy: [{ role: "asc" }, { id: "asc" }],
    }),
  ]);
  // Lead Paid tanpa owner → dikreditkan ke admin pemilik lead lain orang yang sama (WA/email/nama mirip) yang masuk sebelum pembayaran;
  // pembayaran yang terjadi sebelum lead masuk ke admin tidak dihitung sebagai penjualan admin tsb (lihat creditedOwner)
  const attributed = await attributeOwners(allSold);
  const withOwner = allSold.map((l) => ({ ...l, ...creditedOwner(l, attributed), originalOwnerId: l.ownerId }));
  const sold = ownerId ? withOwner.filter((l) => l.ownerId === ownerId) : withOwner;

  const totals: Record<ProductKey, SalesCell & { missingNominal: number; byPaket: Map<string, number> }> = {
    COC: { ...emptyCell(), missingNominal: 0, byPaket: new Map() },
    "VIP Privat": { ...emptyCell(), missingNominal: 0, byPaket: new Map() },
    "Mimpi.mu": { ...emptyCell(), missingNominal: 0, byPaket: new Map() },
    Lainnya: { ...emptyCell(), missingNominal: 0, byPaket: new Map() },
  };
  const perOwner = new Map<number | null, Record<ProductKey, SalesCell>>();
  let revenueTotal = 0;
  let bundleCount = 0;

  for (const l of sold) {
    const prods = productsOf(l.produk);
    if (prods.length > 1) bundleCount++;
    revenueTotal += l.nominal ?? 0;
    const row = perOwner.get(l.ownerId) ?? emptyRow();
    for (const p of prods) {
      // Nominal lead gabungan tidak bisa dipecah per produk → hanya dihitung di total pendapatan
      const rev = prods.length === 1 ? (l.nominal ?? 0) : 0;
      totals[p].units++;
      totals[p].revenue += rev;
      if (l.nominal == null) totals[p].missingNominal++;
      const paket = l.paket?.trim() || "(paket tidak dicatat)";
      totals[p].byPaket.set(paket, (totals[p].byPaket.get(paket) ?? 0) + 1);
      row[p].units++;
      row[p].revenue += rev;
    }
    perOwner.set(l.ownerId, row);
  }

  const names = new Map(staff.map((s) => [s.id, s]));
  const ownerIds = ownerId ? [ownerId] : [...new Set([...staff.filter((s) => s.role === "ADMIN").map((s) => s.id), ...perOwner.keys()])];
  const byAdmin = ownerIds
    .map((id) => {
      const row = perOwner.get(id) ?? emptyRow();
      const units = SALES_PRODUCTS.reduce((s, p) => s + row[p].units, 0);
      const revenue = SALES_PRODUCTS.reduce((s, p) => s + row[p].revenue, 0);
      return { id, name: id == null ? "Tanpa owner" : (names.get(id)?.name ?? `User #${id}`), ...row, units, revenue };
    })
    .sort((a, b) => (a.id == null ? 1 : b.id == null ? -1 : b.units - a.units));

  return {
    transactions: sold.length,
    /** penjualan yang owner-nya ditentukan lewat pencocokan identitas */
    attributedCount: sold.filter((l) => l.attributedFrom).length,
    soldLeads: sold,
    revenueTotal,
    bundleCount,
    products: SALES_PRODUCTS.map((p) => ({
      key: p,
      units: totals[p].units,
      revenue: totals[p].revenue,
      missingNominal: totals[p].missingNominal,
      byPaket: [...totals[p].byPaket.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    })),
    byAdmin,
  };
}

/** onlyUserId diisi → hanya baris admin tsb (dipakai untuk akun ADMIN) */
export async function getAdminPerformance(range: Pick<DateRange, "start" | "end">, onlyUserId?: number) {
  const hasRange = Boolean(range.start || range.end);
  const [admins, sales] = await Promise.all([
    prisma.user.findMany({
      where: onlyUserId ? { id: onlyUserId } : { role: { in: ["ADMIN", "SUPERADMIN"] } },
      orderBy: [{ role: "asc" }, { id: "asc" }],
      include: {
        leads: {
          select: {
            id: true,
            nama: true,
            noWa: true,
            email: true,
            ownerId: true,
            invoiceId: true,
            statusFunnel: true,
            nextFollowUp: true,
            kategori: true,
            lastContact: true,
            tanggalMasuk: true,
            tanggalBayar: true,
          },
        },
        // hanya pendaftaran dari web (aktivasi akun dari Master Lead bukan pendaftaran web)
        handledRegistrations: { where: { sourceLeadId: null }, select: { status: true, amount: true, createdAt: true } },
      },
    }),
    getProductSales(range, onlyUserId),
  ]);
  const today = startOfTodayWib();
  // Tanpa filter → "dihubungi" = 7 hari terakhir; dengan filter → dalam periode
  const contactRange = hasRange ? range : { start: new Date(today.getTime() - 6 * DAY), end: null };
  const salesById = new Map(sales.byAdmin.map((s) => [s.id, s]));
  const cohorts = new Map(admins.map((a) => [a.id, a.leads.filter((l) => inRange(l.tanggalMasuk, range))])); // lead yang MASUK di periode
  // lead yang statusnya belum Paid tetapi orangnya sudah membayar (terdeteksi dari data lain)
  const detected = await detectPaidAcrossData([...cohorts.values()].flat());

  const rows = admins
    .map((a) => {
      const cohort = cohorts.get(a.id) ?? [];
      const count = (s: string) => cohort.filter((l) => l.statusFunnel === s).length;
      const real = cohort.filter((l) => l.kategori !== "Bukan Lead").length;
      const paidDetected = cohort.filter((l) => l.kategori !== "Bukan Lead" && detected.has(l.id)).length;
      const regs = a.handledRegistrations.filter((r) => inRange(r.createdAt, range));
      const s = salesById.get(a.id);
      return {
        id: a.id,
        name: a.name,
        role: a.role,
        totalLeads: cohort.length,
        realLeads: real,
        baru: count("Baru"),
        dihubungi: count("Dihubungi"),
        followUp: count("Follow-up"),
        trial: count("Trial"),
        pending: count("Pending"),
        paid: count("Paid"),
        /** belum Paid di Master Lead, tetapi sudah membayar menurut data lain (WA/email/nama mirip) */
        paidDetected,
        lost: count("Lost"),
        conversion: real ? Math.round(((count("Paid") + paidDetected) / real) * 1000) / 10 : 0,
        // snapshot saat ini, tidak terpengaruh filter
        overdue: a.leads.filter((l) => l.nextFollowUp && l.nextFollowUp < today && !["Paid", "Lost"].includes(l.statusFunnel)).length,
        contacted: a.leads.filter((l) => inRange(l.lastContact, contactRange)).length,
        registrations: regs.length,
        registrationsPaid: regs.filter((r) => r.status === "PAID").length,
        sold: s?.units ?? 0,
        soldCoc: s?.COC.units ?? 0,
        soldVip: s?.["VIP Privat"].units ?? 0,
        soldMimpimu: s?.["Mimpi.mu"].units ?? 0,
        revenue: s?.revenue ?? 0,
      };
    })
    .filter((a) => onlyUserId || a.role === "ADMIN" || a.totalLeads > 0 || a.sold > 0);

  return { rows, sales, contactLabel: hasRange ? "Dihubungi (periode)" : "Dihubungi 7 hari" };
}

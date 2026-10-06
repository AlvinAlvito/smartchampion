import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { SessionPayload } from "./session";
import { readDateRange, type DateRange } from "./date-range";
import { getAdminPerformance, getProductSales } from "./stats";
import { attributeOwners, creditedOwner, detectPaidAcrossData } from "./attribution";
import { FUNNEL_STATUSES } from "./constants";

/**
 * Data lengkap laporan performa (PDF & Excel). Definisi sama dengan halaman Performa:
 * - lead & status → lead yang MASUK di periode (tanggal masuk)
 * - penjualan → lead Paid dengan TANGGAL BAYAR di periode
 * - blast → tanggal blast di periode
 * - follow-up terlambat → kondisi saat ini
 */

const DAY = 86_400_000;
const WIB = 7 * 3600_000;

export type ReportScope = { ownerId?: number; ownerName: string };

/** Admin → selalu dirinya; superadmin → admin terpilih (?owner=id) atau semua. */
export async function resolveReportScope(session: SessionPayload, ownerParam: string | null): Promise<ReportScope | null> {
  if (session.role === "ADMIN") return { ownerId: session.userId, ownerName: session.name };
  if (session.role !== "ROOT" && session.role !== "SUPERADMIN") return null;
  const id = Number(ownerParam);
  if (!ownerParam || !Number.isInteger(id) || id <= 0) return { ownerName: "Semua admin" };
  const u = await prisma.user.findFirst({ where: { id, role: { in: ["ADMIN", "SUPERADMIN"] } }, select: { id: true, name: true } });
  return u ? { ownerId: u.id, ownerName: u.name } : null;
}

export function readReportRange(params: URLSearchParams) {
  return readDateRange((k) => params.get(k) ?? undefined);
}

export function rangeFilter(range: Pick<DateRange, "start" | "end">): Prisma.DateTimeFilter | undefined {
  if (!range.start && !range.end) return undefined;
  return { ...(range.start ? { gte: range.start } : {}), ...(range.end ? { lt: range.end } : {}) };
}

const inRange = (d: Date | null | undefined, r: Pick<DateRange, "start" | "end">) =>
  !!d && (!r.start || d >= r.start) && (!r.end || d < r.end);

/* ---------- helper tanggal WIB ---------- */
const wib = (d: Date) => new Date(d.getTime() + WIB);
const dayKey = (d: Date) => wib(d).toISOString().slice(0, 10);
const monthKey = (d: Date) => wib(d).toISOString().slice(0, 7);
/** Senin minggu tsb (yyyy-mm-dd, WIB) */
function weekKey(d: Date) {
  const w = wib(d);
  const dow = (w.getUTCDay() + 6) % 7; // Senin = 0
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() - dow)).toISOString().slice(0, 10);
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const fmtDay = (k: string) => `${Number(k.slice(8, 10))} ${MONTHS[Number(k.slice(5, 7)) - 1]}`;
const fmtMonth = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
const fmtDayShort = (k: string) => `${Number(k.slice(8, 10))}/${Number(k.slice(5, 7))}`;

export type Bucket = { key: string; label: string; leads: number; paid: number; blast: number };

function buildBuckets(
  keys: string[],
  label: (k: string) => string,
  keyOf: (d: Date) => string,
  src: { leads: Date[]; paid: Date[]; blast: Date[] },
): Bucket[] {
  const map = new Map(keys.map((k) => [k, { key: k, label: label(k), leads: 0, paid: 0, blast: 0 }]));
  for (const [field, dates] of Object.entries(src) as ["leads" | "paid" | "blast", Date[]][]) {
    for (const d of dates) {
      const b = map.get(keyOf(d));
      if (b) b[field]++;
    }
  }
  return [...map.values()];
}

function countBy<T>(items: T[], key: (t: T) => string | null | undefined, fallback = "(kosong)") {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it)?.trim() || fallback;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export async function buildPerformanceReport(range: DateRange, scope: ReportScope, generatedBy: string) {
  const owner: Prisma.LeadWhereInput = scope.ownerId ? { ownerId: scope.ownerId } : {};
  const blastOwner: Prisma.BlastWhereInput = scope.ownerId ? { ownerId: scope.ownerId } : {};
  const rf = rangeFilter(range);
  const now = new Date();
  const todayStart = new Date(Date.UTC(wib(now).getUTCFullYear(), wib(now).getUTCMonth(), wib(now).getUTCDate()) - WIB);

  const leadSelect = {
    id: true,
    nama: true,
    noWa: true,
    email: true,
    sumberLead: true,
    kategori: true,
    produk: true,
    paket: true,
    statusFunnel: true,
    nominal: true,
    tanggalMasuk: true,
    tanggalBayar: true,
    lastContact: true,
    nextFollowUp: true,
    invoiceId: true,
    ownerId: true,
    owner: { select: { name: true } },
  } satisfies Prisma.LeadSelect;

  const [cohort, paidLeadsRaw, blasts, overdueLeads, contacted, regs, sales, adminPerf, allContacts, staff] = await Promise.all([
    prisma.lead.findMany({ where: { ...owner, ...(rf ? { tanggalMasuk: rf } : {}) }, select: leadSelect }),
    prisma.lead.findMany({
      // tanpa owner ikut diambil → bisa dikreditkan ke admin lewat pencocokan identitas (sama dengan halaman Performa)
      where: { ...(scope.ownerId ? { OR: [{ ownerId: scope.ownerId }, { ownerId: null }] } : {}), statusFunnel: "Paid", ...(rf ? { tanggalBayar: rf } : {}) },
      select: leadSelect,
      orderBy: { tanggalBayar: "desc" },
    }),
    prisma.blast.findMany({
      where: { ...blastOwner, ...(rf ? { tanggal: rf } : {}) },
      select: { id: true, tanggal: true, asalBlast: true, jenjang: true, provinsi: true, noHp: true, email: true, ownerId: true },
    }),
    prisma.lead.findMany({
      where: { ...owner, nextFollowUp: { lt: todayStart }, statusFunnel: { notIn: ["Paid", "Lost"] } },
      select: leadSelect,
      orderBy: { nextFollowUp: "asc" },
    }),
    prisma.lead.count({ where: { ...owner, ...(rf ? { lastContact: rf } : { lastContact: { not: null } }) } }),
    prisma.registration.findMany({
      where: { sourceLeadId: null, ...(scope.ownerId ? { adminId: scope.ownerId } : {}), ...(rf ? { createdAt: rf } : {}) },
      select: { status: true, amount: true },
    }),
    getProductSales(range, scope.ownerId),
    scope.ownerId ? null : getAdminPerformance(range),
    // semua kontak lead (lintas owner) untuk mengukur blast yang menjadi lead
    prisma.lead.findMany({ select: { noWa: true, email: true, statusFunnel: true } }),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPERADMIN"] } }, select: { id: true, name: true } }),
  ]);

  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const attributed = await attributeOwners(paidLeadsRaw);
  const paidLeads = paidLeadsRaw
    .map((l) => {
      const { ownerId } = creditedOwner(l, attributed);
      return { ...l, ownerId, owner: ownerId ? { name: staffName.get(ownerId) ?? `User #${ownerId}` } : null };
    })
    .filter((l) => !scope.ownerId || l.ownerId === scope.ownerId);
  // lead yang belum Paid tetapi orangnya sudah membayar menurut data lain
  const detected = await detectPaidAcrossData(cohort);
  const isPaid = (l: (typeof cohort)[number]) => l.statusFunnel === "Paid" || detected.has(l.id);

  /* ---------- KPI lead & funnel ---------- */
  const valid = cohort.filter((l) => l.kategori !== "Bukan Lead");
  const status = (s: string) => cohort.filter((l) => l.statusFunnel === s).length;
  const reached = cohort.filter((l) => l.statusFunnel !== "Baru").length;
  const interested = cohort.filter((l) => isPaid(l) || ["Follow-up", "Trial", "Pending"].includes(l.statusFunnel)).length;
  const hot = cohort.filter((l) => isPaid(l) || ["Trial", "Pending"].includes(l.statusFunnel)).length;
  const paidCohort = cohort.filter(isPaid).length;

  const closeDays = paidLeads
    .filter((l) => l.tanggalBayar && l.tanggalBayar >= l.tanggalMasuk)
    .map((l) => Math.round((l.tanggalBayar!.getTime() - l.tanggalMasuk.getTime()) / DAY))
    .sort((a, b) => a - b);
  const avgClose = closeDays.length ? Math.round((closeDays.reduce((s, d) => s + d, 0) / closeDays.length) * 10) / 10 : null;
  const medianClose = closeDays.length ? closeDays[Math.floor(closeDays.length / 2)] : null;

  /* ---------- blast ---------- */
  const leadByContact = new Map<string, string>();
  for (const l of allContacts) {
    if (l.noWa) leadByContact.set(`wa:${l.noWa}`, l.statusFunnel);
    if (l.email) leadByContact.set(`em:${l.email.toLowerCase()}`, l.statusFunnel);
  }
  let blastToLead = 0;
  let blastToPaid = 0;
  for (const b of blasts) {
    const st = (b.noHp && leadByContact.get(`wa:${b.noHp}`)) || (b.email && leadByContact.get(`em:${b.email.toLowerCase()}`));
    if (st) {
      blastToLead++;
      if (st === "Paid") blastToPaid++;
    }
  }

  /* ---------- tren waktu ---------- */
  const spanStart =
    range.start ??
    [...cohort.map((l) => l.tanggalMasuk), ...paidLeads.map((l) => l.tanggalBayar!), ...blasts.map((b) => b.tanggal)].reduce<Date | null>(
      (m, d) => (d && (!m || d < m) ? d : m),
      null,
    ) ??
    todayStart;
  const spanEnd = new Date(Math.min((range.end ?? new Date(todayStart.getTime() + DAY)).getTime(), todayStart.getTime() + DAY) - 1);
  const src = { leads: cohort.map((l) => l.tanggalMasuk), paid: paidLeads.map((l) => l.tanggalBayar!), blast: blasts.map((b) => b.tanggal) };

  const dayKeys: string[] = [];
  for (let t = Math.max(spanStart.getTime(), spanEnd.getTime() - 61 * DAY); t <= spanEnd.getTime(); t += DAY) dayKeys.push(dayKey(new Date(t)));
  const weekKeys: string[] = [];
  for (let t = new Date(`${weekKey(spanStart)}T00:00:00+07:00`).getTime(); t <= spanEnd.getTime(); t += 7 * DAY) weekKeys.push(weekKey(new Date(t)));
  const monthKeys: string[] = [];
  {
    const s = wib(spanStart);
    const e = wib(spanEnd);
    let y = s.getUTCFullYear();
    let m = s.getUTCMonth();
    while (y < e.getUTCFullYear() || (y === e.getUTCFullYear() && m <= e.getUTCMonth())) {
      monthKeys.push(`${y}-${String(m + 1).padStart(2, "0")}`);
      m++;
      if (m === 12) {
        m = 0;
        y++;
      }
    }
  }
  const daily = buildBuckets([...new Set(dayKeys)], fmtDayShort, dayKey, src);
  const weekly = buildBuckets(weekKeys.slice(-26), (k) => fmtDay(k), weekKey, src);
  const monthly = buildBuckets(monthKeys.slice(-24), fmtMonth, monthKey, src);

  /* ---------- rincian ---------- */
  const groupStats = (key: (l: (typeof cohort)[number]) => string | null) => {
    const m = new Map<string, { leads: number; valid: number; paid: number }>();
    for (const l of cohort) {
      const k = key(l)?.trim() || "(kosong)";
      const r = m.get(k) ?? { leads: 0, valid: 0, paid: 0 };
      r.leads++;
      if (l.kategori !== "Bukan Lead") r.valid++;
      if (isPaid(l)) r.paid++;
      m.set(k, r);
    }
    return [...m.entries()].map(([name, r]) => ({ name, ...r, conversion: pct(r.paid, r.valid) })).sort((a, b) => b.leads - a.leads);
  };

  const products = sales.products;

  return {
    meta: {
      ownerName: scope.ownerName,
      allAdmins: !scope.ownerId,
      periodLabel: range.label,
      periodStart: range.start,
      periodEnd: range.end ? new Date(range.end.getTime() - 1) : null,
      trendNote: dayKeys.length < Math.round((spanEnd.getTime() - spanStart.getTime()) / DAY) ? "Grafik harian menampilkan 62 hari terakhir periode." : null,
      generatedAt: now,
      generatedBy,
    },
    kpi: {
      leads: cohort.length,
      valid: valid.length,
      bukanLead: cohort.length - valid.length,
      reached,
      interested,
      hot,
      paid: paidCohort,
      /** bagian dari `paid` yang terdeteksi lewat pencocokan WA/email/nama (status di Master Lead belum Paid) */
      paidDetected: detected.size,
      salesAttributed: sales.attributedCount,
      lost: status("Lost"),
      conversion: pct(paidCohort, valid.length),
      contacted,
      overdue: overdueLeads.length,
      sold: products.reduce((n, p) => n + p.units, 0),
      transactions: sales.transactions,
      revenue: sales.revenueTotal,
      avgTicket: sales.transactions ? Math.round(sales.revenueTotal / sales.transactions) : 0,
      avgCloseDays: avgClose,
      medianCloseDays: medianClose,
      blast: blasts.length,
      blastWa: blasts.filter((b) => b.asalBlast === "WhatsApp").length,
      blastEmail: blasts.filter((b) => b.asalBlast === "Email").length,
      blastToLead,
      blastToPaid,
      blastLeadRate: pct(blastToLead, blasts.length),
      webRegistrations: regs.length,
      webPaid: regs.filter((r) => r.status === "PAID").length,
    },
    funnel: [
      { name: "Lead masuk", value: cohort.length },
      { name: "Lead valid", value: valid.length },
      { name: "Berhasil dihubungi", value: reached },
      { name: "Tertarik (follow-up s.d. paid)", value: interested },
      { name: "Hangat (trial / pending / paid)", value: hot },
      { name: "Paid", value: paidCohort },
    ],
    statuses: FUNNEL_STATUSES.map((s) => ({ name: s, value: status(s) })),
    daily,
    weekly,
    monthly,
    bySource: groupStats((l) => l.sumberLead),
    byProduct: groupStats((l) => l.produk),
    byCategory: countBy(cohort, (l) => l.kategori),
    sales: {
      products: products.map((p) => ({ key: p.key, units: p.units, revenue: p.revenue, missingNominal: p.missingNominal, byPaket: p.byPaket.slice(0, 10) })),
      bundleCount: sales.bundleCount,
    },
    blast: {
      byChannel: countBy(blasts, (b) => b.asalBlast),
      byJenjang: countBy(blasts, (b) => b.jenjang, "(tidak diisi)"),
      byProvinsi: countBy(blasts, (b) => b.provinsi, "(tidak diisi)").slice(0, 10),
      byOwner: countBy(blasts, (b) => (b.ownerId ? (staffName.get(b.ownerId) ?? `User #${b.ownerId}`) : "Tanpa owner")),
    },
    admins: adminPerf
      ? adminPerf.rows.map((r) => ({
          name: r.name,
          leads: r.totalLeads,
          valid: r.realLeads,
          paid: r.paid + r.paidDetected,
          conversion: r.conversion,
          sold: r.sold,
          revenue: r.revenue,
          overdue: r.overdue,
          blast: blasts.filter((b) => b.ownerId === r.id).length,
        }))
      : [],
    overdueList: overdueLeads.slice(0, 30).map((l) => ({
      nama: l.nama,
      noWa: l.noWa,
      status: l.statusFunnel,
      nextFollowUp: l.nextFollowUp!,
      daysLate: Math.max(1, Math.round((todayStart.getTime() - l.nextFollowUp!.getTime()) / DAY)),
      owner: l.owner?.name ?? "-",
    })),
    salesList: paidLeads.slice(0, 30).map((l) => ({
      nama: l.nama,
      produk: l.produk ?? "-",
      paket: l.paket ?? "-",
      nominal: l.nominal,
      tanggalBayar: l.tanggalBayar!,
      owner: l.owner?.name ?? "-",
    })),
    counts: { overdueTotal: overdueLeads.length, salesTotal: paidLeads.length },
  };
}

export type PerformanceReport = Awaited<ReturnType<typeof buildPerformanceReport>>;

/** Filter untuk sheet Excel: lead yang masuk ATAU dibayar di periode; blast di periode. */
export function reportLeadWhere(range: DateRange, scope: ReportScope): Prisma.LeadWhereInput {
  const rf = rangeFilter(range);
  return { ...(scope.ownerId ? { ownerId: scope.ownerId } : {}), ...(rf ? { OR: [{ tanggalMasuk: rf }, { tanggalBayar: rf }] } : {}) };
}
export function reportBlastWhere(range: DateRange, scope: ReportScope): Prisma.BlastWhereInput {
  const rf = rangeFilter(range);
  return { ...(scope.ownerId ? { ownerId: scope.ownerId } : {}), ...(rf ? { tanggal: rf } : {}) };
}
export { inRange as inReportRange };

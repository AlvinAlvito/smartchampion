import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isStaff, statsScope } from "@/lib/session";
import { readDateRange } from "@/lib/date-range";
import { getProductSales, productsOf } from "@/lib/stats";
import { buildSalesTrend, REVENUE_GROUPS, SALES_SOURCES, sourceKeyOf } from "@/lib/sales-trend";
import { buildWorkbookSheets, FMT, sheet, todayStamp, xlsxResponse } from "@/lib/excel";
import { guardRoute } from "@/lib/security";
import { blockReadOnlyDownload } from "@/lib/read-only";

/**
 * Ekspor data di balik grafik penjualan Dashboard & Performa untuk periode yang sama:
 * lead berstatus Paid dengan tanggal bayar dalam periode (fungsi getProductSales yang sama dengan grafik).
 * Akun ADMIN hanya mendapat penjualannya sendiri, sama seperti tampilan grafiknya.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session || !isStaff(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`export:${session.userId}`, 20, 60000);
  if (limited) return limited;

  const range = readDateRange((k) => request.nextUrl.searchParams.get(k) ?? undefined);
  const scope = statsScope(session);
  const [sales, staff] = await Promise.all([
    getProductSales(range, scope),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPERADMIN", "ROOT"] } }, select: { id: true, name: true } }),
  ]);
  const trend = buildSalesTrend(sales, range);
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const srcLabel = new Map(SALES_SOURCES.map((s) => [s.key, s.label]));

  const sold = [...sales.soldLeads].sort((a, b) => (a.tanggalBayar?.getTime() ?? 0) - (b.tanggalBayar?.getTime() ?? 0));
  type Sold = (typeof sold)[number];

  // Ringkasan: angka yang sama dengan kartu & grafik
  type Sum = { bagian: string; item: string; jumlah: number | null; nominal: number | null; catatan: string };
  const summary: Sum[] = [
    ...sales.products.map((p) => ({
      bagian: "Terjual per produk",
      item: p.key,
      jumlah: p.units,
      nominal: p.revenue,
      catatan: p.missingNominal ? `${p.missingNominal} transaksi tanpa nominal` : "",
    })),
    {
      bagian: "Total",
      item: "Transaksi Paid",
      jumlah: sales.transactions,
      nominal: sales.revenueTotal,
      catatan: sales.bundleCount ? `${sales.bundleCount} lead bundling dihitung di 2 produk` : "",
    },
    // pemasukan per produk = kartu "Pemasukan" di Dashboard (bundling dipisah agar jumlahnya = total)
    ...REVENUE_GROUPS.map((g) => ({
      bagian: "Pemasukan per produk",
      item: g.label,
      jumlah: null,
      nominal: trend.revenueTotals[g.key],
      catatan: "",
    })),
    {
      bagian: "Pemasukan per produk",
      item: "TOTAL PEMASUKAN",
      jumlah: trend.revenueTotals.transactions,
      nominal: trend.revenueTotals.total,
      catatan: trend.revenueTotals.missingNominal ? `${trend.revenueTotals.missingNominal} transaksi tanpa nominal (Rp0)` : "",
    },
    ...trend.revenue
      .filter((r) => r.total > 0)
      .map((r) => ({
        bagian: `Pemasukan ${trend.granularity === "day" ? "per hari" : "per bulan"}`,
        item: r.label,
        jumlah: null,
        nominal: r.total,
        catatan: REVENUE_GROUPS.filter((g) => r[g.key])
          .map((g) => `${g.label}: Rp ${r[g.key].toLocaleString("id-ID")}`)
          .join(" · "),
      })),
    ...(["mimpi", "coc"] as const).flatMap((k) =>
      SALES_SOURCES.map((s) => ({
        bagian: `${k === "mimpi" ? "Mimpi.mu" : "COC"} per sumber`,
        item: s.label,
        jumlah: trend.sourceTotals[k][s.key],
        nominal: null,
        catatan: "",
      })),
    ),
    ...sales.byAdmin.map((a) => ({ bagian: "Per admin (owner)", item: a.name, jumlah: a.units, nominal: a.revenue, catatan: "" })),
  ];

  const periode = `Periode ${range.label} (tanggal bayar, WIB)`;
  const buffer = await buildWorkbookSheets([
    sheet<Sum>({
      sheetName: "Ringkasan",
      title: `Ringkasan Penjualan${scope !== undefined ? ` — ${session.name}` : ""} · Pelatihan POSI`,
      subtitle: `${periode} · diekspor ${todayStamp()} oleh ${session.name} · sama dengan grafik Dashboard & Performa`,
      columns: [
        { header: "Bagian", value: (r) => r.bagian, width: 22 },
        { header: "Item", value: (r) => r.item, width: 26 },
        { header: "Jumlah", value: (r) => r.jumlah, width: 10 },
        { header: "Nominal", value: (r) => r.nominal, numFmt: FMT.rupiah },
        { header: "Catatan", value: (r) => r.catatan, width: 70 },
      ],
      rows: summary,
    }),
    sheet<Sold>({
      sheetName: "Transaksi Paid",
      title: "Rincian Transaksi Paid (bukti grafik penjualan)",
      subtitle: `${periode} · ${sold.length} lead · cari Lead ID / invoice di Master Lead untuk melihat datanya`,
      columns: [
        { header: "Tanggal Bayar", value: (l) => l.tanggalBayar, numFmt: FMT.dateTime },
        { header: "Lead ID", value: (l) => l.id, width: 9 },
        { header: "Nama", value: (l) => l.nama },
        { header: "No. WA", value: (l) => l.noWa },
        { header: "Email", value: (l) => l.email },
        { header: "Produk (di lead)", value: (l) => l.produk },
        { header: "Dihitung sebagai", value: (l) => productsOf(l.produk).join(" + ") },
        { header: "Paket/Kelas", value: (l) => l.paket, width: 34 },
        { header: "Nominal", value: (l) => l.nominal, numFmt: FMT.rupiah },
        { header: "Sumber Lead", value: (l) => l.sumberLead },
        { header: "Kelompok Sumber (grafik)", value: (l) => srcLabel.get(sourceKeyOf(l.sumberLead)) },
        { header: "Owner", value: (l) => (l.ownerId ? (names.get(l.ownerId) ?? `User #${l.ownerId}`) : "Tanpa owner") },
        {
          header: "Owner dari pencocokan",
          value: (l) => (l.attributedFrom ? "Ya (lead tanpa owner, dicocokkan dengan lead lain orang yang sama)" : ""),
          width: 30,
        },
        { header: "Invoice", value: (l) => l.invoiceId, width: 26 },
        { header: "Tanggal Masuk", value: (l) => l.tanggalMasuk, numFmt: FMT.date },
      ],
      rows: sold,
    }),
  ]);
  const tag = range.preset === "custom" ? `${range.from || "awal"}_${range.to || "sekarang"}` : range.preset;
  return xlsxResponse(buffer, `penjualan-${tag}-${todayStamp()}.xlsx`);
}

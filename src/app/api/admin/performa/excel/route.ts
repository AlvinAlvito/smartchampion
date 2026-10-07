import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isStaff } from "@/lib/session";
import { buildWorkbookSheets, FMT, sheet, todayStamp, xlsxResponse, type ExcelColumn } from "@/lib/excel";
import { getProductSales, productsOf } from "@/lib/stats";
import { buildSalesTrend, REVENUE_GROUPS, revenueKeyOf } from "@/lib/sales-trend";
import { blastExportColumns, leadExportColumns, type LeadExportRow } from "@/lib/export-columns";
import { inReportRange, readReportRange, reportBlastWhere, reportLeadWhere, resolveReportScope } from "@/lib/performance-report";
import { slugify } from "@/lib/utils";
import { guardRoute } from "@/lib/security";
import { blockReadOnlyDownload } from "@/lib/read-only";

/**
 * Laporan performa (Excel) — mengikuti filter periode halaman Performa:
 * Produk Terjual & Rekap Penjualan (sumber sama persis dengan grafik penjualan), Master Lead, Data Blast.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  // Superadmin = mode lihat saja: tidak boleh mengunduh
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session || !isStaff(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`report-xlsx:${session.userId}`, 10, 60000);
  if (limited) return limited;
  const params = request.nextUrl.searchParams;
  const scope = await resolveReportScope(session, params.get("owner"));
  if (!scope) return NextResponse.json({ message: "owner tidak valid" }, { status: 400 });
  const range = readReportRange(params);

  const [leads, blasts, sales, staff] = await Promise.all([
    prisma.lead.findMany({
      where: reportLeadWhere(range, scope),
      include: { owner: { select: { name: true } } },
      orderBy: [{ tanggalMasuk: "asc" }, { id: "asc" }],
    }),
    prisma.blast.findMany({
      where: reportBlastWhere(range, scope),
      include: { owner: { select: { name: true } } },
      orderBy: [{ tanggal: "asc" }, { id: "asc" }],
    }),
    // sama dengan grafik "Penjualan produk (Paid)" & "Pemasukan" di halaman Performa/Dashboard
    getProductSales(range, scope.ownerId),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const trend = buildSalesTrend(sales, range);
  const staffName = new Map(staff.map((u) => [u.id, u.name]));
  const WIB = 7 * 3600_000;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const bucketOf = (d: Date) => {
    const w = new Date(d.getTime() + WIB);
    return trend.granularity === "day" ? `${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]}` : `${MONTHS[w.getUTCMonth()]} ${String(w.getUTCFullYear()).slice(2)}`;
  };
  const revLabel = new Map<string, string>(REVENUE_GROUPS.map((g) => [g.key, g.label]));

  // 1 baris per produk terjual (lead "Mimpi.mu & COC" = 2 baris, sama seperti hitungan grafik); nominal transaksi hanya di baris pertama
  type SoldRow = {
    tanggalBayar: Date | null;
    bulan: string;
    nama: string;
    produk: string;
    paket: string | null;
    harga: number | null;
    nominal: number | null;
    kelompok: string;
    sumber: string;
    invoice: string | null;
    owner: string;
    ket: string;
  };
  const soldRows: SoldRow[] = [...sales.soldLeads]
    .filter((l) => l.tanggalBayar)
    .sort((a, b) => a.tanggalBayar!.getTime() - b.tanggalBayar!.getTime())
    .flatMap((l) => {
      const prods = productsOf(l.produk);
      const bundle = prods.length > 1;
      const ket =
        "fromRegistration" in l && l.fromRegistration
          ? "Dari transaksi web (lead tidak ada di Master Lead)"
          : l.paidBeforeLead
            ? "Tidak dikreditkan: dibayar sebelum lead masuk ke admin"
            : l.attributedFrom
              ? "Owner dari pencocokan lead lain orang yang sama"
              : "";
      return prods.map((prod, i) => ({
        tanggalBayar: l.tanggalBayar,
        bulan: bucketOf(l.tanggalBayar!),
        nama: l.nama,
        produk: prod,
        paket: l.paket,
        harga: bundle ? null : l.nominal,
        nominal: i === 0 ? l.nominal : null,
        kelompok: revLabel.get(revenueKeyOf(l.produk)) ?? "",
        sumber: l.sumberLead,
        invoice: l.invoiceId,
        owner: l.ownerId ? (staffName.get(l.ownerId) ?? `User #${l.ownerId}`) : "Tanpa owner",
        ket: [bundle ? "Bundling: nominal satu transaksi untuk beberapa produk, tidak dipecah per produk" : "", ket].filter(Boolean).join(" · "),
      }));
    });

  // rekap per bulan/hari = isi grafik (unit per produk) + grafik pemasukan
  type RekapRow = { label: string; mimpi: number; coc: number; vip: number; units: number; rMimpi: number; rCoc: number; rVip: number; rBundling: number; rLain: number; rTotal: number };
  const rekap: RekapRow[] = trend.byProduct.map((b, i) => {
    const r = trend.revenue[i];
    return { label: b.label, mimpi: b.mimpi, coc: b.coc, vip: b.vip, units: b.mimpi + b.coc + b.vip, rMimpi: r.mimpi, rCoc: r.coc, rVip: r.vip, rBundling: r.bundling, rLain: r.lain, rTotal: r.total };
  });
  const rt = trend.revenueTotals;
  rekap.push({
    label: "TOTAL",
    mimpi: trend.totals.mimpi,
    coc: trend.totals.coc,
    vip: trend.totals.vip,
    units: trend.totals.mimpi + trend.totals.coc + trend.totals.vip,
    rMimpi: rt.mimpi,
    rCoc: rt.coc,
    rVip: rt.vip,
    rBundling: rt.bundling,
    rLain: rt.lain,
    rTotal: rt.total,
  });

  // Kolom penanda: kenapa lead ini masuk laporan (masuk di periode / dibayar di periode)
  const hasRange = Boolean(range.start || range.end);
  const periodCol: ExcelColumn<LeadExportRow> = {
    header: "Periode",
    width: 18,
    value: (l) => {
      if (!hasRange) return "Semua waktu";
      const masuk = inReportRange(l.tanggalMasuk, range);
      const bayar = l.statusFunnel === "Paid" && inReportRange(l.tanggalBayar, range);
      return masuk && bayar ? "Masuk & bayar" : bayar ? "Bayar (masuk sebelumnya)" : "Masuk";
    },
  };
  const subtitle = (n: number, noun: string) => `${scope.ownerName} · Periode: ${range.label} · ${n} ${noun} · diunduh ${todayStamp()} oleh ${session.name}`;

  const buffer = await buildWorkbookSheets([
    sheet<RekapRow>({
      sheetName: "Rekap Penjualan",
      title: `Rekap Penjualan — ${scope.ownerName}`,
      subtitle: `${scope.ownerName} · Periode: ${range.label} · per ${trend.granularity === "day" ? "hari" : "bulan"} · sama dengan grafik "Penjualan produk (Paid)" & "Pemasukan" di web · diunduh ${todayStamp()} oleh ${session.name}`,
      columns: [
        { header: trend.granularity === "day" ? "Tanggal" : "Bulan", value: (r) => r.label, width: 12 },
        { header: "Mimpi.mu (terjual)", value: (r) => r.mimpi },
        { header: "COC (terjual)", value: (r) => r.coc },
        { header: "VIP Privat (terjual)", value: (r) => r.vip },
        { header: "Total produk terjual", value: (r) => r.units },
        { header: "Pemasukan Mimpi.mu", value: (r) => r.rMimpi, numFmt: FMT.rupiah },
        { header: "Pemasukan COC", value: (r) => r.rCoc, numFmt: FMT.rupiah },
        { header: "Pemasukan VIP Privat", value: (r) => r.rVip, numFmt: FMT.rupiah },
        { header: "Pemasukan Bundling", value: (r) => r.rBundling, numFmt: FMT.rupiah },
        { header: "Pemasukan Lainnya", value: (r) => r.rLain, numFmt: FMT.rupiah },
        { header: "Total Pemasukan", value: (r) => r.rTotal, numFmt: FMT.rupiah },
      ],
      rows: rekap,
    }),
    sheet<SoldRow>({
      sheetName: "Produk Terjual",
      title: `Produk Terjual (Paid) — ${scope.ownerName}`,
      subtitle: `${scope.ownerName} · Periode: ${range.label} · ${sales.soldLeads.length} transaksi · ${soldRows.length} produk terjual · total pemasukan Rp ${rt.total.toLocaleString("id-ID")} · diunduh ${todayStamp()}`,
      columns: [
        { header: "Tanggal Bayar", value: (r) => r.tanggalBayar, numFmt: FMT.date },
        { header: trend.granularity === "day" ? "Hari (grafik)" : "Bulan (grafik)", value: (r) => r.bulan, width: 12 },
        { header: "Nama", value: (r) => r.nama, width: 28 },
        { header: "Produk", value: (r) => r.produk },
        { header: "Paket/Kelas", value: (r) => r.paket, width: 34 },
        { header: "Harga Produk", value: (r) => r.harga, numFmt: FMT.rupiah },
        { header: "Nominal Transaksi", value: (r) => r.nominal, numFmt: FMT.rupiah },
        { header: "Kelompok Pemasukan", value: (r) => r.kelompok, width: 22 },
        { header: "Sumber Lead", value: (r) => r.sumber },
        { header: "Invoice/Kode", value: (r) => r.invoice, width: 26 },
        { header: "Owner", value: (r) => r.owner },
        { header: "Keterangan", value: (r) => r.ket, width: 40 },
      ],
      rows: soldRows,
    }),
    sheet({
      sheetName: "Master Lead",
      title: `Master Lead — Laporan Performa ${scope.ownerName}`,
      subtitle: subtitle(leads.length, "lead (masuk atau dibayar di periode ini)"),
      columns: [...leadExportColumns, periodCol],
      rows: leads,
    }),
    sheet({
      sheetName: "Data Blast",
      title: `Data Blast — Laporan Performa ${scope.ownerName}`,
      subtitle: subtitle(blasts.length, "data blast"),
      columns: blastExportColumns,
      rows: blasts,
    }),
  ]);
  const periode = range.from || range.to ? `${range.from || "awal"}_${range.to || "sekarang"}` : range.preset;
  return xlsxResponse(buffer, `laporan-performa-${slugify(scope.ownerName)}-${periode}.xlsx`);
}

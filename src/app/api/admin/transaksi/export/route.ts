import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isPanel } from "@/lib/session";
import { PRODUCT_TYPE_LABEL, REG_STATUS_LABEL } from "@/lib/constants";
import { buildTransactionWhere, paymentLabel, readTransactionFilters } from "@/lib/transaction-filters";
import { buildWorkbook, FMT, todayStamp, xlsxResponse } from "@/lib/excel";
import { guardRoute } from "@/lib/security";
import { blockReadOnlyDownload } from "@/lib/read-only";

/** Ekspor transaksi Midtrans (sesuai filter halaman Transaksi) */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session || !isPanel(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`export:${session.userId}`, 20, 60000);
  if (limited) return limited;

  const f = readTransactionFilters((k) => request.nextUrl.searchParams.get(k));
  const rows = await prisma.registration.findMany({
    where: buildTransactionWhere(f),
    orderBy: { createdAt: "desc" },
    include: { product: { select: { name: true, type: true } } },
  });
  type R = (typeof rows)[number];
  const paid = rows.filter((r) => r.status === "PAID");
  const active = Object.entries(f)
    .filter(([k, v]) => v && !(k === "tgl" && v === "daftar"))
    .map(([k, v]) => `${k}=${v}`);
  const buffer = await buildWorkbook<R>({
    sheetName: "Transaksi Midtrans",
    title: "Transaksi Midtrans (pendaftaran web) — Pelatihan POSI",
    subtitle: `Diekspor ${todayStamp()} oleh ${session.name} · ${rows.length} transaksi · lunas ${paid.length} (Rp ${paid.reduce((s, r) => s + r.amount, 0).toLocaleString("id-ID")})${active.length ? ` · filter: ${active.join(", ")}` : ""}`,
    columns: [
      { header: "Kode", value: (r) => r.code },
      { header: "Order ID Midtrans", value: (r) => r.midtransOrderId, width: 30 },
      { header: "Tanggal Daftar", value: (r) => r.createdAt, numFmt: FMT.dateTime },
      { header: "Tanggal Lunas", value: (r) => r.paidAt, numFmt: FMT.dateTime },
      { header: "Nama", value: (r) => r.fullName },
      { header: "Email", value: (r) => r.email },
      { header: "No. WA", value: (r) => r.phone },
      { header: "Jenis Produk", value: (r) => (r.product ? (PRODUCT_TYPE_LABEL[r.product.type] ?? r.product.type) : "") },
      { header: "Kelas", value: (r) => r.product?.name ?? "Belum ditempatkan", width: 34 },
      { header: "Paket (pertemuan)", value: (r) => r.sessionsBought },
      { header: "Nominal", value: (r) => r.amount, numFmt: FMT.rupiah },
      { header: "Metode Bayar", value: (r) => paymentLabel(r.paymentType) },
      { header: "Status", value: (r) => REG_STATUS_LABEL[r.status] },
      { header: "Sumber Info", value: (r) => r.source },
    ],
    rows,
  });
  return xlsxResponse(buffer, `transaksi-midtrans-${todayStamp()}.xlsx`);
}

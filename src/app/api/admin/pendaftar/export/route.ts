import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isPanel } from "@/lib/session";
import { PRODUCT_TYPE_LABEL, REG_STATUS_LABEL } from "@/lib/constants";
import { buildRegistrationWhere, readRegistrationFilters } from "@/lib/registration-filters";
import { buildWorkbook, FMT, todayStamp, xlsxResponse, type ExcelColumn } from "@/lib/excel";
import { guardRoute } from "@/lib/security";
import { blockReadOnlyDownload } from "@/lib/read-only";

export async function GET(request: NextRequest) {
  const session = await getSession();
  // Superadmin = mode lihat saja: tidak boleh mengunduh
  const readOnly = blockReadOnlyDownload(session?.role);
  if (readOnly) return readOnly;
  if (!session || !isPanel(session.role)) return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  const limited = guardRoute(`export:${session.userId}`, 20, 60000);
  if (limited) return limited;

  const filters = readRegistrationFilters((k) => request.nextUrl.searchParams.get(k));
  const regs = await prisma.registration.findMany({
    where: buildRegistrationWhere(filters),
    include: { product: { select: { name: true, type: true, bidang: true, jenjang: true } }, admin: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  type R = (typeof regs)[number];

  const columns: ExcelColumn<R>[] = [
    { header: "Kode", value: (r) => r.code },
    { header: "Tanggal Daftar", value: (r) => r.createdAt, numFmt: FMT.dateTime },
    { header: "Nama Lengkap", value: (r) => r.fullName },
    { header: "Asal Sekolah", value: (r) => r.school },
    { header: "No. WA", value: (r) => r.phone },
    { header: "No. WA Orang Tua", value: (r) => r.parentPhone },
    { header: "Email", value: (r) => r.email },
    { header: "Jenis Produk", value: (r) => r.product ? (PRODUCT_TYPE_LABEL[r.product.type] ?? r.product.type) : "-" },
    { header: "Kelas", value: (r) => r.product?.name ?? "Belum ditempatkan" },
    { header: "Bidang", value: (r) => r.product?.bidang ?? "-" },
    { header: "Jenjang", value: (r) => r.product?.jenjang ?? "-" },
    { header: "Dapat Info Dari", value: (r) => r.source },
    { header: "Admin", value: (r) => r.admin?.name },
    { header: "Nominal", value: (r) => r.amount, numFmt: FMT.rupiah },
    { header: "Status", value: (r) => REG_STATUS_LABEL[r.status] },
    { header: "Metode Bayar", value: (r) => r.paymentType },
    { header: "Tanggal Lunas", value: (r) => r.paidAt, numFmt: FMT.dateTime },
    { header: "Catatan", value: (r) => r.notes, width: 40 },
  ];

  const active = Object.entries(filters).filter(([, v]) => v);
  const buffer = await buildWorkbook({
    sheetName: "Peserta Terdaftar",
    title: `Peserta Terdaftar${filters.type ? ` — ${PRODUCT_TYPE_LABEL[filters.type]}` : " — Semua Produk Kelas"} · Pelatihan POSI`,
    subtitle: `Diekspor ${todayStamp()} oleh ${session.name} · ${regs.length} peserta${active.length ? ` · filter: ${active.map(([k, v]) => `${k}=${v}`).join(", ")}` : ""}`,
    columns,
    rows: regs,
  });
  return xlsxResponse(buffer, `peserta-terdaftar-${filters.type ? `${filters.type.toLowerCase()}-` : ""}${todayStamp()}.xlsx`);
}

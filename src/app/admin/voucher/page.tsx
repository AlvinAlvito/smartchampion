import { TicketPercent } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { PRODUCT_TYPE_LABEL } from "@/lib/constants";
import { PageTitle } from "@/components/ui";
import { VoucherAdmin, VoucherButton } from "./voucher-admin";

export const metadata = { title: "Voucher" };
export const dynamic = "force-dynamic";

export default async function VoucherPage() {
  await requirePanel();
  const [vouchers, usage, products] = await Promise.all([
    prisma.voucher.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { products: { select: { id: true, name: true } }, createdBy: { select: { name: true } } },
    }),
    // pemakaian per voucher & status: lunas, menunggu bayar (keduanya memakai kuota) + total potongan yang lunas
    prisma.registration.groupBy({ by: ["voucherId", "status"], where: { voucherId: { not: null } }, _count: true, _sum: { discount: true } }),
    prisma.product.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }], select: { id: true, name: true, type: true, status: true } }),
  ]);
  const use = (id: number, status: string) => usage.find((u) => u.voucherId === id && u.status === status);

  return (
    <>
      <PageTitle
        icon={TicketPercent}
        eyebrow="Promo"
        title="Voucher Diskon"
        subtitle="Kode voucher yang bisa dimasukkan peserta di form pendaftaran: potongan persen atau rupiah, masa berlaku, kuota, dan kelas yang berlaku."
        action={<VoucherButton voucher={null} products={products.map((p) => ({ ...p, typeLabel: PRODUCT_TYPE_LABEL[p.type] ?? p.type }))} />}
      />
      <VoucherAdmin
        products={products.map((p) => ({ ...p, typeLabel: PRODUCT_TYPE_LABEL[p.type] ?? p.type }))}
        vouchers={vouchers.map((v) => ({
          id: v.id,
          code: v.code,
          description: v.description,
          type: v.type,
          value: v.value,
          maxDiscount: v.maxDiscount,
          minAmount: v.minAmount,
          quota: v.quota,
          validFrom: v.validFrom,
          validUntil: v.validUntil,
          isActive: v.isActive,
          allProducts: v.allProducts,
          productIds: v.products.map((p) => p.id),
          productNames: v.products.map((p) => p.name),
          createdBy: v.createdBy?.name ?? null,
          paid: use(v.id, "PAID")?._count ?? 0,
          pending: use(v.id, "PENDING")?._count ?? 0,
          discountPaid: use(v.id, "PAID")?._sum.discount ?? 0,
        }))}
      />
    </>
  );
}

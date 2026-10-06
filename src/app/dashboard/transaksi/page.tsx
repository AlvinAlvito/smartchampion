import Link from "next/link";
import { ArrowRight, CalendarDays, CircleCheck, CircleX, Clock3, CreditCard, Hash, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { REG_STATUS_LABEL } from "@/lib/constants";
import { formatDate, formatRupiah } from "@/lib/utils";
import { Badge, EmptyState, PageTitle, statusTone } from "@/components/ui";

export const metadata = { title: "Transaksi Saya" };
export const dynamic = "force-dynamic";

function StatusIcon({ status }: { status: string }) {
  if (status === "PAID") return <CircleCheck className="h-5 w-5" />;
  if (status === "PENDING") return <Clock3 className="h-5 w-5" />;
  return <CircleX className="h-5 w-5" />;
}

function statusIconTone(status: string) {
  if (status === "PAID") return "bg-emerald-100 text-emerald-600";
  if (status === "PENDING") return "bg-amber-100 text-amber-600";
  return "bg-rose-100 text-rose-600";
}

export default async function TransaksiPage() {
  const session = await requireUser(["PESERTA"]);
  const transactions = await prisma.registration.findMany({
    where: { userId: session.userId },
    include: { product: { select: { name: true, bidang: true, jenjang: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="Transaksi saya" subtitle="Lihat riwayat pendaftaran dan status pembayaran kelasmu." icon={Receipt} />

      {transactions.length ? (
        <div className="space-y-4">
          {transactions.map((transaction, index) => {
            const pending = transaction.status === "PENDING";
            return (
              <article key={transaction.id} className="card animate-fade-up overflow-hidden p-0!" style={{ animationDelay: `${index * 55}ms` }}>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-navy-100 bg-navy-50/55 px-5 py-4 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${statusIconTone(transaction.status)}`}>
                      <StatusIcon status={transaction.status} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate font-extrabold text-navy-900">{transaction.product?.name ?? "Belum ditempatkan ke kelas"}</h2>
                      <p className="mt-0.5 text-xs font-medium text-navy-400">{transaction.product ? `${transaction.product.bidang} · ${transaction.product.jenjang}` : "Hubungi admin untuk penempatan kelas"}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-extrabold tracking-tight text-navy-900">{formatRupiah(transaction.amount)}</p>
                    <Badge tone={statusTone(transaction.status)}>{REG_STATUS_LABEL[transaction.status]}</Badge>
                  </div>
                </div>

                <div className="grid gap-x-8 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2 sm:px-6">
                  <p className="flex items-start gap-2 text-navy-600">
                    <Hash className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    <span><span className="block text-xs text-navy-400">Kode transaksi</span><b className="font-mono text-xs text-navy-700">{transaction.code}</b></span>
                  </p>
                  <p className="flex items-start gap-2 text-navy-600">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    <span><span className="block text-xs text-navy-400">Tanggal pendaftaran</span><b>{formatDate(transaction.createdAt, true)} WIB</b></span>
                  </p>
                  <p className="flex items-start gap-2 text-navy-600">
                    <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    <span><span className="block text-xs text-navy-400">Metode pembayaran</span><b>{transaction.paymentType ?? "Belum dipilih"}</b></span>
                  </p>
                  <p className="flex items-start gap-2 text-navy-600">
                    <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    <span><span className="block text-xs text-navy-400">Waktu pembayaran</span><b>{transaction.paidAt ? `${formatDate(transaction.paidAt, true)} WIB` : "Belum dibayar"}</b></span>
                  </p>
                </div>

                <div className="flex justify-end border-t border-navy-100 bg-white px-5 py-3 sm:px-6">
                  <Link href={`/pembayaran/${transaction.code}`} className={pending ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>
                    {pending ? "Lanjutkan pembayaran" : "Lihat detail pembayaran"} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Receipt}
          title="Belum ada transaksi"
          desc="Pendaftaran kelas yang kamu buat akan muncul di sini."
          action={<Link href="/kelas" className="btn-primary mt-2">Lihat katalog kelas <ArrowRight className="h-4 w-4" /></Link>}
        />
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, CircleCheck, CircleX, Hourglass, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession, isPanel } from "@/lib/session";
import { getTransactionStatus, mapMidtransStatus, midtransEnabled, simulationEnabled, SNAP_JS_URL } from "@/lib/midtrans";
import { applyRegistrationStatus } from "@/lib/payments";
import { REG_STATUS_LABEL } from "@/lib/constants";
import { formatDate, formatRupiah } from "@/lib/utils";
import { Badge, statusTone } from "@/components/ui";
import { PaymentActions } from "./payment-actions";
import { Confetti } from "@/components/confetti";
import { NOINDEX } from "@/lib/seo";

export const metadata = { title: "Pembayaran", ...NOINDEX };
export const dynamic = "force-dynamic";

export default async function PembayaranPage({ params }: PageProps<"/pembayaran/[code]">) {
  const { code } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/pembayaran/${code}`);

  let reg = await prisma.registration.findUnique({ where: { code }, include: { product: true } });
  if (!reg || (reg.userId !== session.userId && !isPanel(session.role))) notFound();

  // Sinkron status dari Midtrans ketika kembali dari halaman pembayaran
  if (reg.status === "PENDING" && reg.midtransOrderId && midtransEnabled()) {
    const st = await getTransactionStatus(reg.midtransOrderId);
    const mapped = st && mapMidtransStatus(st);
    if (mapped && mapped !== reg.status) {
      await applyRegistrationStatus(reg.id, mapped, st.payment_type);
      reg = await prisma.registration.findUniqueOrThrow({ where: { code }, include: { product: true } });
    }
  }
  if (!reg.product) notFound();

  const rows: [string, React.ReactNode][] = [
    [reg.sessionsBought ? "VIP Privat" : "Kelas", reg.product.name],
    ...(reg.sessionsBought ? ([["Paket", `${reg.sessionsBought}x pertemuan`]] as [string, React.ReactNode][]) : []),
    ["Nama peserta", reg.fullName],
    ["Asal sekolah", reg.school],
    ["WhatsApp", reg.phone],
    ["Email", reg.email],
    ["Tanggal daftar", formatDate(reg.createdAt, true)],
  ];
  const paid = reg.status === "PAID";
  const pending = reg.status === "PENDING";
  const StatusIcon = paid ? CircleCheck : pending ? Hourglass : CircleX;

  return (
    <div className="bg-dots">
      <div className="container-page max-w-2xl py-10 sm:py-14">
        {paid && <Confetti />}
        <div className="card relative animate-fade-up overflow-hidden p-0!">
          <div
            className={`relative overflow-hidden px-6 py-8 text-center text-white sm:px-8 ${paid ? "bg-linear-to-br from-emerald-500 via-teal-600 to-navy-800" : pending ? "bg-hero" : "bg-linear-to-br from-rose-500 to-navy-800"}`}
          >
            <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
            <span className="relative mx-auto grid h-16 w-16 animate-pop place-items-center rounded-3xl bg-white/15 ring-4 ring-white/20">
              <StatusIcon className={`h-8 w-8 ${pending ? "animate-pulse" : ""}`} />
            </span>
            <p className="relative mt-4 text-sm text-white/80">{paid ? "Pembayaran berhasil" : pending ? "Menunggu pembayaran" : "Pendaftaran tidak aktif"}</p>
            <p className="relative text-4xl font-extrabold tracking-tight">{formatRupiah(reg.amount)}</p>
            <p className="relative mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-mono text-xs">
              <Receipt className="h-3.5 w-3.5" /> {reg.code}
            </p>
          </div>

          <div className="space-y-6 p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <h1 className="font-bold text-navy-900">Rincian pendaftaran</h1>
              <Badge tone={statusTone(reg.status)}>{REG_STATUS_LABEL[reg.status]}</Badge>
            </div>
            <dl className="divide-y divide-dashed divide-navy-100 rounded-2xl bg-navy-50/50 px-4 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2.5">
                  <dt className="text-navy-400">{k}</dt>
                  <dd className="text-right font-semibold text-navy-800">{v}</dd>
                </div>
              ))}
            </dl>

            {paid ? (
              <div className="rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-800 ring-1 ring-emerald-100">
                <p className="text-base font-bold">Selamat, kamu resmi terdaftar! 🎉</p>
                <p className="mt-1">
                  {reg.sessionsBought
                    ? `Paket ${reg.sessionsBought}x pertemuan VIP aktif. Admin akan menghubungi via WhatsApp untuk mengatur jadwal bersama tutor.`
                    : "Admin akan menghubungi via WhatsApp untuk info grup kelas. Jadwal & materi bisa dilihat di dashboard."}
                </p>
                <Link href="/dashboard" className="btn-primary mt-4">
                  Buka dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : pending ? (
              <PaymentActions code={reg.code} midtransEnabled={midtransEnabled()} simulation={simulationEnabled()} snapJsUrl={SNAP_JS_URL} clientKey={process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? ""} />
            ) : (
              <div className="rounded-2xl bg-rose-50 p-5 text-sm text-rose-700 ring-1 ring-rose-100">
                Pendaftaran ini berstatus <b>{REG_STATUS_LABEL[reg.status]}</b>. Silakan daftar ulang dari{" "}
                <Link className="font-semibold underline" href={`/kelas/${reg.product.slug}`}>
                  halaman kelas
                </Link>
                .
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

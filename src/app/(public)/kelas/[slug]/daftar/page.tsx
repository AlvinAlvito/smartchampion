import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, CreditCard, ShieldCheck, UserRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { formatRupiah } from "@/lib/utils";
import { subjectVisual } from "@/components/product-card";
import { EmptyState } from "@/components/ui";
import { RegistrationForm } from "./registration-form";
import { NOINDEX } from "@/lib/seo";

export const metadata = { title: "Form Pendaftaran", ...NOINDEX };

const STEPS = [
  { icon: UserRound, label: "Akun" },
  { icon: ClipboardList, label: "Data diri" },
  { icon: CreditCard, label: "Pembayaran" },
];

export default async function DaftarPage({ params, searchParams }: PageProps<"/kelas/[slug]/daftar">) {
  const { slug } = await params;
  const sp = await searchParams;
  const paketId = Number(typeof sp.paket === "string" ? sp.paket : "") || 0;
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/kelas/${slug}/daftar${paketId ? `?paket=${paketId}` : ""}`)}`);

  const product = await prisma.product.findUnique({ where: { slug } });
  if (!product || !["OPEN", "RUNNING"].includes(product.status)) notFound();
  // VIP Privat wajib memilih paket pertemuan terlebih dahulu
  const vip = product.type === "PRIVATE";
  const pkg = vip ? await prisma.productPackage.findFirst({ where: { id: paketId, productId: product.id, isActive: true } }) : null;
  if (vip && !pkg) redirect(`/kelas/${slug}`);

  if (session.role !== "PESERTA") {
    return (
      <div className="container-page py-16">
        <EmptyState icon={ShieldCheck} title="Form ini khusus akun peserta" desc="Kamu masuk sebagai admin. Keluar lalu masuk dengan akun peserta untuk mencoba pendaftaran." />
      </div>
    );
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const { icon: Icon, gradient } = subjectVisual(product.bidang);

  return (
    <div className="bg-dots">
      <div className="container-page py-8 sm:py-12">
        <Link href={`/kelas/${slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:gap-2.5">
          <ArrowLeft className="h-4 w-4" /> {product.name}
        </Link>

        {/* Stepper */}
        <ol className="my-8 flex items-center justify-center gap-2 sm:gap-4">
          {STEPS.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2 sm:gap-4">
              <span className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold sm:text-sm ${i <= 1 ? "bg-linear-to-r from-brand-600 to-navy-700 text-white shadow-lg shadow-brand-500/25" : "bg-white text-navy-400 ring-1 ring-navy-100"}`}>
                <s.icon className="h-4 w-4" /> <span className="hidden sm:inline">{s.label}</span>
              </span>
              {i < STEPS.length - 1 && <span className={`h-0.5 w-6 rounded-full sm:w-14 ${i < 1 ? "bg-brand-500" : "bg-navy-100"}`} />}
            </li>
          ))}
        </ol>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card animate-fade-up p-6 sm:p-8 lg:col-span-2">
            <h1 className="text-2xl font-extrabold text-navy-900">{vip ? "Form Pendaftaran VIP Privat" : "Form Pendaftaran COC 2026"}</h1>
            <p className="mb-7 mt-1 text-sm text-navy-400">Data sudah terisi dari akunmu. Periksa lagi, lalu lanjut ke pembayaran.</p>
            <RegistrationForm
              productId={product.id}
              packageId={pkg?.id}
              defaults={{ fullName: user.name, school: user.school ?? "", phone: user.phone ?? "", email: user.email }}
            />
          </div>
          <aside className="h-fit animate-fade-up space-y-4 [animation-delay:120ms]">
            <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-navy-900 to-brand-900 p-6 text-white shadow-xl">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-500/30 blur-2xl" />
              <span className={`relative grid h-12 w-12 place-items-center rounded-2xl bg-linear-to-br ${gradient} ring-2 ring-white/20`}>
                <Icon className="h-6 w-6" />
              </span>
              <p className="relative mt-4 text-xs text-brand-200">{vip ? "VIP Privat yang dipilih" : "Kelas yang dipilih"}</p>
              <p className="relative font-bold">{product.name}</p>
              {pkg ? (
                <>
                  <p className="relative mt-3 inline-flex rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold text-navy-950">{pkg.sessions}x pertemuan</p>
                  <p className="relative mt-3 text-3xl font-extrabold">{formatRupiah(pkg.price)}</p>
                  <p className="relative text-sm text-navy-200">
                    dibayar sekali · {formatRupiah(Math.round(pkg.price / pkg.sessions))}/pertemuan
                  </p>
                  <Link href={`/kelas/${slug}`} className="relative mt-3 inline-block text-xs font-bold text-brand-200 underline hover:text-white">
                    Ganti paket
                  </Link>
                </>
              ) : (
                <>
                  <p className="relative mt-4 text-3xl font-extrabold">{formatRupiah(product.price)}</p>
                  <p className="relative text-sm text-navy-200">per {product.priceUnit}</p>
                </>
              )}
            </div>
            <div className="card flex gap-3 text-sm text-navy-500">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
              Pembayaran via Midtrans. Bukti transfer tidak perlu diunggah karena pembayaran tercatat otomatis.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

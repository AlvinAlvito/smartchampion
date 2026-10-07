import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarClock, CalendarDays, Check, CircleCheck, Clock, Crown, Gamepad2, Lock, ShieldCheck, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { paidCountByProduct } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { JENJANG_LABEL, PRODUCT_STATUS_LABEL } from "@/lib/constants";
import { formatDate, formatRupiah } from "@/lib/utils";
import { QuotaBar } from "@/components/ui";
import { subjectVisual } from "@/components/product-card";
import { ClassTutors } from "@/components/class-tutors";
import { PackagePicker } from "./package-picker";
import { quotaHype, quotaVisible } from "@/lib/quota";
import { JsonLd } from "@/components/json-ld";
import { NOINDEX, SITE_NAME, SITE_URL, abs, breadcrumbLd, pageMeta } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/kelas/[slug]">) {
  const { slug } = await params;
  const p = await prisma.product.findUnique({
    where: { slug },
    select: { name: true, shortDesc: true, price: true, priceUnit: true, jenjang: true, type: true, status: true },
  });
  if (!p || p.status === "DRAFT") return { title: "Kelas tidak ditemukan", ...NOINDEX };
  const vip = p.type === "PRIVATE";
  return pageMeta({
    title: `${p.name} — ${vip ? "Les Privat" : "Kelas"} Olimpiade Online ${JENJANG_LABEL[p.jenjang] ?? ""}`.trim(),
    description: `${p.shortDesc} Mulai ${formatRupiah(p.price)}/${p.priceUnit}. ${vip ? "Belajar 1-on-1 bersama tutor, jadwal fleksibel." : "Kelas grup online bersama tutor medalis."} Daftar online di Pelatihan POSI.`,
    path: `/kelas/${slug}`,
  });
}

export default async function KelasDetailPage({ params }: PageProps<"/kelas/[slug]">) {
  const { slug } = await params;
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      sessions: { orderBy: { startAt: "asc" }, take: 6 },
      packages: { where: { isActive: true }, orderBy: { sessions: "asc" }, select: { id: true, sessions: true, price: true, label: true } },
    },
  });
  if (!product || product.status === "DRAFT") notFound();

  const [counts, session] = await Promise.all([paidCountByProduct([product.id]), getSession()]);
  const paid = counts.get(product.id) ?? 0;
  const canRegister = ["OPEN", "RUNNING"].includes(product.status);
  const vip = product.type === "PRIVATE";
  const other = product.type === "OTHER";
  const showQuota = quotaVisible({ ...product, paidCount: paid });
  const hype = showQuota ? quotaHype({ ...product, paidCount: paid }) : null;
  const myRegs = session
    ? await prisma.registration.findMany({ where: { userId: session.userId, productId: product.id, status: { in: ["PENDING", "PAID"] } }, orderBy: { createdAt: "desc" } })
    : [];
  const myReg = myRegs.find((r) => r.status === "PENDING") ?? myRegs[0] ?? null;
  // VIP: paket lunas yang masih punya sisa pertemuan, dan pesanan yang belum dibayar
  const activeVip = vip ? myRegs.find((r) => r.status === "PAID" && (r.sessionsBought ?? 0) > r.sessionsDone) : undefined;
  const pendingVip = vip ? myRegs.find((r) => r.status === "PENDING") : undefined;
  const { icon: Icon, gradient } = subjectVisual(product.bidang);
  const [intro, ...rest] = product.description.split("\n\n");
  const instructors = await prisma.tutor.findMany({ where: { isPublished: true, classes: { some: { id: product.id } } }, select: { nama: true } });
  const courseLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: product.name,
    description: product.shortDesc,
    url: abs(`/kelas/${product.slug}`),
    inLanguage: "id",
    educationalLevel: JENJANG_LABEL[product.jenjang],
    about: product.bidang,
    provider: { "@type": "EducationalOrganization", name: SITE_NAME, sameAs: SITE_URL },
    offers: [
      {
        "@type": "Offer",
        category: "Paid",
        price: product.price,
        priceCurrency: "IDR",
        availability: canRegister ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
        url: abs(`/kelas/${product.slug}`),
      },
    ],
    hasCourseInstance: [
      {
        "@type": "CourseInstance",
        courseMode: "Online",
        ...(product.startDate ? { startDate: product.startDate.toISOString().slice(0, 10) } : {}),
        ...(instructors.length ? { instructor: instructors.map((t) => ({ "@type": "Person", name: t.nama })) } : {}),
      },
    ],
  };

  return (
    <>
      <JsonLd
        data={[
          courseLd,
          breadcrumbLd([
            { name: "Beranda", path: "/" },
            { name: "Kelas", path: "/kelas" },
            { name: product.name, path: `/kelas/${product.slug}` },
          ]),
        ]}
      />
      <section className="relative overflow-hidden bg-hero pb-28 pt-8 text-white">
        <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
        <div className="pointer-events-none absolute -right-20 top-0 h-80 w-80 animate-blob rounded-full bg-brand-500/30 blur-3xl" />
        <div className="container-page relative animate-fade-up">
          <Link href="/kelas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-200 transition hover:gap-2.5 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Katalog kelas
          </Link>
          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
            <span className={`grid h-20 w-20 shrink-0 animate-float place-items-center rounded-[28px] bg-linear-to-br ${gradient} shadow-2xl ring-4 ring-white/10`}>
              <Icon className="h-10 w-10" />
            </span>
            <div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <span className="badge bg-white/15 text-white">{JENJANG_LABEL[product.jenjang]}</span>
                <span className="badge bg-white/15 text-white">{product.level}</span>
                {product.gradeLabel && <span className="badge bg-white/15 text-white">{product.gradeLabel}</span>}
                <span className="badge bg-emerald-400/20 text-emerald-200">{PRODUCT_STATUS_LABEL[product.status]}</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{product.name}</h1>
              <p className="mt-2 max-w-2xl text-navy-200">{product.shortDesc}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="container-page relative z-10 -mt-16 grid gap-6 pb-10 lg:grid-cols-3">
        <div className="stagger space-y-6 lg:col-span-2">
          <div className="card">
            <h2 className="mb-3 text-lg font-bold text-navy-900">Tentang kelas</h2>
            <p className="leading-relaxed text-navy-600">{intro}</p>
            {rest.length > 0 && (
              <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {rest
                  .join("\n")
                  .split("\n")
                  .filter((l) => l.trim().startsWith("•"))
                  .map((l) => (
                    <li key={l} className="flex items-start gap-2.5 rounded-2xl bg-brand-50/60 p-3 text-sm text-navy-700">
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> {l.replace("•", "").trim()}
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <ClassTutors productId={product.id} />

          <div className="card">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy-900">
              <CalendarDays className="h-5 w-5 text-brand-600" /> Jadwal
            </h2>
            {product.scheduleInfo && (
              <p className="mb-4 flex items-center gap-2 rounded-2xl bg-navy-50 px-4 py-3 text-sm font-medium text-navy-700">
                <Clock className="h-4 w-4 text-brand-600" /> {product.scheduleInfo}
              </p>
            )}
            {product.sessions.length ? (
              <ol className="relative space-y-3 border-l-2 border-brand-100 pl-5">
                {product.sessions.map((s) => (
                  <li key={s.id} className="relative">
                    <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-brand-500 ring-4 ring-brand-100" />
                    <p className="font-semibold text-navy-800">{s.title}</p>
                    <p className="text-xs text-navy-400">{formatDate(s.startAt, true)} WIB</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="flex items-center gap-2 text-sm text-navy-400">
                <CalendarClock className="h-4 w-4" />{" "}
                {vip
                  ? "Jadwal privat diatur bersama tutor setelah pembayaran, menyesuaikan waktu luangmu."
                  : other
                    ? `Program ${product.sessionCount ?? 1}x pertemuan — jadwal diumumkan admin kepada peserta yang sudah terdaftar.`
                    : `Jadwal pertemuan diumumkan setelah kuota minimal ${product.minQuota} peserta terpenuhi.`}
              </p>
            )}
          </div>
        </div>

        <aside className="h-fit animate-fade-up lg:sticky lg:top-24">
          {vip ? (
            <div className="card overflow-hidden p-0!">
              <div className="bg-linear-to-br from-amber-50 to-white p-6">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-700">
                  <Crown className="h-4 w-4" /> VIP Privat · 1-on-1
                </p>
                <p className="mt-1 text-4xl font-extrabold tracking-tight text-navy-900">{formatRupiah(product.price)}</p>
                <p className="text-sm text-navy-400">per pertemuan · pilih paket di bawah</p>
              </div>
              <div className="space-y-5 p-6">
                {pendingVip ? (
                  <div className="space-y-2">
                    <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
                      Kamu punya pesanan <b>{pendingVip.sessionsBought}x pertemuan</b> yang belum dibayar.
                    </p>
                    <Link href={`/pembayaran/${pendingVip.code}`} className="btn-primary w-full py-3">
                      Lanjutkan pembayaran <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                ) : (
                  <>
                    {activeVip && (
                      <Link
                        href={`/dashboard/kelas/${product.slug}`}
                        className="block rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-100 transition hover:bg-emerald-100"
                      >
                        <Check className="mr-1 inline h-4 w-4" /> Paket aktif:{" "}
                        <b>
                          {activeVip.sessionsDone}/{activeVip.sessionsBought} pertemuan
                        </b>{" "}
                        terpakai. Mau tambah paket? Pilih di bawah.
                      </Link>
                    )}
                    <PackagePicker slug={product.slug} packages={product.packages} pricePerSession={product.price} canRegister={canRegister} />
                  </>
                )}
                <ul className="space-y-2 border-t border-navy-50 pt-4 text-xs text-navy-500">
                  <li className="flex gap-2">
                    <Crown className="h-4 w-4 shrink-0 text-amber-500" /> Belajar 1-on-1 bersama tutor, materi disesuaikan kebutuhanmu.
                  </li>
                  <li className="flex gap-2">
                    <CalendarDays className="h-4 w-4 shrink-0 text-brand-500" /> Jadwal diatur fleksibel bersama tutor setelah pembayaran.
                  </li>
                  <li className="flex gap-2">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-brand-500" /> Bayar sekali untuk seluruh paket, aman melalui Midtrans.
                  </li>
                </ul>
              </div>
            </div>
          ) : (
          <div className="card overflow-hidden p-0!">
            <div className="bg-linear-to-br from-brand-50 to-white p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-navy-400">Biaya kelas</p>
              <p className="mt-1 text-4xl font-extrabold tracking-tight text-navy-900">{formatRupiah(product.price)}</p>
              <p className="text-sm text-navy-400">
                per {product.priceUnit}
                {other ? ` · ${product.sessionCount ?? 1}x pertemuan` : ""}
              </p>
            </div>
            <div className="space-y-5 p-6">
              {showQuota ? (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-navy-700">
                    <Users className="h-4 w-4 text-brand-600" /> Progres kuota
                  </p>
                  {hype && <p className={`mb-2 text-xs font-bold ${hype.tone === "hot" ? "text-orange-600" : "text-amber-600"}`}>{hype.tone === "hot" ? "🔥" : "⭐"} {hype.text}</p>}
                  <QuotaBar filled={paid} min={product.minQuota} />
                </div>
              ) : (
                <p className="flex items-center gap-2 rounded-2xl bg-brand-50/70 px-3 py-2.5 text-sm font-semibold text-brand-700">
                  <Users className="h-4 w-4 shrink-0" /> Pendaftaran dibuka — amankan kursimu sekarang
                </p>
              )}
              {product.startDate && (
                <p className="flex items-center gap-2 text-sm text-navy-600">
                  <CalendarDays className="h-4 w-4 text-brand-600" /> Target mulai <b>{formatDate(product.startDate)}</b>
                </p>
              )}
              {myReg ? (
                <Link href={myReg.status === "PAID" ? "/dashboard" : `/pembayaran/${myReg.code}`} className="btn-primary w-full py-3">
                  {myReg.status === "PAID" ? (
                    <>
                      <Check className="h-4 w-4" /> Kamu sudah terdaftar
                    </>
                  ) : (
                    <>
                      Lanjutkan pembayaran <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Link>
              ) : canRegister ? (
                <Link href={`/kelas/${product.slug}/daftar`} className="btn-primary w-full py-3 text-base">
                  Daftar kelas ini <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <button disabled className="btn-secondary w-full">
                  <Lock className="h-4 w-4" /> Pendaftaran ditutup
                </button>
              )}
              <ul className="space-y-2 border-t border-navy-50 pt-4 text-xs text-navy-500">
                <li className="flex gap-2">
                  <Users className="h-4 w-4 shrink-0 text-brand-500" />{" "}
                  {other ? `${product.sessionCount ?? 1}x pertemuan, dibayar sekali untuk seluruh pertemuan.` : `Kelas mulai setelah minimal ${product.minQuota} peserta lunas.`}
                </li>
                <li className="flex gap-2">
                  <Gamepad2 className="h-4 w-4 shrink-0 text-brand-500" /> Selama menunggu, materi awal & games sudah bisa diakses.
                </li>
                <li className="flex gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-brand-500" /> Pembayaran aman melalui Midtrans.
                </li>
              </ul>
            </div>
          </div>
          )}
        </aside>
      </div>
    </>
  );
}

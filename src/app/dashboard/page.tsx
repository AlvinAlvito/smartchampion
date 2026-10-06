import Link from "next/link";
import { Brain, ArrowRight, BookOpen, CalendarClock, CircleCheck, CreditCard, Gamepad2, GraduationCap, Hourglass, Sparkles, Trophy, Video } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { paidCountByProduct } from "@/lib/queries";
import { REG_STATUS_LABEL } from "@/lib/constants";
import { formatDate, formatRupiah, safeUrl } from "@/lib/utils";
import { Badge, EmptyState, QuotaBar, SectionTitle, StatCard, statusTone } from "@/components/ui";
import { subjectVisual } from "@/components/product-card";
import { MimpimuCard } from "@/components/mimpimu-card";
import { TutorAvatar } from "@/components/tutor-avatar";
import { SessionProgress } from "@/components/session-progress";
import { safeWaGroupUrl } from "@/lib/wa-group";
import { WhatsAppIcon } from "@/components/whatsapp-icon";

export const metadata = { title: "Dashboard Peserta" };
export const dynamic = "force-dynamic";

function greeting() {
  const h = new Date(Date.now() + 7 * 3600_000).getUTCHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 19) return "Selamat sore";
  return "Selamat malam";
}

export default async function DashboardPage() {
  const session = await requireUser(["PESERTA"]);
  const regs = await prisma.registration.findMany({
    where: { userId: session.userId },
    include: {
      product: {
        include: {
          _count: { select: { materials: { where: { isPublished: true } } } },
          tutors: { where: { isPublished: true }, select: { id: true, nama: true, foto: true }, orderBy: [{ urutan: "asc" }, { id: "asc" }] },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const placedRegs = regs.filter((r): r is typeof r & { productId: number; product: NonNullable<typeof r.product> } => r.productId !== null && r.product !== null);
  const paid = placedRegs.filter((r) => r.status === "PAID");
  const pending = placedRegs.filter((r) => r.status === "PENDING");
  const paidProductIds = paid.map((r) => r.productId);

  const [counts, upcoming, scores, playCount] = await Promise.all([
    paidCountByProduct(paidProductIds),
    prisma.classSession.findMany({
      where: { productId: { in: paidProductIds }, endAt: { gte: new Date() } },
      include: { product: { select: { name: true } } },
      orderBy: { startAt: "asc" },
      take: 4,
    }),
    prisma.gameScore.findMany({ where: { userId: session.userId }, include: { game: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.gameScore.count({ where: { userId: session.userId } }),
  ]);
  const bestScore = scores.length ? Math.max(...scores.map((s) => s.score)) : 0;

  return (
    <>
      {/* Sapaan */}
      <section className="relative mb-6 animate-fade-up overflow-hidden rounded-[32px] bg-hero p-6 text-white shadow-xl shadow-navy-900/20 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <div className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 animate-blob rounded-full bg-brand-500/40 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-sm text-brand-200">
              <Sparkles className="h-4 w-4" /> {greeting()}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{session.name} 👋</h1>
            <p className="mt-2 max-w-md text-sm text-navy-200">
              {paid.length
                ? "Semangat belajar hari ini! Cek jadwal dan materi terbarumu di bawah."
                : "Yuk mulai perjalanan juaramu. Pilih kelas COC yang sesuai target lombamu."}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/games" className="btn-outline-light">
              <Gamepad2 className="h-4 w-4" /> Main games
            </Link>
            <Link href="/kelas" className="btn-light">
              <BookOpen className="h-4 w-4" /> Katalog
            </Link>
          </div>
        </div>
      </section>

      <div className="stagger mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Kelas aktif" value={paid.length} tone="brand" icon={GraduationCap} />
        <StatCard label="Menunggu bayar" value={pending.length} tone="yellow" icon={Hourglass} />
        <StatCard label="Games dimainkan" value={playCount} tone="blue" icon={Gamepad2} />
        <StatCard label="Skor terbaik" value={bestScore} tone="navy" icon={Trophy} />
      </div>

      {pending.length > 0 && (
        <div className="mb-8 space-y-3">
          {pending.map((r) => (
            <div
              key={r.id}
              className="flex animate-fade-up flex-wrap items-center justify-between gap-3 rounded-3xl bg-linear-to-r from-amber-50 to-orange-50 p-4 ring-1 ring-amber-200 sm:p-5"
            >
              <p className="flex items-center gap-3 text-sm text-amber-900">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-400 text-white">
                  <CreditCard className="h-5 w-5" />
                </span>
                <span>
                  <b>{r.product.name}</b>
                  {r.sessionsBought ? ` (${r.sessionsBought}x pertemuan)` : ""} menunggu pembayaran {formatRupiah(r.amount)}.
                </span>
              </p>
              <Link href={`/pembayaran/${r.code}`} className="btn-primary btn-sm">
                Bayar sekarang <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <SectionTitle title="Kelas saya" icon={GraduationCap} />
          {paid.length ? (
            <div className="stagger space-y-4">
              {paid.map((r) => {
                const filled = counts.get(r.productId) ?? 0;
                const vip = r.product.type === "PRIVATE";
                const ready = vip || filled >= r.product.minQuota;
                const vipDone = vip && r.sessionsDone >= (r.sessionsBought ?? 0);
                const { icon: Icon, gradient } = subjectVisual(r.product.bidang);
                return (
                  <div key={r.id} className="card card-hover">
                    <div className="flex flex-wrap items-start gap-4">
                      <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-linear-to-br ${gradient} text-white shadow-lg`}>
                        <Icon className="h-7 w-7" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-bold text-navy-900">{r.product.name}</p>
                          {vip ? (
                            <Badge tone={vipDone ? "navy" : "yellow"}>{vipDone ? "Paket selesai" : `VIP · ${r.sessionsBought}x pertemuan`}</Badge>
                          ) : (
                            <Badge tone={ready ? "green" : "yellow"}>{ready ? "Kelas berjalan" : "Menunggu kuota"}</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-navy-400">
                          {r.code} · lunas {formatDate(r.paidAt)}
                        </p>
                        {r.product.tutors.length > 0 && (
                          <p className="mt-2 flex items-center gap-2 text-sm text-navy-600">
                            <span className="flex -space-x-2">
                              {r.product.tutors.slice(0, 3).map((t) => (
                                <TutorAvatar key={t.id} name={t.nama} src={t.foto} className="h-7 w-7 rounded-full text-[10px] ring-2 ring-white" />
                              ))}
                            </span>
                            <span className="min-w-0 truncate">
                              Tutor: <b className="text-navy-800">{r.product.tutors.map((t) => t.nama).join(", ")}</b>
                            </span>
                          </p>
                        )}
                        {r.product.scheduleInfo && (
                          <p className="mt-2 flex items-center gap-1.5 text-sm text-navy-600">
                            <CalendarClock className="h-4 w-4 text-brand-500" /> {r.product.scheduleInfo}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-4">
                      {vip ? <SessionProgress done={r.sessionsDone} total={r.sessionsBought ?? 0} /> : <QuotaBar filled={filled} min={r.product.minQuota} />}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link href={`/dashboard/kelas/${r.product.slug}`} className="btn-primary btn-sm">
                        <BookOpen className="h-3.5 w-3.5" /> Jadwal & materi ({r.product._count.materials})
                      </Link>
                      {safeWaGroupUrl(r.product.waGroupUrl) && (
                        <a
                          href={safeWaGroupUrl(r.product.waGroupUrl)!}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-sm bg-emerald-500 text-white shadow-md shadow-emerald-500/25 hover:bg-emerald-600"
                        >
                          <WhatsAppIcon className="h-3.5 w-3.5" /> Grup WhatsApp
                        </a>
                      )}
                      {!ready && (
                        <Link href="/games" className="btn-secondary btn-sm">
                          <Gamepad2 className="h-3.5 w-3.5" /> Main games selama menunggu
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={GraduationCap}
              title="Belum ada kelas aktif"
              desc="Daftar kelas COC sesuai bidang lombamu untuk mengakses jadwal dan materi."
              action={
                <Link href="/kelas" className="btn-primary mt-2">
                  Lihat katalog <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />
          )}

          {placedRegs.some((r) => !["PAID", "PENDING"].includes(r.status)) && (
            <div className="card mt-4">
              <p className="mb-2 text-sm font-bold text-navy-700">Riwayat pendaftaran lain</p>
              <ul className="divide-y divide-navy-50 text-sm">
                {placedRegs
                  .filter((r) => !["PAID", "PENDING"].includes(r.status))
                  .map((r) => (
                    <li key={r.id} className="flex items-center justify-between py-2.5">
                      <span className="text-navy-700">{r.product.name}</span>
                      <Badge tone={statusTone(r.status)}>{REG_STATUS_LABEL[r.status]}</Badge>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div>
            <SectionTitle
              title="Jadwal terdekat"
              icon={CalendarClock}
              action={
                <Link href="/dashboard/jadwal" className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:gap-1.5">
                  Lihat semua <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <div className="card">
              {upcoming.length ? (
                <ol className="relative space-y-4 border-l-2 border-brand-100 pl-5">
                  {upcoming.map((s, i) => (
                    <li key={s.id} className="relative animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
                      <span
                        className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ${i === 0 ? "animate-pulse bg-brand-500 ring-brand-100" : "bg-navy-200 ring-white"}`}
                      />
                      <p className="text-xs font-bold text-brand-600">{formatDate(s.startAt, true)} WIB</p>
                      <p className="font-semibold text-navy-800">{s.title}</p>
                      <p className="text-xs text-navy-400">{s.product.name}</p>
                      {i === 0 && s.meetingUrl && (
                        <a href={safeUrl(s.meetingUrl) ?? "#"} target="_blank" rel="noreferrer" className="btn-primary btn-sm mt-2">
                          <Video className="h-3.5 w-3.5" /> Gabung kelas
                        </a>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="flex items-start gap-2 text-sm text-navy-400">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" /> Belum ada jadwal. Jadwal muncul setelah kuota kelas terpenuhi.
                </p>
              )}
            </div>
          </div>
          <div>
            <SectionTitle title="Skor games terakhir" icon={Trophy} />
            <div className="card">
              {scores.length ? (
                <ul className="space-y-1">
                  {scores.map((s) => (
                    <li key={s.id}>
                      <Link href={`/games/${s.game.slug}`} className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-brand-50">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-navy-50 text-lg">{s.game.emoji}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy-700">{s.game.title}</span>
                        <span className="flex items-center gap-1 text-sm font-extrabold text-brand-700">
                          <CircleCheck className="h-3.5 w-3.5 text-emerald-500" /> {s.score}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-navy-400">
                  Belum main.{" "}
                  <Link href="/games" className="font-semibold text-brand-600 underline">
                    Coba sekarang
                  </Link>
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Produk belajar mandiri */}
      <section className="mt-8">
        <SectionTitle title="Belajar mandiri di Mimpi.mu" icon={Brain} />
        <MimpimuCard />
      </section>
    </>
  );
}

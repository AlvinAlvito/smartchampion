import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarClock,
  Check,
  CircleHelp,
  CreditCard,
  Crown,
  Flame,
  Gamepad2,
  Lightbulb,
  Medal,
  PartyPopper,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCatalog, getLeaderboard } from "@/lib/queries";
import { formatRupiah } from "@/lib/utils";
import { ProductCard } from "@/components/product-card";
import { CountUp, Reveal } from "@/components/motion";
import { MimpimuCard } from "@/components/mimpimu-card";
import { JsonLd } from "@/components/json-ld";
import { Mascot } from "@/components/mascot";
import { SITE_META_DESCRIPTION, SITE_TITLE, organizationLd, pageMeta, websiteLd } from "@/lib/seo";

export const metadata = pageMeta({ title: SITE_TITLE, absoluteTitle: true, description: SITE_META_DESCRIPTION, path: "/" });

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: Medal, title: "Tutor medalis", desc: "Dibimbing langsung oleh tutor berpengalaman & peraih medali olimpiade." },
  { icon: Lightbulb, title: "Realistis-eksploratif", desc: "Konsep → latihan terarah → pembahasan. Paham, bukan sekadar hafal." },
  { icon: CalendarClock, title: "Jadwal & materi rapi", desc: "Semua jadwal, rekaman, PDF, dan artikel tersusun di dashboard." },
  { icon: Gamepad2, title: "Belajar sambil main", desc: "Games kuis edukatif dengan leaderboard biar makin semangat." },
];

const STEPS = [
  { icon: UserPlus, title: "Buat akun", desc: "Daftar gratis dengan data diri & asal sekolah." },
  { icon: Target, title: "Pilih kelas", desc: "Pilih bidang & jenjang sesuai target lombamu." },
  { icon: CreditCard, title: "Bayar online", desc: "VA bank, e-wallet, QRIS, atau kartu via Midtrans." },
  { icon: Rocket, title: "Mulai belajar", desc: "Akses jadwal, materi, dan games di dashboard." },
];

const FAQ = [
  {
    q: "Kapan kelas COC dimulai?",
    a: "Setiap bidang dimulai setelah minimal 15 peserta terdaftar dan lunas. Progres kuota bisa kamu lihat langsung di halaman setiap kelas.",
  },
  { q: "Apa yang saya dapat selama menunggu kelas dimulai?", a: "Kamu sudah bisa mengakses materi awal dan bermain games edukasi. Skormu masuk leaderboard!" },
  {
    q: "Apa beda COC dan Mimpi.mu?",
    a: "COC adalah kelas dengan tutor (pendampingan). Mimpi.mu adalah platform belajar mandiri dengan latihan soal dan analisis performa berbasis AI.",
  },
  { q: "Pembayarannya aman?", a: "Ya. Pembayaran diproses Midtrans dan status pendaftaranmu otomatis berubah menjadi lunas setelah pembayaran berhasil." },
];

/** Judul bagian bergaya Smart Champion */
function SectionTitle({
  eyebrow,
  title,
  desc,
  center = false,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
  center?: boolean;
  icon?: typeof Flame;
}) {
  return (
    <div className={center ? "text-center" : undefined}>
      <p className="inline-flex items-center gap-2 rounded-full bg-sun-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-sun-800">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5 fill-sun-500 text-sun-500" />} {eyebrow}
      </p>
      <h2 className="mt-3 font-display text-3xl font-normal text-navy-900 sm:text-4xl">{title}</h2>
      {desc && <p className="mt-2 text-navy-500">{desc}</p>}
    </div>
  );
}

export default async function HomePage() {
  const [catalog, games, participantCount] = await Promise.all([
    getCatalog(),
    prisma.game.findMany({ where: { isPublished: true }, orderBy: { launchedAt: "desc" }, take: 3, include: { _count: { select: { scores: true } } } }),
    prisma.registration.count({ where: { status: "PAID" } }),
  ]);
  const featured = [...catalog].sort((a, b) => b.paidCount - a.paidCount).slice(0, 6);
  const top = featured[0];
  const leaders = games[0] ? await getLeaderboard(games[0].id, 3) : [];

  return (
    <>
      <JsonLd data={[organizationLd, websiteLd]} />
      {/* ================= HERO ================= */}
      <section className="relative -mt-16 overflow-hidden bg-hero pb-20 pt-28 text-white sm:-mt-[72px] sm:pt-36">
        {/* latar hidup: jaring kotak bergeser, cahaya berdenyut, kilau menyapu, bintang berkelip */}
        <div className="pointer-events-none absolute inset-0 animate-grid-pan bg-grid-hero [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_80%)]" />
        <div className="pointer-events-none absolute -left-24 top-16 h-96 w-96 animate-blob rounded-full bg-brand-400/35 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-0 h-[28rem] w-[28rem] animate-blob rounded-full bg-sun-400/20 blur-3xl [animation-delay:-5s]" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 animate-blob rounded-full bg-sky-300/20 blur-3xl [animation-delay:-9s]" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -inset-y-1/2 left-0 w-1/4 animate-beam bg-linear-to-r from-transparent via-white/[0.07] to-transparent" />
        </div>
        {[
          "left-[6%] top-[22%] h-3 w-3",
          "left-[44%] top-[14%] h-5 w-5 [animation-delay:-1.1s]",
          "left-[30%] bottom-[30%] h-2.5 w-2.5 [animation-delay:-2s]",
          "right-[8%] top-[60%] h-4 w-4 [animation-delay:-0.6s]",
          "right-[38%] bottom-[18%] h-3 w-3 [animation-delay:-2.6s]",
          "left-[18%] top-[8%] h-2 w-2 [animation-delay:-1.7s]",
          "right-[24%] top-[10%] h-2.5 w-2.5 [animation-delay:-0.3s]",
        ].map((c, k) => (
          <Star key={k} className={`pointer-events-none absolute hidden animate-twinkle fill-sun-300 text-sun-300 sm:block ${c}`} />
        ))}

        <div className="container-page relative grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="stagger">
            <p className="glass mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold text-sun-100">
              <Sparkles className="h-3.5 w-3.5 text-sun-300" /> POSI × SmartChampion · Kelas Premium 2026
            </p>
            <h1 className="font-display text-[2.6rem] font-normal leading-[1.05] text-white drop-shadow-[0_4px_24px_rgba(8,22,37,0.35)] sm:text-6xl lg:text-[4.2rem]">
              Persiapkan dirimu jadi{" "}
              <span className="relative inline-block text-sun-300">
                juara
                <svg className="absolute -bottom-2 left-0 h-3 w-full text-sun-400" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden>
                  <path d="M2 9 C 50 2, 150 2, 198 8" stroke="currentColor" strokeWidth="6" fill="none" strokeLinecap="round" />
                </svg>
              </span>{" "}
              olimpiade.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-100 sm:text-lg">
              Kelas pendampingan bersama tutor medalis untuk OSN, KSM, dan persiapan TKA. Belajar lebih terarah, ditemani latihan dan games yang bikin semangat.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/kelas" className="btn-primary px-6 py-3 text-base">
                Lihat Kelas <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/games" className="btn-outline-light px-6 py-3 text-base">
                <Gamepad2 className="h-4 w-4" /> Coba Games
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap gap-2.5">
              {["Tutor medalis", "Materi lengkap", "Bayar online aman"].map((t) => (
                <span key={t} className="glass flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold text-white">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-sun-400 text-brand-900">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* kartu maskot + kelas terpopuler */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="relative rounded-[32px] bg-white p-3 shadow-[0_40px_90px_-30px_rgba(8,22,37,0.7)] ring-4 ring-white/10 sm:p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="relative grid aspect-square place-items-center overflow-hidden rounded-3xl bg-linear-to-br from-sun-100 to-sun-200">
                  <Mascot name="smarty" priority className="h-[88%] w-auto animate-float drop-shadow-xl" />
                </div>
                <div className="relative grid aspect-square place-items-center overflow-hidden rounded-3xl bg-linear-to-br from-brand-50 to-brand-100">
                  <Mascot name="champy" priority className="h-[88%] w-auto animate-float-slow drop-shadow-xl [animation-delay:-2s]" />
                </div>
              </div>
              <div className="mt-3 rounded-3xl bg-linear-to-br from-brand-600 via-brand-700 to-brand-800 p-5 text-white">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white p-1.5 shadow-lg">
                    <Mascot name="sc" className="h-full w-full object-contain" decorative />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-sun-300">Kelas terpopuler</p>
                    <p className="truncate font-bold">{top?.name ?? "Matematika SMP Advance"}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs text-brand-100">
                    <span>{top?.paidCount ?? 12} peserta bergabung</span>
                    <span className="font-bold text-sun-300">{top && top.paidCount >= top.minQuota ? "Kelas berjalan" : "Segera dimulai"}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full animate-gradient rounded-full bg-linear-to-r from-sun-300 via-sun-400 to-sun-200 bg-[length:200%_100%]"
                      style={{ width: `${top ? Math.min(100, (top.paidCount / top.minQuota) * 100) : 80}%` }}
                    />
                  </div>
                </div>
                <div className="mt-4 flex -space-x-2">
                  {["A", "B", "C", "D", "E"].map((l, i) => (
                    <span
                      key={l}
                      className="grid h-9 w-9 place-items-center rounded-full border-2 border-brand-700 text-xs font-bold"
                      style={{ background: ["#f9d014", "#2e89bc", "#fcd83a", "#4fa4d3", "#d9b300"][i], color: i % 2 ? "#ffffff" : "#0f2436" }}
                    >
                      {l}
                    </span>
                  ))}
                  <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-brand-700 bg-white text-xs font-bold text-brand-800">
                    +{Math.max(participantCount - 5, 0)}
                  </span>
                </div>
              </div>
            </div>

            {leaders.length > 0 && (
              <div className="absolute -bottom-28 -left-10 hidden w-64 animate-float-slow rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-brand-100 [animation-delay:-3s] xl:block">
                <p className="mb-2 flex items-center gap-2 text-xs font-bold text-navy-700">
                  <Trophy className="h-4 w-4 text-sun-600" /> Leaderboard {games[0].title}
                </p>
                {leaders.map((l, i) => (
                  <div key={l.userId} className="flex items-center justify-between py-1 text-sm text-navy-800">
                    <span className="flex items-center gap-2 truncate">
                      {i === 0 ? <Crown className="h-4 w-4 text-sun-500" /> : <span className="w-4 text-center text-xs text-navy-400">{i + 1}</span>}
                      <span className="truncate">{l.name}</span>
                    </span>
                    <b className="text-brand-600">{l.score}</b>
                  </div>
                ))}
              </div>
            )}

            <div className="absolute -right-3 -top-6 hidden animate-float-slow items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-2xl ring-1 ring-sun-200 lg:flex">
              <PartyPopper className="h-5 w-5 text-sun-500" />
              <div>
                <p className="text-[11px] text-navy-400">Pendaftaran baru</p>
                <p className="text-sm font-bold text-navy-900">Lunas ✓</p>
              </div>
            </div>
          </div>
        </div>

        {/* Statistik */}
        <div className="container-page relative mt-24">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { v: catalog.length, l: "Kelas COC dibuka", icon: BookOpen },
              { v: participantCount, l: "Peserta terdaftar", icon: Users },
              { v: 15, l: "Minimal per kelas", icon: Target },
              { v: games.length, l: "Games edukasi", icon: Gamepad2, suffix: "+" },
            ].map((s, i) => (
              <div key={s.l} className="glass flex items-center gap-4 rounded-3xl p-4 sm:p-5">
                <span
                  className={`hidden h-12 w-12 shrink-0 place-items-center rounded-2xl sm:grid ${i % 2 ? "bg-brand-400/25 text-brand-100" : "bg-sun-400/20 text-sun-300"}`}
                >
                  <s.icon className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-2xl font-extrabold text-white sm:text-3xl">
                    <CountUp value={s.v} suffix={s.suffix ?? ""} />
                  </p>
                  <p className="text-xs text-brand-100 sm:text-sm">{s.l}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= PRODUK ================= */}
      <section id="produk" className="container-page scroll-mt-24 py-20">
        <Reveal className="mb-12">
          <SectionTitle center eyebrow="Produk kami" title="Pilih cara belajarmu" desc="Butuh tutor atau mau latihan mandiri? Ada dua pilihan terbaik." />
        </Reveal>
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal>
            <div className="relative h-full overflow-hidden rounded-[32px] bg-linear-to-br from-brand-600 via-brand-700 to-brand-900 p-5 text-white shadow-2xl shadow-brand-900/30 sm:p-8">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-sun-400/25 blur-3xl" />
              <Mascot
                name="champy-cheer"
                decorative
                className="pointer-events-none absolute -bottom-3 -right-4 hidden h-44 w-auto opacity-95 drop-shadow-2xl sm:block"
              />
              <div className="relative flex h-full flex-col gap-5">
                <div className="flex items-center justify-between">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                    <Award className="h-7 w-7 text-sun-300" />
                  </span>
                  <span className="rounded-full bg-linear-to-r from-sun-300 to-sun-400 px-3 py-1 text-xs font-bold text-navy-950">Dengan tutor</span>
                </div>
                <div>
                  <h3 className="font-display text-2xl font-normal sm:text-3xl">Champion Online Class</h3>
                  <p className="mt-2 text-brand-100">Kelas bimbingan online bersama tutor berpengalaman, untuk kamu yang ingin latihan lebih terarah.</p>
                </div>
                <ul className="grid gap-2.5 text-sm sm:grid-cols-2 sm:pr-24">
                  {["Tutor expert medalis", "Metode realistis-eksploratif", "Jadwal & materi di dashboard", "SD, SMP, SMA & umum"].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-sun-300" /> {t}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-4 sm:pr-28">
                  <p className="text-3xl font-extrabold">
                    {formatRupiah(299000)} <span className="text-sm font-medium text-brand-200">/ bulan</span>
                  </p>
                  <Link href="/kelas" className="btn-primary">
                    Daftar COC <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="relative h-full">
              <Mascot name="smarty-idea" decorative className="pointer-events-none absolute -top-12 right-32 z-10 hidden h-28 w-auto drop-shadow-xl sm:block" />
              <MimpimuCard />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= KEUNGGULAN ================= */}
      <section className="relative overflow-hidden bg-white py-20">
        <div className="pointer-events-none absolute inset-0 bg-dots [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="container-page relative grid items-center gap-8 lg:grid-cols-[260px_1fr]">
          <Reveal className="hidden text-center lg:block">
            <Mascot name="smarty-laugh" className="mx-auto h-56 w-auto animate-float drop-shadow-xl" />
            <p className="mt-3 font-display text-xl text-navy-900">Belajar jadi seru!</p>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 80}>
                <div className="card card-hover group h-full">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-linear-to-br from-sun-300 to-sun-500 text-brand-800 shadow-lg shadow-sun-500/30 transition group-hover:scale-110 group-hover:rotate-[-6deg]">
                    <f.icon className="h-6 w-6" />
                  </span>
                  <p className="mt-4 font-bold text-navy-900">{f.title}</p>
                  <p className="mt-1.5 text-sm text-navy-500">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= KELAS POPULER ================= */}
      <section className="container-page py-20">
        <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            <Mascot name="champy-coin" decorative className="hidden h-24 w-auto drop-shadow-lg sm:block" />
            <SectionTitle
              eyebrow="Paling diminati"
              icon={Flame}
              title="Kelas COC terpopuler"
              desc="Kelas dimulai begitu kuota minimal terpenuhi. Ajak temanmu biar cepat mulai!"
            />
          </div>
          <Link href="/kelas" className="btn-secondary">
            Lihat semua kelas <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
        <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* ================= ALUR ================= */}
      <section className="relative overflow-hidden bg-white py-20">
        <div className="container-page">
          <Reveal className="relative mb-12">
            <Mascot name="smarty-shy" decorative className="pointer-events-none absolute -top-4 left-0 hidden h-28 w-auto drop-shadow-lg md:block" />
            <Mascot name="champy-idea" decorative className="pointer-events-none absolute -top-4 right-0 hidden h-28 w-auto drop-shadow-lg md:block" />
            <SectionTitle center eyebrow="Mudah & cepat" title="4 langkah mulai belajar" />
          </Reveal>
          <div className="relative grid gap-6 md:grid-cols-4">
            <div className="pointer-events-none absolute left-0 right-0 top-8 hidden h-1 rounded-full bg-linear-to-r from-sun-300 via-brand-300 to-brand-500 md:block" />
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 100}>
                <div className="relative text-center">
                  <span className="relative mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-linear-to-br from-brand-500 to-brand-700 text-white shadow-xl shadow-brand-500/30 ring-8 ring-white">
                    <s.icon className="h-7 w-7" />
                    <span className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-sun-400 text-xs font-extrabold text-brand-900 shadow ring-2 ring-white">
                      {i + 1}
                    </span>
                  </span>
                  <p className="mt-4 font-bold text-navy-900">{s.title}</p>
                  <p className="mx-auto mt-1 max-w-[220px] text-sm text-navy-500">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= GAMES ================= */}
      {games.length > 0 && (
        <section className="container-page py-20">
          <div className="relative overflow-hidden rounded-[36px] bg-hero p-8 text-white sm:p-12">
            <div className="pointer-events-none absolute inset-0 bg-grid opacity-50" />
            <div className="pointer-events-none absolute -right-10 -top-10 h-72 w-72 animate-blob rounded-full bg-sun-400/30 blur-3xl" />
            <Mascot name="champy-laugh" decorative className="pointer-events-none absolute -bottom-2 right-6 hidden h-40 w-auto drop-shadow-2xl lg:block" />
            <div className="relative">
              <Reveal className="mb-8 flex flex-wrap items-end justify-between gap-4 lg:pr-44">
                <div>
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-sun-300">
                    <Gamepad2 className="h-4 w-4" /> Belajar sambil main
                  </p>
                  <h2 className="mt-2 font-display text-3xl font-normal sm:text-4xl">Games edukasi & leaderboard</h2>
                  <p className="mt-2 text-brand-100">Jawab cepat & tepat, kumpulkan skor, rebut posisi puncak!</p>
                </div>
                <Link href="/games" className="btn-primary">
                  Main sekarang <ArrowRight className="h-4 w-4" />
                </Link>
              </Reveal>
              <div className="grid gap-5 md:grid-cols-3 lg:pr-40">
                {games.map((g, i) => (
                  <Reveal key={g.id} delay={i * 100}>
                    <Link
                      href={`/games/${g.slug}`}
                      className="glass group block h-full rounded-3xl p-6 transition duration-300 hover:-translate-y-1 hover:bg-white/15"
                    >
                      <span className="inline-block text-5xl transition duration-300 group-hover:scale-125 group-hover:rotate-[-8deg]">{g.emoji}</span>
                      <p className="mt-4 text-lg font-bold">{g.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-brand-100">{g.description}</p>
                      <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-sun-300">
                        <Trophy className="h-3.5 w-3.5" /> {g._count.scores} kali dimainkan
                      </p>
                    </Link>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================= FAQ ================= */}
      <section className="container-page pb-10">
        <Reveal className="mb-10">
          <SectionTitle center eyebrow="FAQ" icon={CircleHelp} title="Pertanyaan umum" />
        </Reveal>
        <div className="mx-auto grid max-w-4xl items-start gap-6 lg:grid-cols-[1fr_200px]">
          <div className="space-y-3">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <details className="card group cursor-pointer open:ring-2 open:ring-sun-300">
                  <summary className="flex list-none items-center justify-between gap-4 font-bold text-navy-900 marker:hidden">
                    {f.q}
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sun-100 text-sun-800 transition group-open:rotate-45 group-open:bg-brand-600 group-open:text-white">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 animate-fade-in text-sm leading-relaxed text-navy-500">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
          <Reveal className="hidden lg:sticky lg:top-28 lg:block">
            <Mascot name="champy-idea" className="mx-auto h-48 w-auto animate-float-slow drop-shadow-xl" />
          </Reveal>
        </div>
        <Reveal className="mt-14">
          <div className="relative overflow-hidden rounded-[32px] bg-linear-to-r from-brand-600 via-brand-700 to-brand-800 p-8 text-center text-white shadow-2xl shadow-brand-700/30 sm:p-10">
            <div className="pointer-events-none absolute -left-10 -top-16 h-56 w-56 rounded-full bg-sun-400/25 blur-3xl" />
            <Mascot name="smarty" decorative className="pointer-events-none absolute -bottom-6 left-4 hidden h-44 w-auto drop-shadow-2xl md:block" />
            <Mascot name="champy-coin" decorative className="pointer-events-none absolute -bottom-4 right-4 hidden h-40 w-auto drop-shadow-2xl md:block" />
            <div className="relative flex flex-col items-center gap-4">
              <ShieldCheck className="h-10 w-10 text-sun-300" />
              <h3 className="font-display text-2xl font-normal sm:text-4xl">Siap jadi juara berikutnya?</h3>
              <p className="max-w-lg text-brand-100">Daftar sekarang, pilih kelasmu, dan mulai belajar bersama tutor terbaik.</p>
              <Link href="/register" className="btn-primary px-6 py-3">
                Buat akun gratis <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}

import Link from "next/link";
import type { Jenjang, Prisma } from "@prisma/client";
import { ArrowLeft, ArrowRight, Gamepad2, ListChecks, Lock, Play, Search, Timer, Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hasGameAccess } from "@/lib/game-access";
import { isPremiumMode } from "@/lib/game-rules";
import { JENJANG_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { GameCat } from "@/components/game-cat";
import { Pagination, readPage } from "@/components/pagination";
import { pageMeta } from "@/lib/seo";
import { MODES, modeOf, type ModeInfo } from "./modes";
import { ModeHub } from "./mode-hub";

export const metadata = pageMeta({
  title: "Arena Game Edukasi & Latihan Soal Olimpiade",
  description: "Pilih mode permainan seru — petualangan, labirin, stasiun luar angkasa, platformer & lainnya — lalu mainkan latihan soal olimpiade SD, SMP, SMA dengan papan peringkat.",
  path: "/games",
});
export const dynamic = "force-dynamic";

const PER_PAGE = 10;
const JENJANGS = ["SD", "SMP", "SMA", "UMUM"];

/** Langkah: 1 pilih mode → 2 pilih soal → 3 main */
function Steps({ active }: { active: 1 | 2 }) {
  return (
    <ol className="mt-6 flex flex-wrap items-center gap-2 text-xs font-bold sm:text-sm">
      {["Pilih mode", "Pilih soal", "Main & raih skor!"].map((t, i) => (
        <li key={t} className="flex items-center gap-2">
          <span
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 ring-1",
              i + 1 === active ? "bg-sun-400 text-navy-950 ring-sun-300" : i + 1 < active ? "bg-white/20 text-white ring-white/30" : "bg-white/5 text-white/60 ring-white/15",
            )}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-navy-950/20 text-[11px]">{i + 1 < active ? "✓" : i + 1}</span> {t}
          </span>
          {i < 2 && <ArrowRight className="h-4 w-4 text-white/40" />}
        </li>
      ))}
    </ol>
  );
}

export default async function GamesPage({ searchParams }: PageProps<"/games">) {
  const sp = await searchParams;
  const session = await getSession();
  const allModes = await hasGameAccess(session);
  const mode = modeOf(sp.mode);
  if (mode) return <SetPicker mode={mode} sp={sp} allModes={allModes} />;

  const [sets, players] = await Promise.all([
    prisma.game.count({ where: { isPublished: true } }),
    prisma.gameScore.findMany({ where: { game: { isPublished: true } }, distinct: ["userId"], select: { userId: true } }),
  ]);

  return (
    <>
      {/* hero arena */}
      <section className="relative overflow-hidden bg-linear-to-br from-[#0b1026] via-indigo-950 to-brand-900 pb-24 pt-10 text-white sm:pt-14">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="pointer-events-none absolute -left-16 top-0 h-80 w-80 animate-blob rounded-full bg-fuchsia-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-80 w-80 animate-blob rounded-full bg-sky-400/20 blur-3xl" />
        {["🎮", "🏆", "⭐", "🐾", "🚀", "🧩", "⚽", "🎲"].map((e, i) => (
          <span
            key={e}
            aria-hidden
            className="pointer-events-none absolute animate-float text-2xl opacity-40 sm:text-3xl"
            style={{ left: `${6 + i * 12}%`, top: `${12 + ((i * 37) % 60)}%`, animationDelay: `${i * 0.7}s` }}
          >
            {e}
          </span>
        ))}
        <div className="container-page relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-sun-300 ring-1 ring-white/20">
              <Gamepad2 className="h-4 w-4" /> Belajar sambil main
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
              Arena Game <span className="bg-linear-to-r from-sun-300 via-amber-400 to-rose-400 bg-clip-text text-transparent">POSI</span>
            </h1>
            <p className="mt-3 max-w-xl text-base text-indigo-100 sm:text-lg">
              {MODES.length} mode permainan seru — dari petualangan, labirin gelap, sampai stasiun luar angkasa. Pilih mode, pilih soal, lalu kejar skor tertinggi
              di papan peringkat!
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-sm font-bold">
              <span className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/20">🎮 {MODES.length} mode</span>
              <span className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/20">📚 {sets} kumpulan soal</span>
              <span className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/20">👥 {players.length} pemain</span>
            </div>
            <Steps active={1} />
          </div>
          <div className="relative hidden lg:block">
            <div className="absolute inset-0 animate-pulse rounded-full bg-sun-400/20 blur-2xl" />
            <GameCat mood="girang" className="relative h-56 w-56 animate-float" />
          </div>
        </div>
      </section>
      <div className="container-page relative z-10 -mt-14 pb-12">
        <ModeHub allModes={allModes} loggedIn={!!session} loginHref="/login?next=/games" />
      </div>
    </>
  );
}

/** Langkah 2: pilih kumpulan soal untuk mode terpilih — cari, filter jenjang & bidang, 10 per halaman */
async function SetPicker({ mode, sp, allModes }: { mode: ModeInfo; sp: Record<string, string | string[] | undefined>; allModes: boolean }) {
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const jenjang = typeof sp.jenjang === "string" && JENJANGS.includes(sp.jenjang) ? sp.jenjang : "";
  const bidang = typeof sp.bidang === "string" ? sp.bidang.slice(0, 60) : "";
  const locked = isPremiumMode(mode.key) && !allModes;
  const { page, skip, take } = readPage(sp, PER_PAGE);

  const where: Prisma.GameWhereInput = {
    isPublished: true,
    ...(jenjang ? { jenjang: jenjang as Jenjang } : {}),
    ...(bidang ? { subject: bidang } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }, { subject: { contains: q } }] } : {}),
  };
  const [total, games, subjects] = await Promise.all([
    prisma.game.count({ where }),
    prisma.game.findMany({ where, orderBy: [{ launchedAt: "desc" }, { id: "desc" }], skip, take, include: { _count: { select: { questions: true } } } }),
    prisma.game.findMany({ where: { isPublished: true }, distinct: ["subject"], select: { subject: true }, orderBy: { subject: "asc" } }),
  ]);
  const ids = games.map((g) => g.id);
  const [players, best] = await Promise.all([
    prisma.gameScore.groupBy({ by: ["gameId", "userId"], where: { gameId: { in: ids } } }),
    prisma.gameScore.groupBy({ by: ["gameId"], where: { gameId: { in: ids } }, _max: { score: true } }),
  ]);
  const playerCount = new Map<number, number>();
  players.forEach((p) => playerCount.set(p.gameId, (playerCount.get(p.gameId) ?? 0) + 1));
  const bestScore = new Map(best.map((b) => [b.gameId, b._max.score ?? 0]));
  const query = (extra: Record<string, string>) => {
    const base: Record<string, string> = { mode: mode.key, ...(q ? { q } : {}), ...(jenjang ? { jenjang } : {}), ...(bidang ? { bidang } : {}) };
    for (const [k, v] of Object.entries(extra)) if (v) base[k] = v;
    else delete base[k];
    return { pathname: "/games", query: base, hash: "pilih-soal" };
  };

  return (
    <>
      {/* header mode terpilih */}
      <section className="relative isolate overflow-hidden pb-24 pt-8 text-white sm:pt-10">
        <span aria-hidden className="absolute inset-0 -z-20 bg-cover bg-center" style={{ backgroundImage: `url(/games/modes/${mode.key}.jpg)` }} />
        <span
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: `linear-gradient(100deg, rgba(${mode.tone},0.97) 0%, rgba(${mode.tone},0.88) 45%, rgba(11,16,38,0.55) 100%)` }}
        />
        <div className="container-page animate-fade-up">
          <Link href="/games#mode" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 transition hover:gap-2.5 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Ganti mode
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-3xl bg-white/15 ring-1 ring-white/30 backdrop-blur">
              <mode.icon className={cn("h-8 w-8", mode.key === "classic" && "fill-current")} />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-white/70">Mode terpilih</p>
              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{mode.name}</h1>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {mode.fav && <span className="rounded-full bg-linear-to-r from-rose-500 to-pink-500 px-2.5 py-1 text-xs font-black">⭐ FAVORIT</span>}
              {mode.isNew && <span className="rounded-full bg-sun-400 px-2.5 py-1 text-xs font-black text-navy-950">BARU</span>}
              {!isPremiumMode(mode.key) && <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-black">GRATIS</span>}
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-white/90">{mode.desc}</p>
          <Steps active={2} />
        </div>
      </section>

      <div id="pilih-soal" className="container-page relative z-10 -mt-14 scroll-mt-20 pb-12">
        {locked && (
          <div className="card mb-4 flex flex-wrap items-center gap-3 border-amber-200 bg-amber-50! p-4 text-sm text-amber-900">
            <Lock className="h-5 w-5 shrink-0" />
            <p className="min-w-0 flex-1">
              <b>Mode {mode.name} terkunci.</b> Silakan daftar kelas untuk membuka semua games — cukup sekali membeli produk apa pun (COC, VIP Privat, ACLB,
              dll.).
            </p>
            <Link href="/kelas" className="btn-primary py-2">
              Lihat katalog kelas <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* pencarian & filter */}
        <div className="card space-y-3 p-3 sm:p-4">
          <form action="/games" className="flex gap-2">
            <input type="hidden" name="mode" value={mode.key} />
            {jenjang && <input type="hidden" name="jenjang" value={jenjang} />}
            {bidang && <input type="hidden" name="bidang" value={bidang} />}
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
              <input name="q" type="search" defaultValue={q} placeholder="Cari soal, mis. pecahan, tata surya, vocabulary…" aria-label="Cari soal" className="input py-2.5! pl-10" />
            </div>
            <button className="btn-primary px-5!">Cari</button>
          </form>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-black uppercase tracking-wide text-navy-400">Jenjang</span>
            {["", ...JENJANGS].map((j) => (
              <Link
                key={j || "semua"}
                href={query({ jenjang: j, page: "" })}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-bold transition sm:text-sm",
                  jenjang === j ? "bg-linear-to-r from-brand-600 to-navy-700 text-white shadow" : "bg-navy-50 text-navy-600 hover:bg-brand-50 hover:text-brand-700",
                )}
              >
                {j ? JENJANG_LABEL[j] : "Semua"}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-black uppercase tracking-wide text-navy-400">Bidang</span>
            {["", ...subjects.map((s) => s.subject)].map((b) => (
              <Link
                key={b || "semua"}
                href={query({ bidang: b, page: "" })}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-bold transition sm:text-sm",
                  bidang === b ? "bg-linear-to-r from-rose-500 to-pink-600 text-white shadow" : "bg-navy-50 text-navy-600 hover:bg-rose-50 hover:text-rose-700",
                )}
              >
                {b || "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <p className="mb-3 mt-5 flex flex-wrap items-center gap-x-2 px-1 text-sm text-navy-400">
          <b className="text-navy-700">{total} kumpulan soal</b>
          {(q || jenjang || bidang) && (
            <>
              {q && <>untuk “{q}”</>}
              <Link href={{ pathname: "/games", query: { mode: mode.key }, hash: "pilih-soal" }} className="font-semibold text-brand-600 hover:underline">
                hapus filter
              </Link>
            </>
          )}
        </p>

        {games.length ? (
          <div className="stagger grid gap-4 lg:grid-cols-2">
            {games.map((g) => (
              <article key={g.id} className="card card-hover group flex gap-4 p-4!">
                <div
                  className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-3xl text-5xl shadow-inner sm:h-28 sm:w-28"
                  style={{ background: `linear-gradient(135deg, rgba(${mode.tone},0.95), rgba(${mode.tone},0.55))` }}
                >
                  <span aria-hidden className="absolute inset-0 bg-grid opacity-30" />
                  <span className="relative drop-shadow-lg transition duration-500 group-hover:scale-125 group-hover:rotate-[-8deg]">{g.emoji}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700">{g.subject}</span>
                    <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-bold text-navy-600">{JENJANG_LABEL[g.jenjang]}</span>
                  </div>
                  <h2 className="mt-1.5 font-extrabold leading-snug text-navy-900">{g.title}</h2>
                  <p className="mt-0.5 line-clamp-2 text-sm text-navy-400">{g.description}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-navy-500">
                    <span className="flex items-center gap-1">
                      <ListChecks className="h-3.5 w-3.5 text-brand-500" /> {g._count.questions} soal
                    </span>
                    <span className="flex items-center gap-1">
                      <Timer className="h-3.5 w-3.5 text-brand-500" /> {g.secondsPerQuestion} dtk/soal
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-brand-500" /> {playerCount.get(g.id) ?? 0} pemain
                    </span>
                    {(bestScore.get(g.id) ?? 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <Trophy className="h-3.5 w-3.5 text-amber-500" /> rekor {bestScore.get(g.id)}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {locked ? (
                      <Link href="/kelas" className="btn-ghost py-2 text-sm">
                        <Lock className="h-4 w-4" /> Buka dengan daftar kelas
                      </Link>
                    ) : (
                      <Link
                        href={`/games/${g.slug}?mode=${mode.key}`}
                        className="inline-flex items-center gap-2 rounded-2xl bg-linear-to-r from-sun-300 to-sun-500 px-5 py-2.5 text-sm font-black text-navy-950 shadow-lg shadow-sun-500/30 transition hover:-translate-y-0.5 hover:brightness-105"
                      >
                        <Play className="h-4 w-4 fill-current" /> Main {mode.name}
                      </Link>
                    )}
                    <Link href={`/games/${g.slug}`} className="inline-flex items-center gap-1 text-xs font-bold text-navy-500 hover:text-brand-700">
                      <Trophy className="h-3.5 w-3.5" /> Papan peringkat
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon={Gamepad2} title="Soal tidak ditemukan" desc="Coba ubah kata kunci, jenjang, atau bidang." />
        )}
        <div className="mt-6">
          <Pagination basePath="/games" searchParams={sp} page={page} perPage={PER_PAGE} total={total} noun="kumpulan soal" anchor="pilih-soal" />
        </div>
      </div>
    </>
  );
}

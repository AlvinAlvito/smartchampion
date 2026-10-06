import Link from "next/link";
import { Gamepad2, ListChecks, Play, Timer, Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { JENJANG_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { PageHero } from "@/components/page-hero";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Games Edukasi & Latihan Soal Olimpiade",
  description: "Main games edukasi dan latihan soal olimpiade secara online, lihat skor di papan peringkat. Cocok untuk siswa SD, SMP, SMA yang bersiap OSN & KSN.",
  path: "/games",
});
export const dynamic = "force-dynamic";

const CARD_BG = ["from-brand-600 to-navy-800", "from-navy-700 to-brand-800", "from-sky-600 to-navy-900", "from-brand-500 to-navy-900", "from-sky-600 to-navy-800"];

export default async function GamesPage() {
  const games = await prisma.game.findMany({
    where: { isPublished: true },
    orderBy: { launchedAt: "desc" },
    include: { _count: { select: { questions: true, scores: true } } },
  });
  const players = await prisma.gameScore.groupBy({ by: ["gameId", "userId"], where: { gameId: { in: games.map((g) => g.id) } } });
  const playerCount = new Map<number, number>();
  players.forEach((p) => playerCount.set(p.gameId, (playerCount.get(p.gameId) ?? 0) + 1));
  const newest = games[0]?.id;

  return (
    <>
      <PageHero
        eyebrow="Belajar sambil main"
        icon={Gamepad2}
        title={
          <>
            Games <span className="text-gradient">Edukasi</span>
          </>
        }
        subtitle="Jawab cepat & tepat untuk skor tertinggi. Setiap game punya leaderboard sendiri, dan games baru rutin dirilis!"
      />
      <div className="container-page relative z-10 -mt-10 pb-10">
        {games.length ? (
          <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g, i) => (
              <Link key={g.id} href={`/games/${g.slug}`} className="card card-hover group relative flex flex-col overflow-hidden p-0!">
                <div className={`relative flex h-36 items-center justify-center overflow-hidden bg-linear-to-br ${CARD_BG[i % CARD_BG.length]}`}>
                  <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
                  <span className="relative text-6xl drop-shadow-lg transition duration-500 group-hover:scale-125 group-hover:rotate-[-10deg]">{g.emoji}</span>
                  {g.id === newest && (
                    <span className="absolute left-3 top-3 animate-pop rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-brand-700 shadow">✨ Baru rilis</span>
                  )}
                  <span className="absolute bottom-3 right-3 grid h-11 w-11 translate-y-3 place-items-center rounded-2xl bg-white text-brand-700 opacity-0 shadow-lg transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                    <Play className="h-5 w-5 fill-current" />
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div>
                    <h2 className="font-bold text-navy-900 transition group-hover:text-brand-700">{g.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-navy-400">{g.description}</p>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold text-navy-500">
                    <span className="flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5 text-brand-500" /> {g._count.questions} soal</span>
                    <span className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-brand-500" /> {g.secondsPerQuestion} dtk</span>
                    <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-brand-500" /> {playerCount.get(g.id) ?? 0} pemain</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-navy-50 pt-3 text-xs text-navy-400">
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">
                      {g.subject} · {JENJANG_LABEL[g.jenjang]}
                    </span>
                    <span className="flex items-center gap-1"><Trophy className="h-3.5 w-3.5" /> {formatDate(g.launchedAt)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={Gamepad2} title="Belum ada game yang dirilis" desc="Nantikan games edukasi seru dari tim POSI." />
        )}
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Crown, Medal, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession, isPanel } from "@/lib/session";
import { getLeaderboard, getUserRank } from "@/lib/queries";
import { JENJANG_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { GameStage } from "./game-stage";
import { NOINDEX, pageMeta } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/games/[slug]">) {
  const { slug } = await params;
  const g = await prisma.game.findUnique({ where: { slug }, select: { title: true, description: true, subject: true, isPublished: true } });
  if (!g || !g.isPublished) return { title: "Game", ...NOINDEX };
  return pageMeta({ title: `${g.title} — Game Edukasi ${g.subject}`, description: g.description || `Main game edukasi ${g.subject} di Pelatihan POSI.`, path: `/games/${slug}` });
}

export default async function GamePage({ params }: PageProps<"/games/[slug]">) {
  const { slug } = await params;
  const session = await getSession();
  const game = await prisma.game.findUnique({
    where: { slug },
    include: { questions: { orderBy: { order: "asc" }, select: { id: true, text: true, options: true, points: true } } },
  });
  const staff = isPanel(session?.role);
  if (!game || (!game.isPublished && !staff)) notFound();

  const [leaderboard, myBest, myRank] = await Promise.all([
    getLeaderboard(game.id, 10),
    session ? prisma.gameScore.findFirst({ where: { gameId: game.id, userId: session.userId }, orderBy: { score: "desc" } }) : null,
    session?.role === "PESERTA" ? getUserRank(game.id, session.userId) : null,
  ]);
  const questions = game.questions.map((q) => ({ id: q.id, text: q.text, options: q.options as string[], points: q.points }));
  const podium = [leaderboard[1], leaderboard[0], leaderboard[2]];

  return (
    <div className="relative">
      <section className="relative overflow-hidden bg-hero pb-28 pt-8 text-white">
        <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
        <div className="pointer-events-none absolute -left-10 top-10 h-72 w-72 animate-blob rounded-full bg-brand-500/30 blur-3xl" />
        <div className="container-page relative animate-fade-up">
          <Link href="/games" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-200 transition hover:gap-2.5 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Semua games
          </Link>
          <div className="mt-5 flex items-center gap-4">
            <span className="grid h-20 w-20 animate-float place-items-center rounded-[28px] bg-white/10 text-5xl ring-1 ring-white/20">{game.emoji}</span>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{game.title}</h1>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="badge bg-white/15 text-white">{game.subject}</span>
                <span className="badge bg-white/15 text-white">{JENJANG_LABEL[game.jenjang]}</span>
                {!game.isPublished && <span className="badge bg-amber-400/25 text-amber-100">Preview admin</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <GameStage
        quiz={{
          gameId: game.id,
          description: game.description,
          secondsPerQuestion: game.secondsPerQuestion,
          questions,
          loggedIn: !!session,
          canSave: session?.role === "PESERTA" && game.isPublished,
          loginHref: `/login?next=/games/${game.slug}`,
          bestScore: myBest?.score ?? null,
        }}
        leaderboard={
        <aside className="card h-fit p-0!">
          <div className="rounded-t-3xl bg-linear-to-br from-navy-900 to-brand-900 px-5 pb-6 pt-5 text-white">
            <h2 className="flex items-center gap-2 font-bold">
              <Trophy className="h-5 w-5 text-amber-300" /> Leaderboard
            </h2>
            {leaderboard.length > 0 ? (
              <div className="mt-6 grid grid-cols-3 items-end gap-2 text-center">
                {podium.map((r, i) =>
                  r ? (
                    <div key={r.userId} className="animate-fade-up" style={{ animationDelay: `${i * 120}ms` }}>
                      <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-sm font-bold ring-2 ring-white/30">
                        {r.rank === 1 ? <Crown className="h-5 w-5 text-amber-300" /> : r.name.charAt(0)}
                      </div>
                      <p className="truncate text-xs font-semibold">{r.name.split(" ")[0]}</p>
                      <p className="text-[11px] text-brand-200">{r.score}</p>
                      <div
                        className={cn(
                          "mt-2 grid place-items-center rounded-t-2xl font-extrabold",
                          r.rank === 1 ? "h-20 bg-linear-to-t from-amber-500 to-amber-300 text-amber-900" : r.rank === 2 ? "h-14 bg-linear-to-t from-slate-400 to-slate-200 text-slate-700" : "h-10 bg-linear-to-t from-orange-700 to-orange-400 text-orange-50",
                        )}
                      >
                        {r.rank}
                      </div>
                    </div>
                  ) : (
                    <div key={i} />
                  ),
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-navy-200">Belum ada skor. Jadilah yang pertama!</p>
            )}
          </div>
          <div className="p-4">
            {myBest && (
              <p className="mb-3 flex items-center justify-between rounded-2xl bg-brand-50 px-4 py-2.5 text-sm text-brand-800 ring-1 ring-brand-100">
                <span className="flex items-center gap-2">
                  <Medal className="h-4 w-4" /> Skor terbaikmu
                  {myRank && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">#{myRank.rank} dari {myRank.total}</span>}
                </span>
                <b>{myBest.score}</b>
              </p>
            )}
            <ol className="space-y-1">
              {leaderboard.slice(3).map((r) => (
                <li key={r.userId} className={cn("flex items-center gap-3 rounded-2xl px-3 py-2 text-sm transition hover:bg-navy-50", r.userId === session?.userId && "bg-brand-50 ring-1 ring-brand-100")}>
                  <span className="w-6 text-center text-xs font-bold text-navy-400">{r.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-navy-800">{r.name}</span>
                    <span className="block truncate text-xs text-navy-400">{r.school}</span>
                  </span>
                  <span className="font-extrabold text-brand-700">{r.score}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
        }
      />
    </div>
  );
}

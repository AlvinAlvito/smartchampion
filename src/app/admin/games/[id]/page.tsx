import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Crown, ExternalLink, Timer, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { getLeaderboard } from "@/lib/queries";
import { JENJANG_LABEL } from "@/lib/constants";
import { Badge } from "@/components/ui";
import { GameDialogButton } from "../game-form";
import { GameDangerButtons, PublishButton, QuestionsPanel } from "./questions";

export const metadata = { title: "Kelola Game" };
export const dynamic = "force-dynamic";

export default async function AdminGameDetail({ params }: PageProps<"/admin/games/[id]">) {
  await requirePanel();
  const { id } = await params;
  const game = await prisma.game.findUnique({
    where: { id: Number(id) || 0 },
    include: { questions: { orderBy: { order: "asc" } }, _count: { select: { scores: true } } },
  });
  if (!game) notFound();
  const leaderboard = await getLeaderboard(game.id, 10);
  const { questions, _count, ...values } = game;

  return (
    <>
      <Link href="/admin/games" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:gap-2.5">
        <ArrowLeft className="h-4 w-4" /> Games
      </Link>

      <section className="relative my-5 animate-fade-up overflow-hidden rounded-[32px] bg-hero p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 animate-float place-items-center rounded-3xl bg-white/10 text-4xl ring-1 ring-white/20">{game.emoji}</span>
            <div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Badge tone={game.isPublished ? "green" : "gray"}>{game.isPublished ? "Sudah rilis" : "Draft"}</Badge>
                <span className="badge bg-white/15 text-white">{game.subject}</span>
                <span className="badge bg-white/15 text-white">{JENJANG_LABEL[game.jenjang]}</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{game.title}</h1>
              <p className="mt-1 flex items-center gap-3 text-sm text-navy-200">
                <span className="flex items-center gap-1">
                  <Timer className="h-4 w-4" /> {game.secondsPerQuestion} dtk/soal
                </span>
                <span className="flex items-center gap-1">
                  <Trophy className="h-4 w-4" /> {_count.scores} kali dimainkan
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/games/${game.slug}`} target="_blank" className="btn-outline-light">
              <ExternalLink className="h-4 w-4" /> Preview
            </Link>
            <GameDialogButton game={values} className="btn-outline-light" />
            <PublishButton id={game.id} published={game.isPublished} />
            <GameDangerButtons id={game.id} title={game.title} hasScores={leaderboard.length > 0} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <QuestionsPanel
            gameId={game.id}
            ai={{ id: game.id, title: game.title, subject: game.subject, jenjang: game.jenjang, description: game.description }}
            questions={questions.map((q) => ({
              id: q.id,
              text: q.text,
              options: q.options as string[],
              answerIndex: q.answerIndex,
              explanation: q.explanation,
              points: q.points,
            }))}
          />
        </div>
        <aside className="card h-fit">
          <p className="mb-3 flex items-center gap-2 font-bold text-navy-900">
            <Trophy className="h-5 w-5 text-amber-500" /> Leaderboard
          </p>
          <ol className="space-y-1">
            {leaderboard.map((r) => (
              <li key={r.userId} className="flex items-center gap-3 rounded-2xl px-2 py-2 text-sm transition hover:bg-brand-50">
                <span
                  className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-bold ${r.rank === 1 ? "bg-amber-100 text-amber-700" : r.rank <= 3 ? "bg-brand-100 text-brand-700" : "bg-navy-50 text-navy-500"}`}
                >
                  {r.rank === 1 ? <Crown className="h-3.5 w-3.5" /> : r.rank}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-navy-800">{r.name}</span>
                <b className="text-brand-700">{r.score}</b>
              </li>
            ))}
            {!leaderboard.length && <li className="rounded-2xl bg-navy-50/60 p-4 text-center text-sm text-navy-400">Belum ada skor.</li>}
          </ol>
        </aside>
      </div>
    </>
  );
}

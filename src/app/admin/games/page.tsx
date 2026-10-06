import Link from "next/link";
import { Gamepad2, ListChecks, Rocket, Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { JENJANG_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { Badge, EmptyState, PageTitle } from "@/components/ui";
import { GameDialogButton } from "./game-form";
import { Pagination, readPage } from "@/components/pagination";

export const metadata = { title: "Games" };
export const dynamic = "force-dynamic";

export default async function AdminGamesPage({ searchParams }: PageProps<"/admin/games">) {
  await requirePanel();
  const sp = await searchParams;
  const { page, skip, take } = readPage(sp);
  const [total, games] = await Promise.all([
    prisma.game.count(),
    prisma.game.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { questions: true, scores: true } } },
      skip,
      take,
    }),
  ]);
  const players = await prisma.gameScore.groupBy({ by: ["gameId", "userId"], where: { gameId: { in: games.map((g) => g.id) } } });
  const uniquePlayers = new Map<number, number>();
  players.forEach((p) => uniquePlayers.set(p.gameId, (uniquePlayers.get(p.gameId) ?? 0) + 1));

  return (
    <>
      <PageTitle
        icon={Gamepad2}
        eyebrow="Belajar sambil main"
        title="Games Edukasi"
        subtitle="Buat game kuis, kelola soal, lalu rilis. Setiap game punya leaderboard sendiri."
        action={<GameDialogButton game={null} />}
      />
      {games.length ? (
        <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {games.map((g) => (
            <Link key={g.id} href={`/admin/games/${g.id}`} className="card card-hover group flex flex-col gap-4 overflow-hidden">
              <div className="flex items-start justify-between">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-navy-800 to-brand-800 text-3xl shadow-lg transition group-hover:rotate-[-8deg] group-hover:scale-110">
                  {g.emoji}
                </span>
                <Badge tone={g.isPublished ? "green" : "gray"}>{g.isPublished ? <><Rocket className="h-3 w-3" /> Rilis</> : "Draft"}</Badge>
              </div>
              <div>
                <p className="font-bold text-navy-900 group-hover:text-brand-700">{g.title}</p>
                <p className="text-xs text-navy-400">
                  {g.subject} · {JENJANG_LABEL[g.jenjang]} · {g.secondsPerQuestion} dtk/soal
                </p>
              </div>
              <div className="mt-auto grid grid-cols-3 gap-2 text-center text-xs">
                {[
                  { icon: ListChecks, v: g._count.questions, l: "soal" },
                  { icon: Trophy, v: g._count.scores, l: "dimainkan" },
                  { icon: Users, v: uniquePlayers.get(g.id) ?? 0, l: "pemain" },
                ].map((s) => (
                  <div key={s.l} className="rounded-2xl bg-navy-50/70 p-2.5">
                    <s.icon className="mx-auto h-4 w-4 text-brand-500" />
                    <b className="mt-1 block text-base text-navy-900">{s.v}</b>
                    <span className="text-navy-400">{s.l}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-navy-400">{g.launchedAt ? `Rilis ${formatDate(g.launchedAt)}` : "Belum pernah dirilis"}</p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={Gamepad2} title="Belum ada game" desc="Buat game kuis pertama untuk peserta." action={<GameDialogButton game={null} />} />
      )}
      <Pagination basePath="/admin/games" searchParams={sp} page={page} total={total} noun="game" />
    </>
  );
}

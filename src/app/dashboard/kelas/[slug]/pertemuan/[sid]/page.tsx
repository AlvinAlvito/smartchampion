import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, ArrowLeft, CalendarClock, CircleCheck, CircleX, FileQuestion, Lightbulb, Lock, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn, formatDate } from "@/lib/utils";
import { GRADE_SCALE, LETTERS, gradeTone, worksheetOpen } from "@/lib/worksheet-shared";
import { Badge } from "@/components/ui";
import { Confetti } from "@/components/confetti";
import { WorksheetPlayer } from "./worksheet-player";
import { RichText } from "@/components/rich-text";

export const metadata = { title: "Worksheet" };
export const dynamic = "force-dynamic";

const GRADE_BG: Record<string, string> = {
  A: "from-emerald-500 to-teal-600",
  B: "from-sky-500 to-navy-700",
  C: "from-amber-400 to-orange-500",
  D: "from-orange-500 to-rose-500",
  E: "from-rose-500 to-rose-700",
};

export default async function WorksheetPage({ params }: PageProps<"/dashboard/kelas/[slug]/pertemuan/[sid]">) {
  const { slug, sid } = await params;
  const me = await requireUser(["PESERTA"]);
  const s = await prisma.classSession.findFirst({
    where: { id: Number(sid) || 0, product: { slug } },
    include: { product: { select: { id: true, name: true, slug: true } }, worksheetQuestions: { orderBy: [{ order: "asc" }, { id: "asc" }] } },
  });
  if (!s) notFound();
  const paid = await prisma.registration.count({ where: { userId: me.userId, productId: s.productId, status: "PAID" } });
  if (!paid) notFound();
  const [attempt, number] = await Promise.all([
    prisma.worksheetAttempt.findUnique({ where: { sessionId_userId: { sessionId: s.id, userId: me.userId } } }),
    prisma.classSession
      .count({ where: { productId: s.productId, OR: [{ startAt: { lt: s.startAt } }, { startAt: s.startAt, id: { lt: s.id } }] } })
      .then((n) => n + 1),
  ]);
  const open = worksheetOpen(s);
  const back = `/dashboard/kelas/${s.product.slug}`;
  const total = s.worksheetQuestions.reduce((a, q) => a + q.points, 0);

  const header = (
    <>
      <Link href={back} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:gap-2.5">
        <ArrowLeft className="h-4 w-4" /> {s.product.name}
      </Link>
      <div className="mb-6 mt-4 flex animate-fade-up items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-3xl bg-linear-to-br from-brand-500 to-navy-700 text-white shadow-xl">
          <FileQuestion className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Worksheet · Pertemuan {number}</p>
          <h1 className="text-xl font-extrabold tracking-tight text-navy-900 sm:text-2xl">{s.title}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-navy-400">
            <span>
              {s.worksheetQuestions.length} soal · {total} poin
            </span>
            {s.worksheetDueAt && (
              <span className="flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" /> batas {formatDate(s.worksheetDueAt, true)} WIB
              </span>
            )}
          </p>
        </div>
      </div>
    </>
  );

  /* ---------- sudah dikumpulkan: nilai + pembahasan ---------- */
  if (attempt) {
    const chosen = new Map((attempt.answers as { questionId: number; choice: number }[]).map((a) => [a.questionId, a.choice]));
    const scale = GRADE_SCALE.find((g) => g.grade === attempt.grade);
    return (
      <>
        {header}
        {attempt.score >= 85 && <Confetti />}
        <section
          className={cn("relative mb-6 overflow-hidden rounded-[32px] bg-linear-to-br p-6 text-white shadow-xl sm:p-8", GRADE_BG[attempt.grade] ?? GRADE_BG.E)}
        >
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
          <div className="relative flex flex-wrap items-center gap-6">
            <div className="grid h-24 w-24 place-items-center rounded-[28px] bg-white/20 text-5xl font-black ring-4 ring-white/30">{attempt.grade}</div>
            <div>
              <p className="flex items-center gap-2 text-sm text-white/80">
                <Trophy className="h-4 w-4" /> Nilai worksheet
              </p>
              <p className="text-5xl font-black tracking-tight">{attempt.score}</p>
              <p className="text-sm text-white/85">
                {attempt.correctCount}/{attempt.totalQuestions} benar · {scale?.label} · dikumpulkan {formatDate(attempt.submittedAt, true)} WIB
              </p>
            </div>
          </div>
        </section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-navy-900">Pembahasan</h2>
          <a href={`/api/worksheet-pdf/${s.id}?dl=1`} className="btn-primary btn-sm">
            <FileDown className="h-3.5 w-3.5" /> Unduh soal &amp; pembahasan (PDF)
          </a>
        </div>
        <ol className="space-y-3">
          {s.worksheetQuestions.map((q, i) => {
            const c = chosen.has(q.id) ? chosen.get(q.id)! : -1;
            const ok = c === q.answerIndex;
            const opts = q.options as string[];
            return (
              <li key={q.id} className={cn("card space-y-3 ring-1", ok ? "ring-emerald-100" : "ring-rose-100")}>
                <div className="flex items-start gap-3">
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white", ok ? "bg-emerald-500" : "bg-rose-500")}>
                    {ok ? <CircleCheck className="h-4 w-4" /> : <CircleX className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-navy-400">
                      Soal {i + 1} · {ok ? `+${q.points}` : "0"} poin
                    </p>
                    <RichText text={q.text} className="font-semibold text-navy-900" />
                  </div>
                </div>
                {q.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.imageUrl} alt={`Gambar soal ${i + 1}`} className="max-h-64 max-w-full rounded-2xl ring-1 ring-navy-100" />
                )}
                <div className="grid gap-1.5">
                  {opts.map((o, oi) => (
                    <div
                      key={oi}
                      className={cn(
                        "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                        oi === q.answerIndex
                          ? "bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-200"
                          : oi === c
                            ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                            : "bg-navy-50/50 text-navy-600",
                      )}
                    >
                      <b>{LETTERS[oi]}.</b> <RichText text={o} className="min-w-0 flex-1" imgClassName="max-h-32" />
                      {oi === q.answerIndex && <Badge tone="green">Jawaban benar</Badge>}
                      {oi === c && oi !== q.answerIndex && <Badge tone="red">Jawabanmu</Badge>}
                    </div>
                  ))}
                  {c < 0 && <p className="text-xs italic text-navy-400">Tidak dijawab.</p>}
                </div>
                {q.explanation && (
                  <div className="flex gap-2 rounded-2xl bg-amber-50/70 p-3 text-sm text-navy-700 ring-1 ring-amber-100">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <RichText text={q.explanation} className="min-w-0 flex-1" />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </>
    );
  }

  /* ---------- belum dibuka / sudah ditutup ---------- */
  if (!open || !s.worksheetQuestions.length) {
    return (
      <>
        {header}
        <div className="card flex flex-col items-center gap-2 py-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-3xl bg-navy-50 text-navy-400">
            <Lock className="h-7 w-7" />
          </span>
          <p className="font-bold text-navy-900">
            {s.worksheetPublished && s.worksheetQuestions.length ? "Worksheet sudah ditutup" : "Worksheet belum dibuka"}
          </p>
          <p className="max-w-md text-sm text-navy-400">
            {s.worksheetPublished && s.worksheetQuestions.length
              ? "Batas waktu pengumpulan sudah lewat. Hubungi admin bila kamu berhalangan."
              : "Tutor/admin belum menerbitkan worksheet untuk pertemuan ini. Cek lagi nanti ya!"}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {s.worksheetPublished && s.worksheetQuestions.length > 0 && (
              // batas waktu lewat → soal & pembahasan boleh diunduh sebagai pegangan
              <a href={`/api/worksheet-pdf/${s.id}?dl=1`} className="btn-primary">
                <FileDown className="h-4 w-4" /> Unduh soal &amp; pembahasan (PDF)
              </a>
            )}
            <Link href={back} className="btn-secondary">
              <ArrowLeft className="h-4 w-4" /> Kembali ke kelas
            </Link>
          </div>
        </div>
      </>
    );
  }

  /* ---------- kerjakan (kunci jawaban tidak dikirim ke browser) ---------- */
  return (
    <>
      {header}
      <WorksheetPlayer
        sessionId={s.id}
        userId={me.userId}
        questions={s.worksheetQuestions.map((q) => ({ id: q.id, text: q.text, imageUrl: q.imageUrl, options: q.options as string[], points: q.points }))}
      />
      <p className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-navy-400">
        Skala nilai:
        {GRADE_SCALE.map((g) => (
          <Badge key={g.grade} tone={gradeTone(g.grade)}>
            {g.grade} ≥ {g.min}
          </Badge>
        ))}
      </p>
    </>
  );
}

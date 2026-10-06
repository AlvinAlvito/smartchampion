import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, ClipboardCheck, FileQuestion, GraduationCap, PlayCircle, Video } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { JENJANG_LABEL } from "@/lib/constants";
import { cn, formatDate, safeUrl } from "@/lib/utils";
import { meetingPhase } from "@/lib/worksheet-shared";
import { Badge } from "@/components/ui";
import { MathText } from "@/components/math-text";
import { AttendancePanel, EditMeetingButton, ScoresPanel, WorksheetQuestions, WorksheetSettings, type WsQuestion } from "./meeting-admin";
import { WorksheetPdfCard } from "./worksheet-tools";
import { readWorksheetPdfConfig } from "@/lib/worksheet-pdf-config";

export const metadata = { title: "Kelola Pertemuan" };
export const dynamic = "force-dynamic";

const TABS = [
  { v: "worksheet", l: "Worksheet", icon: FileQuestion },
  { v: "absensi", l: "Absensi", icon: ClipboardCheck },
  { v: "nilai", l: "Nilai", icon: GraduationCap },
] as const;

export default async function MeetingAdminPage({ params, searchParams }: PageProps<"/admin/produk/[id]/pertemuan/[sid]">) {
  await requirePanel();
  const { id, sid } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.v === sp.tab) ? (sp.tab as string) : "worksheet";
  const s = await prisma.classSession.findFirst({
    where: { id: Number(sid) || 0, productId: Number(id) || 0 },
    include: {
      product: { select: { id: true, name: true, bidang: true, jenjang: true, worksheetPdfBg: true, worksheetPdfConfig: true } },
      worksheetQuestions: { orderBy: [{ order: "asc" }, { id: "asc" }] },
      worksheetAttempts: true,
      attendances: { include: { markedBy: { select: { name: true } } } },
    },
  });
  if (!s) notFound();
  const [number, regs] = await Promise.all([
    prisma.classSession
      .count({ where: { productId: s.productId, OR: [{ startAt: { lt: s.startAt } }, { startAt: s.startAt, id: { lt: s.id } }] } })
      .then((n) => n + 1),
    prisma.registration.findMany({
      where: { productId: s.productId, status: "PAID" },
      select: { userId: true, fullName: true, school: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  // satu baris per akun peserta (VIP bisa punya beberapa paket lunas)
  const people = [...new Map(regs.map((r) => [r.userId, r])).values()];
  const questions: WsQuestion[] = s.worksheetQuestions.map((q) => ({
    id: q.id,
    text: q.text,
    imageUrl: q.imageUrl,
    options: q.options as string[],
    answerIndex: q.answerIndex,
    points: q.points,
    explanation: q.explanation,
  }));
  const attByUser = new Map(s.attendances.map((a) => [a.userId, a]));
  const tryByUser = new Map(s.worksheetAttempts.map((a) => [a.userId, a]));
  const phase = meetingPhase(s);
  const PHASE = { upcoming: { l: "Akan datang", tone: "blue" }, live: { l: "Berlangsung", tone: "green" }, done: { l: "Selesai", tone: "gray" } } as const;

  return (
    <>
      <Link href={`/admin/produk/${s.productId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:gap-2.5">
        <ArrowLeft className="h-4 w-4" /> {s.product.name}
      </Link>

      <section className="relative my-5 animate-fade-up overflow-hidden rounded-[32px] bg-hero p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-1.5">
              <span className="badge bg-white/15 text-white">Pertemuan {number}</span>
              <Badge tone={PHASE[phase].tone}>{PHASE[phase].l}</Badge>
              <span className="badge bg-white/15 text-white">{JENJANG_LABEL[s.product.jenjang]}</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{s.title}</h1>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-navy-200">
              <span className="flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4" /> {formatDate(s.startAt, true)} – {formatDate(s.endAt, true).split(", ").pop()} WIB
              </span>
              {s.meetingUrl && (
                <a href={safeUrl(s.meetingUrl) ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-white hover:underline">
                  <Video className="h-4 w-4" /> Link Zoom
                </a>
              )}
              {s.recordingUrl ? (
                <a
                  href={safeUrl(s.recordingUrl) ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-white hover:underline"
                >
                  <PlayCircle className="h-4 w-4" /> Rekaman
                </a>
              ) : (
                <span className="flex items-center gap-1.5 text-navy-300">
                  <PlayCircle className="h-4 w-4" /> Rekaman belum diisi
                </span>
              )}
            </p>
            {s.notes && <MathText as="p" text={s.notes} className="mt-2 max-w-2xl text-sm text-navy-200" />}
          </div>
          <EditMeetingButton productId={s.productId} number={number} meeting={s} />
        </div>
      </section>

      <nav className="mb-5 flex flex-wrap gap-1.5 rounded-3xl bg-white p-1.5 ring-1 ring-navy-100">
        {TABS.map((t) => (
          <Link
            key={t.v}
            href={`?tab=${t.v}`}
            scroll={false}
            className={cn(
              "flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition",
              tab === t.v ? "bg-linear-to-r from-brand-600 to-navy-700 text-white shadow-md" : "text-navy-500 hover:bg-brand-50 hover:text-brand-700",
            )}
          >
            <t.icon className="h-4 w-4" /> {t.l}
            {t.v === "absensi" && (
              <span className="text-xs opacity-80">
                {s.attendances.filter((a) => a.status === "HADIR").length}/{people.length}
              </span>
            )}
            {t.v === "nilai" && (
              <span className="text-xs opacity-80">
                {s.worksheetAttempts.length}/{people.length}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {tab === "worksheet" && (
        <div className="space-y-5">
          <WorksheetSettings sessionId={s.id} published={s.worksheetPublished} dueAt={s.worksheetDueAt} questionCount={questions.length} />
          <WorksheetPdfCard
            sessionId={s.id}
            productId={s.productId}
            questionCount={questions.length}
            config={readWorksheetPdfConfig(s.product.worksheetPdfConfig)}
            bgUrl={s.product.worksheetPdfBg}
          />
          <WorksheetQuestions
            sessionId={s.id}
            questions={questions}
            ai={{
              className: s.product.name,
              meetingTitle: s.title,
              subject: s.product.bidang,
              jenjang: JENJANG_LABEL[s.product.jenjang] ?? s.product.jenjang,
              notes: s.notes ?? "",
            }}
          />
        </div>
      )}
      {tab === "absensi" && (
        <AttendancePanel
          sessionId={s.id}
          live={phase === "live"}
          rows={people.map((p) => {
            const a = attByUser.get(p.userId);
            return {
              userId: p.userId,
              name: p.fullName,
              school: p.school,
              status: a?.status ?? null,
              method: a?.method ?? null,
              updatedAt: a?.updatedAt ?? null,
              markedBy: a?.markedBy?.name ?? null,
            };
          })}
        />
      )}
      {tab === "nilai" && (
        <ScoresPanel
          sessionId={s.id}
          questions={questions}
          rows={people.map((p) => {
            const a = tryByUser.get(p.userId);
            return {
              userId: p.userId,
              name: p.fullName,
              school: p.school,
              attempt: a
                ? {
                    score: a.score,
                    grade: a.grade,
                    correctCount: a.correctCount,
                    totalQuestions: a.totalQuestions,
                    submittedAt: a.submittedAt,
                    answers: a.answers as { questionId: number; choice: number }[],
                  }
                : null,
            };
          })}
        />
      )}
    </>
  );
}

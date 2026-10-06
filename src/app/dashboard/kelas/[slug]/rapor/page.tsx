import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Award, CalendarDays, ClipboardCheck, Download, FileQuestion, MessageSquareQuote, Medal, Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getStudentReport } from "@/lib/class-report";
import { ATTENDANCE_LABEL, ATTENDANCE_TONE, GRADE_SCALE, gradeOf, gradeTone } from "@/lib/worksheet-shared";
import { cn } from "@/lib/utils";
import { Badge, EmptyState } from "@/components/ui";
import { ChartCard, GroupedBarChart } from "@/components/charts";
import { Confetti } from "@/components/confetti";
import { activeQuestions, feedbackGate } from "@/lib/feedback";
import { FeedbackCard } from "./feedback-card";

export const metadata = { title: "Rapor" };
export const dynamic = "force-dynamic";

const GRADE_BG: Record<string, string> = {
  A: "from-emerald-500 to-teal-600",
  B: "from-sky-500 to-navy-700",
  C: "from-amber-400 to-orange-500",
  D: "from-orange-500 to-rose-500",
  E: "from-rose-500 to-rose-700",
};

export default async function ReportPage({ params }: PageProps<"/dashboard/kelas/[slug]/rapor">) {
  const { slug } = await params;
  const me = await requireUser(["PESERTA"]);
  const product = await prisma.product.findUnique({ where: { slug }, select: { id: true, reportPublished: true } });
  if (!product) notFound();
  const r = await getStudentReport(product.id, me.userId);
  if (!r) notFound();
  const back = `/dashboard/kelas/${slug}`;
  if (!product.reportPublished) {
    return (
      <>
        <Link href={back} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
          <ArrowLeft className="h-4 w-4" /> {r.product.name}
        </Link>
        <div className="mt-6">
          <EmptyState icon={Award} title="Rapor belum diterbitkan" desc="Rapor tampil di sini setelah pelatihan selesai dan admin menerbitkannya." />
        </div>
      </>
    );
  }
  const [gate, fb, questions] = await Promise.all([
    feedbackGate(product.id, me.userId),
    prisma.feedback.findUnique({
      where: { productId_userId: { productId: product.id, userId: me.userId } },
      select: { answers: { orderBy: { id: "asc" }, select: { questionId: true, questionText: true, type: true, rating: true, text: true } } },
    }),
    activeQuestions(),
  ]);
  const sm = r.summary;
  const chart = r.meetings.filter((m) => m.graded).map((m) => ({ name: `P${m.number}`, nilai: m.score ?? 0, kelas: m.classAverage ?? 0 }));

  return (
    <>
      {sm.grade === "A" && <Confetti />}
      <Link href={back} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:gap-2.5">
        <ArrowLeft className="h-4 w-4" /> {r.product.name}
      </Link>

      {/* hero */}
      <section className="relative my-5 animate-fade-up overflow-hidden rounded-[32px] bg-hero p-6 text-white shadow-xl sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <div className="relative flex flex-wrap items-center gap-6">
          <div
            className={cn(
              "grid h-28 w-28 shrink-0 place-items-center rounded-[32px] bg-linear-to-br shadow-2xl ring-4 ring-white/20",
              GRADE_BG[sm.grade ?? "E"] ?? GRADE_BG.E,
            )}
          >
            <div className="text-center">
              <p className="text-5xl font-black leading-none">{sm.grade ?? "–"}</p>
              <p className="mt-1 text-[11px] font-semibold text-white/90">{sm.predikat ?? "belum dinilai"}</p>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-200">Rapor hasil belajar</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{r.student.name}</h1>
            <p className="mt-1 text-sm text-navy-200">
              {r.product.name} · {r.period}
            </p>
            <p className="text-xs text-navy-300">
              {r.student.school}
              {r.tutors.length ? ` · Tutor: ${r.tutors.join(", ")}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/rapor/${r.product.id}/${me.userId}?dl=1`} className="btn-light">
              <Download className="h-4 w-4" /> Unduh rapor PDF
            </a>
            {r.certificate && (
              <a href={`/api/sertifikat/${r.product.id}/${me.userId}?dl=1`} className="btn-outline-light">
                <Award className="h-4 w-4" /> Sertifikat
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ringkasan */}
      <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { l: "Nilai akhir", v: sm.average ?? "–", h: "rata-rata worksheet", icon: Trophy, c: "text-brand-700 bg-brand-50" },
          {
            l: "Kehadiran",
            v: sm.attendanceRate != null ? `${sm.attendanceRate}%` : "–",
            h: `hadir ${sm.present} dari ${sm.started}`,
            icon: ClipboardCheck,
            c: "text-emerald-700 bg-emerald-50",
          },
          {
            l: "Worksheet",
            v: `${sm.worksheetsDone}/${sm.worksheetsTotal}`,
            h: sm.best != null ? `nilai terbaik ${sm.best}` : "dikerjakan",
            icon: FileQuestion,
            c: "text-sky-700 bg-sky-50",
          },
          { l: "Peringkat kelas", v: sm.rank ?? "–", h: `dari ${sm.rankedCount} peserta`, icon: Medal, c: "text-amber-700 bg-amber-50" },
          {
            l: "Rata-rata kelas",
            v: sm.classAverage ?? "–",
            h:
              sm.average != null && sm.classAverage != null
                ? sm.average >= sm.classAverage
                  ? `kamu +${sm.average - sm.classAverage} di atasnya`
                  : `kamu ${sm.average - sm.classAverage} darinya`
                : `${sm.classSize} peserta`,
            icon: Users,
            c: "text-navy-700 bg-navy-50",
          },
        ].map((k) => (
          <div key={k.l} className="card p-4!">
            <span className={cn("mb-2 grid h-9 w-9 place-items-center rounded-xl", k.c)}>
              <k.icon className="h-4 w-4" />
            </span>
            <p className="text-xs font-semibold text-navy-400">{k.l}</p>
            <p className="text-2xl font-black text-navy-900">{k.v}</p>
            <p className="text-xs text-navy-400">{k.h}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {chart.length > 0 && (
            // pembungkus: ChartCard memakai h-full, tanpa ini kartu ikut setinggi seluruh kolom
            <div>
              <ChartCard title="Perkembangan nilai worksheet" subtitle="Nilaimu dibanding rata-rata kelas tiap pertemuan">
                <GroupedBarChart
                  data={chart}
                  series={[
                    { key: "nilai", label: "Nilaimu" },
                    { key: "kelas", label: "Rata-rata kelas" },
                  ]}
                />
              </ChartCard>
            </div>
          )}
          <section className="card overflow-x-auto p-0!">
            <p className="flex items-center gap-2 border-b border-navy-50 p-4 font-bold text-navy-900">
              <CalendarDays className="h-5 w-5 text-brand-600" /> Rincian per pertemuan
            </p>
            <table className="table min-w-[560px]">
              <thead>
                <tr>
                  <th>Pertemuan</th>
                  <th>Kehadiran</th>
                  <th className="text-right">Nilai</th>
                  <th>Grade</th>
                  <th className="text-right">Rata kelas</th>
                </tr>
              </thead>
              <tbody>
                {r.meetings.map((m) => (
                  <tr key={m.number}>
                    <td>
                      <p className="font-semibold text-navy-900">
                        P{m.number} · {m.title}
                      </p>
                      <p className="text-xs text-navy-400">{m.date}</p>
                    </td>
                    <td>
                      {m.attendance ? (
                        <Badge tone={ATTENDANCE_TONE[m.attendance]}>{ATTENDANCE_LABEL[m.attendance]}</Badge>
                      ) : (
                        <span className="text-xs text-navy-400">{m.started ? "Belum diabsen" : "Akan datang"}</span>
                      )}
                    </td>
                    <td className={cn("text-right text-lg font-extrabold", m.missed ? "text-rose-500" : "text-navy-900")}>
                      {m.score ?? (m.graded ? "–" : "")}
                    </td>
                    <td>{m.grade ? <Badge tone={gradeTone(m.grade)}>{m.grade}</Badge> : null}</td>
                    <td className="text-right text-sm text-navy-500">{m.classAverage ?? ""}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <p className="font-semibold text-navy-900">Try Out Mimpi.mu</p>
                    <p className="text-xs text-navy-400">Nilai tambahan setelah pelatihan</p>
                  </td>
                  <td />
                  <td className="text-right text-lg font-extrabold text-navy-900">{sm.tryout ?? "–"}</td>
                  <td>{sm.tryout != null ? <Badge tone={gradeTone(gradeOf(sm.tryout))}>{gradeOf(sm.tryout)}</Badge> : null}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </section>
        </div>

        <aside className="space-y-6">
          <div className="card space-y-3">
            <p className="flex items-center gap-2 font-bold text-navy-900">
              <ClipboardCheck className="h-5 w-5 text-emerald-600" /> Rekap kehadiran
            </p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {(["HADIR", "IZIN", "SAKIT", "ALPA"] as const).map((k) => (
                <div key={k} className="rounded-2xl bg-navy-50/60 p-2">
                  <p className="text-xl font-black text-navy-900">{sm.attendance[k] ?? 0}</p>
                  <Badge tone={ATTENDANCE_TONE[k]}>{ATTENDANCE_LABEL[k]}</Badge>
                </div>
              ))}
            </div>
          </div>
          <div className="card space-y-2 bg-linear-to-br from-amber-50 to-white">
            <p className="flex items-center gap-2 font-bold text-navy-900">
              <MessageSquareQuote className="h-5 w-5 text-amber-500" /> Catatan tutor
            </p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-navy-700">
              {r.note || "Terus semangat berlatih dan pertahankan kehadiranmu di setiap pertemuan."}
            </p>
          </div>
          {r.certificate && (
            <div className="card space-y-2 ring-2 ring-amber-200">
              <p className="flex items-center gap-2 font-bold text-navy-900">
                <Award className="h-5 w-5 text-amber-500" /> Sertifikat
              </p>
              <p className="font-mono text-xs text-navy-500">No. {r.certificate.number}</p>
              <a href={`/api/sertifikat/${r.product.id}/${me.userId}?dl=1`} className="btn-primary btn-sm w-full">
                <Download className="h-3.5 w-3.5" /> Unduh sertifikat
              </a>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 text-xs text-navy-400">
            Skala nilai:
            {GRADE_SCALE.map((g) => (
              <Badge key={g.grade} tone={gradeTone(g.grade)}>
                {g.grade} ≥ {g.min}
              </Badge>
            ))}
          </div>
        </aside>
      </div>

      <div className="mt-6">
        <FeedbackCard
          productId={product.id}
          open={gate.open}
          reason={gate.open ? undefined : gate.reason}
          questions={questions}
          answers={fb?.answers ?? null}
        />
      </div>
    </>
  );
}

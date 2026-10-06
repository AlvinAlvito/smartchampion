import Link from "next/link";
import { Download, Filter, ListChecks, MessageSquareHeart, MessageSquareText, RotateCcw, Star, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { listFeedback, summarizeQuestions, toQuestionDTO } from "@/lib/feedback";
import { CATEGORY_LABEL, CATEGORY_TONE, FEEDBACK_ASPECTS, TYPE_LABEL, avgRating, feedbackScore } from "@/lib/feedback-shared";
import { paidCountByProduct } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Badge, PageTitle, StatCard } from "@/components/ui";
import { StarDisplay } from "@/components/star-rating";
import { FeedbackTable, QuestionManager } from "./feedback-admin";

export const metadata = { title: "Feedback Peserta" };
export const dynamic = "force-dynamic";

export default async function FeedbackPage({ searchParams }: PageProps<"/admin/feedback">) {
  await requirePanel();
  const sp = await searchParams;
  const tab = sp.tab === "pertanyaan" ? "pertanyaan" : "hasil";
  const productId = Number(sp.produk) || undefined;

  const questionsRaw = await prisma.feedbackQuestion.findMany({
    orderBy: [{ order: "asc" }, { id: "asc" }],
    include: { _count: { select: { answers: true } } },
  });
  const questions = questionsRaw.map((q) => ({ ...toQuestionDTO(q), isActive: q.isActive, order: q.order, answerCount: q._count.answers }));
  const activeCount = questions.filter((q) => q.isActive).length;

  const tabs = (
    <div className="mb-5 flex gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-navy-100 sm:inline-flex">
      {[
        { k: "hasil", label: "Hasil feedback", icon: MessageSquareText, href: `/admin/feedback${productId ? `?produk=${productId}` : ""}` },
        { k: "pertanyaan", label: `Pertanyaan (${activeCount} aktif)`, icon: ListChecks, href: "/admin/feedback?tab=pertanyaan" },
      ].map((t) => (
        <Link
          key={t.k}
          href={t.href}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition",
            tab === t.k ? "bg-brand-600 text-white shadow" : "text-navy-500 hover:bg-navy-50",
          )}
        >
          <t.icon className="h-4 w-4" /> {t.label}
        </Link>
      ))}
    </div>
  );

  if (tab === "pertanyaan") {
    return (
      <>
        <PageTitle
          eyebrow="Kualitas pelatihan"
          title="Feedback Peserta"
          subtitle="Kelola pertanyaan yang muncul di form feedback peserta (setelah semua pertemuan selesai & rapor diterbitkan). Berlaku untuk semua kelas."
          icon={MessageSquareHeart}
        />
        {tabs}
        <QuestionManager questions={questions} />
      </>
    );
  }

  const [rows, summary, products] = await Promise.all([
    listFeedback(productId),
    prisma.feedback.groupBy({
      by: ["productId"],
      _count: { _all: true },
      _avg: { tutorRating: true, adminRating: true, materialRating: true, overallRating: true },
    }),
    prisma.product.findMany({ select: { id: true, name: true, reportPublished: true }, orderBy: { name: "asc" } }),
  ]);
  const paid = await paidCountByProduct(summary.map((s) => s.productId));
  const nameOf = new Map(products.map((p) => [p.id, p.name]));
  const perClass = summary
    .map((s) => ({ ...s, name: nameOf.get(s.productId) ?? `#${s.productId}`, paid: paid.get(s.productId) ?? 0 }))
    .sort((a, b) => b._count._all - a._count._all);
  const selected = productId ? products.find((p) => p.id === productId) : undefined;
  const avgs = FEEDBACK_ASPECTS.map((a) => ({ ...a, avg: avgRating(rows.map((r) => r[a.key])) }));
  const perQuestion = summarizeQuestions(rows, questions);

  return (
    <>
      <PageTitle
        eyebrow="Kualitas pelatihan"
        title="Feedback Peserta"
        subtitle="Hasil penilaian peserta setelah pelatihan selesai & rapor diterbitkan."
        icon={MessageSquareHeart}
        action={
          <a href={`/api/admin/feedback${productId ? `?produk=${productId}` : ""}`} className="btn-secondary">
            <Download className="h-4 w-4" /> Ekspor Excel
          </a>
        }
      />
      {tabs}

      <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={selected ? "Feedback kelas ini" : "Total feedback"} value={rows.length} icon={Users} tone="navy" />
        {avgs.map((a) => (
          <StatCard
            key={a.key}
            label={a.label}
            value={a.avg != null ? `${a.avg} / 5` : "-"}
            hint={<StarDisplay value={a.avg} size="h-3.5 w-3.5" />}
            icon={Star}
            tone={a.key === "overallRating" ? "brand" : "yellow"}
          />
        ))}
      </div>

      {!productId && perClass.length > 0 && (
        <section className="card mb-6 overflow-x-auto p-0!">
          <p className="border-b border-navy-50 p-4 font-bold text-navy-900">Ringkasan per kelas</p>
          <table className="table min-w-190">
            <thead>
              <tr>
                <th>Kelas</th>
                <th className="text-right">Responden</th>
                {FEEDBACK_ASPECTS.map((a) => (
                  <th key={a.key} className="text-right">
                    {a.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perClass.map((c) => (
                <tr key={c.productId}>
                  <td>
                    <Link href={`/admin/feedback?produk=${c.productId}`} className="font-semibold text-navy-900 hover:text-brand-700">
                      {c.name}
                    </Link>
                  </td>
                  <td className="text-right text-sm text-navy-600">
                    {c._count._all}/{c.paid}
                  </td>
                  {FEEDBACK_ASPECTS.map((a) => {
                    const v = c._avg[a.key];
                    return (
                      <td key={a.key} className="text-right font-bold text-navy-900">
                        {v != null ? Math.round(v * 10) / 10 : "-"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <form className="card mb-6 flex flex-wrap gap-3" action="/admin/feedback">
        <select name="produk" defaultValue={productId ?? ""} className="input min-w-0 flex-1" aria-label="Filter kelas">
          <option value="">Semua kelas</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Link href="/admin/feedback" className="btn-ghost" aria-label="Reset filter">
          <RotateCcw className="h-4 w-4" />
        </Link>
        <button className="btn-primary">
          <Filter className="h-4 w-4" /> Filter
        </button>
      </form>

      {perQuestion.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 font-bold text-navy-900">Rekap per pertanyaan{selected ? ` · ${selected.name}` : ""}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {perQuestion.map((q) => {
              const max = Math.max(1, ...q.counts.map((c) => c.n));
              return (
                <div key={q.key} className="card space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 font-semibold text-navy-900">{q.text}</p>
                    <Badge tone={CATEGORY_TONE[q.category]}>{CATEGORY_LABEL[q.category]}</Badge>
                  </div>
                  <p className="text-xs text-navy-400">
                    {TYPE_LABEL[q.type]} · {q.count} jawaban
                  </p>
                  {q.type === "RATING" && (
                    <p className="flex items-center gap-2 text-2xl font-black text-navy-900">
                      {q.average ?? "-"} <StarDisplay value={q.average} />
                    </p>
                  )}
                  {q.counts.length > 0 && (
                    <div className="space-y-1.5">
                      {q.counts.map((c) => (
                        <div key={c.label} className="flex items-center gap-2 text-xs">
                          <span className="w-24 shrink-0 truncate font-semibold text-navy-600">{q.type === "RATING" ? `${c.label} bintang` : c.label}</span>
                          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-navy-50">
                            <span className="block h-full rounded-full bg-linear-to-r from-amber-400 to-brand-500" style={{ width: `${(c.n / max) * 100}%` }} />
                          </span>
                          <span className="w-8 text-right font-bold text-navy-700">{c.n}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {q.type === "TEXT" && (
                    <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {q.texts.map((t, i) => (
                        <li key={i} className="rounded-xl bg-navy-50/60 p-2.5 text-sm text-navy-700">
                          “{t.text}” <span className="text-xs text-navy-400">— {t.name}</span>
                        </li>
                      ))}
                      {!q.texts.length && <li className="text-sm text-navy-400">Belum ada jawaban.</li>}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <FeedbackTable
        rows={rows.map((r) => ({
          id: r.id,
          productName: r.product.name,
          name: r.name,
          school: r.school,
          tutorRating: r.tutorRating,
          adminRating: r.adminRating,
          materialRating: r.materialRating,
          overallRating: r.overallRating,
          score: feedbackScore(r),
          updatedAt: r.updatedAt,
          answers: r.answers,
        }))}
        scope={selected?.name ?? null}
        reportPending={!!selected && !selected.reportPublished}
      />
    </>
  );
}

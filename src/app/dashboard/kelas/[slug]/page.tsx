import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CalendarRange,
  ClipboardCheck,
  Clock,
  FileQuestion,
  FileText,
  GraduationCap,
  Lock,
  MessageSquareHeart,
  Newspaper,
  PlayCircle,
  Video,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { paidCountByProduct } from "@/lib/queries";
import { cn, formatDate, safeUrl } from "@/lib/utils";
import { ATTENDANCE_LABEL, ATTENDANCE_TONE, average, gradeOf, gradeTone, meetingPhase, worksheetOpen } from "@/lib/worksheet-shared";
import { MathText } from "@/components/math-text";
import { CheckInButton } from "./check-in-button";
import { Badge, EmptyState, QuotaBar, SectionTitle } from "@/components/ui";
import { subjectVisual } from "@/components/product-card";
import { ClassTutors } from "@/components/class-tutors";
import { SessionProgress } from "@/components/session-progress";
import { safeWaGroupUrl } from "@/lib/wa-group";
import { WhatsAppIcon } from "@/components/whatsapp-icon";

export const dynamic = "force-dynamic";

const TYPE_META = {
  PDF: { icon: FileText, label: "PDF", tone: "red", grad: "from-rose-400 to-rose-600" },
  VIDEO: { icon: Video, label: "Video", tone: "blue", grad: "from-sky-400 to-navy-600" },
  ARTICLE: { icon: Newspaper, label: "Artikel", tone: "brand", grad: "from-brand-400 to-brand-700" },
} as const;

export default async function KelasSayaPage({ params }: PageProps<"/dashboard/kelas/[slug]">) {
  const { slug } = await params;
  const session = await requireUser(["PESERTA"]);
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      sessions: { orderBy: [{ startAt: "asc" }, { id: "asc" }], include: { _count: { select: { worksheetQuestions: true } } } },
      materials: { where: { isPublished: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!product) notFound();
  const regs = await prisma.registration.findMany({ where: { userId: session.userId, productId: product.id, status: "PAID" }, orderBy: { paidAt: "desc" } });
  const reg = regs[0];
  if (!reg) notFound();
  // hanya peserta lunas yang sampai di sini → aman menampilkan link grup
  const waGroup = safeWaGroupUrl(product.waGroupUrl);
  // VIP Privat bisa beli paket berkali-kali: jumlahkan seluruh paket lunas
  const vip = product.type === "PRIVATE";
  const vipBought = regs.reduce((s, r) => s + (r.sessionsBought ?? 0), 0);
  const vipDone = regs.reduce((s, r) => s + r.sessionsDone, 0);

  const filled = (await paidCountByProduct([product.id])).get(product.id) ?? 0;
  const sessionIds = product.sessions.map((s) => s.id);
  const [attempts, attendances, result, myFeedback] = await Promise.all([
    prisma.worksheetAttempt.findMany({
      where: { userId: session.userId, sessionId: { in: sessionIds } },
      select: { sessionId: true, score: true, grade: true },
    }),
    prisma.attendance.findMany({ where: { userId: session.userId, sessionId: { in: sessionIds } }, select: { sessionId: true, status: true } }),
    prisma.classResult.findUnique({ where: { productId_userId: { productId: product.id, userId: session.userId } }, select: { certificateNo: true } }),
    prisma.feedback.findUnique({ where: { productId_userId: { productId: product.id, userId: session.userId } }, select: { id: true } }),
  ]);
  const tryBy = new Map(attempts.map((a) => [a.sessionId, a]));
  const attBy = new Map(attendances.map((a) => [a.sessionId, a.status]));
  // ringkasan (sama dengan rekap admin: worksheet yang lewat batas & tidak dikumpulkan = 0)
  const graded = product.sessions.filter((s) => s.worksheetPublished && s._count.worksheetQuestions > 0);
  const missed = graded.filter((s) => !tryBy.has(s.id) && !worksheetOpen(s));
  const myAvg = average([...attempts.map((a) => a.score), ...missed.map(() => 0)]);
  const started = product.sessions.filter((s) => meetingPhase(s) !== "upcoming").length;
  const present = attendances.filter((a) => a.status === "HADIR").length;
  const { icon: Icon, gradient } = subjectVisual(product.bidang);

  return (
    <>
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:gap-2.5">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <div className="mb-8 mt-4 flex animate-fade-up items-center gap-4">
        <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-linear-to-br ${gradient} text-white shadow-xl`}>
          <Icon className="h-8 w-8" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">{product.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-navy-400">
            <span className="font-mono">{reg.code}</span>
            {product.scheduleInfo && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {product.scheduleInfo}
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-8 lg:col-span-2">
          <div>
            <SectionTitle title={`Pertemuan (${product.sessions.length})`} icon={CalendarRange} />
            {product.sessions.length ? (
              <ol className="stagger space-y-3">
                {product.sessions.map((s, i) => {
                  const phase = meetingPhase(s);
                  const att = attBy.get(s.id);
                  const done = tryBy.get(s.id);
                  const hasWs = s.worksheetPublished && s._count.worksheetQuestions > 0;
                  const wsOpen = hasWs && worksheetOpen(s);
                  // baris aksi hanya tampil bila ada isinya (pertemuan mendatang tanpa link belum punya aksi)
                  const hasActions = (phase !== "done" && !!s.meetingUrl) || !!att || phase !== "upcoming" || !!s.recordingUrl || hasWs;
                  return (
                    <li key={s.id} className={cn("card space-y-3 p-4!", phase === "live" && "ring-2 ring-emerald-300", phase === "done" && "bg-white/70")}>
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-extrabold",
                            phase === "done" ? "bg-navy-100 text-navy-500" : "bg-linear-to-br from-brand-500 to-navy-700 text-white shadow-md",
                          )}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-navy-900">{s.title}</p>
                            {phase === "live" ? (
                              <Badge tone="green">● Sedang berlangsung</Badge>
                            ) : phase === "upcoming" ? (
                              <Badge tone="blue">Akan datang</Badge>
                            ) : (
                              <Badge>Selesai</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-navy-400">
                            {formatDate(s.startAt, true)} – {formatDate(s.endAt, true).split(", ").pop()} WIB
                          </p>
                          {s.notes && <MathText as="p" text={s.notes} className="mt-1 text-sm text-navy-500" />}
                        </div>
                      </div>
                      <div className={cn("flex flex-wrap items-center gap-2 border-t border-navy-50 pt-3", !hasActions && "hidden")}>
                        {phase !== "done" && s.meetingUrl && (
                          <a href={safeUrl(s.meetingUrl) ?? "#"} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
                            <Video className="h-3.5 w-3.5" /> Gabung Zoom
                          </a>
                        )}
                        {att ? (
                          <Badge tone={ATTENDANCE_TONE[att]}>
                            <ClipboardCheck className="h-3 w-3" /> {ATTENDANCE_LABEL[att]}
                          </Badge>
                        ) : phase === "live" ? (
                          <CheckInButton sessionId={s.id} />
                        ) : phase === "done" ? (
                          <span className="text-xs text-navy-400">Tidak tercatat hadir</span>
                        ) : null}
                        {s.recordingUrl && (
                          <a href={safeUrl(s.recordingUrl) ?? "#"} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                            <PlayCircle className="h-3.5 w-3.5 text-rose-500" /> Tonton rekaman
                          </a>
                        )}
                        {hasWs &&
                          (done ? (
                            <Link href={`/dashboard/kelas/${product.slug}/pertemuan/${s.id}`} className="btn-secondary btn-sm">
                              <FileQuestion className="h-3.5 w-3.5 text-brand-600" /> Nilai {done.score}{" "}
                              <Badge tone={gradeTone(done.grade)}>{done.grade}</Badge>
                            </Link>
                          ) : wsOpen ? (
                            <Link
                              href={`/dashboard/kelas/${product.slug}/pertemuan/${s.id}`}
                              className="btn-sm inline-flex items-center gap-1.5 rounded-xl bg-linear-to-r from-brand-500 to-brand-700 px-3 py-1.5 text-xs font-semibold text-white shadow-md transition hover:brightness-110"
                            >
                              <FileQuestion className="h-3.5 w-3.5" /> Kerjakan worksheet ({s._count.worksheetQuestions} soal)
                              {s.worksheetDueAt && <span className="opacity-80">· s.d. {formatDate(s.worksheetDueAt, true)}</span>}
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-rose-500">
                              <Lock className="h-3.5 w-3.5" /> Worksheet ditutup (nilai 0)
                            </span>
                          ))}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState
                icon={CalendarRange}
                title="Jadwal pertemuan belum diumumkan"
                desc="Admin akan mengisi jadwal, link Zoom, dan worksheet setiap pertemuan di sini."
              />
            )}
          </div>

          <div>
            <SectionTitle title={`Materi kelas (${product.materials.length})`} icon={BookOpen} />
            {product.materials.length ? (
              <div className="stagger grid gap-4 sm:grid-cols-2">
                {product.materials.map((m) => {
                  const meta = TYPE_META[m.type];
                  return (
                    <Link key={m.id} href={`/dashboard/materi/${m.id}`} className="card card-hover group flex gap-4">
                      <span
                        className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br ${meta.grad} text-white shadow-md transition group-hover:scale-110`}
                      >
                        <meta.icon className="h-6 w-6" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <span className="mt-1.5 block font-bold leading-snug text-navy-900 group-hover:text-brand-700">{m.title}</span>
                        {m.summary && <span className="mt-1 line-clamp-2 block text-sm text-navy-400">{m.summary}</span>}
                        <span className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-600 opacity-0 transition group-hover:opacity-100">
                          Buka materi <ArrowRight className="h-3 w-3" />
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={BookOpen} title="Materi belum tersedia" desc="Tutor dan admin akan mengunggah materi di sini. Cek lagi nanti ya!" />
            )}
          </div>
        </section>

        <aside className="space-y-6">
          {waGroup ? (
            <div className="card space-y-3 bg-linear-to-br from-emerald-50 to-white ring-2 ring-emerald-200">
              <p className="flex items-center gap-2 font-bold text-navy-900">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500 text-white">
                  <WhatsAppIcon className="h-5 w-5" />
                </span>
                Grup WhatsApp kelas
              </p>
              <p className="text-sm text-navy-600">Info jadwal, link kelas, dan pengumuman dibagikan di grup. Gabung sekarang ya!</p>
              <a
                href={waGroup}
                target="_blank"
                rel="noreferrer"
                className="btn w-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-600"
              >
                <WhatsAppIcon /> Gabung grup WhatsApp
              </a>
            </div>
          ) : (
            <div className="card flex items-start gap-3 text-sm text-navy-500">
              <WhatsAppIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              Link grup WhatsApp kelas akan muncul di sini setelah disiapkan admin.
            </div>
          )}
          <div className="card space-y-4">
            <p className="flex items-center gap-2 font-bold text-navy-900">
              <GraduationCap className="h-5 w-5 text-brand-600" /> Progres belajarku
            </p>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-brand-50 p-3">
                <p className="text-3xl font-black text-brand-700">{myAvg ?? "-"}</p>
                <p className="text-xs text-navy-500">Rata-rata nilai</p>
                {myAvg != null && (
                  <Badge tone={gradeTone(gradeOf(myAvg))} className="mt-1">
                    Grade {gradeOf(myAvg)}
                  </Badge>
                )}
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3">
                <p className="text-3xl font-black text-emerald-700">
                  {present}
                  <span className="text-base font-bold text-emerald-600/70">/{started}</span>
                </p>
                <p className="text-xs text-navy-500">Kehadiran</p>
                {started > 0 && <p className="mt-1 text-xs font-semibold text-emerald-700">{Math.round((present / started) * 100)}%</p>}
              </div>
            </div>
            <p className="text-xs text-navy-400">
              Worksheet dikerjakan {attempts.length}/{graded.length}
              {missed.length > 0 && <span className="text-rose-500"> · {missed.length} terlewat (nilai 0)</span>}
            </p>
          </div>
          <div className={cn("card space-y-3", (result?.certificateNo || product.reportPublished) && "ring-2 ring-amber-200")}>
            <p className="flex items-center gap-2 font-bold text-navy-900">
              <Award className="h-5 w-5 text-amber-500" /> Sertifikat & rapor
            </p>
            {result?.certificateNo || product.reportPublished ? (
              <div className="flex flex-col gap-2">
                {product.reportPublished && (
                  <Link href={`/dashboard/kelas/${product.slug}/rapor`} className="btn-primary btn-sm w-full">
                    <FileText className="h-3.5 w-3.5" /> Lihat rapor
                  </Link>
                )}
                {product.reportPublished && (
                  <Link href={`/dashboard/kelas/${product.slug}/rapor#feedback`} className="btn-secondary btn-sm w-full">
                    <MessageSquareHeart className="h-3.5 w-3.5 text-rose-500" /> {myFeedback ? "Feedback terkirim · lihat" : "Beri feedback"}
                  </Link>
                )}
                {result?.certificateNo && (
                  <a href={`/api/sertifikat/${product.id}/${session.userId}?dl=1`} className="btn-secondary btn-sm w-full">
                    <Award className="h-3.5 w-3.5 text-amber-500" /> Unduh sertifikat
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs text-navy-400">Sertifikat & rapor tersedia setelah semua pertemuan selesai dan diterbitkan admin.</p>
            )}
          </div>
          {vip ? (
            <div className="card space-y-3">
              <p className="font-bold text-navy-900">Paket VIP Privat</p>
              <SessionProgress done={vipDone} total={vipBought} />
              {regs.length > 1 && (
                <ul className="space-y-1 text-xs text-navy-500">
                  {regs.map((r) => (
                    <li key={r.id} className="flex justify-between">
                      <span className="font-mono">{r.code}</span>
                      <span>
                        {r.sessionsDone}/{r.sessionsBought} pertemuan
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-navy-400">
                {vipDone < vipBought
                  ? "Jadwal pertemuan diatur bersama tutor. Hubungi admin untuk mengatur jadwal berikutnya."
                  : "Semua pertemuan sudah terpakai."}
              </p>
              <Link href={`/kelas/${product.slug}`} className="btn-secondary btn-sm w-full">
                Tambah paket pertemuan
              </Link>
            </div>
          ) : (
            <div className="card space-y-3">
              <p className="font-bold text-navy-900">Status kelas</p>
              {product.type === "OTHER" ? (
                <p className="text-sm font-semibold text-navy-700">Program {product.sessionCount ?? 1}x pertemuan</p>
              ) : (
                <QuotaBar filled={filled} min={product.minQuota} />
              )}
              <p className="text-xs text-navy-400">
                {product.type === "OTHER"
                  ? "Jadwal & link pertemuan tampil di halaman ini setelah diumumkan admin."
                  : filled >= product.minQuota
                  ? "Kuota terpenuhi, kelas berjalan sesuai jadwal."
                  : "Kelas dimulai setelah kuota minimal terpenuhi. Ajak teman satu bidang biar cepat mulai!"}
              </p>
            </div>
          )}
          <ClassTutors productId={product.id} variant="compact" />
        </aside>
      </div>
    </>
  );
}

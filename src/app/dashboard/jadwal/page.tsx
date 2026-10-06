import Link from "next/link";
import { ArrowRight, CalendarDays, CircleCheck, Clock, PlayCircle, Video } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn, safeUrl } from "@/lib/utils";
import { EmptyState, PageTitle } from "@/components/ui";
import { subjectVisual } from "@/components/product-card";

export const metadata = { title: "Jadwal Saya" };
export const dynamic = "force-dynamic";

const dayKey = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const fmtDay = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" }).format(d);
const fmtTime = (d: Date) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(d);

export default async function JadwalPage({ searchParams }: PageProps<"/dashboard/jadwal">) {
  const session = await requireUser(["PESERTA"]);
  const sp = await searchParams;
  const showPast = sp.tab === "selesai";

  const paid = await prisma.registration.findMany({ where: { userId: session.userId, status: "PAID" }, select: { productId: true } });
  const productIds = paid.map((r) => r.productId).filter((id): id is number => id !== null);
  const now = new Date();
  const sessions = await prisma.classSession.findMany({
    where: { productId: { in: productIds }, ...(showPast ? { endAt: { lt: now } } : { endAt: { gte: now } }) },
    include: { product: { select: { name: true, slug: true, bidang: true } } },
    orderBy: { startAt: showPast ? "desc" : "asc" },
    take: 60,
  });

  // kelompokkan per hari
  const groups = new Map<string, typeof sessions>();
  for (const s of sessions) groups.set(dayKey(s.startAt), [...(groups.get(dayKey(s.startAt)) ?? []), s]);
  const todayKey = dayKey(now);

  return (
    <>
      <PageTitle icon={CalendarDays} eyebrow="Kelas saya" title="Jadwal" subtitle="Semua pertemuan dari kelas COC yang sudah kamu ikuti." />

      <div className="card mb-6 flex gap-1.5 p-1.5!">
        {[
          { v: "", l: "Akan datang" },
          { v: "selesai", l: "Sudah selesai" },
        ].map((t) => (
          <Link
            key={t.l}
            href={t.v ? `/dashboard/jadwal?tab=${t.v}` : "/dashboard/jadwal"}
            className={cn(
              "flex-1 rounded-2xl px-4 py-2.5 text-center text-sm font-semibold transition",
              (showPast ? "selesai" : "") === t.v ? "bg-linear-to-r from-brand-600 to-navy-700 text-white shadow-md" : "text-navy-500 hover:bg-brand-50",
            )}
          >
            {t.l}
          </Link>
        ))}
      </div>

      {!productIds.length ? (
        <EmptyState
          icon={CalendarDays}
          title="Belum ada kelas"
          desc="Jadwal akan muncul di sini setelah kamu terdaftar dan lunas di kelas COC."
          action={
            <Link href="/kelas" className="btn-primary mt-2">
              Lihat katalog <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      ) : !sessions.length ? (
        <EmptyState
          icon={CalendarDays}
          title={showPast ? "Belum ada pertemuan yang selesai" : "Belum ada jadwal mendatang"}
          desc={showPast ? undefined : "Jadwal diumumkan setelah kuota kelas terpenuhi. Sambil menunggu, main games yuk!"}
        />
      ) : (
        <div className="space-y-7">
          {[...groups.entries()].map(([key, items], gi) => (
            <section key={key} className="animate-fade-up" style={{ animationDelay: `${gi * 70}ms` }}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-700">
                {key === todayKey && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] text-white">Hari ini</span>}
                {fmtDay(items[0].startAt)}
              </h2>
              <ol className="space-y-3">
                {items.map((s) => {
                  const live = s.startAt <= now && s.endAt >= now;
                  const done = s.endAt < now;
                  const { icon: Icon, gradient } = subjectVisual(s.product.bidang);
                  return (
                    <li key={s.id} className={cn("card card-hover flex gap-4 p-4!", live && "ring-2 ring-brand-400")}>
                      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-navy-50 py-2 text-center">
                        <Clock className="h-4 w-4 text-brand-500" />
                        <span className="mt-1 text-sm font-extrabold text-navy-900">{fmtTime(s.startAt)}</span>
                        <span className="text-[10px] text-navy-400">{fmtTime(s.endAt)}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-linear-to-br ${gradient} text-white`}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <Link href={`/dashboard/kelas/${s.product.slug}`} className="truncate text-xs font-semibold text-brand-600 hover:underline">
                            {s.product.name}
                          </Link>
                        </div>
                        <p className="mt-1 font-bold text-navy-900">{s.title}</p>
                        {s.notes && <p className="mt-0.5 text-xs text-navy-400">{s.notes}</p>}
                        {live && (
                          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-600">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> Sedang berlangsung
                          </span>
                        )}
                        {done && (
                          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <CircleCheck className="h-3.5 w-3.5" /> Selesai
                          </span>
                        )}
                      </div>
                      {!done && s.meetingUrl && (
                        <a href={safeUrl(s.meetingUrl) ?? "#"} target="_blank" rel="noreferrer" className="btn-primary btn-sm self-center">
                          <Video className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Gabung</span>
                        </a>
                      )}
                      {done && s.recordingUrl && (
                        <a href={safeUrl(s.recordingUrl) ?? "#"} target="_blank" rel="noreferrer" className="btn-secondary btn-sm self-center">
                          <PlayCircle className="h-3.5 w-3.5 text-rose-500" /> <span className="hidden sm:inline">Rekaman</span>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, ExternalLink, Users, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { JENJANG_LABEL, PRODUCT_STATUS_LABEL } from "@/lib/constants";
import { cn, formatDate, formatRupiah } from "@/lib/utils";
import { Badge, QuotaBar, statusTone } from "@/components/ui";
import { subjectVisual } from "@/components/product-card";
import { ProductDialogButton } from "../product-form";
import { DeleteProductButton, MaterialsPanel } from "./panels";
import { MeetingsPanel } from "./meetings-panel";
import { PackagesPanel } from "./packages-panel";
import { safeWaGroupUrl } from "@/lib/wa-group";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { hasLoggedIn, loginInfo, LOGIN_TRACKING_SINCE, type LoginInfo } from "@/lib/last-login";

const DAY = 86_400_000;
const daysAgo = (d: Date) => (Date.now() - d.getTime()) / DAY;

/** Login terakhir peserta (di bawah nama sekolah) */
function LoginLine({ info }: { info?: LoginInfo }) {
  const recent = info?.lastSeenAt ?? info?.lastLoginAt ?? null;
  if (info?.lastLoginAt) {
    const fresh = daysAgo(recent!) <= 7;
    return (
      <span className="flex items-center gap-1 text-[11px] text-navy-500">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", fresh ? "bg-emerald-500" : "bg-amber-400")} />
        <span className="truncate">
          Login terakhir {formatDate(info.lastLoginAt, true)}
          {info.lastSeenAt && info.lastSeenAt.getTime() - info.lastLoginAt.getTime() > 30 * 60_000 ? ` · aktif ${formatDate(info.lastSeenAt, true)}` : ""}
        </span>
      </span>
    );
  }
  if (info?.lastSeenAt)
    return (
      <span className="flex items-center gap-1 text-[11px] text-navy-500">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", daysAgo(info.lastSeenAt) <= 7 ? "bg-emerald-500" : "bg-amber-400")} />
        <span className="truncate">Terakhir aktif {formatDate(info.lastSeenAt, true)}</span>
      </span>
    );
  if (info?.lastActivityAt)
    return (
      <span className="flex items-center gap-1 text-[11px] text-navy-500" title={`Login sebelum ${LOGIN_TRACKING_SINCE} belum tercatat; ini aktivitas terakhirnya (worksheet/absen/games/feedback).`}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
        <span className="truncate">Aktivitas terakhir {formatDate(info.lastActivityAt, true)}</span>
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-500" title={`Pencatatan login dimulai ${LOGIN_TRACKING_SINCE}; belum ada login maupun aktivitas (worksheet/absen mandiri/games/feedback) sejak itu.`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" /> Belum login sejak {LOGIN_TRACKING_SINCE}
    </span>
  );
}

export const metadata = { title: "Kelola Kelas" };
export const dynamic = "force-dynamic";

export default async function ProductDetailPage({ params }: PageProps<"/admin/produk/[id]">) {
  await requirePanel();
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id: Number(id) || 0 },
    include: {
      sessions: {
        orderBy: { startAt: "asc" },
        include: { _count: { select: { worksheetQuestions: true, worksheetAttempts: true, attendances: { where: { status: "HADIR" } } } } },
      },
      materials: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      registrations: {
        where: { status: "PAID" },
        select: { id: true, userId: true, fullName: true, school: true, phone: true, paidAt: true, sessionsBought: true, sessionsDone: true },
        orderBy: { paidAt: "desc" },
      },
      packages: { orderBy: { sessions: "asc" }, include: { _count: { select: { registrations: { where: { status: "PAID" } } } } } },
    },
  });
  if (!product) notFound();
  const { icon: Icon, gradient } = subjectVisual(product.bidang);
  const { sessions, materials, registrations, packages, ...values } = product;
  const vip = product.type === "PRIVATE";
  const logins = await loginInfo(registrations.map((r) => r.userId));
  const loggedIn = registrations.filter((r) => r.userId && hasLoggedIn(logins.get(r.userId))).length;

  return (
    <>
      <Link href="/admin/produk" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:gap-2.5">
        <ArrowLeft className="h-4 w-4" /> Produk & Materi
      </Link>

      <section className="relative my-5 animate-fade-up overflow-hidden rounded-[32px] bg-hero p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-linear-to-br ${gradient} shadow-xl ring-4 ring-white/10`}>
              <Icon className="h-8 w-8" />
            </span>
            <div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Badge tone={statusTone(product.status)}>{PRODUCT_STATUS_LABEL[product.status]}</Badge>
                <span className="badge bg-white/15 text-white">{JENJANG_LABEL[product.jenjang]}</span>
                <span className="badge bg-white/15 text-white">{product.level}</span>
                {vip && <span className="badge bg-amber-400 text-navy-950">VIP Privat</span>}
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{product.name}</h1>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-navy-200">
                <span className="flex items-center gap-1.5">
                  <Wallet className="h-4 w-4" /> {formatRupiah(product.price)}/{product.priceUnit}
                </span>
                {sessions.length > 0 ? (
                  <span className="flex items-center gap-1.5" title="Pertemuan pertama – pertemuan terakhir">
                    <CalendarDays className="h-4 w-4" /> {formatDate(sessions[0].startAt)} – {formatDate(sessions[sessions.length - 1].endAt)}
                  </span>
                ) : (
                  product.startDate && (
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4" /> mulai {formatDate(product.startDate)}
                    </span>
                  )
                )}
                {safeWaGroupUrl(product.waGroupUrl) ? (
                  <a
                    href={safeWaGroupUrl(product.waGroupUrl)!}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 font-semibold text-emerald-300 hover:underline"
                  >
                    <WhatsAppIcon /> Grup WhatsApp terpasang
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 text-sun-300">
                    <WhatsAppIcon /> Link grup WhatsApp belum diisi
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/kelas/${product.slug}`} target="_blank" className="btn-outline-light">
              <ExternalLink className="h-4 w-4" /> Lihat halaman
            </Link>
            <ProductDialogButton product={values} className="btn-light" />
            <DeleteProductButton id={product.id} name={product.name} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {vip && (
            <PackagesPanel
              productId={product.id}
              pricePerSession={product.price}
              packages={packages.map((p) => ({
                id: p.id,
                sessions: p.sessions,
                price: p.price,
                label: p.label,
                isActive: p.isActive,
                sold: p._count.registrations,
              }))}
            />
          )}
          <MeetingsPanel
            productId={product.id}
            paidCount={new Set(registrations.map((r) => r.userId)).size}
            now={new Date().getTime()}
            meetings={sessions.map(({ _count, ...s }) => ({
              ...s,
              questions: _count.worksheetQuestions,
              attempts: _count.worksheetAttempts,
              present: _count.attendances,
            }))}
          />
          <MaterialsPanel productId={product.id} materials={materials} />
        </div>
        <aside className="card h-fit space-y-4">
          <p className="flex items-center gap-2 font-bold text-navy-900">
            <Users className="h-5 w-5 text-brand-600" /> Peserta lunas
          </p>
          {vip ? (
            <p className="text-sm text-navy-500">{registrations.length} peserta VIP aktif · jadwal diatur bersama tutor.</p>
          ) : (
            <QuotaBar filled={registrations.length} min={product.minQuota} />
          )}
          {registrations.length > 0 && (
            <p className="text-xs text-navy-500">
              <b className={loggedIn === registrations.length ? "text-emerald-600" : "text-navy-800"}>
                {loggedIn}/{registrations.length}
              </b>{" "}
              peserta sudah pernah login
              <span className="block text-[11px] text-navy-400">Pencatatan login dimulai {LOGIN_TRACKING_SINCE}; sebelumnya memakai jejak aktivitas.</span>
            </p>
          )}
          <ul className="max-h-[480px] space-y-1 overflow-y-auto">
            {registrations.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/pendaftar?open=${r.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-brand-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-brand-100 to-navy-100 text-xs font-bold text-brand-700">
                    {r.fullName.charAt(0)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-navy-800">{r.fullName}</span>
                    <span className="block truncate text-xs text-navy-400">
                      {r.school}
                      {r.sessionsBought ? ` · ${r.sessionsDone}/${r.sessionsBought} pertemuan` : ""}
                    </span>
                    <LoginLine info={r.userId ? logins.get(r.userId) : undefined} />
                  </span>
                </Link>
              </li>
            ))}
            {!registrations.length && <li className="rounded-2xl bg-navy-50/60 p-4 text-center text-sm text-navy-400">Belum ada peserta lunas.</li>}
          </ul>
        </aside>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, Clock, Eye, FileSpreadsheet, MessageSquareReply, Send, SkipForward, Users, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { campaignScope, canBlast, senderHealth, wibHour } from "@/lib/blast-wa";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_TONE, RECIPIENT_STATUS_LABEL, RECIPIENT_STATUS_TONE, SENT_STATUSES } from "@/lib/blast-wa-shared";
import { cn, formatDate } from "@/lib/utils";
import { Badge, StatCard } from "@/components/ui";
import { Pagination, readPage } from "@/components/pagination";
import { HealthCard } from "../../health-card";
import { AutoRefresh, CampaignControls } from "./controls";

export const metadata = { title: "Detail Kampanye · Blast WhatsApp" };
export const dynamic = "force-dynamic";

const FILTERS: Record<string, { label: string; where: object }> = {
  "": { label: "Semua", where: {} },
  pending: { label: "Menunggu", where: { status: { in: ["PENDING", "QUEUED"] } } },
  sent: { label: "Terkirim", where: { status: { in: [...SENT_STATUSES] } } },
  read: { label: "Dibaca", where: { status: "READ" } },
  replied: { label: "Dibalas", where: { repliedAt: { not: null } } },
  failed: { label: "Gagal", where: { status: "FAILED" } },
  skipped: { label: "Dilewati", where: { status: "SKIPPED" } },
};

export default async function CampaignDetailPage({ params, searchParams }: PageProps<"/admin/blast-wa/kampanye/[id]">) {
  const session = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const c = await prisma.blastCampaign.findFirst({ where: { id: Number(id) || 0, ...campaignScope(session) }, include: { sender: true, owner: { select: { name: true } } } });
  if (!c) notFound();
  const tab = typeof sp.tab === "string" && sp.tab in FILTERS ? sp.tab : "";
  const { page, skip, take } = readPage(sp);
  const rWhere = { campaignId: c.id, ...FILTERS[tab].where };

  const [byStatus, replied, retryable, total, rows] = await Promise.all([
    prisma.blastRecipient.groupBy({ by: ["status"], where: { campaignId: c.id }, _count: { _all: true } }),
    prisma.blastRecipient.count({ where: { campaignId: c.id, repliedAt: { not: null } } }),
    // gagal yang bisa dikirim ulang (nomor tanpa WhatsApp tidak dihitung)
    prisma.blastRecipient.count({ where: { campaignId: c.id, status: "FAILED", NOT: { error: "Nomor tidak terdaftar di WhatsApp" } } }),
    prisma.blastRecipient.count({ where: rWhere }),
    prisma.blastRecipient.findMany({ where: rWhere, orderBy: { id: "asc" }, skip, take }),
  ]);
  const n = (...st: string[]) => byStatus.filter((x) => st.includes(x.status)).reduce((s, x) => s + x._count._all, 0);
  const all = n("PENDING", "QUEUED", "SENT", "DELIVERED", "READ", "FAILED", "SKIPPED");
  const sent = n(...SENT_STATUSES);
  const pending = n("PENDING", "QUEUED");
  const pct = all ? Math.round(((all - pending) / all) * 100) : 0;
  const own = c.ownerId === session.userId && canBlast(session.role);
  const health = own && c.sender?.firstConnectedAt ? await senderHealth(c.sender) : null;

  // kenapa belum mengirim?
  const now = new Date();
  const hour = wibHour(now);
  const waitReason =
    c.status !== "RUNNING"
      ? null
      : !c.sender || c.sender.status !== "CONNECTED"
        ? "Nomor blast belum tersambung — pengiriman menunggu."
        : hour < c.hourStart || hour >= c.hourEnd
          ? `Di luar jam kirim (${c.hourStart}.00–${c.hourEnd}.00 WIB) — lanjut otomatis di jam kirim berikutnya.`
          : health && health.usage.today >= health.warm.cap
            ? "Kuota harian nomor tercapai — lanjut otomatis besok."
            : c.sender.nextSendAt && c.sender.nextSendAt > now
              ? `Jeda antar pesan — kiriman berikutnya ±${Math.max(1, Math.round((c.sender.nextSendAt.getTime() - now.getTime()) / 1000))} detik lagi.`
              : "Mengirim…";

  return (
    <>
      {c.status === "RUNNING" && <AutoRefresh ms={10_000} />}
      <Link href="/admin/blast-wa/kampanye" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-500 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" /> Semua kampanye
      </Link>
      <div className="card mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold text-navy-900">{c.name}</h2>
              <Badge tone={CAMPAIGN_STATUS_TONE[c.status]}>{CAMPAIGN_STATUS_LABEL[c.status]}</Badge>
            </div>
            <p className="mt-1 text-xs text-navy-400">
              {c.audienceNote} · dibuat {formatDate(c.createdAt, true)} oleh {c.owner.name}
              {c.scheduledAt && c.status === "SCHEDULED" ? ` · dijadwalkan ${formatDate(c.scheduledAt, true)}` : ""}
              {c.finishedAt ? ` · selesai ${formatDate(c.finishedAt, true)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {own && <CampaignControls id={c.id} status={c.status} failed={retryable} />}
            <a href={`/api/admin/blast-wa/kampanye/${c.id}/export`} className="btn-secondary">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Laporan Excel
            </a>
          </div>
        </div>
        {c.pauseReason && c.status === "PAUSED" && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {c.pauseReason}
          </p>
        )}
        {waitReason && (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-brand-50 p-3 text-sm text-brand-800">
            <Clock className="h-4 w-4 shrink-0" /> {waitReason}
          </p>
        )}
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs font-semibold text-navy-500">
            <span>Progres</span>
            <span>
              {all - pending}/{all} ({pct}%)
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-navy-50">
            <div className={cn("h-full rounded-full transition-all", c.status === "COMPLETED" ? "bg-emerald-500" : "bg-brand-500")} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <p className="mt-3 text-xs text-navy-400">
          Jeda {c.delayMin}–{c.delayMax} dtk · istirahat {c.batchRestMin} mnt tiap {c.batchSize} pesan · jam kirim {c.hourStart}.00–{c.hourEnd}.00 WIB · maks {c.dailyLimit}/hari
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Penerima" value={all.toLocaleString("id-ID")} icon={Users} tone="navy" />
        <StatCard label="Terkirim" value={sent.toLocaleString("id-ID")} icon={Send} tone="blue" />
        <StatCard label="Dibaca" value={n("READ").toLocaleString("id-ID")} hint={sent ? `${Math.round((n("READ") / sent) * 100)}% dari terkirim` : undefined} icon={Eye} tone="brand" />
        <StatCard label="Dibalas" value={replied.toLocaleString("id-ID")} hint={sent ? `${Math.round((replied / sent) * 100)}% dari terkirim` : undefined} icon={MessageSquareReply} tone="green" />
        <StatCard label="Gagal" value={n("FAILED").toLocaleString("id-ID")} icon={XCircle} tone="red" />
        <StatCard label="Dilewati" value={n("SKIPPED").toLocaleString("id-ID")} hint="berhenti langganan / tanpa WA" icon={SkipForward} tone="gray" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {Object.entries(FILTERS).map(([k, f]) => (
              <Link
                key={k || "all"}
                href={k ? `/admin/blast-wa/kampanye/${c.id}?tab=${k}` : `/admin/blast-wa/kampanye/${c.id}`}
                className={cn("rounded-xl px-3 py-1.5 text-xs font-bold transition", tab === k ? "bg-navy-900 text-white" : "bg-white text-navy-500 ring-1 ring-navy-100 hover:bg-navy-50")}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <div id="tabel" className="card scroll-mt-24 overflow-x-auto p-0!">
            <table className="table min-w-[760px]">
              <thead>
                <tr>
                  <th>Penerima</th>
                  <th>Status</th>
                  <th>Waktu kirim</th>
                  <th>Balasan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <p className="font-bold text-navy-900">{r.nama}</p>
                      <p className="text-xs text-navy-400">{r.noHp}</p>
                    </td>
                    <td>
                      <Badge tone={RECIPIENT_STATUS_TONE[r.status]}>{RECIPIENT_STATUS_LABEL[r.status] ?? r.status}</Badge>
                      {r.error && <p className="mt-0.5 max-w-[220px] text-[11px] text-rose-500">{r.error}</p>}
                    </td>
                    <td className="whitespace-nowrap text-xs text-navy-500">{r.sentAt ? formatDate(r.sentAt, true) : "-"}</td>
                    <td className="max-w-[260px] text-xs">
                      {r.repliedAt ? (
                        <>
                          <p className="truncate font-semibold text-emerald-700" title={r.replyText ?? undefined}>
                            {r.replyText}
                          </p>
                          <p className="text-navy-400">{formatDate(r.repliedAt, true)}</p>
                        </>
                      ) : (
                        <span className="text-navy-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-navy-400">
                      Tidak ada penerima pada filter ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination basePath={`/admin/blast-wa/kampanye/${c.id}`} searchParams={sp} page={page} total={total} noun="penerima" anchor="tabel" />
        </div>
        <aside className="space-y-4">
          <div className="card">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-navy-400">Template pesan</p>
            {c.imageFile && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/admin/blast-wa/gambar/${c.imageFile}`} alt="Lampiran" className="mb-2 max-h-48 w-full rounded-xl object-cover" />
            )}
            <p className="whitespace-pre-wrap wrap-break-word font-mono text-xs text-navy-700">{c.message}</p>
          </div>
          {health && <HealthCard health={health} compact />}
        </aside>
      </div>
    </>
  );
}

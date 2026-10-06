import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { canBlast, canSeeAllBlast, campaignScope } from "@/lib/blast-wa";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_TONE, SENT_STATUSES } from "@/lib/blast-wa-shared";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { Pagination, readPage } from "@/components/pagination";

export const metadata = { title: "Kampanye Blast WhatsApp" };
export const dynamic = "force-dynamic";

const ALL = ["PENDING", "QUEUED", "SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"];

export default async function CampaignsPage({ searchParams }: PageProps<"/admin/blast-wa/kampanye">) {
  const session = await requireStaff();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && sp.status in CAMPAIGN_STATUS_LABEL ? sp.status : "";
  const where = { ...campaignScope(session), ...(status ? { status } : {}) };
  const { page, skip, take } = readPage(sp);
  const [total, rows] = await Promise.all([
    prisma.blastCampaign.count({ where }),
    prisma.blastCampaign.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { owner: { select: { name: true } } } }),
  ]);
  const ids = rows.map((r) => r.id);
  const [stats, replied] = await Promise.all([
    prisma.blastRecipient.groupBy({ by: ["campaignId", "status"], where: { campaignId: { in: ids } }, _count: { _all: true } }),
    prisma.blastRecipient.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids }, repliedAt: { not: null } }, _count: { _all: true } }),
  ]);
  const n = (id: number, st: readonly string[]) => stats.filter((x) => x.campaignId === id && st.includes(x.status)).reduce((s, x) => s + x._count._all, 0);
  const seeAll = canSeeAllBlast(session.role);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {["", ...Object.keys(CAMPAIGN_STATUS_LABEL)].map((s) => (
            <Link
              key={s || "all"}
              href={s ? `/admin/blast-wa/kampanye?status=${s}` : "/admin/blast-wa/kampanye"}
              className={cn("rounded-xl px-3 py-1.5 text-xs font-bold transition", status === s ? "bg-navy-900 text-white" : "bg-white text-navy-500 ring-1 ring-navy-100 hover:bg-navy-50")}
            >
              {s ? CAMPAIGN_STATUS_LABEL[s] : "Semua"}
            </Link>
          ))}
        </div>
        {canBlast(session.role) && (
          <Link href="/admin/blast-wa/kampanye/baru" className="btn-primary">
            <Plus className="h-4 w-4" /> Kampanye baru
          </Link>
        )}
      </div>
      <div id="tabel" className="card scroll-mt-24 overflow-x-auto p-0!">
        <table className="table min-w-[900px]">
          <thead>
            <tr>
              <th>Kampanye</th>
              <th>Status</th>
              <th>Progres</th>
              <th className="text-right">Terkirim</th>
              <th className="text-right">Dibaca</th>
              <th className="text-right">Dibalas</th>
              <th className="text-right">Gagal</th>
              <th>Dibuat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const totalR = n(c.id, ALL);
              const done = totalR - n(c.id, ["PENDING", "QUEUED"]);
              const pct = totalR ? Math.round((done / totalR) * 100) : 0;
              return (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/blast-wa/kampanye/${c.id}`} className="font-bold text-navy-900 hover:text-brand-700">
                      {c.name}
                    </Link>
                    <p className="max-w-xs truncate text-xs text-navy-400">{c.audienceNote}</p>
                  </td>
                  <td>
                    <Badge tone={CAMPAIGN_STATUS_TONE[c.status]}>{CAMPAIGN_STATUS_LABEL[c.status]}</Badge>
                    {c.status === "SCHEDULED" && c.scheduledAt && <p className="mt-0.5 text-[11px] text-navy-400">{formatDate(c.scheduledAt, true)}</p>}
                  </td>
                  <td className="w-40">
                    <div className="h-2 overflow-hidden rounded-full bg-navy-50">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-navy-400">
                      {done}/{totalR} ({pct}%)
                    </p>
                  </td>
                  <td className="text-right font-bold text-navy-900">{n(c.id, SENT_STATUSES)}</td>
                  <td className="text-right text-navy-600">{n(c.id, ["READ"])}</td>
                  <td className="text-right font-semibold text-emerald-600">{replied.find((x) => x.campaignId === c.id)?._count._all ?? 0}</td>
                  <td className="text-right text-rose-600">{n(c.id, ["FAILED"])}</td>
                  <td className="text-xs text-navy-500">
                    {formatDate(c.createdAt)}
                    {seeAll && <p className="font-semibold text-navy-700">{c.owner.name}</p>}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="py-14 text-center text-navy-400">
                  Belum ada kampanye.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination basePath="/admin/blast-wa/kampanye" searchParams={sp} page={page} total={total} noun="kampanye" anchor="tabel" />
    </>
  );
}

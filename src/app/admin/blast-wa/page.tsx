import Link from "next/link";
import { ArrowRight, BookUser, CircleSlash, Megaphone, MessageSquareReply, Plus, Send, Smartphone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { gatewayConfigured } from "@/lib/wa";
import { canBlast, canSeeAllBlast, campaignScope, contactScope, mySender, senderHealth } from "@/lib/blast-wa";
import { CAMPAIGN_STATUS_LABEL, CAMPAIGN_STATUS_TONE } from "@/lib/blast-wa-shared";
import { WA_STATUS_LABEL, WA_STATUS_TONE, formatWaPhone } from "@/lib/wa-shared";
import { formatDate } from "@/lib/utils";
import { Badge, SectionTitle, StatCard } from "@/components/ui";
import { HealthCard } from "./health-card";
import { SenderPanel } from "./sender-panel";

export const dynamic = "force-dynamic";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

export default async function BlastWaPage() {
  const session = await requireStaff();
  const blaster = canBlast(session.role);
  const seeAll = canSeeAllBlast(session.role);
  const since = daysAgo(7);
  const cScope = contactScope(session);
  const kScope = campaignScope(session);

  const [sender, chat, contacts, optOut, active, sent7, replied7, campaigns] = await Promise.all([
    blaster ? mySender(session.userId) : null,
    blaster ? prisma.waAccount.findUnique({ where: { userId: session.userId }, select: { phone: true } }) : null,
    prisma.blastContact.count({ where: cScope }),
    prisma.blastContact.count({ where: { ...cScope, optOut: true } }),
    prisma.blastCampaign.count({ where: { ...kScope, status: { in: ["RUNNING", "SCHEDULED"] } } }),
    prisma.blastRecipient.count({ where: { campaign: kScope, sentAt: { gte: since } } }),
    prisma.blastRecipient.count({ where: { campaign: kScope, repliedAt: { gte: since } } }),
    prisma.blastCampaign.findMany({
      where: kScope,
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { owner: { select: { name: true } }, _count: { select: { recipients: true } } },
    }),
  ]);
  const health = sender && sender.status !== "DISCONNECTED" && sender.firstConnectedAt ? await senderHealth(sender) : null;

  // pemantauan: nomor blast semua admin
  const senders = seeAll ? await prisma.blastSender.findMany({ include: { user: { select: { name: true } } }, orderBy: { id: "asc" } }) : [];
  const healths = await Promise.all(senders.map((s) => (s.firstConnectedAt ? senderHealth(s) : null)));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Kontak" value={contacts.toLocaleString("id-ID")} icon={BookUser} tone="brand" />
        <StatCard label="Berhenti langganan" value={optOut.toLocaleString("id-ID")} icon={CircleSlash} tone="red" />
        <StatCard label="Kampanye aktif" value={active} icon={Megaphone} tone="yellow" />
        <StatCard label="Terkirim 7 hari" value={sent7.toLocaleString("id-ID")} icon={Send} tone="blue" />
        <StatCard label="Dibalas 7 hari" value={replied7.toLocaleString("id-ID")} hint={sent7 ? `${Math.round((replied7 / sent7) * 100)}% balasan` : undefined} icon={MessageSquareReply} tone="green" />
      </div>

      {blaster && (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-4">
            <SectionTitle title="Nomor blast saya" icon={Smartphone} />
            <SenderPanel
              configured={gatewayConfigured()}
              chatConflict={!!sender?.phone && sender.phone === chat?.phone}
              initial={
                sender
                  ? { id: sender.id, status: sender.status, phone: sender.phone, waName: sender.waName, lastError: sender.lastError, restricted: sender.restricted, numberAge: sender.numberAge }
                  : null
              }
            />
          </div>
          <div className="space-y-4">
            <SectionTitle title="Indikator keamanan nomor" />
            {health ? (
              <HealthCard health={health} />
            ) : (
              <div className="card text-sm text-navy-500">
                Indikator muncul setelah nomor blast tersambung: skor 0–100, tahap warm-up, kuota harian & per jam, tingkat gagal, balasan, dan berhenti langganan.
              </div>
            )}
          </div>
        </div>
      )}

      {seeAll && (
        <div>
          <SectionTitle title="Nomor blast semua admin" icon={Smartphone} />
          <div className="card overflow-x-auto p-0!">
            <table className="table min-w-[760px]">
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Nomor</th>
                  <th>Status</th>
                  <th>Skor keamanan</th>
                  <th>Hari ini</th>
                  <th>Gagal / balasan 7 hari</th>
                </tr>
              </thead>
              <tbody>
                {senders.map((s, i) => {
                  const h = healths[i];
                  return (
                    <tr key={s.id}>
                      <td className="font-bold text-navy-900">{s.user.name}</td>
                      <td className="text-xs">{s.phone ? formatWaPhone(s.phone) : "-"}</td>
                      <td>
                        <Badge tone={s.restricted ? "red" : (WA_STATUS_TONE[s.status] ?? "gray")}>{s.restricted ? "Dibatasi WA" : (WA_STATUS_LABEL[s.status] ?? s.status)}</Badge>
                      </td>
                      <td>{h ? <Badge tone={h.level === "AMAN" ? "green" : h.level === "WASPADA" ? "yellow" : "red"}>{`${h.score} · ${h.level}`}</Badge> : "-"}</td>
                      <td className="text-xs">{h ? `${h.usage.today}/${h.warm.cap}` : "-"}</td>
                      <td className="text-xs">{h ? `${Math.round(h.stats.failRate * 100)}% / ${Math.round(h.stats.replyRate * 100)}%` : "-"}</td>
                    </tr>
                  );
                })}
                {!senders.length && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-navy-400">
                      Belum ada admin yang menautkan nomor blast.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <SectionTitle
          title="Kampanye terbaru"
          icon={Megaphone}
          action={
            blaster ? (
              <Link href="/admin/blast-wa/kampanye/baru" className="btn-primary btn-sm">
                <Plus className="h-4 w-4" /> Kampanye baru
              </Link>
            ) : undefined
          }
        />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/admin/blast-wa/kampanye/${c.id}`} className="card group block transition hover:-translate-y-0.5">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-navy-900 group-hover:text-brand-700">{c.name}</p>
                <Badge tone={CAMPAIGN_STATUS_TONE[c.status]}>{CAMPAIGN_STATUS_LABEL[c.status]}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-navy-400">{c.message}</p>
              <p className="mt-3 flex items-center justify-between text-xs text-navy-500">
                <span>
                  {c._count.recipients.toLocaleString("id-ID")} penerima · {formatDate(c.createdAt)}
                  {seeAll ? ` · ${c.owner.name}` : ""}
                </span>
                <ArrowRight className="h-4 w-4 text-navy-300 group-hover:text-brand-600" />
              </p>
            </Link>
          ))}
          {!campaigns.length && <p className="card text-sm text-navy-400 md:col-span-2 xl:col-span-3">Belum ada kampanye. Tambahkan kontak dulu, lalu buat kampanye pertama.</p>}
        </div>
      </div>
    </div>
  );
}

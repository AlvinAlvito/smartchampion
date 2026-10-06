import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { canBlast, mySender } from "@/lib/blast-wa";
import { parseLabels, warmup } from "@/lib/blast-wa-shared";
import { CampaignForm } from "../campaign-form";

export const metadata = { title: "Kampanye Baru · Blast WhatsApp" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const session = await requireStaff();
  if (!canBlast(session.role)) redirect("/admin/blast-wa");
  const [sender, labelRows] = await Promise.all([
    mySender(session.userId),
    prisma.blastContact.findMany({ where: { ownerId: session.userId, labels: { not: null } }, distinct: ["labels"], select: { labels: true }, take: 500 }),
  ]);
  const labels = [...new Set(labelRows.flatMap((r) => parseLabels(r.labels)))].sort((a, b) => a.localeCompare(b, "id"));
  const warm = warmup(sender?.numberAge ?? "BARU", sender?.firstConnectedAt ?? null);
  return <CampaignForm campaign={null} labels={labels} senderConnected={sender?.status === "CONNECTED"} warmCap={warm.cap} />;
}

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { canBlast, mySender } from "@/lib/blast-wa";
import { warmup } from "@/lib/blast-wa-shared";
import { CampaignForm } from "../../campaign-form";

export const metadata = { title: "Ubah Kampanye · Blast WhatsApp" };
export const dynamic = "force-dynamic";

export default async function EditCampaignPage({ params }: PageProps<"/admin/blast-wa/kampanye/[id]/edit">) {
  const session = await requireStaff();
  if (!canBlast(session.role)) redirect("/admin/blast-wa/kampanye");
  const { id } = await params;
  const c = await prisma.blastCampaign.findFirst({ where: { id: Number(id) || 0, ownerId: session.userId } });
  if (!c) notFound();
  if (!["DRAFT", "PAUSED", "SCHEDULED"].includes(c.status)) redirect(`/admin/blast-wa/kampanye/${c.id}`);
  const sender = await mySender(session.userId);
  const warm = warmup(sender?.numberAge ?? "BARU", sender?.firstConnectedAt ?? null);
  return <CampaignForm campaign={c} labels={[]} senderConnected={sender?.status === "CONNECTED"} warmCap={warm.cap} />;
}

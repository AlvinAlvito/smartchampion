import { redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/constants";
import { canChat, canMonitor, gatewayConfigured } from "@/lib/wa";
import { PageTitle } from "@/components/ui";
import { ChatApp } from "./chat-app";

export const metadata = { title: "Chat WA" };
export const dynamic = "force-dynamic";

export default async function ChatPage({ searchParams }: PageProps<"/admin/chat">) {
  const session = await requirePanel();
  if (!canChat(session.role) && !canMonitor(session.role)) redirect("/admin");
  const sp = await searchParams;
  const monitor = canMonitor(session.role);

  if (monitor) {
    // Superadmin: pantau nomor WA setiap admin (hanya baca)
    const staff = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SMARTCHAMPION"] }, isActive: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        role: true,
        waAccount: { select: { id: true, status: true, phone: true, _count: { select: { chats: true } }, chats: { select: { unread: true } } } },
      },
    });
    const accounts = staff.map((u) => ({
      userId: u.id,
      name: u.name,
      role: ROLE_LABEL[u.role],
      accountId: u.waAccount?.id ?? null,
      status: u.waAccount?.status ?? "DISCONNECTED",
      phone: u.waAccount?.phone ?? null,
      chats: u.waAccount?._count.chats ?? 0,
      unread: u.waAccount?.chats.reduce((s, c) => s + c.unread, 0) ?? 0,
    }));
    const pick = Number(typeof sp.akun === "string" ? sp.akun : "") || accounts.find((a) => a.accountId)?.accountId || null;
    return (
      <>
        <PageTitle
          icon={MessagesSquare}
          eyebrow="Superadmin"
          title="Pantau Chat WA"
          subtitle="Lihat percakapan WhatsApp setiap admin. Mode pantau hanya membaca: tidak bisa membalas dan tidak memunculkan centang biru di customer."
        />
        <ChatApp
          mode="monitor"
          configured={gatewayConfigured()}
          accounts={accounts}
          initialAccountId={accounts.some((a) => a.accountId === pick) ? pick : null}
          role={session.role}
        />
      </>
    );
  }

  const account = await prisma.waAccount.findUnique({ where: { userId: session.userId }, select: { id: true } });
  return (
    <>
      <PageTitle
        icon={MessagesSquare}
        eyebrow="CRM"
        title="Chat WA"
        subtitle="Tautkan WhatsApp Anda, balas chat customer, dan lihat profil serta riwayat transaksinya di samping percakapan."
      />
      <ChatApp mode="own" configured={gatewayConfigured()} accounts={[]} initialAccountId={account?.id ?? null} role={session.role} />
    </>
  );
}

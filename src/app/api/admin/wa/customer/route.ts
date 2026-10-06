import { getSession } from "@/lib/session";
import { json, resolveChat } from "@/lib/wa";
import { customerForChat } from "@/lib/wa-customer";
import { guardRoute } from "@/lib/security";

export const dynamic = "force-dynamic";

/** Profil & riwayat transaksi customer untuk panel di samping chat */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return json({ error: "Tidak diizinkan." }, 403);
  const limited = guardRoute(`wa-customer:${session.userId}`, 60, 60_000);
  if (limited) return limited;
  const chat = await resolveChat(session, Number(new URL(request.url).searchParams.get("chat")));
  if (!chat) return json({ error: "Chat tidak ditemukan." }, 404);
  // Admin SmartChampion tidak melihat data keuangan (nominal)
  const data = await customerForChat({ phone: chat.phone, name: chat.name }, session.role !== "SMARTCHAMPION");
  return json({
    ...data,
    canLead: session.role === "ADMIN" && chat.account.userId === session.userId,
    canOpenLead: session.role !== "SMARTCHAMPION",
    // edit lead langsung dari panel chat: Admin Pelatihan & Root (Superadmin = lihat saja)
    canEditLead: session.role === "ADMIN" || session.role === "ROOT",
  });
}

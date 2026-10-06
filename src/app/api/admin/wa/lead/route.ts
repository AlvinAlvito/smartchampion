import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { crossSite, json, resolveChat } from "@/lib/wa";
import { customerForChat } from "@/lib/wa-customer";
import { guardRoute } from "@/lib/security";

export const dynamic = "force-dynamic";

/** Simpan kontak chat ke Master Lead (Admin Pelatihan; owner = admin tsb). Ditolak bila orangnya sudah ada. */
export async function POST(request: Request) {
  if (crossSite(request)) return json({ error: "Permintaan ditolak." }, 403);
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return json({ error: "Hanya Admin Pelatihan yang bisa menambah lead." }, 403);
  const limited = guardRoute(`wa-lead:${session.userId}`, 20, 60_000);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { chatId?: number; nama?: string };
  const chat = await resolveChat(session, Number(body.chatId), true);
  if (!chat) return json({ error: "Chat tidak ditemukan." }, 404);
  const existing = await customerForChat({ phone: chat.phone, name: chat.name }, true);
  if (existing.leads.some((l) => !l.weak)) return json({ error: "Kontak ini sudah ada di Master Lead." }, 409);
  const nama =
    String(body.nama ?? chat.name ?? "")
      .trim()
      .slice(0, 160) || "(tanpa nama)";
  const now = new Date();
  const lead = await prisma.lead.create({
    data: {
      tanggalMasuk: now,
      nama,
      noWa: chat.phone,
      sumberLead: "Organic",
      campaign: "Chat WA admin",
      kategori: "Calon Customer",
      ownerId: session.userId,
      statusFunnel: "Dihubungi",
      lastContact: now,
      catatan: "Ditambahkan dari menu Chat WA",
    },
  });
  return json({ ok: true, leadId: lead.id });
}

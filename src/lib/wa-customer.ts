import "server-only";
import { prisma } from "./prisma";
import { IdentityIndex, MATCH_LABEL, normEmail, normPhone } from "./identity";

/**
 * Data customer di samping chat WA: cari orangnya di Master Lead dari no. WA / nama WA (fuzzy),
 * lalu kumpulkan profil + riwayat transaksi (lead Paid & pendaftaran web) dari semua catatan orang tsb.
 * `showMoney=false` (Admin SmartChampion) → nominal disembunyikan.
 */
export async function customerForChat(chat: { phone: string | null; name: string | null }, showMoney: boolean) {
  const leads = await prisma.lead.findMany({
    select: {
      id: true,
      nama: true,
      noWa: true,
      email: true,
      sumberLead: true,
      kategori: true,
      produk: true,
      paket: true,
      statusFunnel: true,
      nominal: true,
      tanggalMasuk: true,
      tanggalBayar: true,
      lastContact: true,
      nextFollowUp: true,
      invoiceId: true,
      catatan: true,
      owner: { select: { name: true } },
    },
  });
  const index = new IdentityIndex(leads, (l) => ({ nama: l.nama, phones: [l.noWa], emails: [l.email] }));
  const hits = index.find({ nama: chat.name, phones: [chat.phone] }).slice(0, 8);
  const strong = hits.filter((h) => !h.match.weak);
  const matched = strong.length ? strong : hits;

  // semua kontak orang ini → cari pendaftaran web & akun peserta
  const phones = new Set<string>();
  const emails = new Set<string>();
  const p0 = normPhone(chat.phone);
  if (p0) phones.add(p0);
  for (const h of strong) {
    const p = normPhone(h.item.noWa);
    if (p) phones.add(p);
    const e = normEmail(h.item.email);
    if (e && h.item.email) emails.add(h.item.email.trim().toLowerCase());
  }
  const phoneList = [...phones];
  const emailList = [...emails];
  const users = phoneList.length || emailList.length
    ? await prisma.user.findMany({
        where: { role: "PESERTA", OR: [...(phoneList.length ? [{ phone: { in: phoneList } }] : []), ...(emailList.length ? [{ email: { in: emailList } }] : [])] },
        select: { id: true, name: true, email: true, phone: true, school: true, jenjang: true, kelas: true, kabKota: true, provinsi: true, createdAt: true },
        take: 5,
      })
    : [];
  const regs = phoneList.length || emailList.length || users.length
    ? await prisma.registration.findMany({
        where: {
          OR: [
            ...(phoneList.length ? [{ phone: { in: phoneList } }, { parentPhone: { in: phoneList } }] : []),
            ...(emailList.length ? [{ email: { in: emailList } }] : []),
            ...(users.length ? [{ userId: { in: users.map((u) => u.id) } }] : []),
          ],
        },
        select: { code: true, fullName: true, school: true, amount: true, status: true, createdAt: true, paidAt: true, sessionsBought: true, product: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];

  const regCodes = new Set(regs.map((r) => r.code));
  const transactions = [
    ...regs.map((r) => ({
      key: `r-${r.code}`,
      date: r.paidAt ?? r.createdAt,
      title: (r.product?.name ?? "Belum ditempatkan") + (r.sessionsBought ? ` · ${r.sessionsBought}x pertemuan` : ""),
      sub: `${r.code} · daftar web`,
      status: r.status as string,
      amount: showMoney ? r.amount : null,
    })),
    ...strong
      .filter((h) => h.item.statusFunnel === "Paid" && !(h.item.invoiceId && regCodes.has(h.item.invoiceId)))
      .map((h) => ({
        key: `l-${h.item.id}`,
        date: h.item.tanggalBayar ?? h.item.tanggalMasuk,
        title: [h.item.produk, h.item.paket].filter(Boolean).join(" · ") || "Produk tidak dicatat",
        sub: `Master Lead #${h.item.id}${h.item.owner ? ` · ${h.item.owner.name}` : ""}`,
        status: "PAID",
        amount: showMoney ? h.item.nominal : null,
      })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const primary = matched[0]?.item ?? null;
  const user = users[0] ?? null;
  return {
    found: matched.length > 0 || users.length > 0,
    profile: {
      nama: primary?.nama ?? user?.name ?? chat.name ?? null,
      noWa: primary?.noWa ?? user?.phone ?? chat.phone ?? null,
      email: primary?.email ?? user?.email ?? null,
      sekolah: user?.school ?? (primary?.catatan?.match(/Asal sekolah:\s*(.+)/)?.[1]?.split("\n")[0] ?? null),
      jenjang: user?.jenjang ?? null,
      kelas: user?.kelas ?? null,
      wilayah: [user?.kabKota, user?.provinsi].filter(Boolean).join(", ") || null,
      akunPeserta: user ? { id: user.id, since: user.createdAt } : null,
    },
    leads: matched.map((h) => ({
      id: h.item.id,
      nama: h.item.nama,
      noWa: h.item.noWa,
      email: h.item.email,
      sumber: h.item.sumberLead,
      kategori: h.item.kategori,
      produk: h.item.produk,
      status: h.item.statusFunnel,
      owner: h.item.owner?.name ?? null,
      tanggalMasuk: h.item.tanggalMasuk,
      lastContact: h.item.lastContact,
      nextFollowUp: h.item.nextFollowUp,
      match: h.match.weak ? `${MATCH_LABEL[h.match.by]}, nama berbeda (mungkin keluarga)` : h.match.by === "nama" ? `${MATCH_LABEL.nama} ${Math.round(h.match.score * 100)}%` : MATCH_LABEL[h.match.by],
      weak: !!h.match.weak,
    })),
    transactions,
    totalPaid: showMoney ? transactions.filter((t) => t.status === "PAID").reduce((s, t) => s + (t.amount ?? 0), 0) : null,
  };
}

export type CustomerPanelData = Awaited<ReturnType<typeof customerForChat>>;

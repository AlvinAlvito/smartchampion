import "server-only";
import { cache } from "react";
import { prisma } from "./prisma";
import { IdentityIndex, type Identity, type Match } from "./identity";

/**
 * Deteksi pembayaran lintas data (untuk Performa & laporan):
 * satu orang sering tercatat lebih dari sekali — mis. lead lama milik admin (status Follow-up) lalu orangnya
 * mendaftar sendiri di web dengan email/nama berbeda (lead baru, Paid, tanpa owner). Tanpa pencocokan,
 * konversi admin tsb tidak terhitung. Pencocokan memakai no. WA / email / nama mirip (lib/identity.ts).
 * Hanya dihitung (tidak mengubah data Master Lead).
 */

const DAY = 86_400_000;

type LeadRow = {
  id: number;
  nama: string;
  noWa: string | null;
  email: string | null;
  ownerId: number | null;
  statusFunnel: string;
  tanggalMasuk: Date;
  tanggalBayar: Date | null;
  invoiceId: string | null;
};

/** Bukti pembayaran: lead Paid (+ identitas pendaftaran web & akun peserta yang tertaut) atau pendaftaran lunas tanpa lead */
export type PaidEvidence = { key: string; leadId: number | null; ownerId: number | null; paidAt: Date | null; label: string; identity: Identity };

export const loadIdentityData = cache(async () => {
  const [leads, regs] = await Promise.all([
    prisma.lead.findMany({
      select: { id: true, nama: true, noWa: true, email: true, ownerId: true, statusFunnel: true, tanggalMasuk: true, tanggalBayar: true, invoiceId: true },
    }),
    prisma.registration.findMany({
      where: { status: "PAID" },
      select: {
        code: true,
        fullName: true,
        phone: true,
        parentPhone: true,
        email: true,
        paidAt: true,
        adminId: true,
        sourceLeadId: true,
        product: { select: { name: true } },
        user: { select: { name: true, email: true, phone: true } },
      },
    }),
  ]);
  const regByCode = new Map(regs.map((r) => [r.code, r]));
  const leadIdentity = (l: LeadRow): Identity => {
    const r = l.invoiceId ? regByCode.get(l.invoiceId) : undefined;
    return {
      nama: l.nama,
      phones: [l.noWa, r?.phone, r?.parentPhone, r?.user.phone],
      emails: [l.email, r?.email, r?.user.email],
    };
  };

  const evidence: PaidEvidence[] = [];
  for (const l of leads) {
    if (l.statusFunnel !== "Paid") continue;
    const id = leadIdentity(l);
    evidence.push({ key: `L${l.id}`, leadId: l.id, ownerId: l.ownerId, paidAt: l.tanggalBayar, label: `Lead #${l.id}`, identity: id });
    // nama akun peserta bisa berbeda dari nama di lead → tambahkan sebagai varian nama
    const r = l.invoiceId ? regByCode.get(l.invoiceId) : undefined;
    for (const alt of [r?.fullName, r?.user.name]) {
      if (alt && alt !== l.nama) evidence.push({ key: `L${l.id}`, leadId: l.id, ownerId: l.ownerId, paidAt: l.tanggalBayar, label: `Lead #${l.id}`, identity: { ...id, nama: alt } });
    }
  }
  const leadCodes = new Set(leads.map((l) => l.invoiceId).filter(Boolean));
  for (const r of regs) {
    // pendaftaran yang tertaut ke lead (web: invoice = kode; aktivasi Master Lead: sourceLeadId) sudah diwakili lead tsb
    if (leadCodes.has(r.code) || r.sourceLeadId) continue;
    const identity = { phones: [r.phone, r.parentPhone, r.user.phone], emails: [r.email, r.user.email] };
    for (const nama of new Set([r.fullName, r.user.name])) {
      evidence.push({ key: `R${r.code}`, leadId: null, ownerId: r.adminId, paidAt: r.paidAt, label: `${r.code} · ${r.product?.name ?? "Belum ditempatkan"}`, identity: { ...identity, nama } });
    }
  }

  return {
    leads,
    leadIdentity,
    evidenceIndex: new IdentityIndex(evidence, (e) => e.identity),
    ownedLeadIndex: new IdentityIndex(
      leads.filter((l) => l.ownerId != null),
      (l) => leadIdentity(l),
    ),
  };
});

export type Detected = { evidence: PaidEvidence; match: Match };

/**
 * Lead (belum Paid) di `cohort` yang ternyata SUDAH membayar menurut data lain.
 * Syarat bukti: dibayar tidak lebih dari 1 hari sebelum lead masuk, owner bukti kosong atau sama dengan owner lead
 * (penjualan admin lain tidak diklaim), bukan lead Paid milik owner yang sama di cohort ini (sudah terhitung),
 * dan satu bukti hanya dipakai sekali per owner.
 */
export async function detectPaidAcrossData(cohort: LeadRow[]) {
  const { evidenceIndex, leadIdentity } = await loadIdentityData();
  const cohortIds = new Set(cohort.map((l) => l.id));
  const cohortOwnerOf = new Map(cohort.map((l) => [l.id, l.ownerId]));
  const used = new Set<string>();
  const found = new Map<number, Detected>();
  const sorted = [...cohort].sort((a, b) => a.tanggalMasuk.getTime() - b.tanggalMasuk.getTime());
  for (const l of sorted) {
    if (l.statusFunnel === "Paid") continue;
    const hits = evidenceIndex.find(leadIdentity(l), (e) => {
      if (e.leadId === l.id) return false;
      if (e.paidAt && e.paidAt.getTime() < l.tanggalMasuk.getTime() - DAY) return false;
      if (e.ownerId != null && e.ownerId !== l.ownerId) return false;
      if (e.leadId != null && cohortIds.has(e.leadId) && cohortOwnerOf.get(e.leadId) === l.ownerId) return false;
      return !used.has(`${l.ownerId}:${e.key}`);
    });
    // kecocokan lemah (kontak sama, nama jelas berbeda → kemungkinan keluarga) tidak dihitung sebagai konversi
    const hit = hits.find((h) => !h.match.weak);
    if (!hit) continue;
    used.add(`${l.ownerId}:${hit.item.key}`);
    found.set(l.id, { evidence: hit.item, match: hit.match });
  }
  return found;
}

/**
 * Penjualan (lead Paid) yang belum punya owner → dikreditkan ke admin pemilik lead lain milik orang yang sama
 * (lead yang masuk paling akhir sebelum tanggal bayar; bila tidak ada, yang paling awal).
 */
export async function attributeOwners<T extends LeadRow>(sold: T[]) {
  const { ownedLeadIndex, leadIdentity } = await loadIdentityData();
  const out = new Map<number, { ownerId: number; fromLeadId: number; match: Match }>();
  for (const l of sold) {
    if (l.ownerId != null) continue;
    const hits = ownedLeadIndex.find(leadIdentity(l), (o) => o.id !== l.id).filter((h) => !h.match.weak);
    if (!hits.length) continue;
    const paid = (l.tanggalBayar ?? l.tanggalMasuk).getTime();
    const strongest = hits[0].match.by === "nama" ? hits[0].match.score : 2;
    const top = hits.filter((h) => (h.match.by === "nama" ? h.match.score : 2) === strongest);
    const before = top.filter((h) => h.item.tanggalMasuk.getTime() <= paid).sort((a, b) => b.item.tanggalMasuk.getTime() - a.item.tanggalMasuk.getTime());
    const pick = before[0] ?? [...top].sort((a, b) => a.item.tanggalMasuk.getTime() - b.item.tanggalMasuk.getTime())[0];
    out.set(l.id, { ownerId: pick.item.ownerId!, fromLeadId: pick.item.id, match: pick.match });
  }
  return out;
}

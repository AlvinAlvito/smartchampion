import "server-only";
import type { Blast, Lead } from "@prisma/client";
import { FMT, type ExcelColumn } from "./excel";

/** Kolom ekspor Master Lead (disamakan dengan Data Master Lead.xlsx + Tanggal Bayar); dipakai Ekspor Excel & laporan performa. */
export type LeadExportRow = Lead & { owner: { name: string } | null };

export const leadExportColumns: ExcelColumn<LeadExportRow>[] = [
  { header: "Lead ID", value: (l) => l.id, width: 9 },
  { header: "Tanggal Masuk", value: (l) => l.tanggalMasuk, numFmt: FMT.date },
  { header: "Nama", value: (l) => l.nama },
  { header: "No. WA", value: (l) => l.noWa }, // teks, agar tidak jadi notasi ilmiah
  { header: "Email", value: (l) => l.email },
  { header: "Sumber Lead", value: (l) => l.sumberLead },
  { header: "Campaign/Halaman", value: (l) => l.campaign },
  { header: "Kategori Customer", value: (l) => l.kategori },
  { header: "Produk", value: (l) => l.produk },
  { header: "Paket/Bidang/Jenjang", value: (l) => l.paket },
  { header: "Admin yang Melayani", value: (l) => l.owner?.name },
  { header: "Status Funnel", value: (l) => l.statusFunnel },
  { header: "Trial Mimpi.mu", value: (l) => l.trialMimpimu },
  { header: "Invoice ID", value: (l) => l.invoiceId },
  { header: "Status Bayar", value: (l) => l.statusBayar },
  { header: "Nominal", value: (l) => l.nominal, numFmt: FMT.rupiah },
  { header: "Tanggal Bayar", value: (l) => l.tanggalBayar, numFmt: FMT.date },
  { header: "Last Contact", value: (l) => l.lastContact, numFmt: FMT.date },
  { header: "Next Follow-up", value: (l) => l.nextFollowUp, numFmt: FMT.date },
  { header: "Objection/Kendala", value: (l) => l.objection, width: 40 },
  { header: "Next Action", value: (l) => l.nextAction, width: 40 },
  { header: "Catatan", value: (l) => l.catatan, width: 40 },
];

/** Kolom ekspor Data Blast (judul sama dengan template import → bisa diimpor ulang). */
export type BlastExportRow = Blast & { owner: { name: string } | null };

export const blastExportColumns: ExcelColumn<BlastExportRow>[] = [
  { header: "Blast ID", value: (b) => b.id, width: 9 },
  { header: "Tanggal", value: (b) => b.tanggal, numFmt: FMT.date },
  { header: "Nama", value: (b) => b.nama },
  { header: "Email", value: (b) => b.email },
  { header: "No. HP", value: (b) => b.noHp },
  { header: "Provinsi", value: (b) => b.provinsi },
  { header: "Kota", value: (b) => b.kota },
  { header: "Jenjang", value: (b) => b.jenjang },
  { header: "Sekolah", value: (b) => b.sekolah },
  { header: "Owner/Admin", value: (b) => b.owner?.name },
  { header: "Asal Blast", value: (b) => b.asalBlast },
];

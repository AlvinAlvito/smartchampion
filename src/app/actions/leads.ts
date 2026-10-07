"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePanel, requireStaff } from "@/lib/session";
import { normalizePhone, optInt, optStr, parseWibDate, str } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { readLeadFilters } from "@/lib/lead-filters";
import { buildLeadWhereWithAccounts } from "@/lib/lead-filters-server";
import { parseLeadWorkbook } from "@/lib/lead-import";
import { checkImportFile, MAX_IMPORT_ROWS, type ImportState, type ImportSummary } from "@/lib/import-types";
import { limitAction } from "@/lib/security";
import { enrollLeadAction } from "./lead-activation";

/** Owner lead = admin penanggung jawab pendaftaran web (dihubungkan lewat invoiceId = kode pendaftaran). */
async function syncRegistrationAdmin(invoiceId: string | null, ownerId: number | null) {
  if (!invoiceId) return;
  await prisma.registration.updateMany({ where: { code: invoiceId }, data: { adminId: ownerId } });
  revalidatePath("/admin/pendaftar");
}

export async function saveLeadAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  // Admin SmartChampion boleh mengelola lead (akun peserta), tetapi owner tetap diatur tim sales
  const session = await requirePanel();
  const salesTeam = session.role !== "SMARTCHAMPION";
  const id = optInt(form, "id");
  const nama = str(form, "nama");
  const sumberLead = str(form, "sumberLead");
  const tanggalMasuk = parseWibDate(form.get("tanggalMasuk"));
  const fieldErrors: Record<string, string[]> = {};
  if (!nama) fieldErrors.nama = ["Nama wajib diisi"];
  if (!sumberLead) fieldErrors.sumberLead = ["Sumber lead wajib dipilih"];
  if (!tanggalMasuk) fieldErrors.tanggalMasuk = ["Tanggal masuk wajib diisi"];
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const statusFunnel = str(form, "statusFunnel") || "Baru";
  const managesClass = form.has("classProductId") && !!id;
  const classProductId = optInt(form, "classProductId");
  const currentLead = id ? await prisma.lead.findUnique({ where: { id }, select: { id: true, invoiceId: true, ownerId: true } }) : null;
  const linkedRegistration = currentLead
    ? await prisma.registration.findFirst({
        where: { OR: [{ sourceLeadId: currentLead.id }, ...(currentLead.invoiceId ? [{ code: currentLead.invoiceId }] : [])] },
        select: { id: true, productId: true },
      })
    : null;
  const targetProduct = classProductId
    ? await prisma.product.findFirst({ where: { id: classProductId, status: { not: "DRAFT" } }, select: { id: true, name: true, type: true } })
    : null;
  if (classProductId && !targetProduct) return { fieldErrors: { classProductId: ["Kelas tujuan tidak ditemukan atau masih berupa draf."] } };
  // Tanggal bayar: wajib ada kalau Paid (default hari ini), dikosongkan kalau bukan Paid
  const tanggalBayar = statusFunnel === "Paid" ? (parseWibDate(form.get("tanggalBayar")) ?? new Date()) : null;

  const data = {
    tanggalMasuk: tanggalMasuk!,
    nama,
    noWa: normalizePhone(str(form, "noWa")),
    email: optStr(form, "email")?.toLowerCase() ?? null,
    sumberLead,
    campaign: optStr(form, "campaign"),
    kategori: str(form, "kategori") || "Calon Customer",
    produk: optStr(form, "produk"),
    paket: optStr(form, "paket"),
    ownerId: salesTeam ? optInt(form, "ownerId") : (currentLead?.ownerId ?? null),
    statusFunnel,
    tanggalBayar,
    trialMimpimu: optStr(form, "trialMimpimu"),
    invoiceId: optStr(form, "invoiceId"),
    statusBayar: optStr(form, "statusBayar"),
    nominal: optInt(form, "nominal"),
    lastContact: parseWibDate(form.get("lastContact")),
    nextFollowUp: parseWibDate(form.get("nextFollowUp")),
    objection: optStr(form, "objection"),
    nextAction: optStr(form, "nextAction"),
    catatan: optStr(form, "catatan"),
  };

  try {
    const saved = id ? await prisma.lead.update({ where: { id }, data }) : await prisma.lead.create({ data });
    await syncRegistrationAdmin(saved.invoiceId, saved.ownerId);
    if (managesClass && linkedRegistration) {
      if (targetProduct && targetProduct.id !== linkedRegistration.productId && targetProduct.type !== "PRIVATE") {
        const duplicate = await prisma.registration.findFirst({
          where: { id: { not: linkedRegistration.id }, user: { email: saved.email ?? "" }, productId: targetProduct.id, status: "PAID" },
          select: { code: true },
        });
        if (duplicate) return { error: `Peserta sudah terdaftar lunas di kelas tujuan (${duplicate.code}).` };
      }
      await prisma.registration.update({
        where: { id: linkedRegistration.id },
        data: {
          productId: targetProduct?.id ?? null,
          packageId: targetProduct?.type === "PRIVATE" ? undefined : null,
          ...((targetProduct && targetProduct.type !== "PRIVATE") ? { sessionsBought: null, sessionsDone: 0 } : {}),
        },
      });
      revalidatePath("/admin/pendaftar");
    } else if (managesClass && targetProduct) {
      const enrolled = await enrollLeadAction({ leadId: saved.id, productId: targetProduct.id });
      if ("error" in enrolled || "fieldErrors" in enrolled) return enrolled;
    }
  } catch {
    return { error: "Gagal menyimpan lead. Coba lagi." };
  }
  revalidatePath("/admin/leads");
  return { ok: id ? `Lead "${nama}" berhasil diperbarui.` : `Lead "${nama}" berhasil ditambahkan.` };
}

/** Data lengkap satu lead + daftar staf (untuk form edit cepat di panel Chat WA) */
export async function getLeadForEditAction(id: number) {
  await requireStaff();
  const [lead, staff] = await Promise.all([
    prisma.lead.findUnique({ where: { id: Number(id) || 0 } }),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPERADMIN"] }, isActive: true }, select: { id: true, name: true }, orderBy: { id: "asc" } }),
  ]);
  if (!lead) return { error: "Lead tidak ditemukan." } as const;
  return { lead, staff } as const;
}

export async function deleteLeadAction(id: number): Promise<ActionResult> {
  await requireStaff();
  const lead = await prisma.lead.delete({ where: { id } }).catch(() => null);
  if (!lead) return { error: "Lead tidak ditemukan atau sudah dihapus." };
  revalidatePath("/admin/leads");
  return { ok: `Lead "${lead.nama}" dihapus.` };
}

/** Update cepat dari tabel: status + tandai sudah dihubungi hari ini */
export async function quickUpdateLeadAction(id: number, status: string): Promise<ActionResult> {
  const session = await requirePanel();
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return { error: "Lead tidak ditemukan." };
  const statusFunnel = status || lead.statusFunnel;
  // lead tanpa owner diambil admin sales yang meng-update; Admin SmartChampion tidak mengambil lead
  const ownerId = session.role === "SMARTCHAMPION" ? lead.ownerId : (lead.ownerId ?? session.userId);
  await prisma.lead.update({
    where: { id },
    data: {
      statusFunnel,
      tanggalBayar: statusFunnel === "Paid" ? (lead.tanggalBayar ?? new Date()) : null,
      lastContact: new Date(),
      // lead tanpa owner otomatis jadi milik admin yang meng-update (aturan Program Kerja §8.1)
      ownerId,
    },
  });
  if (!lead.ownerId && ownerId) await syncRegistrationAdmin(lead.invoiceId, ownerId);
  revalidatePath("/admin/leads");
  return { ok: `Status "${lead.nama}" → ${statusFunnel}. Kontak hari ini dicatat.` };
}

/* ======================= HAPUS MASSAL ======================= */

const MAX_BULK_DELETE = 5000;

/** Hapus lead yang dicentang. */
export async function deleteLeadsAction(ids: number[]): Promise<ActionResult> {
  await requireStaff();
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (!clean.length) return { error: "Tidak ada lead yang dipilih." };
  if (clean.length > MAX_BULK_DELETE) return { error: `Maksimal ${MAX_BULK_DELETE} lead sekali hapus.` };
  const r = await prisma.lead.deleteMany({ where: { id: { in: clean } } });
  revalidatePath("/admin/leads");
  return { ok: `${r.count} lead berhasil dihapus.` };
}

/** Hapus SEMUA lead yang cocok dengan filter aktif (opsi "pilih semua sesuai filter"). */
export async function deleteLeadsByFilterAction(query: string, expected: number): Promise<ActionResult> {
  await requireStaff();
  const params = new URLSearchParams(query);
  const where = await buildLeadWhereWithAccounts(readLeadFilters((k) => params.get(k)));
  const count = await prisma.lead.count({ where });
  if (!count) return { error: "Tidak ada lead yang cocok dengan filter." };
  // pengaman: data berubah sejak halaman dibuka → minta konfirmasi ulang
  if (count !== expected) return { error: `Jumlah data berubah (${expected} → ${count}). Muat ulang halaman lalu coba lagi.` };
  if (count > MAX_BULK_DELETE) return { error: `Maksimal ${MAX_BULK_DELETE} lead sekali hapus. Persempit filter terlebih dahulu.` };
  const r = await prisma.lead.deleteMany({ where });
  revalidatePath("/admin/leads");
  return { ok: `${r.count} lead berhasil dihapus.` };
}

/* ======================= IMPORT MASSAL ======================= */

export type LeadImportSample = { nama: string; noWa: string | null; sumberLead: string; statusFunnel: string; owner: string | null };

export async function importLeadsAction(_prev: ImportState<LeadImportSample> | undefined, form: FormData): Promise<ImportState<LeadImportSample>> {
  const me = await requireStaff();
  const limited = await limitAction("import", me.userId, 30, 10 * 60_000);
  if (limited) return { error: limited };
  const file = form.get("file");
  const mode = form.get("mode") === "commit" ? "commit" : "preview";
  const skipDuplicates = form.get("skipDuplicates") !== "0";
  const fileError = checkImportFile(file);
  if (fileError || !(file instanceof File)) return { error: fileError ?? "File tidak valid." };

  const staff = await prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPERADMIN"] } }, select: { id: true, name: true, email: true } });
  let parsed;
  try {
    parsed = await parseLeadWorkbook(await file.arrayBuffer(), staff);
  } catch {
    return { error: "File tidak bisa dibaca. Pastikan file berformat .xlsx yang valid (gunakan template)." };
  }
  if (!parsed.sheetName) return { error: 'Header tidak ditemukan. Gunakan template: baris judul harus memuat kolom "Nama" dan "Sumber Lead".' };
  if (parsed.missingHeaders.length) return { error: `Kolom wajib tidak ada: ${parsed.missingHeaders.join(", ")}.` };
  if (!parsed.totalRows) return { error: "File tidak berisi data (semua baris kosong)." };
  if (parsed.totalRows > MAX_IMPORT_ROWS) return { error: `Maksimal ${MAX_IMPORT_ROWS} baris per file. Pecah file menjadi beberapa bagian.` };

  // Duplikat terhadap database (berdasarkan No. WA)
  const was = [...new Set(parsed.valid.map((v) => v.data.noWa).filter((w): w is string => !!w))];
  const existing = new Set<string>();
  for (let i = 0; i < was.length; i += 1000) {
    const rows = await prisma.lead.findMany({ where: { noWa: { in: was.slice(i, i + 1000) } }, select: { noWa: true } });
    rows.forEach((r) => r.noWa && existing.add(r.noWa));
  }
  const reportByRow = new Map(parsed.reports.map((r) => [r.row, r]));
  let duplicates = 0;
  for (const v of parsed.valid) {
    if (v.data.noWa && existing.has(v.data.noWa)) {
      duplicates++;
      const rep = reportByRow.get(v.row)!;
      rep.status = "duplicate";
      rep.messages.unshift(skipDuplicates ? "No. WA sudah ada di Master Lead → dilewati" : "No. WA sudah ada di Master Lead (tetap diimpor)");
    }
  }
  const toInsert = parsed.valid.filter((v) => !(skipDuplicates && v.data.noWa && existing.has(v.data.noWa)));
  const ownerName = new Map(staff.map((s) => [s.id, s.name]));

  const summary: ImportSummary<LeadImportSample> = {
    mode,
    fileName: file.name,
    total: parsed.totalRows,
    ready: toInsert.length,
    warnings: parsed.reports.filter((r) => r.status === "warning").length,
    errors: parsed.reports.filter((r) => r.status === "error").length,
    duplicates,
    skipDuplicates,
    issues: parsed.reports.filter((r) => r.status !== "ok").slice(0, 200),
    sample: toInsert.slice(0, 6).map((v) => ({
      row: v.row,
      nama: v.data.nama,
      noWa: v.data.noWa,
      sumberLead: v.data.sumberLead,
      statusFunnel: v.data.statusFunnel,
      owner: v.data.ownerId ? (ownerName.get(v.data.ownerId) ?? null) : null,
    })),
  };

  if (mode === "preview") return { summary };
  if (!toInsert.length) return { error: "Tidak ada baris yang bisa diimpor.", summary };

  let inserted = 0;
  try {
    for (let i = 0; i < toInsert.length; i += 500) {
      const r = await prisma.lead.createMany({ data: toInsert.slice(i, i + 500).map((v) => v.data) });
      inserted += r.count;
    }
  } catch (e) {
    console.error("[import lead]", e);
    return { error: `Import terhenti setelah ${inserted} baris karena kesalahan database. Periksa data lalu coba lagi.`, summary: { ...summary, inserted } };
  }
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
  return { ok: `${inserted} lead berhasil diimpor dari ${file.name}.`, summary: { ...summary, mode: "commit", inserted } };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { normalizePhone, optInt, optStr, parseWibDate, str } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { BLAST_CHANNELS } from "@/lib/constants";
import { buildBlastWhere, readBlastFilters } from "@/lib/blast-filters";
import { blastContactKey, parseBlastWorkbook } from "@/lib/blast-import";
import { checkImportFile, MAX_IMPORT_ROWS, type ImportState, type ImportSummary } from "@/lib/import-types";
import { limitAction } from "@/lib/security";

const PATH = "/admin/blast";

export async function saveBlastAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requireStaff();
  const id = optInt(form, "id");
  const nama = str(form, "nama");
  const asalBlast = str(form, "asalBlast");
  const tanggal = parseWibDate(form.get("tanggal"));
  const noHp = normalizePhone(str(form, "noHp"));
  const email = optStr(form, "email")?.toLowerCase() ?? null;

  const fieldErrors: Record<string, string[]> = {};
  if (!nama) fieldErrors.nama = ["Nama wajib diisi"];
  if (!tanggal) fieldErrors.tanggal = ["Tanggal wajib diisi"];
  if (!(BLAST_CHANNELS as readonly string[]).includes(asalBlast)) fieldErrors.asalBlast = ["Pilih asal blast"];
  else if (asalBlast === "WhatsApp" && !noHp) fieldErrors.noHp = ["No. HP wajib diisi untuk blast WhatsApp"];
  else if (asalBlast === "Email" && !email) fieldErrors.email = ["Email wajib diisi untuk blast Email"];
  if (email && !/^\S+@\S+\.\S+$/.test(email)) fieldErrors.email = ["Format email tidak valid"];
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const data = {
    tanggal: tanggal!,
    nama,
    email,
    noHp,
    provinsi: optStr(form, "provinsi"),
    kota: optStr(form, "kota"),
    jenjang: optStr(form, "jenjang"),
    sekolah: optStr(form, "sekolah"),
    ownerId: optInt(form, "ownerId"),
    asalBlast,
  };
  try {
    if (id) await prisma.blast.update({ where: { id }, data });
    else await prisma.blast.create({ data });
  } catch {
    return { error: "Gagal menyimpan data blast. Coba lagi." };
  }
  revalidatePath(PATH);
  return { ok: id ? `Data blast "${nama}" berhasil diperbarui.` : `Data blast "${nama}" berhasil ditambahkan.` };
}

export async function deleteBlastAction(id: number): Promise<ActionResult> {
  await requireStaff();
  const b = await prisma.blast.delete({ where: { id } }).catch(() => null);
  if (!b) return { error: "Data blast tidak ditemukan atau sudah dihapus." };
  revalidatePath(PATH);
  return { ok: `Data blast "${b.nama}" dihapus.` };
}

/** Salin kontak blast ke Master Lead (sumber Blast WA / Blast Email) bila belum ada di sana. */
export async function blastToLeadAction(id: number): Promise<ActionResult> {
  const session = await requireStaff();
  const b = await prisma.blast.findUnique({ where: { id } });
  if (!b) return { error: "Data blast tidak ditemukan." };
  const contacts = [b.noHp ? { noWa: b.noHp } : null, b.email ? { email: b.email } : null].filter((x) => x !== null);
  if (contacts.length) {
    const existing = await prisma.lead.findFirst({ where: { OR: contacts }, select: { nama: true, id: true } });
    if (existing) return { error: `Kontak ini sudah ada di Master Lead sebagai "${existing.nama}" (Lead #${existing.id}).` };
  }
  const place = [b.sekolah, b.kota, b.provinsi].filter(Boolean).join(", ");
  const lead = await prisma.lead.create({
    data: {
      tanggalMasuk: new Date(),
      nama: b.nama,
      noWa: b.noHp,
      email: b.email,
      sumberLead: b.asalBlast === "Email" ? "Blast Email" : "Blast WA (RFM)",
      paket: b.jenjang,
      ownerId: b.ownerId ?? session.userId,
      statusFunnel: "Baru",
      catatan: `Dari Data Blast #${b.id} (blast ${b.asalBlast}).${place ? ` ${place}.` : ""}`,
    },
  });
  revalidatePath("/admin/leads");
  return { ok: `"${b.nama}" masuk Master Lead (Lead #${lead.id}).` };
}

/* ======================= HAPUS MASSAL ======================= */

const MAX_BULK_DELETE = 5000;

export async function deleteBlastsAction(ids: number[]): Promise<ActionResult> {
  await requireStaff();
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (!clean.length) return { error: "Tidak ada data blast yang dipilih." };
  if (clean.length > MAX_BULK_DELETE) return { error: `Maksimal ${MAX_BULK_DELETE} data sekali hapus.` };
  const r = await prisma.blast.deleteMany({ where: { id: { in: clean } } });
  revalidatePath(PATH);
  return { ok: `${r.count} data blast berhasil dihapus.` };
}

/** Hapus SEMUA data blast yang cocok dengan filter aktif. */
export async function deleteBlastsByFilterAction(query: string, expected: number): Promise<ActionResult> {
  await requireStaff();
  const params = new URLSearchParams(query);
  const where = buildBlastWhere(readBlastFilters((k) => params.get(k)));
  const count = await prisma.blast.count({ where });
  if (!count) return { error: "Tidak ada data blast yang cocok dengan filter." };
  if (count !== expected) return { error: `Jumlah data berubah (${expected} → ${count}). Muat ulang halaman lalu coba lagi.` };
  if (count > MAX_BULK_DELETE) return { error: `Maksimal ${MAX_BULK_DELETE} data sekali hapus. Persempit filter terlebih dahulu.` };
  const r = await prisma.blast.deleteMany({ where });
  revalidatePath(PATH);
  return { ok: `${r.count} data blast berhasil dihapus.` };
}

/* ======================= IMPORT MASSAL ======================= */

export type BlastImportSample = { nama: string; kontak: string | null; asalBlast: string; sekolah: string | null; owner: string | null };

export async function importBlastsAction(_prev: ImportState<BlastImportSample> | undefined, form: FormData): Promise<ImportState<BlastImportSample>> {
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
    parsed = await parseBlastWorkbook(await file.arrayBuffer(), staff);
  } catch {
    return { error: "File tidak bisa dibaca. Pastikan file berformat .xlsx yang valid (gunakan template)." };
  }
  if (!parsed.found) return { error: 'Header tidak ditemukan. Gunakan template: baris judul harus memuat kolom "Nama" dan "Asal Blast".' };
  if (parsed.missingHeaders.length) return { error: `Kolom wajib tidak ada: ${parsed.missingHeaders.join(", ")}.` };
  if (!parsed.totalRows) return { error: "File tidak berisi data (semua baris kosong)." };
  if (parsed.totalRows > MAX_IMPORT_ROWS) return { error: `Maksimal ${MAX_IMPORT_ROWS} baris per file. Pecah file menjadi beberapa bagian.` };

  // Duplikat terhadap database: kontak yang sama di kanal yang sama (WA → No. HP, Email → email)
  const hps = [...new Set(parsed.valid.filter((v) => v.data.asalBlast === "WhatsApp" && v.data.noHp).map((v) => v.data.noHp!))];
  const emails = [...new Set(parsed.valid.filter((v) => v.data.asalBlast === "Email" && v.data.email).map((v) => v.data.email!))];
  const existing = new Set<string>();
  for (let i = 0; i < hps.length; i += 1000) {
    const rows = await prisma.blast.findMany({ where: { asalBlast: "WhatsApp", noHp: { in: hps.slice(i, i + 1000) } }, select: { noHp: true } });
    rows.forEach((r) => existing.add(`WhatsApp:${r.noHp}`));
  }
  for (let i = 0; i < emails.length; i += 1000) {
    const rows = await prisma.blast.findMany({ where: { asalBlast: "Email", email: { in: emails.slice(i, i + 1000) } }, select: { email: true } });
    rows.forEach((r) => existing.add(`Email:${r.email}`));
  }
  const isDup = (d: (typeof parsed.valid)[number]["data"]) => {
    const k = blastContactKey(d);
    return !!k && existing.has(k);
  };

  const reportByRow = new Map(parsed.reports.map((r) => [r.row, r]));
  let duplicates = 0;
  for (const v of parsed.valid) {
    if (isDup(v.data)) {
      duplicates++;
      const rep = reportByRow.get(v.row)!;
      rep.status = "duplicate";
      rep.messages.unshift(skipDuplicates ? `Kontak ${v.data.asalBlast} sudah ada di Data Blast → dilewati` : `Kontak ${v.data.asalBlast} sudah ada di Data Blast (tetap diimpor)`);
    }
  }
  const toInsert = parsed.valid.filter((v) => !(skipDuplicates && isDup(v.data)));
  const ownerName = new Map(staff.map((s) => [s.id, s.name]));

  const summary: ImportSummary<BlastImportSample> = {
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
      kontak: v.data.asalBlast === "Email" ? v.data.email : v.data.noHp,
      asalBlast: v.data.asalBlast,
      sekolah: v.data.sekolah,
      owner: v.data.ownerId ? (ownerName.get(v.data.ownerId) ?? null) : null,
    })),
  };

  if (mode === "preview") return { summary };
  if (!toInsert.length) return { error: "Tidak ada baris yang bisa diimpor.", summary };

  let inserted = 0;
  try {
    for (let i = 0; i < toInsert.length; i += 500) {
      const r = await prisma.blast.createMany({ data: toInsert.slice(i, i + 500).map((v) => v.data) });
      inserted += r.count;
    }
  } catch (e) {
    console.error("[import blast]", e);
    return { error: `Import terhenti setelah ${inserted} baris karena kesalahan database. Periksa data lalu coba lagi.`, summary: { ...summary, inserted } };
  }
  revalidatePath(PATH);
  return { ok: `${inserted} data blast berhasil diimpor dari ${file.name}.`, summary: { ...summary, mode: "commit", inserted } };
}

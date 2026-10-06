"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/session";
import { limitAction } from "@/lib/security";
import { normalizePhone, optStr, str } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { checkImportFile, MAX_IMPORT_ROWS, type ImportState, type ImportSummary } from "@/lib/import-types";
import { gateway } from "@/lib/wa";
import {
  audienceWhere,
  BLAST_IMAGE_DIR,
  blastGatewayId,
  canBlast,
  contactScope,
  isUniqueError,
  linkContactsToDataBlast,
  mySender,
  readBlastImage,
  saveBlastImage,
  touchDataBlast,
  type AudienceFilter,
} from "@/lib/blast-wa";
import { BLAST_MAX_TEXT, joinLabels, NUMBER_AGE_LABEL, parseLabels, renderMessage } from "@/lib/blast-wa-shared";
import { buildContactWhere, readContactFilters } from "@/lib/blast-contact-filters";
import { parseContactWorkbook } from "@/lib/blast-contact-import";

const BASE = "/admin/blast-wa";

/** Admin Pelatihan & Root (Superadmin = hanya lihat, sudah ditolak requireStaff untuk aksi) */
async function requireBlaster() {
  const me = await requireStaff();
  if (!canBlast(me.role)) throw new Error("Tidak diizinkan.");
  return me;
}

function refresh() {
  revalidatePath(BASE, "layout");
  revalidatePath("/admin/blast");
}

/* ============================ NOMOR BLAST ============================ */

export async function setNumberAgeAction(age: string): Promise<ActionResult> {
  const me = await requireBlaster();
  if (!(age in NUMBER_AGE_LABEL)) return { error: "Pilihan umur nomor tidak valid." };
  const s = await mySender(me.userId);
  if (!s) return { error: "Tautkan nomor blast terlebih dahulu." };
  await prisma.blastSender.update({ where: { id: s.id }, data: { numberAge: age } });
  refresh();
  return { ok: `Umur nomor disimpan: ${NUMBER_AGE_LABEL[age]}. Kuota warm-up disesuaikan.` };
}

/* ============================== KONTAK ============================== */

const MAX_CONTACT_TEXT = 160;

export async function saveContactAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const me = await requireBlaster();
  const id = Number(form.get("id")) || null;
  const nama = str(form, "nama").slice(0, MAX_CONTACT_TEXT);
  const noHp = normalizePhone(str(form, "noHp"));
  const email = optStr(form, "email")?.toLowerCase().slice(0, 160) ?? null;
  const fieldErrors: Record<string, string[]> = {};
  if (!nama) fieldErrors.nama = ["Nama wajib diisi"];
  if (!noHp || noHp.length < 10 || noHp.length > 15) fieldErrors.noHp = ["No. WhatsApp tidak valid. Contoh: 081234567890"];
  if (email && !/^\S+@\S+\.\S+$/.test(email)) fieldErrors.email = ["Format email tidak valid"];
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const data = {
    nama,
    noHp: noHp!,
    email,
    jenjang: optStr(form, "jenjang")?.slice(0, 30) ?? null,
    kelas: optStr(form, "kelas")?.slice(0, 30) ?? null,
    sekolah: optStr(form, "sekolah")?.slice(0, 160) ?? null,
    kota: optStr(form, "kota")?.slice(0, 100) ?? null,
    provinsi: optStr(form, "provinsi")?.slice(0, 80) ?? null,
    labels: joinLabels(parseLabels(str(form, "labels"))),
    catatan: optStr(form, "catatan")?.slice(0, 2000) ?? null,
  };
  try {
    if (id) {
      const own = await prisma.blastContact.findFirst({ where: { id, ...contactScope(me) } });
      if (!own) return { error: "Kontak tidak ditemukan." };
      const c = await prisma.blastContact.update({ where: { id }, data });
      await touchDataBlast(c);
    } else {
      await prisma.blastContact.create({ data: { ...data, ownerId: me.userId, source: "Manual" } });
      await linkContactsToDataBlast(me.userId);
    }
  } catch (e) {
    if (isUniqueError(e)) return { fieldErrors: { noHp: ["Nomor ini sudah ada di kontak Anda"] } };
    console.error("[blast-wa contact]", e);
    return { error: "Gagal menyimpan kontak. Coba lagi." };
  }
  refresh();
  return { ok: id ? `Kontak "${nama}" diperbarui.` : `Kontak "${nama}" ditambahkan & tercatat di Data Blast.` };
}

const cleanIds = (ids: number[]) => [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 5000);

type BulkTarget = { ids: number[] } | { query: string; expected: number };

async function bulkWhere(me: Awaited<ReturnType<typeof requireBlaster>>, target: BulkTarget) {
  if ("ids" in target) {
    const ids = cleanIds(target.ids);
    if (!ids.length) return { error: "Tidak ada kontak yang dipilih." };
    return { where: { id: { in: ids }, ...contactScope(me) } };
  }
  const params = new URLSearchParams(target.query);
  const where = buildContactWhere(readContactFilters((k) => params.get(k)), contactScope(me));
  const count = await prisma.blastContact.count({ where });
  if (count !== target.expected) return { error: `Jumlah data berubah (${target.expected} → ${count}). Muat ulang halaman lalu coba lagi.` };
  if (count > 5000) return { error: "Maksimal 5.000 kontak sekali proses. Persempit filter terlebih dahulu." };
  return { where };
}

/** Aksi massal kontak: hapus / tambah label / hapus label / berhenti langganan / aktifkan lagi */
export async function bulkContactAction(op: "delete" | "addLabel" | "removeLabel" | "optOut" | "optIn", target: BulkTarget, label?: string): Promise<ActionResult> {
  const me = await requireBlaster();
  const w = await bulkWhere(me, target);
  if ("error" in w) return { error: w.error };
  const { where } = w;
  if (op === "delete") {
    const r = await prisma.blastContact.deleteMany({ where });
    refresh();
    return { ok: `${r.count} kontak dihapus. Riwayat di Data Blast tetap tersimpan.` };
  }
  if (op === "optOut" || op === "optIn") {
    const r = await prisma.blastContact.updateMany({
      where,
      data: op === "optOut" ? { optOut: true, optOutAt: new Date(), optOutReason: "Ditandai admin" } : { optOut: false, optOutAt: null, optOutReason: null },
    });
    refresh();
    return { ok: op === "optOut" ? `${r.count} kontak ditandai berhenti berlangganan (tidak akan dikirimi blast).` : `${r.count} kontak bisa dikirimi blast lagi.` };
  }
  const l = (label ?? "").replace(/,/g, " ").trim().slice(0, 40);
  if (!l) return { error: "Isi nama label." };
  const rows = await prisma.blastContact.findMany({ where, select: { id: true, labels: true } });
  let changed = 0;
  for (const c of rows) {
    const cur = parseLabels(c.labels);
    const next = op === "addLabel" ? [...cur, l] : cur.filter((x) => x.toLowerCase() !== l.toLowerCase());
    const joined = joinLabels(next);
    if (joined !== c.labels) {
      await prisma.blastContact.update({ where: { id: c.id }, data: { labels: joined } });
      changed++;
    }
  }
  refresh();
  return { ok: op === "addLabel" ? `Label "${l}" ditambahkan ke ${changed} kontak.` : `Label "${l}" dihapus dari ${changed} kontak.` };
}

export type ContactImportSample = { nama: string; noHp: string; sekolah: string | null; labels: string | null };

export async function importContactsAction(_prev: ImportState<ContactImportSample> | undefined, form: FormData): Promise<ImportState<ContactImportSample>> {
  const me = await requireBlaster();
  const limited = await limitAction("import", me.userId, 30, 10 * 60_000);
  if (limited) return { error: limited };
  const file = form.get("file");
  const mode = form.get("mode") === "commit" ? "commit" : "preview";
  const skipDuplicates = form.get("skipDuplicates") !== "0";
  const fileError = checkImportFile(file);
  if (fileError || !(file instanceof File)) return { error: fileError ?? "File tidak valid." };
  let parsed;
  try {
    parsed = await parseContactWorkbook(await file.arrayBuffer(), null);
  } catch {
    return { error: "File tidak bisa dibaca. Pastikan file berformat .xlsx yang valid (gunakan template)." };
  }
  if (!parsed.found) return { error: 'Header tidak ditemukan. Baris judul harus memuat kolom "Nama" dan "No. WhatsApp" (atau "No. HP").' };
  if (!parsed.totalRows) return { error: "File tidak berisi data (semua baris kosong)." };
  if (parsed.totalRows > MAX_IMPORT_ROWS) return { error: `Maksimal ${MAX_IMPORT_ROWS} baris per file.` };

  const phones = parsed.valid.map((v) => v.data.noHp);
  const existing = new Set<string>();
  for (let i = 0; i < phones.length; i += 1000) {
    const rows = await prisma.blastContact.findMany({ where: { ownerId: me.userId, noHp: { in: phones.slice(i, i + 1000) } }, select: { noHp: true } });
    rows.forEach((r) => existing.add(r.noHp));
  }
  const reportByRow = new Map(parsed.reports.map((r) => [r.row, r]));
  let duplicates = parsed.reports.filter((r) => r.status === "duplicate").length;
  for (const v of parsed.valid) {
    if (existing.has(v.data.noHp)) {
      duplicates++;
      const rep = reportByRow.get(v.row)!;
      rep.status = "duplicate";
      rep.messages.unshift(skipDuplicates ? "Nomor sudah ada di kontak Anda → dilewati" : "Nomor sudah ada di kontak Anda → data diperbarui");
    }
  }
  const fresh = parsed.valid.filter((v) => !existing.has(v.data.noHp));
  const updates = skipDuplicates ? [] : parsed.valid.filter((v) => existing.has(v.data.noHp));
  const summary: ImportSummary<ContactImportSample> = {
    mode,
    fileName: file.name,
    total: parsed.totalRows,
    ready: fresh.length + updates.length,
    warnings: parsed.reports.filter((r) => r.status === "warning").length,
    errors: parsed.reports.filter((r) => r.status === "error").length,
    duplicates,
    skipDuplicates,
    issues: parsed.reports.filter((r) => r.status !== "ok").slice(0, 200),
    sample: [...fresh, ...updates].slice(0, 6).map((v) => ({ row: v.row, nama: v.data.nama, noHp: v.data.noHp, sekolah: v.data.sekolah, labels: parseLabels(v.data.labels).join(", ") || null })),
  };
  if (mode === "preview") return { summary };
  if (!summary.ready) return { error: "Tidak ada baris yang bisa diimpor.", summary };

  let inserted = 0;
  try {
    for (let i = 0; i < fresh.length; i += 500) {
      const r = await prisma.blastContact.createMany({ data: fresh.slice(i, i + 500).map((v) => ({ ...v.data, ownerId: me.userId, source: "Impor Excel" })), skipDuplicates: true });
      inserted += r.count;
    }
    for (const v of updates) {
      const { noHp, ...rest } = v.data;
      await prisma.blastContact.update({ where: { ownerId_noHp: { ownerId: me.userId, noHp } }, data: rest });
      inserted++;
    }
    await linkContactsToDataBlast(me.userId);
  } catch (e) {
    console.error("[import blast-wa]", e);
    return { error: `Import terhenti setelah ${inserted} baris karena kesalahan database.`, summary: { ...summary, inserted } };
  }
  refresh();
  return { ok: `${inserted} kontak berhasil diimpor dari ${file.name} dan tercatat di Data Blast.`, summary: { ...summary, mode: "commit", inserted } };
}

/** Salin kontak dari Data Blast (asal WhatsApp, milik sendiri) atau Master Lead (lead milik sendiri). */
export async function pullContactsAction(from: "blast" | "lead", leadStatus = ""): Promise<ActionResult> {
  const me = await requireBlaster();
  const limited = await limitAction("blast-pull", me.userId, 10, 10 * 60_000);
  if (limited) return { error: limited };
  const existing = new Set((await prisma.blastContact.findMany({ where: { ownerId: me.userId }, select: { noHp: true } })).map((c) => c.noHp));
  const rows: Prisma.BlastContactCreateManyInput[] = [];
  const add = (r: Prisma.BlastContactCreateManyInput) => {
    const hp = r.noHp;
    if (!hp || hp.length < 10 || hp.length > 15 || existing.has(hp)) return;
    existing.add(hp);
    rows.push(r);
  };
  if (from === "blast") {
    const src = await prisma.blast.findMany({ where: { ownerId: me.userId, asalBlast: "WhatsApp", noHp: { not: null } }, take: 20000 });
    for (const b of src)
      add({ ownerId: me.userId, nama: b.nama.slice(0, 160), noHp: normalizePhone(b.noHp) ?? "", email: b.email, jenjang: b.jenjang, sekolah: b.sekolah, kota: b.kota, provinsi: b.provinsi, blastId: b.id, source: "Data Blast", labels: joinLabels(["Data Blast"]) });
  } else {
    const src = await prisma.lead.findMany({ where: { ownerId: me.userId, noWa: { not: null }, ...(leadStatus ? { statusFunnel: leadStatus } : {}) }, take: 20000 });
    for (const l of src) add({ ownerId: me.userId, nama: l.nama.slice(0, 160), noHp: normalizePhone(l.noWa) ?? "", email: l.email, source: "Master Lead", labels: joinLabels(["Master Lead", l.statusFunnel]) });
  }
  if (!rows.length) return { error: from === "blast" ? "Tidak ada data blast WhatsApp milik Anda yang belum ada di kontak." : "Tidak ada lead milik Anda (ber-No. WA) yang belum ada di kontak." };
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) inserted += (await prisma.blastContact.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true })).count;
  await linkContactsToDataBlast(me.userId);
  refresh();
  return { ok: `${inserted} kontak ditambahkan dari ${from === "blast" ? "Data Blast" : "Master Lead"}.` };
}

/* ============================== KAMPANYE ============================== */

function readAudience(form: FormData): AudienceFilter {
  const s = (k: string) => String(form.get(k) ?? "").trim().slice(0, 100);
  return {
    label: s("aLabel"),
    jenjang: s("aJenjang"),
    provinsi: s("aProvinsi"),
    kota: s("aKota"),
    sekolah: s("aSekolah"),
    status: ["never", "replied"].includes(s("aStatus")) ? s("aStatus") : "",
    notBlastedDays: Math.min(365, Math.max(0, Number(form.get("aNotBlastedDays")) || 0)),
    ids: s("aIds") ? cleanIds(String(form.get("aIds")).split(",").map(Number)) : [],
  };
}

function describeAudience(f: AudienceFilter) {
  const parts = [
    f.ids.length ? `${f.ids.length} kontak dipilih` : "",
    f.label ? `label ${f.label}` : "",
    f.jenjang ? `jenjang ${f.jenjang}` : "",
    f.provinsi,
    f.kota ? `kota ~${f.kota}` : "",
    f.sekolah ? `sekolah ~${f.sekolah}` : "",
    f.status === "never" ? "belum pernah di-blast" : f.status === "replied" ? "pernah membalas" : "",
    f.notBlastedDays ? `tidak di-blast ${f.notBlastedDays} hari terakhir` : "",
  ].filter(Boolean);
  return (parts.length ? parts.join(" · ") : "Semua kontak aktif").slice(0, 255);
}

/** Hitung audiens sesuai filter (pratinjau di form kampanye). */
export async function countAudienceAction(form: FormData): Promise<{ count: number; sample: { nama: string; noHp: string; sekolah: string | null; jenjang: string | null; kelas: string | null; kota: string | null; provinsi: string | null }[] }> {
  const me = await requireBlaster();
  const where = audienceWhere(me.userId, readAudience(form));
  const [count, sample] = await Promise.all([
    prisma.blastContact.count({ where }),
    prisma.blastContact.findMany({ where, take: 5, orderBy: { id: "asc" }, select: { nama: true, noHp: true, sekolah: true, jenjang: true, kelas: true, kota: true, provinsi: true } }),
  ]);
  return { count, sample };
}

const MAX_RECIPIENTS = 5000;
const int = (form: FormData, k: string, def: number) => {
  const n = Number(form.get(k));
  return Number.isFinite(n) && String(form.get(k) ?? "") !== "" ? Math.round(n) : def;
};

export async function saveCampaignAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const me = await requireBlaster();
  const limited = await limitAction("blast-campaign", me.userId, 30, 10 * 60_000);
  if (limited) return { error: limited };
  const id = Number(form.get("id")) || null;
  const intent = String(form.get("intent") ?? "draft"); // draft | start | schedule
  const name = str(form, "name").slice(0, 160);
  const message = String(form.get("message") ?? "").replace(/\r\n/g, "\n").trim();
  const settings = {
    delayMin: int(form, "delayMin", 30),
    delayMax: int(form, "delayMax", 75),
    batchSize: int(form, "batchSize", 20),
    batchRestMin: int(form, "batchRestMin", 10),
    hourStart: int(form, "hourStart", 8),
    hourEnd: int(form, "hourEnd", 20),
    dailyLimit: int(form, "dailyLimit", 150),
  };
  const fieldErrors: Record<string, string[]> = {};
  if (!name) fieldErrors.name = ["Nama kampanye wajib diisi"];
  if (!message) fieldErrors.message = ["Isi pesan wajib diisi"];
  else if (message.length > BLAST_MAX_TEXT) fieldErrors.message = [`Pesan maksimal ${BLAST_MAX_TEXT.toLocaleString("id-ID")} karakter`];
  if (settings.delayMin < 15 || settings.delayMin > 600) fieldErrors.delayMin = ["Jeda minimal 15–600 detik"];
  if (settings.delayMax < settings.delayMin || settings.delayMax > 900) fieldErrors.delayMax = ["Jeda maksimal harus ≥ jeda minimal (maks 900 detik)"];
  if (settings.batchSize < 5 || settings.batchSize > 100) fieldErrors.batchSize = ["Isi 5–100 pesan"];
  if (settings.batchRestMin < 1 || settings.batchRestMin > 180) fieldErrors.batchRestMin = ["Isi 1–180 menit"];
  if (settings.hourStart < 0 || settings.hourStart > 23 || settings.hourEnd < 1 || settings.hourEnd > 24 || settings.hourEnd <= settings.hourStart)
    fieldErrors.hourEnd = ["Jam selesai harus setelah jam mulai (0–24)"];
  if (settings.dailyLimit < 5 || settings.dailyLimit > 1000) fieldErrors.dailyLimit = ["Isi 5–1.000 pesan/hari"];
  let scheduledAt: Date | null = null;
  if (intent === "schedule") {
    const raw = String(form.get("scheduledAt") ?? "");
    scheduledAt = raw ? new Date(`${raw}:00+07:00`) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + 60_000) fieldErrors.scheduledAt = ["Pilih waktu di masa depan"];
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors, error: "Periksa kembali isian yang ditandai." };

  const sender = await mySender(me.userId);
  if (intent !== "draft" && !sender) return { error: "Tautkan nomor WhatsApp blast terlebih dahulu (tab Ringkasan)." };
  if (intent !== "draft" && sender && (sender.restricted || sender.status === "BANNED")) return { error: "Nomor blast sedang dibatasi/diblokir WhatsApp. Kampanye tidak bisa dijalankan." };

  // gambar
  let imageFile: string | null | undefined;
  const image = form.get("image");
  if (image instanceof File && image.size > 0) {
    try {
      imageFile = await saveBlastImage(image);
    } catch (e) {
      return { fieldErrors: { image: [(e as Error).message] } };
    }
  } else if (form.get("removeImage") === "1") imageFile = null;

  const status = intent === "start" ? "RUNNING" : intent === "schedule" ? "SCHEDULED" : "DRAFT";
  const timing = { scheduledAt, ...(status === "RUNNING" ? { startedAt: new Date() } : {}), pauseReason: null };

  if (id) {
    const c = await prisma.blastCampaign.findFirst({ where: { id, ownerId: me.userId } });
    if (!c) return { error: "Kampanye tidak ditemukan." };
    if (!["DRAFT", "PAUSED", "SCHEDULED"].includes(c.status)) return { error: "Kampanye yang sedang berjalan/selesai tidak bisa diubah. Jeda dulu." };
    // daftar penerima tetap (ditetapkan saat kampanye dibuat); untuk audiens lain → duplikat kampanye
    const next = c.status === "PAUSED" && intent === "draft" ? "PAUSED" : status;
    await prisma.blastCampaign.update({
      where: { id },
      data: {
        name,
        message,
        ...settings,
        ...(imageFile !== undefined ? { imageFile } : {}),
        status: next,
        ...(next === "RUNNING" ? { startedAt: c.startedAt ?? new Date(), scheduledAt: null, pauseReason: null } : next === "SCHEDULED" ? { scheduledAt, pauseReason: null } : {}),
        senderId: sender?.id ?? c.senderId,
      },
    });
    if (imageFile !== undefined && c.imageFile && c.imageFile !== imageFile) await removeImageIfUnused(c.imageFile);
    refresh();
    return { ok: `Kampanye "${name}" disimpan${next === "RUNNING" ? " & dijalankan" : next === "SCHEDULED" ? " & dijadwalkan" : ""}.`, id };
  }

  const audience = readAudience(form);
  const contacts = await prisma.blastContact.findMany({ where: audienceWhere(me.userId, audience), select: { id: true, nama: true, noHp: true }, take: MAX_RECIPIENTS + 1, orderBy: { id: "asc" } });
  if (!contacts.length) return { error: "Tidak ada kontak yang cocok dengan audiens. Tambah/impor kontak atau ubah filter." };
  if (contacts.length > MAX_RECIPIENTS) return { error: `Maksimal ${MAX_RECIPIENTS.toLocaleString("id-ID")} penerima per kampanye. Persempit audiens (mis. per label/jenjang).` };
  const c = await prisma.blastCampaign.create({
    data: { ownerId: me.userId, senderId: sender?.id ?? null, name, message, imageFile: imageFile ?? null, status, audienceNote: describeAudience(audience), ...settings, ...timing },
  });
  for (let i = 0; i < contacts.length; i += 1000)
    await prisma.blastRecipient.createMany({ data: contacts.slice(i, i + 1000).map((x) => ({ campaignId: c.id, contactId: x.id, nama: x.nama, noHp: x.noHp })), skipDuplicates: true });
  refresh();
  return {
    ok: `Kampanye "${name}" dibuat untuk ${contacts.length.toLocaleString("id-ID")} kontak${status === "RUNNING" ? " dan mulai dikirim bertahap" : status === "SCHEDULED" ? " dan dijadwalkan" : " (draf)"}.`,
    id: c.id,
    redirectTo: `${BASE}/kampanye/${c.id}`,
  };
}

async function removeImageIfUnused(name: string) {
  const used = await prisma.blastCampaign.count({ where: { imageFile: name } });
  if (!used && /^[a-f0-9-]{36}\.(jpg|png)$/.test(name)) await fs.rm(path.join(BLAST_IMAGE_DIR, name), { force: true });
}

async function ownCampaign(meId: number, id: number) {
  return prisma.blastCampaign.findFirst({ where: { id: Number(id) || 0, ownerId: meId }, include: { sender: true } });
}

export async function campaignControlAction(id: number, op: "start" | "pause" | "resume" | "cancel" | "retry"): Promise<ActionResult> {
  const me = await requireBlaster();
  const c = await ownCampaign(me.userId, id);
  if (!c) return { error: "Kampanye tidak ditemukan." };
  const sender = c.sender ?? (await mySender(me.userId));
  const blocked = !sender ? "Tautkan nomor blast terlebih dahulu." : sender.restricted || sender.status === "BANNED" ? "Nomor blast sedang dibatasi/diblokir WhatsApp." : null;

  if (op === "start" || op === "resume") {
    if (!["DRAFT", "PAUSED", "SCHEDULED"].includes(c.status)) return { error: "Kampanye tidak bisa dijalankan dari status ini." };
    if (blocked) return { error: blocked };
    await prisma.blastCampaign.update({ where: { id: c.id }, data: { status: "RUNNING", pauseReason: null, scheduledAt: null, startedAt: c.startedAt ?? new Date(), senderId: sender!.id } });
    refresh();
    return { ok: sender!.status === "CONNECTED" ? "Kampanye berjalan. Pesan dikirim bertahap sesuai jeda & jam kirim." : "Kampanye berjalan, tetapi nomor blast belum tersambung — pengiriman menunggu nomor tersambung." };
  }
  if (op === "pause") {
    if (!["RUNNING", "SCHEDULED"].includes(c.status)) return { error: "Kampanye tidak sedang berjalan." };
    await prisma.blastCampaign.update({ where: { id: c.id }, data: { status: "PAUSED", pauseReason: `Dijeda oleh ${me.name}` } });
    refresh();
    return { ok: "Kampanye dijeda. Pesan yang sedang di antrean tetap terkirim." };
  }
  if (op === "cancel") {
    if (["COMPLETED", "CANCELLED"].includes(c.status)) return { error: "Kampanye sudah selesai." };
    await prisma.$transaction([
      prisma.blastRecipient.updateMany({ where: { campaignId: c.id, status: "PENDING" }, data: { status: "SKIPPED", error: "Kampanye dibatalkan" } }),
      prisma.blastCampaign.update({ where: { id: c.id }, data: { status: "CANCELLED", finishedAt: new Date(), pauseReason: `Dibatalkan oleh ${me.name}` } }),
    ]);
    refresh();
    return { ok: "Kampanye dibatalkan. Sisa penerima tidak akan dikirimi." };
  }
  // retry: kirim ulang yang gagal (kecuali nomor tidak terdaftar WA)
  if (c.status === "CANCELLED") return { error: "Kampanye sudah dibatalkan." };
  const r = await prisma.blastRecipient.updateMany({
    where: { campaignId: c.id, status: "FAILED", NOT: { error: "Nomor tidak terdaftar di WhatsApp" } },
    data: { status: "PENDING", error: null, queuedAt: null, text: null },
  });
  if (!r.count) return { error: "Tidak ada kiriman gagal yang bisa diulang (nomor tanpa WhatsApp tidak dikirim ulang)." };
  if (c.status === "COMPLETED") await prisma.blastCampaign.update({ where: { id: c.id }, data: { status: blocked ? "PAUSED" : "RUNNING", finishedAt: null, pauseReason: blocked } });
  refresh();
  return { ok: `${r.count} penerima dijadwalkan kirim ulang.` };
}

export async function duplicateCampaignAction(id: number): Promise<ActionResult> {
  const me = await requireBlaster();
  const c = await ownCampaign(me.userId, id);
  if (!c) return { error: "Kampanye tidak ditemukan." };
  // penerima yang kini berhenti berlangganan / tidak punya WA tidak ikut disalin
  const recips = await prisma.blastRecipient.findMany({
    where: { campaignId: c.id, NOT: [{ contact: { optOut: true } }, { contact: { waStatus: "INVALID" } }] },
    select: { contactId: true, nama: true, noHp: true },
  });
  const copy = await prisma.blastCampaign.create({
    data: {
      ownerId: me.userId,
      senderId: c.senderId,
      name: `${c.name} (salinan)`.slice(0, 160),
      message: c.message,
      imageFile: c.imageFile,
      audienceNote: c.audienceNote,
      delayMin: c.delayMin,
      delayMax: c.delayMax,
      batchSize: c.batchSize,
      batchRestMin: c.batchRestMin,
      hourStart: c.hourStart,
      hourEnd: c.hourEnd,
      dailyLimit: c.dailyLimit,
    },
  });
  for (let i = 0; i < recips.length; i += 1000) await prisma.blastRecipient.createMany({ data: recips.slice(i, i + 1000).map((r) => ({ ...r, campaignId: copy.id })), skipDuplicates: true });
  refresh();
  return { ok: `Disalin sebagai draf "${copy.name}".`, id: copy.id, redirectTo: `${BASE}/kampanye/${copy.id}` };
}

export async function deleteCampaignAction(id: number): Promise<ActionResult> {
  const me = await requireBlaster();
  const c = await ownCampaign(me.userId, id);
  if (!c) return { error: "Kampanye tidak ditemukan." };
  if (c.status === "RUNNING") return { error: "Jeda atau batalkan kampanye terlebih dahulu." };
  await prisma.blastCampaign.delete({ where: { id: c.id } });
  if (c.imageFile) await removeImageIfUnused(c.imageFile);
  refresh();
  return { ok: `Kampanye "${c.name}" dihapus. Data Blast tetap tersimpan.`, redirectTo: `${BASE}/kampanye` };
}

/** Kirim satu pesan uji ke nomor admin sendiri (pakai contoh kontak pertama audiens). */
export async function testSendAction(form: FormData): Promise<ActionResult> {
  const me = await requireBlaster();
  const limited = await limitAction("blast-test", me.userId, 5, 10 * 60_000);
  if (limited) return { error: limited };
  const phone = normalizePhone(str(form, "testPhone"));
  const message = String(form.get("message") ?? "").replace(/\r\n/g, "\n").trim();
  if (!phone || phone.length < 10 || phone.length > 15) return { error: "Nomor uji tidak valid." };
  if (!message) return { error: "Isi pesan masih kosong." };
  const sender = await mySender(me.userId);
  if (!sender || sender.status !== "CONNECTED") return { error: "Nomor blast belum tersambung." };
  const sample = await prisma.blastContact.findFirst({ where: audienceWhere(me.userId, readAudience(form)), orderBy: { id: "asc" } });
  const text = renderMessage(message, sample ?? { nama: me.name });
  const campaignId = Number(form.get("id")) || 0;
  let image = null;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    if (file.size > 1024 * 1024) return { error: "Ukuran gambar maksimal 1 MB." };
    image = { data: Buffer.from(await file.arrayBuffer()).toString("base64"), mime: file.type === "image/png" ? "image/png" : "image/jpeg" };
  } else if (campaignId && form.get("removeImage") !== "1") {
    const c = await prisma.blastCampaign.findFirst({ where: { id: campaignId, ownerId: me.userId }, select: { imageFile: true } });
    const img = await readBlastImage(c?.imageFile);
    if (img) image = { data: img.buf.toString("base64"), mime: img.mime };
  }
  const g = await gateway(`/sessions/${blastGatewayId(sender.id)}/send`, { jid: `${phone}@s.whatsapp.net`, text, ref: "test", checkNumber: true, ...(image ? { image } : {}) });
  if (!g.ok) return { error: g.data.error ?? "Gagal mengirim pesan uji." };
  return { ok: `Pesan uji (contoh: ${sample?.nama ?? me.name}) masuk antrean ke ${phone}. Cek WhatsApp dalam ±10 detik.` };
}

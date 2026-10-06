"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { optInt, optStr, str } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";
import { removeTutorPhoto, saveTutorPhoto } from "@/lib/storage";
import { readTutorFilters, tutorWhere } from "@/lib/tutor-filters";
import { logActivity } from "@/lib/activity";

function revalidateTutor() {
  revalidatePath("/admin/tutor");
  revalidatePath("/tutor");
  revalidatePath("/kelas", "layout");
  revalidatePath("/dashboard", "layout");
}

/** Teks daftar (satu poin per baris): rapikan spasi & buang baris kosong. */
function listText(form: FormData, key: string) {
  const lines = str(form, key)
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

export async function saveTutorAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const id = optInt(form, "id");
  const nama = str(form, "nama");
  if (nama.length < 3) return { fieldErrors: { nama: ["Nama minimal 3 karakter"] } };

  const existing = id ? await prisma.tutor.findUnique({ where: { id } }) : null;
  if (id && !existing) return { error: "Data tutor tidak ditemukan." };

  let foto = existing?.foto ?? null;
  const file = form.get("foto");
  if (file instanceof File && file.size > 0) {
    try {
      foto = await saveTutorPhoto(file);
    } catch (e) {
      return { fieldErrors: { foto: [(e as Error).message] } };
    }
  } else if (form.get("hapusFoto") === "1") {
    foto = null;
  }

  const data = {
    nama,
    foto,
    bidang: optStr(form, "bidang"),
    pengalaman: listText(form, "pengalaman"),
    prestasi: listText(form, "prestasi"),
    riwayatPendidikan: listText(form, "riwayatPendidikan"),
    isPublished: form.get("isPublished") === "1",
    urutan: optInt(form, "urutan") ?? 0,
  };

  // Kelas yang dipegang: hanya id kelas yang benar-benar ada
  const wanted = [
    ...new Set(
      form
        .getAll("classIds")
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].slice(0, 200);
  const valid = wanted.length ? await prisma.product.findMany({ where: { id: { in: wanted } }, select: { id: true } }) : [];
  const classes = valid.map((p) => ({ id: p.id }));

  let savedId = existing?.id ?? 0;
  try {
    if (existing) await prisma.tutor.update({ where: { id: existing.id }, data: { ...data, classes: { set: classes } } });
    else savedId = (await prisma.tutor.create({ data: { ...data, classes: { connect: classes } } })).id;
  } catch {
    if (foto && foto !== existing?.foto) await removeTutorPhoto(foto); // jangan tinggalkan file yatim
    return { error: "Gagal menyimpan data tutor. Coba lagi." };
  }
  // foto lama diganti / dihapus → bersihkan filenya
  if (existing?.foto && existing.foto !== foto) await removeTutorPhoto(existing.foto);

  await logActivity({ entity: "TUTOR", action: existing ? "UPDATE" : "CREATE", entityId: savedId, label: nama });
  revalidateTutor();
  return { ok: existing ? `Profil tutor "${nama}" diperbarui.` : `Tutor "${nama}" ditambahkan.` };
}

export async function deleteTutorAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const t = await prisma.tutor.delete({ where: { id } }).catch(() => null);
  if (!t) return { error: "Tutor tidak ditemukan atau sudah dihapus." };
  await removeTutorPhoto(t.foto);
  await logActivity({ entity: "TUTOR", action: "DELETE", entityId: t.id, label: t.nama });
  revalidateTutor();
  return { ok: `Tutor "${t.nama}" dihapus.` };
}

const MAX_BULK_TUTORS = 100;

async function removeTutors(ids: number[]): Promise<ActionResult> {
  const rows = await prisma.tutor.findMany({ where: { id: { in: ids } }, select: { id: true, foto: true, nama: true } });
  if (!rows.length) return { error: "Tutor tidak ditemukan atau sudah dihapus." };
  const r = await prisma.tutor.deleteMany({ where: { id: { in: rows.map((t) => t.id) } } });
  await Promise.all(rows.map((t) => removeTutorPhoto(t.foto)));
  await logActivity({ entity: "TUTOR", action: "DELETE", count: r.count, label: rows.map((t) => t.nama).join(", ") });
  revalidateTutor();
  return { ok: `${r.count} tutor dihapus.` };
}

/** Hapus tutor terpilih (centang) beserta fotonya */
export async function deleteTutorsAction(ids: number[]): Promise<ActionResult> {
  await requirePanel();
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!clean.length) return { error: "Tidak ada tutor yang dipilih." };
  if (clean.length > MAX_BULK_TUTORS) return { error: `Maksimal ${MAX_BULK_TUTORS} tutor sekali hapus.` };
  return removeTutors(clean);
}

/** Hapus SEMUA tutor yang cocok dengan pencarian/filter aktif */
export async function deleteTutorsByFilterAction(query: string, expected: number): Promise<ActionResult> {
  await requirePanel();
  const params = new URLSearchParams(query);
  const rows = await prisma.tutor.findMany({ where: tutorWhere(readTutorFilters((k) => params.get(k))), select: { id: true } });
  if (!rows.length) return { error: "Tidak ada tutor yang cocok dengan filter." };
  // pengaman: data berubah sejak halaman dibuka → minta muat ulang
  if (rows.length !== expected) return { error: `Jumlah tutor berubah (${expected} → ${rows.length}). Muat ulang halaman lalu coba lagi.` };
  if (rows.length > MAX_BULK_TUTORS) return { error: `Maksimal ${MAX_BULK_TUTORS} tutor sekali hapus. Persempit filter terlebih dahulu.` };
  return removeTutors(rows.map((r) => r.id));
}

export async function toggleTutorPublishAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const t = await prisma.tutor.findUnique({ where: { id }, select: { isPublished: true, nama: true } });
  if (!t) return { error: "Tutor tidak ditemukan." };
  await prisma.tutor.update({ where: { id }, data: { isPublished: !t.isPublished } });
  await logActivity({ entity: "TUTOR", action: t.isPublished ? "UNPUBLISH" : "PUBLISH", entityId: id, label: t.nama });
  revalidateTutor();
  return { ok: t.isPublished ? `"${t.nama}" disembunyikan dari halaman publik.` : `"${t.nama}" kini tampil di halaman publik.` };
}

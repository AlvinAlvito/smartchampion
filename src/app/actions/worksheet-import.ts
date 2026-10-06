"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { optInt, str } from "@/lib/utils";
import { limitAction } from "@/lib/security";
import { latexErrors } from "@/lib/latex";
import { questionImageUrls } from "@/lib/rich-text";
import { fillImages, MAX_DOCX_BYTES, parseWorksheetDocx } from "@/lib/worksheet-docx";
import { readWorksheetPdfConfig } from "@/lib/worksheet-pdf-config";
import { logActivity } from "@/lib/activity";
import { removeWorksheetImage, removeWorksheetPdfBackground, saveWorksheetImageBuffer, saveWorksheetPdfBackground } from "@/lib/storage";

export type ImportPreviewQuestion = {
  no: number;
  text: string;
  options: string[];
  answerIndex: number;
  points: number;
  explanation: string | null;
  issues: string[];
  valid: boolean;
};
export type WorksheetImportState = {
  error?: string;
  ok?: string;
  preview?: { questions: ImportPreviewQuestion[]; warnings: string[]; validCount: number; existing: number; hasAttempts: boolean };
};

const MAX_PREVIEW_IMG = 600 * 1024;

function revalidate(productId: number, sessionId: number, slug: string) {
  revalidatePath(`/admin/produk/${productId}`);
  revalidatePath(`/admin/produk/${productId}/pertemuan/${sessionId}`);
  revalidatePath(`/dashboard/kelas/${slug}`, "layout");
}

/**
 * Impor soal dari Word. mode=preview → hanya dibaca & ditampilkan (gambar sebagai data sementara);
 * mode=commit → gambar disimpan & soal valid ditambahkan (replace=1 → ganti semua soal lama).
 */
export async function importWorksheetDocxAction(_prev: WorksheetImportState | undefined, form: FormData): Promise<WorksheetImportState> {
  const me = await requirePanel();
  const limited = await limitAction("ws-import", me.userId, 30, 10 * 60_000);
  if (limited) return { error: limited };
  const s = await prisma.classSession.findUnique({ where: { id: optInt(form, "sessionId") ?? 0 }, include: { product: { select: { id: true, slug: true, name: true } } } });
  if (!s) return { error: "Pertemuan tidak ditemukan." };
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Pilih file Word (.docx) yang sudah diisi." };
  if (!/\.docx$/i.test(file.name)) return { error: "File harus berformat .docx (Word). File .doc lama: buka di Word lalu Save As .docx." };
  if (file.size > MAX_DOCX_BYTES) return { error: "Ukuran file maksimal 10 MB." };

  let parsed;
  try {
    parsed = await parseWorksheetDocx(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return { error: (e as Error).message || "File tidak terbaca." };
  }
  // cek rumus LaTeX per soal
  for (const q of parsed.questions) {
    const bad = [q.text, ...q.options, q.explanation ?? ""].flatMap((t) => latexErrors(t));
    if (bad.length) q.issues.push(`rumus perlu dicek: ${bad[0]}`);
  }
  const [existing, attempts] = await Promise.all([
    prisma.worksheetQuestion.count({ where: { sessionId: s.id } }),
    prisma.worksheetAttempt.count({ where: { sessionId: s.id } }),
  ]);
  const valid = parsed.questions.filter((q) => q.valid);

  if (form.get("mode") !== "commit") {
    const dataUrls = parsed.images.map((img) =>
      img.data.length <= MAX_PREVIEW_IMG ? `data:image/${img.ext === "jpg" ? "jpeg" : img.ext};base64,${img.data.toString("base64")}` : null,
    );
    const fill = (t: string) => fillImages(t, dataUrls);
    return {
      preview: {
        questions: parsed.questions.map((q) => ({
          ...q,
          text: fill(q.text),
          options: q.options.map(fill),
          explanation: q.explanation ? fill(q.explanation) : null,
        })),
        warnings: parsed.warnings,
        validCount: valid.length,
        existing,
        hasAttempts: attempts > 0,
      },
    };
  }

  if (!valid.length) return { error: "Tidak ada soal valid untuk diimpor." };
  const replace = form.get("replace") === "1";
  if (replace && attempts > 0)
    return { error: 'Sudah ada peserta yang mengerjakan worksheet ini — soal lama tidak bisa diganti. Pilih "Tambahkan" atau reset pengerjaan dulu.' };

  // simpan hanya gambar yang dipakai soal valid
  const used = new Set(
    valid.flatMap((q) => [q.text, q.explanation ?? "", ...q.options].flatMap((t) => [...t.matchAll(/@@IMG(\d+)@@/g)].map((m) => Number(m[1])))),
  );
  const urls: (string | null)[] = parsed.images.map(() => null);
  const saved: string[] = [];
  try {
    for (const i of used) {
      urls[i] = await saveWorksheetImageBuffer(parsed.images[i].data);
      saved.push(urls[i]!);
    }
    const old = replace ? await prisma.worksheetQuestion.findMany({ where: { sessionId: s.id } }) : [];
    const last = replace ? null : await prisma.worksheetQuestion.findFirst({ where: { sessionId: s.id }, orderBy: { order: "desc" }, select: { order: true } });
    const base = last?.order ?? 0;
    const fill = (t: string) => fillImages(t, urls);
    await prisma.$transaction([
      ...(replace ? [prisma.worksheetQuestion.deleteMany({ where: { sessionId: s.id } })] : []),
      prisma.worksheetQuestion.createMany({
        data: valid.map((q, i) => ({
          sessionId: s.id,
          text: fill(q.text).slice(0, 20000),
          options: q.options.map(fill) as Prisma.InputJsonValue,
          answerIndex: q.answerIndex,
          points: q.points,
          explanation: q.explanation ? fill(q.explanation).slice(0, 10000) : null,
          order: base + i + 1,
        })),
      }),
    ]);
    if (replace) await Promise.all(old.flatMap((q) => questionImageUrls(q)).map((u) => removeWorksheetImage(u)));
  } catch (e) {
    // gagal di tengah jalan → gambar yang sudah tersimpan dibersihkan
    await Promise.all(saved.map((u) => removeWorksheetImage(u)));
    console.error("[ws-import]", e);
    return { error: "Gagal menyimpan soal. Coba lagi." };
  }
  await logActivity({ entity: "WORKSHEET", action: "IMPORT", entityId: s.id, productId: s.productId, label: `${s.product.name} · ${s.title}`, count: valid.length, detail: "impor Word" });
  revalidate(s.productId, s.id, s.product.slug);
  const skipped = parsed.questions.length - valid.length;
  return {
    ok: `${valid.length} soal ${replace ? "menggantikan soal lama" : "ditambahkan"}${skipped ? ` · ${skipped} soal tidak valid dilewati` : ""}. Periksa lalu terbitkan worksheet.`,
  };
}

/** Desain PDF Soal & Pembahasan (per kelas): gambar latar + margin + kertas */
export async function saveWorksheetPdfDesignAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const product = await prisma.product.findUnique({ where: { id: optInt(form, "productId") ?? 0 }, select: { id: true, slug: true, worksheetPdfBg: true } });
  if (!product) return { error: "Kelas tidak ditemukan." };
  let bg = product.worksheetPdfBg;
  const file = form.get("background");
  if (file instanceof File && file.size > 0) {
    try {
      bg = await saveWorksheetPdfBackground(file);
    } catch (e) {
      return { fieldErrors: { background: [(e as Error).message] } };
    }
    await removeWorksheetPdfBackground(product.worksheetPdfBg);
  } else if (form.get("removeBackground") === "1") {
    await removeWorksheetPdfBackground(product.worksheetPdfBg);
    bg = null;
  }
  const config = readWorksheetPdfConfig({
    marginTop: str(form, "marginTop"),
    marginBottom: str(form, "marginBottom"),
    marginLeft: str(form, "marginLeft"),
    marginRight: str(form, "marginRight"),
    paper: form.get("paper") === "1",
  });
  await prisma.product.update({ where: { id: product.id }, data: { worksheetPdfBg: bg, worksheetPdfConfig: config as unknown as Prisma.InputJsonValue } });
  await logActivity({ entity: "WORKSHEET", action: "UPDATE", productId: product.id, detail: "desain PDF worksheet" });
  revalidatePath(`/admin/produk/${product.id}`, "layout");
  return { ok: "Desain PDF disimpan — berlaku untuk semua pertemuan di kelas ini. Klik Pratinjau PDF untuk melihat hasilnya." };
}

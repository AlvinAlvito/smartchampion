"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import type { ActionResult } from "@/lib/action-result";

/** Nilai 0–100 (boleh desimal 1 angka); kosong → null (hapus) */
function parseScore(v: unknown): number | null | "invalid" {
  const raw = String(v ?? "")
    .trim()
    .replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return "invalid";
  return Math.round(n * 10) / 10;
}

async function paidMember(productId: number, userId: number) {
  return (await prisma.registration.count({ where: { productId, userId, status: "PAID" } })) > 0;
}

function revalidate(productId: number, sessionId?: number) {
  revalidatePath(`/admin/produk/${productId}/rekap`);
  revalidatePath(`/admin/produk/${productId}/kelulusan`);
  if (sessionId) revalidatePath(`/admin/produk/${productId}/pertemuan/${sessionId}`);
  revalidatePath("/dashboard", "layout");
}

/**
 * Nilai manual satu peserta di satu pertemuan (menggantikan nilai otomatis worksheet di rekap, rapor & sertifikat).
 * score kosong → nilai manual dihapus, kembali memakai nilai worksheet.
 */
export async function saveMeetingScoreAction(input: {
  productId: number;
  sessionId: number;
  userId: number;
  score: string;
  note?: string;
}): Promise<ActionResult> {
  const me = await requirePanel();
  const productId = Number(input.productId) || 0;
  const sessionId = Number(input.sessionId) || 0;
  const userId = Number(input.userId) || 0;
  const session = await prisma.classSession.findFirst({ where: { id: sessionId, productId }, select: { id: true, title: true } });
  if (!session) return { error: "Pertemuan tidak ditemukan di kelas ini." };
  if (!(await paidMember(productId, userId))) return { error: "Peserta tidak terdaftar lunas di kelas ini." };
  const score = parseScore(input.score);
  if (score === "invalid") return { fieldErrors: { score: ["Nilai harus angka 0–100."] } };
  const note =
    String(input.note ?? "")
      .trim()
      .slice(0, 255) || null;

  if (score == null) {
    await prisma.meetingScore.deleteMany({ where: { sessionId, userId } });
    await logActivity({ entity: "SCORE", action: "DELETE", entityId: sessionId, productId, label: session.title });
    revalidate(productId, sessionId);
    return { ok: "Nilai manual dihapus — kembali memakai nilai worksheet." };
  }
  await prisma.meetingScore.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    create: { sessionId, userId, score, note, updatedBy: me.name.slice(0, 120) },
    update: { score, note, updatedBy: me.name.slice(0, 120) },
  });
  await logActivity({ entity: "SCORE", action: "UPDATE", entityId: sessionId, productId, label: session.title });
  revalidate(productId, sessionId);
  return { ok: `Nilai ${score} disimpan untuk ${session.title}.` };
}

/** Nilai Try Out Mimpi.mu (setelah pelatihan) — ikut dirata-rata sebagai satu nilai. Kosong → dihapus. */
export async function saveTryoutScoreAction(input: { productId: number; userId: number; score: string; note?: string }): Promise<ActionResult> {
  await requirePanel();
  const productId = Number(input.productId) || 0;
  const userId = Number(input.userId) || 0;
  if (!(await prisma.product.count({ where: { id: productId } }))) return { error: "Kelas tidak ditemukan." };
  if (!(await paidMember(productId, userId))) return { error: "Peserta tidak terdaftar lunas di kelas ini." };
  const score = parseScore(input.score);
  if (score === "invalid") return { fieldErrors: { score: ["Nilai harus angka 0–100."] } };
  const note =
    String(input.note ?? "")
      .trim()
      .slice(0, 255) || null;
  await prisma.classResult.upsert({
    where: { productId_userId: { productId, userId } },
    create: { productId, userId, tryoutScore: score, tryoutNote: score == null ? null : note },
    update: { tryoutScore: score, tryoutNote: score == null ? null : note },
  });
  await logActivity({ entity: "SCORE", action: score == null ? "DELETE" : "UPDATE", productId, label: "Try Out Mimpi.mu" });
  revalidate(productId);
  return { ok: score == null ? "Nilai Try Out dihapus." : `Nilai Try Out ${score} disimpan.` };
}

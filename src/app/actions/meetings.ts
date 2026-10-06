"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePanel, requireUser } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { optInt, optStr, parseWibDate, str } from "@/lib/utils";
import { removeWorksheetImage, saveWorksheetImage } from "@/lib/storage";
import { questionImageUrls } from "@/lib/rich-text";
import { latexErrors } from "@/lib/latex";
import { limitAction } from "@/lib/security";
import { GroqError, groqConfigured } from "@/lib/groq";
import { AI_MAX_QUESTIONS, DIFFICULTIES, generateQuestions, type Difficulty, type GeneratedQuestion } from "@/lib/ai-questions";
import { ATTENDANCE_STATUS, canSelfCheckIn, gradeOf, worksheetOpen } from "@/lib/worksheet-shared";
import { logActivity } from "@/lib/activity";

/* ------------------------------------------------------------------ */
/* helper                                                              */
/* ------------------------------------------------------------------ */

async function sessionWithProduct(sessionId: number) {
  if (!Number.isInteger(sessionId) || sessionId <= 0) return null;
  return prisma.classSession.findUnique({
    where: { id: sessionId },
    include: { product: { select: { id: true, slug: true, name: true, bidang: true, jenjang: true } } },
  });
}

function revalidateMeeting(productId: number, sessionId?: number, slug?: string) {
  revalidatePath(`/admin/produk/${productId}`);
  if (sessionId) revalidatePath(`/admin/produk/${productId}/pertemuan/${sessionId}`);
  revalidatePath(`/admin/produk/${productId}/rekap`);
  if (slug) revalidatePath(`/dashboard/kelas/${slug}`, "layout");
  revalidatePath("/dashboard");
}

const isPaid = (userId: number, productId: number) => prisma.registration.count({ where: { userId, productId, status: "PAID" } }).then((n) => n > 0);

/* ------------------------------------------------------------------ */
/* Admin: pertemuan                                                    */
/* ------------------------------------------------------------------ */

/** Buat beberapa pertemuan sekaligus (mis. 8x tiap minggu di jam yang sama). */
export async function createSessionsBulkAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const productId = optInt(form, "productId");
  const count = optInt(form, "count") ?? 0;
  const firstStart = parseWibDate(form.get("firstStart"));
  const duration = optInt(form, "duration") ?? 90;
  const interval = optInt(form, "interval") ?? 7;
  const prefix = str(form, "prefix") || "Pertemuan";
  const fe: Record<string, string[]> = {};
  if (count < 1 || count > 40) fe.count = ["Isi 1–40 pertemuan"];
  if (!firstStart) fe.firstStart = ["Isi tanggal & jam pertemuan pertama"];
  if (duration < 15 || duration > 600) fe.duration = ["Durasi 15–600 menit"];
  if (interval < 1 || interval > 60) fe.interval = ["Jarak 1–60 hari"];
  if (!productId) return { error: "Kelas tidak valid." };
  if (Object.keys(fe).length) return { fieldErrors: fe };
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, slug: true, name: true, _count: { select: { sessions: true } } } });
  if (!product) return { error: "Kelas tidak ditemukan." };
  const startNo = product._count.sessions + 1;
  const DAY = 86_400_000;
  await prisma.classSession.createMany({
    data: Array.from({ length: count }, (_, i) => {
      const startAt = new Date(firstStart!.getTime() + i * interval * DAY);
      return { productId, title: `${prefix} ${startNo + i}`, startAt, endAt: new Date(startAt.getTime() + duration * 60_000) };
    }),
  });
  await logActivity({ entity: "SESSION", action: "CREATE", productId, label: product.name, count, detail: "jadwal massal" });
  revalidateMeeting(productId, undefined, product.slug);
  return { ok: `${count} pertemuan dibuat (Pertemuan ${startNo}–${startNo + count - 1}).` };
}

/* ------------------------------------------------------------------ */
/* Admin: worksheet                                                    */
/* ------------------------------------------------------------------ */

export async function saveWorksheetSettingsAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const s = await sessionWithProduct(optInt(form, "sessionId") ?? 0);
  if (!s) return { error: "Pertemuan tidak ditemukan." };
  const published = form.get("published") === "1";
  const dueAt = parseWibDate(form.get("dueAt"));
  if (published && !(await prisma.worksheetQuestion.count({ where: { sessionId: s.id } })))
    return { error: "Tambahkan minimal 1 soal sebelum menerbitkan worksheet." };
  await prisma.classSession.update({ where: { id: s.id }, data: { worksheetPublished: published, worksheetDueAt: dueAt } });
  if (published !== s.worksheetPublished)
    await logActivity({ entity: "WORKSHEET", action: published ? "PUBLISH" : "UNPUBLISH", entityId: s.id, productId: s.productId, label: `${s.product.name} · ${s.title}` });
  revalidateMeeting(s.productId, s.id, s.product.slug);
  return { ok: published ? "Worksheet diterbitkan untuk peserta." : "Pengaturan worksheet disimpan (belum tampil ke peserta)." };
}

function readOptions(form: FormData) {
  const options: string[] = [];
  for (let i = 0; i < 5; i++) {
    const v = str(form, `option${i}`);
    if (v) options.push(v.slice(0, 1000));
  }
  return options;
}

export async function saveWorksheetQuestionAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const s = await sessionWithProduct(optInt(form, "sessionId") ?? 0);
  if (!s) return { error: "Pertemuan tidak ditemukan." };
  const id = optInt(form, "id");
  const text = str(form, "text").slice(0, 20000);
  // opsi kosong di tengah dilewati → indeks jawaban disesuaikan
  const raw = Array.from({ length: 5 }, (_, i) => str(form, `option${i}`));
  const answerRaw = optInt(form, "answerIndex") ?? 0;
  const options = readOptions(form);
  const answerIndex = raw[answerRaw] ? raw.slice(0, answerRaw).filter(Boolean).length : -1;
  const points = Math.min(1000, Math.max(1, optInt(form, "points") ?? 10));
  const explanation = optStr(form, "explanation")?.slice(0, 10000) ?? null;

  const fe: Record<string, string[]> = {};
  if (text.length < 3) fe.text = ["Pertanyaan wajib diisi"];
  if (options.length < 2) fe.option1 = ["Isi minimal 2 opsi jawaban"];
  else if (answerIndex < 0) fe.answerIndex = ["Tandai jawaban benar pada opsi yang terisi"];
  const bad = [text, ...options, explanation ?? ""].flatMap((t) => latexErrors(t));
  if (bad.length) fe.text = [...(fe.text ?? []), `Rumus LaTeX belum benar: ${bad[0]}`];
  if (Object.keys(fe).length) return { fieldErrors: fe };

  const existing = id ? await prisma.worksheetQuestion.findFirst({ where: { id, sessionId: s.id } }) : null;
  if (id && !existing) return { error: "Soal tidak ditemukan." };
  let imageUrl = existing?.imageUrl ?? null;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    try {
      imageUrl = await saveWorksheetImage(file);
    } catch (e) {
      return { fieldErrors: { image: [(e as Error).message] } };
    }
    if (existing?.imageUrl) await removeWorksheetImage(existing.imageUrl);
  } else if (form.get("removeImage") === "1" && existing?.imageUrl) {
    await removeWorksheetImage(existing.imageUrl);
    imageUrl = null;
  }

  const data = { text, options, answerIndex, points, explanation, imageUrl };
  if (existing) {
    await prisma.worksheetQuestion.update({ where: { id: existing.id }, data });
    // gambar sisipan yang dihapus dari teks → bersihkan filenya
    const before = questionImageUrls(existing);
    const after = new Set(questionImageUrls(data));
    await Promise.all(before.filter((u) => !after.has(u)).map((u) => removeWorksheetImage(u)));
  } else {
    const last = await prisma.worksheetQuestion.findFirst({ where: { sessionId: s.id }, orderBy: { order: "desc" }, select: { order: true } });
    await prisma.worksheetQuestion.create({ data: { ...data, sessionId: s.id, order: (last?.order ?? 0) + 1 } });
  }
  await logActivity({ entity: "WORKSHEET", action: existing ? "UPDATE" : "CREATE", entityId: s.id, productId: s.productId, label: `${s.product.name} · ${s.title}` });
  revalidateMeeting(s.productId, s.id, s.product.slug);
  return { ok: existing ? "Soal diperbarui." : "Soal ditambahkan." };
}

export async function deleteWorksheetQuestionAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const q = await prisma.worksheetQuestion.findUnique({ where: { id: Number(id) || 0 }, include: { session: { select: { id: true, productId: true, title: true } } } });
  if (!q) return { error: "Soal tidak ditemukan." };
  await prisma.worksheetQuestion.delete({ where: { id: q.id } });
  await Promise.all(questionImageUrls(q).map((u) => removeWorksheetImage(u)));
  const left = await prisma.worksheetQuestion.count({ where: { sessionId: q.sessionId } });
  if (!left) await prisma.classSession.update({ where: { id: q.sessionId }, data: { worksheetPublished: false } });
  await logActivity({ entity: "WORKSHEET", action: "DELETE", entityId: q.sessionId, productId: q.session.productId, label: q.session.title });
  revalidateMeeting(q.session.productId, q.sessionId);
  return { ok: left ? "Soal dihapus." : "Soal dihapus. Worksheet ditarik karena tidak ada soal lagi." };
}

export async function moveWorksheetQuestionAction(id: number, dir: -1 | 1): Promise<ActionResult> {
  await requirePanel();
  const q = await prisma.worksheetQuestion.findUnique({ where: { id: Number(id) || 0 } });
  if (!q) return { error: "Soal tidak ditemukan." };
  const all = await prisma.worksheetQuestion.findMany({ where: { sessionId: q.sessionId }, orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true } });
  const i = all.findIndex((x) => x.id === q.id);
  const j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= all.length) return { ok: "" };
  [all[i], all[j]] = [all[j], all[i]];
  await prisma.$transaction(all.map((x, k) => prisma.worksheetQuestion.update({ where: { id: x.id }, data: { order: k + 1 } })));
  const s = await prisma.classSession.findUnique({ where: { id: q.sessionId }, select: { productId: true } });
  if (s) revalidateMeeting(s.productId, q.sessionId);
  return { ok: "" };
}

export type WsAiResult = ActionResult & { questions?: GeneratedQuestion[] };

export async function generateWorksheetQuestionsAction(input: {
  sessionId: number;
  count: number;
  optionCount: number;
  difficulty: string;
  instructions: string;
}): Promise<WsAiResult> {
  const session = await requirePanel();
  const limited = await limitAction("ai-generate", session.userId, 15, 10 * 60_000);
  if (limited) return { error: limited };
  if (!groqConfigured()) return { error: "Fitur AI belum aktif: GROQ_API_KEY belum diisi di .env." };
  const s = await sessionWithProduct(Number(input.sessionId) || 0);
  if (!s) return { error: "Pertemuan tidak ditemukan." };
  const existing = await prisma.worksheetQuestion.findMany({ where: { sessionId: s.id }, select: { text: true }, take: 60 });
  const count = Math.min(AI_MAX_QUESTIONS, Math.max(1, Math.round(Number(input.count) || 10)));
  try {
    const { questions } = await generateQuestions({
      kind: "worksheet",
      title: `${s.product.name} — ${s.title}`,
      subject: s.product.bidang,
      jenjang: s.product.jenjang,
      description: s.notes ?? "",
      count,
      optionCount: Math.min(5, Math.max(3, Math.round(Number(input.optionCount) || 4))),
      difficulty: (input.difficulty in DIFFICULTIES ? input.difficulty : "campuran") as Difficulty,
      instructions: String(input.instructions ?? "")
        .trim()
        .slice(0, 1000),
      existing: existing.map((q) => q.text),
    });
    if (!questions.length) return { error: "AI tidak menghasilkan soal yang valid. Coba ubah instruksi lalu generate ulang." };
    const note = questions.length < count ? ` (${count - questions.length} soal disaring karena tidak valid/rumus rusak/duplikat)` : "";
    return { ok: `${questions.length} soal siap ditinjau${note}.`, questions };
  } catch (e) {
    if (e instanceof GroqError) return { error: e.message };
    console.error("[ai-worksheet]", e);
    return { error: "Gagal membuat soal dengan AI. Coba lagi." };
  }
}

export async function saveGeneratedWorksheetQuestionsAction(sessionId: number, questions: GeneratedQuestion[], points: number): Promise<ActionResult> {
  await requirePanel();
  const s = await sessionWithProduct(Number(sessionId) || 0);
  if (!s) return { error: "Pertemuan tidak ditemukan." };
  const clean = (Array.isArray(questions) ? questions : [])
    .slice(0, AI_MAX_QUESTIONS)
    .map((q) => ({
      text: String(q.text ?? "")
        .trim()
        .slice(0, 5000),
      options: (Array.isArray(q.options) ? q.options : [])
        .map((o) => String(o).trim().slice(0, 1000))
        .filter(Boolean)
        .slice(0, 5),
      answerIndex: Number(q.answerIndex),
      explanation:
        String(q.explanation ?? "")
          .trim()
          .slice(0, 3000) || null,
    }))
    .filter((q) => q.text.length >= 3 && q.options.length >= 2 && Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.options.length);
  if (!clean.length) return { error: "Tidak ada soal yang dipilih." };
  const pts = Math.min(1000, Math.max(1, Math.round(Number(points) || 10)));
  const last = await prisma.worksheetQuestion.findFirst({ where: { sessionId: s.id }, orderBy: { order: "desc" }, select: { order: true } });
  await prisma.worksheetQuestion.createMany({ data: clean.map((q, i) => ({ ...q, sessionId: s.id, points: pts, order: (last?.order ?? 0) + i + 1 })) });
  await logActivity({ entity: "WORKSHEET", action: "GENERATE", entityId: s.id, productId: s.productId, label: `${s.product.name} · ${s.title}`, count: clean.length });
  revalidateMeeting(s.productId, s.id, s.product.slug);
  return { ok: `${clean.length} soal AI disimpan ke worksheet.` };
}

/** Hapus hasil peserta agar bisa mengerjakan ulang */
export async function resetAttemptAction(sessionId: number, userId: number): Promise<ActionResult> {
  await requirePanel();
  const s = await sessionWithProduct(Number(sessionId) || 0);
  if (!s) return { error: "Pertemuan tidak ditemukan." };
  const r = await prisma.worksheetAttempt.deleteMany({ where: { sessionId: s.id, userId: Number(userId) || 0 } });
  if (r.count) await logActivity({ entity: "WORKSHEET", action: "RESET", entityId: s.id, productId: s.productId, label: `${s.product.name} · ${s.title}`, detail: "hasil 1 peserta" });
  revalidateMeeting(s.productId, s.id, s.product.slug);
  return r.count ? { ok: "Nilai dihapus. Peserta bisa mengerjakan ulang worksheet ini." } : { error: "Peserta belum mengerjakan." };
}

/* ------------------------------------------------------------------ */
/* Admin: absensi (tanpa batas waktu)                                  */
/* ------------------------------------------------------------------ */

export async function setAttendanceAction(sessionId: number, userId: number, status: string): Promise<ActionResult> {
  const admin = await requirePanel();
  const s = await sessionWithProduct(Number(sessionId) || 0);
  if (!s) return { error: "Pertemuan tidak ditemukan." };
  const uid = Number(userId) || 0;
  if (!(await isPaid(uid, s.productId))) return { error: "Peserta tidak terdaftar lunas di kelas ini." };
  if (!status) {
    await prisma.attendance.deleteMany({ where: { sessionId: s.id, userId: uid } });
  } else {
    if (!(ATTENDANCE_STATUS as readonly string[]).includes(status)) return { error: "Status tidak valid." };
    await prisma.attendance.upsert({
      where: { sessionId_userId: { sessionId: s.id, userId: uid } },
      create: { sessionId: s.id, userId: uid, status, method: "ADMIN", markedById: admin.userId },
      update: { status, method: "ADMIN", markedById: admin.userId },
    });
  }
  await logActivity({ entity: "ATTENDANCE", action: "UPDATE", entityId: s.id, productId: s.productId, label: `${s.product.name} · ${s.title}` });
  revalidateMeeting(s.productId, s.id, s.product.slug);
  return { ok: "Absensi disimpan." };
}

/** Tandai semua peserta yang belum diabsen sebagai hadir */
export async function markAllPresentAction(sessionId: number): Promise<ActionResult> {
  const admin = await requirePanel();
  const s = await sessionWithProduct(Number(sessionId) || 0);
  if (!s) return { error: "Pertemuan tidak ditemukan." };
  const [regs, marked] = await Promise.all([
    prisma.registration.findMany({ where: { productId: s.productId, status: "PAID" }, select: { userId: true }, distinct: ["userId"] }),
    prisma.attendance.findMany({ where: { sessionId: s.id }, select: { userId: true } }),
  ]);
  const done = new Set(marked.map((m) => m.userId));
  const todo = regs.filter((r) => !done.has(r.userId));
  if (!todo.length) return { ok: "Semua peserta sudah diabsen." };
  await prisma.attendance.createMany({
    data: todo.map((r) => ({ sessionId: s.id, userId: r.userId, status: "HADIR", method: "ADMIN", markedById: admin.userId })),
    skipDuplicates: true,
  });
  await logActivity({ entity: "ATTENDANCE", action: "CREATE", entityId: s.id, productId: s.productId, label: `${s.product.name} · ${s.title}`, count: todo.length, detail: "tandai semua hadir" });
  revalidateMeeting(s.productId, s.id, s.product.slug);
  return { ok: `${todo.length} peserta ditandai hadir.` };
}

/* ------------------------------------------------------------------ */
/* Peserta                                                             */
/* ------------------------------------------------------------------ */

/** Absen mandiri: hanya saat pertemuan berlangsung & tidak menimpa absensi dari admin. */
export async function selfCheckInAction(sessionId: number): Promise<ActionResult> {
  const me = await requireUser(["PESERTA"]);
  const limited = await limitAction("checkin", me.userId, 20, 10 * 60_000);
  if (limited) return { error: limited };
  const s = await sessionWithProduct(Number(sessionId) || 0);
  if (!s || !(await isPaid(me.userId, s.productId))) return { error: "Pertemuan tidak ditemukan." };
  if (!canSelfCheckIn(s)) return { error: "Absen hanya bisa dilakukan saat pertemuan sedang berlangsung." };
  const existing = await prisma.attendance.findUnique({ where: { sessionId_userId: { sessionId: s.id, userId: me.userId } } });
  if (existing) return { ok: existing.status === "HADIR" ? "Kamu sudah tercatat hadir." : "Absensimu sudah dicatat admin." };
  await prisma.attendance.create({ data: { sessionId: s.id, userId: me.userId, status: "HADIR", method: "MANDIRI" } });
  revalidateMeeting(s.productId, s.id, s.product.slug);
  return { ok: "Absen berhasil. Selamat belajar! 🎉" };
}

/** Kumpulkan worksheet: dinilai di server (kunci jawaban tidak pernah dikirim sebelum dikumpulkan). */
export async function submitWorksheetAction(
  sessionId: number,
  answers: { questionId: number; choice: number }[],
): Promise<ActionResult & { score?: number; grade?: string }> {
  const me = await requireUser(["PESERTA"]);
  const limited = await limitAction("ws-submit", me.userId, 20, 10 * 60_000);
  if (limited) return { error: limited };
  const s = await prisma.classSession.findUnique({
    where: { id: Number(sessionId) || 0 },
    include: { product: { select: { slug: true } }, worksheetQuestions: { select: { id: true, answerIndex: true, points: true, options: true } } },
  });
  if (!s || !(await isPaid(me.userId, s.productId))) return { error: "Worksheet tidak ditemukan." };
  if (!s.worksheetPublished || !s.worksheetQuestions.length) return { error: "Worksheet belum dibuka." };
  if (!worksheetOpen(s)) return { error: "Batas waktu pengumpulan worksheet sudah lewat." };
  if (await prisma.worksheetAttempt.count({ where: { sessionId: s.id, userId: me.userId } })) return { error: "Worksheet ini sudah kamu kumpulkan." };

  const given = new Map((Array.isArray(answers) ? answers : []).map((a) => [Number(a.questionId), Number(a.choice)]));
  let correct = 0;
  let earned = 0;
  let max = 0;
  const saved = s.worksheetQuestions.map((q) => {
    const optCount = Array.isArray(q.options) ? q.options.length : 0;
    const c = given.get(q.id);
    const choice = Number.isInteger(c) && c! >= 0 && c! < optCount ? c! : -1;
    max += q.points;
    if (choice === q.answerIndex) {
      correct++;
      earned += q.points;
    }
    return { questionId: q.id, choice };
  });
  const score = max ? Math.round((earned / max) * 100) : 0;
  const grade = gradeOf(score);
  try {
    await prisma.worksheetAttempt.create({
      data: {
        sessionId: s.id,
        userId: me.userId,
        answers: saved,
        correctCount: correct,
        totalQuestions: saved.length,
        earnedPoints: earned,
        maxPoints: max,
        score,
        grade,
      },
    });
  } catch {
    return { error: "Worksheet ini sudah kamu kumpulkan." };
  }
  revalidateMeeting(s.productId, s.id, s.product.slug);
  return { ok: `Worksheet terkumpul! Nilaimu ${score} (${grade}).`, score, grade };
}

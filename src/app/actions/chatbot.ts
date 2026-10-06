"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePanel } from "@/lib/session";
import { optInt, str } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

const PATH = "/admin/chatbot";

export async function saveKnowledgeAction(_prev: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  await requirePanel();
  const id = optInt(form, "id");
  const judul = str(form, "judul").slice(0, 160);
  const isi = str(form, "isi");
  const fe: Record<string, string[]> = {};
  if (judul.length < 3) fe.judul = ["Judul minimal 3 karakter"];
  if (isi.length < 10) fe.isi = ["Isi minimal 10 karakter"];
  if (isi.length > 8000) fe.isi = ["Isi maksimal 8.000 karakter; pecah menjadi beberapa entri"];
  if (Object.keys(fe).length) return { fieldErrors: fe };
  const data = {
    judul,
    isi,
    kategori: str(form, "kategori").slice(0, 60) || "Umum",
    isActive: form.get("isActive") === "1",
    urutan: optInt(form, "urutan") ?? 0,
  };
  try {
    if (id) await prisma.chatKnowledge.update({ where: { id }, data });
    else await prisma.chatKnowledge.create({ data });
  } catch {
    return { error: "Gagal menyimpan pengetahuan. Coba lagi." };
  }
  revalidatePath(PATH);
  return { ok: id ? `Pengetahuan "${judul}" diperbarui.` : `Pengetahuan "${judul}" ditambahkan. Chatbot langsung memakainya.` };
}

export async function deleteKnowledgeAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const k = await prisma.chatKnowledge.delete({ where: { id } }).catch(() => null);
  if (!k) return { error: "Data tidak ditemukan." };
  revalidatePath(PATH);
  return { ok: `Pengetahuan "${k.judul}" dihapus.` };
}

export async function toggleKnowledgeAction(id: number): Promise<ActionResult> {
  await requirePanel();
  const k = await prisma.chatKnowledge.findUnique({ where: { id }, select: { isActive: true, judul: true } });
  if (!k) return { error: "Data tidak ditemukan." };
  await prisma.chatKnowledge.update({ where: { id }, data: { isActive: !k.isActive } });
  revalidatePath(PATH);
  return { ok: k.isActive ? `"${k.judul}" dinonaktifkan (tidak dipakai chatbot).` : `"${k.judul}" diaktifkan kembali.` };
}

/** Tandai pertanyaan tak terjawab sebagai sudah ditangani (tidak muncul lagi di daftar). */
export async function resolveUnansweredAction(messageId: number): Promise<ActionResult> {
  await requirePanel();
  const m = await prisma.chatMessage.update({ where: { id: messageId }, data: { answered: null } }).catch(() => null);
  if (!m) return { error: "Pesan tidak ditemukan." };
  revalidatePath(PATH);
  return { ok: "Ditandai sudah ditangani." };
}

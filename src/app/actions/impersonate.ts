"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession, getSession, requireUser, isPanel } from "@/lib/session";
import { setFlash } from "@/lib/flash";
import { ROLE_LABEL } from "@/lib/constants";
import type { ActionResult } from "@/lib/action-result";

/**
 * Root "masuk sebagai" akun admin / peserta lain tanpa password.
 * Id root disimpan di sesi agar bisa kembali lewat stopImpersonationAction.
 */
export async function impersonateAction(userId: number): Promise<ActionResult> {
  const session = await requireUser(["ROOT", "ADMIN"]);
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, isActive: true } });
  if (!target) return { error: "Akun tidak ditemukan." };
  if (target.id === session.userId) return { error: "Ini akun Anda sendiri." };
  if (target.role === "ROOT" || target.role === "SUPERADMIN") return { error: "Tidak bisa masuk sebagai akun Root/Superadmin." };
  if (session.role === "ADMIN" && target.role !== "PESERTA") return { error: "Admin hanya dapat login sebagai akun peserta." };
  if (!target.isActive) return { error: "Akun ini nonaktif. Aktifkan dulu untuk masuk sebagai akun ini." };

  console.info(`[impersonate] ${session.role.toLowerCase()} #${session.userId} (${session.name}) masuk sebagai #${target.id} (${target.name}, ${target.role})`);
  await createSession({ userId: target.id, role: target.role, name: target.name, impersonatorId: session.userId, impersonatorName: session.name });
  await setFlash("info", `Anda masuk sebagai ${target.name} (${ROLE_LABEL[target.role]}). Klik "Kembali ke akun root" untuk keluar dari mode ini.`);
  redirect(isPanel(target.role) ? "/admin" : "/dashboard");
}

/** Kembali ke akun root asli. */
export async function stopImpersonationAction(): Promise<never> {
  const session = await getSession();
  if (!session?.impersonatorId) redirect(session ? (isPanel(session.role) ? "/admin" : "/dashboard") : "/login");

  const original = await prisma.user.findUnique({ where: { id: session.impersonatorId }, select: { id: true, name: true, role: true, isActive: true } });
  if (!original || !["ROOT", "ADMIN"].includes(original.role) || !original.isActive) {
    // root aslinya sudah tidak berhak → akhiri sesi sepenuhnya
    await deleteSession();
    await setFlash("warning", "Sesi berakhir. Silakan masuk kembali.");
    redirect("/login");
  }
  console.info(`[impersonate] ${original.role.toLowerCase()} #${original.id} kembali dari akun #${session.userId}`);
  await createSession({ userId: original.id, role: original.role, name: original.name });
  await setFlash("success", `Kembali ke akun ${original.name}.`);
  redirect(original.role === "ROOT" ? "/admin/users" : "/admin/pendaftar");
}

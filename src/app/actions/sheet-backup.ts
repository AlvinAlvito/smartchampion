"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import type { ActionResult } from "@/lib/action-result";
import { runSheetBackup } from "@/lib/sheet-backup";

export async function runSheetBackupAction(): Promise<ActionResult> {
  await requireUser(["ROOT"]);
  const r = await runSheetBackup("manual");
  revalidatePath("/admin/backup");
  if (!r.ok) return { error: `Backup gagal: ${r.lastError}` };
  const total = (r.sheets ?? []).reduce((a, s) => a + s.rows, 0);
  const held = (r.sheets ?? []).filter((s) => s.status !== "OK");
  return {
    ok: held.length
      ? `Backup terkirim, tapi ${held.length} sheet DITAHAN (jumlah baris turun drastis) — cek halaman ini.`
      : `Backup berhasil: ${r.sheets?.length ?? 0} sheet, ${total.toLocaleString("id-ID")} baris.`,
  };
}

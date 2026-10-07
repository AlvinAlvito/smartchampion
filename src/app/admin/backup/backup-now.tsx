"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup } from "lucide-react";
import { runSheetBackupAction } from "@/app/actions/sheet-backup";
import { Spinner } from "@/components/form-buttons";
import { useToast } from "@/components/toast";

export function BackupNowButton() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      className="btn-primary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          toast.fromResult(await runSheetBackupAction());
          router.refresh();
        })
      }
    >
      {pending ? <Spinner /> : <DatabaseBackup className="h-4 w-4" />} {pending ? "Mengirim backup..." : "Backup sekarang"}
    </button>
  );
}

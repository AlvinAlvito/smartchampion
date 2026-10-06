"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncTransactionAction } from "@/app/actions/transactions";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";

/** Cek status langsung ke Midtrans & sinkronkan */
export function SyncButton({ id, disabled }: { id: number; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-icon h-8 w-8"
      disabled={pending || disabled}
      title={disabled ? "Belum ada Order ID Midtrans (peserta belum membuka pembayaran)" : "Cek status ke Midtrans"}
      aria-label="Cek status ke Midtrans"
      onClick={() =>
        start(async () => {
          if (toast.fromResult(await syncTransactionAction(id))) router.refresh();
        })
      }
    >
      <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
    </button>
  );
}

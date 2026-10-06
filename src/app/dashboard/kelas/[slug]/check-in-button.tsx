"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hand } from "lucide-react";
import { selfCheckInAction } from "@/app/actions/meetings";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/form-buttons";

/** Tombol absen mandiri (hanya dirender saat pertemuan berlangsung; server tetap memeriksa waktunya). */
export function CheckInButton({ sessionId }: { sessionId: number }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      className="btn-sm inline-flex items-center gap-1.5 rounded-xl bg-linear-to-r from-emerald-500 to-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-emerald-500/25 transition hover:brightness-110 disabled:opacity-60"
      disabled={pending}
      onClick={() =>
        start(async () => {
          toast.fromResult(await selfCheckInAction(sessionId));
          router.refresh();
        })
      }
    >
      {pending ? <Spinner className="h-3.5 w-3.5" /> : <Hand className="h-3.5 w-3.5" />} Absen hadir
    </button>
  );
}

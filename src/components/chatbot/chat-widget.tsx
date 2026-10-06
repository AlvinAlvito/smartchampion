"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircleHeart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChatPanel } from "./chat-panel";

/** Tombol chatbot melayang + panel percakapan (halaman publik & peserta; disembunyikan di panel admin). */
export function ChatWidget({ aboveBottomNav, raised }: { aboveBottomNav: boolean; raised: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/admin")) return null;

  // posisi: di atas navbar bawah peserta (HP) & di atas penanda "masuk sebagai"
  const bottom = cn(
    aboveBottomNav ? "bottom-[calc(env(safe-area-inset-bottom)+100px)] md:bottom-5" : "bottom-[calc(env(safe-area-inset-bottom)+20px)]",
    raised && (aboveBottomNav ? "bottom-[calc(env(safe-area-inset-bottom)+170px)] md:bottom-24" : "bottom-24"),
  );

  return (
    <>
      {open && (
        <div
          className={cn(
            "fixed inset-x-3 z-[85] flex animate-slide-up flex-col md:inset-x-auto md:w-[400px]",
            // HP: panel hampir layar penuh (di atas navbar bawah peserta); tombol melayang disembunyikan selama panel terbuka
            aboveBottomNav
              ? "top-[max(env(safe-area-inset-top),12px)] bottom-[calc(env(safe-area-inset-bottom)+96px)] md:top-auto md:bottom-24"
              : "top-[max(env(safe-area-inset-top),12px)] bottom-[calc(env(safe-area-inset-bottom)+12px)] md:top-auto md:bottom-24",
            "md:right-5",
            "md:h-[min(640px,calc(100dvh-140px))]",
          )}
          role="dialog"
          aria-label="Chat dengan Asisten POSI"
        >
          <ChatPanel onClose={() => setOpen(false)} storageKey="pp_chatbot" className="h-full" />
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          open && "max-md:hidden",
          "fixed right-4 z-[86] grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-brand-500 via-brand-600 to-brand-700 text-white shadow-xl shadow-brand-600/40 ring-4 ring-white/70 transition hover:scale-105 active:scale-95 sm:right-5",
          bottom,
        )}
        aria-label={open ? "Tutup chat asisten" : "Buka chat asisten AI"}
        aria-expanded={open}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircleHeart className="h-7 w-7" />}
        {!open && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-white" />}
      </button>
    </>
  );
}

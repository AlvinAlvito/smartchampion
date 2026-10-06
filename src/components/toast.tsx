"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, CircleX, Info, TriangleAlert, X } from "lucide-react";
import { FLASH_COOKIE, type ActionResult, type FlashType } from "@/lib/action-result";
import { cn } from "@/lib/utils";

type ToastItem = { id: number; type: FlashType; message: string; title?: string; leaving?: boolean };
type ToastApi = {
  show: (type: FlashType, message: string, title?: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  /** Tampilkan hasil server action (ok / error / fieldErrors). Mengembalikan true jika sukses. */
  fromResult: (r: ActionResult | undefined | null) => boolean;
};

const ToastContext = createContext<ToastApi | null>(null);

const META: Record<FlashType, { icon: typeof Info; title: string; ring: string; iconCls: string; bar: string }> = {
  success: { icon: CircleCheck, title: "Berhasil", ring: "ring-emerald-100", iconCls: "bg-emerald-100 text-emerald-600", bar: "bg-emerald-500" },
  error: { icon: CircleX, title: "Gagal", ring: "ring-rose-100", iconCls: "bg-rose-100 text-rose-600", bar: "bg-rose-500" },
  warning: { icon: TriangleAlert, title: "Perhatian", ring: "ring-amber-100", iconCls: "bg-amber-100 text-amber-600", bar: "bg-amber-500" },
  info: { icon: Info, title: "Info", ring: "ring-brand-100", iconCls: "bg-brand-100 text-brand-600", bar: "bg-brand-500" },
};
const DURATION = 4500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((all) => all.filter((t) => t.id !== id)), 250);
  }, []);

  const show = useCallback(
    (type: FlashType, message: string, title?: string) => {
      const id = ++seq.current;
      setItems((all) => [...all.slice(-3), { id, type, message, title }]);
      setTimeout(() => dismiss(id), DURATION);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (m, t) => show("success", m, t),
      error: (m, t) => show("error", m, t),
      info: (m, t) => show("info", m, t),
      warning: (m, t) => show("warning", m, t),
      fromResult: (r) => {
        if (!r) return false;
        if (r.error) {
          show("error", r.error);
          return false;
        }
        if (r.fieldErrors && Object.values(r.fieldErrors).some((v) => v?.length)) {
          const first = Object.values(r.fieldErrors).find((v) => v?.length)?.[0];
          show("warning", first ?? "Periksa kembali isian form.", "Isian belum lengkap");
          return false;
        }
        if (r.ok) show("success", r.ok);
        return Boolean(r.ok);
      },
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end"
      >
        {items.map((t) => {
          const m = META[t.type];
          const Icon = m.icon;
          return (
            <div
              key={t.id}
              role={t.type === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl bg-white/95 p-3.5 pr-10 shadow-[0_20px_50px_-15px_rgba(15,36,54,0.35)] ring-1 backdrop-blur transition-all duration-300",
                m.ring,
                t.leaving ? "translate-y-[-8px] opacity-0 sm:translate-x-6 sm:translate-y-0" : "animate-scale-in sm:animate-slide-in-right",
              )}
            >
              <div className="flex gap-3">
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", m.iconCls)}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-bold text-navy-900">{t.title ?? m.title}</p>
                  <p className="text-sm text-navy-500">{t.message}</p>
                </div>
              </div>
              <button onClick={() => dismiss(t.id)} className="absolute right-2 top-2 rounded-lg p-1 text-navy-300 hover:bg-navy-50 hover:text-navy-600" aria-label="Tutup notifikasi">
                <X className="h-4 w-4" />
              </button>
              <span className={cn("absolute bottom-0 left-0 h-0.5 origin-left", m.bar)} style={{ width: "100%", animation: `toast-bar ${DURATION}ms linear forwards` }} />
            </div>
          );
        })}
      </div>
      <style>{`@keyframes toast-bar{from{transform:scaleX(1)}to{transform:scaleX(0)}}`}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus di dalam <ToastProvider>");
  return ctx;
}

/** Membaca notifikasi "flash" dari server (dipasang oleh setFlash sebelum redirect). */
export function FlashToaster() {
  const toast = useToast();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const match = document.cookie.split("; ").find((c) => c.startsWith(`${FLASH_COOKIE}=`));
    if (!match) return;
    document.cookie = `${FLASH_COOKIE}=; path=/; max-age=0`;
    // nilai bisa ter-encode lebih dari sekali tergantung cara cookie diserialisasi
    let raw = match.slice(FLASH_COOKIE.length + 1);
    for (let i = 0; i < 3; i++) {
      try {
        const { type, message } = JSON.parse(raw);
        if (message) toast.show(type, message);
        return;
      } catch {
        try {
          raw = decodeURIComponent(raw);
        } catch {
          return;
        }
      }
    }
  }, [pathname, searchParams, toast]);

  return null;
}

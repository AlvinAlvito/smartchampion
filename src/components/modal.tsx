"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { useToast } from "./toast";
import { READ_ONLY_TITLE, useReadOnly } from "./read-only";

const noopSubscribe = () => () => {};
const SIZES = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" } as const;

export function Modal({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  size = "md",
  children,
  footer,
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  size?: keyof typeof SIZES;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
}) {
  // portal hanya di browser (hindari mismatch SSR)
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // fokus ke field pertama
    const t = setTimeout(() => panelRef.current?.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea,button")?.focus(), 60);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-navy-950/60 backdrop-blur-sm" onClick={closeOnBackdrop ? onClose : undefined} />
      <div
        ref={panelRef}
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl animate-slide-up sm:rounded-[28px] sm:animate-scale-in",
          SIZES[size],
        )}
      >
        <div className="flex items-start gap-3 border-b border-navy-50 bg-linear-to-r from-brand-50/70 to-white px-5 py-4 sm:px-6">
          {Icon && (
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-navy-600 text-white shadow-md">
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-lg font-bold text-navy-900">{title}</h2>
            {description && <p className="text-sm text-navy-400">{description}</p>}
          </div>
          <button onClick={onClose} className="btn-icon -mr-2 -mt-1" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-navy-50 bg-navy-50/40 px-5 py-3.5 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Dialog konfirmasi yang menjalankan server action lalu menampilkan notifikasi. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmText = "Ya, hapus",
  tone = "danger",
  action,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  tone?: "danger" | "primary";
  action: () => Promise<ActionResult | void>;
  onDone?: (r: ActionResult) => void;
}) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const run = () =>
    start(async () => {
      try {
        const r = (await action()) ?? { ok: "Berhasil." };
        const ok = toast.fromResult(r);
        if (ok) {
          onClose();
          onDone?.(r);
          if (r.redirectTo) router.push(r.redirectTo);
          else router.refresh();
        }
      } catch (e) {
        // redirect() di server action dilempar sebagai error khusus Next — bukan kegagalan, navigasi tetap berjalan
        const digest = (e as { digest?: unknown } | null)?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return;
        toast.error("Terjadi kesalahan jaringan. Coba lagi.");
      }
    });

  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={pending}>
            Batal
          </button>
          <button className={tone === "danger" ? "btn-danger" : "btn-primary"} onClick={run} disabled={pending}>
            {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {pending ? "Memproses..." : confirmText}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
            tone === "danger" ? "bg-rose-50 text-rose-600" : "bg-brand-50 text-brand-600",
          )}
        >
          <TriangleAlert className="h-5 w-5" />
        </span>
        <div className="pt-1 text-sm text-navy-600">{message}</div>
      </div>
    </Modal>
  );
}

/** Tombol + dialog konfirmasi dalam satu komponen. */
export function ConfirmButton({
  children,
  className = "btn-icon text-rose-500 hover:bg-rose-50 hover:text-rose-600",
  title = "Hapus data?",
  message = "Data yang dihapus tidak bisa dikembalikan.",
  confirmText,
  tone,
  action,
  onDone,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  message?: React.ReactNode;
  confirmText?: string;
  tone?: "danger" | "primary";
  action: () => Promise<ActionResult | void>;
  onDone?: (r: ActionResult) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const locked = useReadOnly();
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        disabled={locked}
        title={locked ? READ_ONLY_TITLE : undefined}
      >
        {children}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        message={message}
        confirmText={confirmText}
        tone={tone}
        action={action}
        onDone={onDone}
      />
    </>
  );
}

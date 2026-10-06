"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookOpen, CalendarDays, Gamepad2, House, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

const ITEMS: Item[] = [
  { href: "/kelas", label: "Kelas", icon: BookOpen, match: (p) => p.startsWith("/kelas") || p.startsWith("/pembayaran") },
  { href: "/games", label: "Games", icon: Gamepad2, match: (p) => p.startsWith("/games") },
  {
    href: "/dashboard",
    label: "Beranda",
    icon: House,
    match: (p) => p === "/dashboard" || p.startsWith("/dashboard/kelas") || p.startsWith("/dashboard/materi"),
  },
  { href: "/dashboard/jadwal", label: "Jadwal", icon: CalendarDays, match: (p) => p.startsWith("/dashboard/jadwal") },
  { href: "/dashboard/akun", label: "Akun", icon: UserRound, match: (p) => p.startsWith("/dashboard/akun") },
];
const CENTER = 2;

/** Halaman tempat navbar tidak ditampilkan (area admin & halaman masuk/daftar). */
const HIDDEN_ON = ["/admin", "/login", "/register"];

/**
 * Navigasi bawah ala aplikasi mobile untuk peserta.
 * Dirender SEKALI di root layout sehingga tetap tampil (tidak di-unmount) saat berpindah halaman,
 * dan indikator menu aktif bisa beranimasi bergeser.
 */
export function BottomNav({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  // indeks yang baru diketuk → indikator langsung bergeser sebelum halaman selesai dimuat
  const [pending, setPending] = useState<{ index: number; from: string } | null>(null);

  if (!enabled || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  const routeIndex = ITEMS.findIndex((it) => it.match(pathname));
  const active = pending && pending.from === pathname ? pending.index : routeIndex;

  return (
    <>
      {/* ruang agar konten paling bawah tidak tertutup navbar */}
      <div className="h-28 md:hidden" aria-hidden />
      <nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom),10px)] md:hidden" aria-label="Navigasi peserta">
        <div className="relative mx-auto max-w-md">
          <div className="relative grid h-[68px] grid-cols-5 items-center rounded-[28px] border border-white/10 bg-navy-900/95 shadow-[0_20px_40px_-12px_rgba(8,22,37,0.65)] backdrop-blur-xl">
            {/* Indikator aktif yang bergeser (untuk menu samping) */}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute left-0 top-1/2 h-12 w-1/5 -translate-y-1/2 px-2 transition-all duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)]",
                active === -1 || active === CENTER ? "opacity-0" : "opacity-100",
              )}
              style={{ transform: `translate(${Math.max(active, 0) * 100}%, -50%)` }}
            >
              <span className="block h-full w-full rounded-2xl bg-white/10 ring-1 ring-white/10" />
            </span>

            {ITEMS.map((it, i) => {
              const isActive = active === i;
              const Icon = it.icon;

              if (i === CENTER) {
                return (
                  <div key={it.href} className="relative flex h-full justify-center">
                    <Link
                      href={it.href}
                      onClick={() => setPending({ index: i, from: pathname })}
                      aria-current={isActive ? "page" : undefined}
                      aria-label={it.label}
                      className="group absolute -top-7 flex flex-col items-center"
                    >
                      {isActive && <span className="absolute top-0 h-16 w-16 animate-ping rounded-full bg-brand-500/30 [animation-duration:2s]" />}
                      <span
                        className={cn(
                          "relative grid h-16 w-16 place-items-center rounded-full bg-linear-to-br from-brand-400 via-brand-600 to-brand-800 text-white ring-[6px] ring-[#f5f9fc] transition-all duration-300 active:scale-90",
                          isActive ? "scale-105 shadow-[0_12px_28px_-6px_rgba(26,111,159,0.75)]" : "shadow-[0_10px_22px_-8px_rgba(26,111,159,0.6)] saturate-[0.85]",
                        )}
                      >
                        <Icon key={String(isActive)} className={cn("h-7 w-7", isActive && "animate-pop")} strokeWidth={2.3} />
                      </span>
                      <span className={cn("mt-2 text-[11px] font-bold leading-none transition-colors", isActive ? "text-white" : "text-navy-300")}>{it.label}</span>
                    </Link>
                  </div>
                );
              }

              return (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={() => setPending({ index: i, from: pathname })}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative z-10 flex h-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors duration-300 active:scale-90",
                    isActive ? "text-white" : "text-navy-300 hover:text-white",
                  )}
                >
                  <Icon key={String(isActive)} className={cn("h-[22px] w-[22px] transition-transform duration-300", isActive && "-translate-y-0.5 animate-pop text-brand-300")} />
                  {it.label}
                  <span className={cn("absolute bottom-1.5 h-1 rounded-full bg-brand-300 transition-all duration-300", isActive ? "w-4 opacity-100" : "w-0 opacity-0")} />
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}

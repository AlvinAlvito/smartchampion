"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Award, BookOpen, Gamepad2, LayoutDashboard, LogIn, LogOut, Menu, Sparkles, UserPlus, X } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

const NAV = [
  { href: "/#produk", label: "Produk", icon: Sparkles },
  { href: "/kelas", label: "Kelas", icon: BookOpen },
  { href: "/tutor", label: "Tutor", icon: Award },
  { href: "/games", label: "Games", icon: Gamepad2 },
];

type User = { name: string; role: string; staff: boolean } | null;

export function SiteHeaderClient({ user }: { user: User }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const onHero = pathname === "/";

  // tutup menu mobile saat berpindah halaman
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const transparent = onHero && !scrolled && !open;
  const isPeserta = user && !user.staff;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-all duration-300",
        transparent ? "bg-transparent" : "border-b border-navy-100/60 bg-white/80 shadow-[0_8px_30px_-18px_rgba(15,36,54,0.25)] backdrop-blur-xl",
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4 sm:h-[72px]">
        <Logo light={transparent} />

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = n.href !== "/#produk" && pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "relative rounded-xl px-3.5 py-2 text-sm font-semibold transition",
                  transparent ? "text-white/85 hover:bg-white/10 hover:text-white" : "text-navy-600 hover:bg-brand-50 hover:text-brand-700",
                  active && (transparent ? "bg-white/10 text-white" : "bg-brand-50 text-brand-700"),
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link href={user.staff ? "/admin" : "/dashboard"} className="btn-primary hidden sm:inline-flex">
                <LayoutDashboard className="h-4 w-4" />
                {user.staff ? "Panel Admin" : "Dashboard"}
              </Link>
              <form action={logoutAction} className="hidden md:block">
                <button className={transparent ? "btn-outline-light" : "btn-ghost"} aria-label="Keluar">
                  <LogOut className="h-4 w-4" />
                </button>
              </form>
            </>
          ) : (
            <>
              {/* HP: cukup tombol Masuk (Daftar ada di menu); desktop: Masuk + Daftar */}
              <Link href="/login" className="btn-primary sm:hidden">
                <LogIn className="h-4 w-4" /> Masuk
              </Link>
              <Link href="/login" className={cn("hidden sm:inline-flex", transparent ? "btn text-white hover:bg-white/10" : "btn-ghost")}>
                Masuk
              </Link>
              <Link href="/register" className="btn-primary hidden sm:inline-flex">
                Daftar
              </Link>
            </>
          )}
          {/* Peserta di mobile memakai bottom navbar; selain itu tampilkan tombol menu */}
          {!isPeserta && (
            <button
              onClick={() => setOpen((o) => !o)}
              className={cn("btn-icon md:hidden", transparent && "text-white hover:bg-white/10 hover:text-white")}
              aria-label="Menu"
              aria-expanded={open}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="animate-fade-in border-t border-navy-50 bg-white md:hidden">
          <nav className="container-page stagger flex flex-col gap-1 py-3">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="flex items-center gap-3 rounded-2xl px-3 py-3 font-semibold text-navy-700 hover:bg-brand-50">
                <n.icon className="h-5 w-5 text-brand-600" /> {n.label}
              </Link>
            ))}
            {user ? (
              <>
                <Link href="/admin" className="flex items-center gap-3 rounded-2xl px-3 py-3 font-semibold text-navy-700 hover:bg-brand-50">
                  <LayoutDashboard className="h-5 w-5 text-brand-600" /> Panel Admin
                </Link>
                <form action={logoutAction}>
                  <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 font-semibold text-rose-600 hover:bg-rose-50">
                    <LogOut className="h-5 w-5" /> Keluar
                  </button>
                </form>
              </>
            ) : (
              <div className="mt-2 rounded-3xl bg-brand-50/70 p-4 text-center">
                <p className="text-sm font-semibold text-navy-700">Belum punya akun peserta?</p>
                <Link href="/register" className="btn-primary mt-3 w-full">
                  <UserPlus className="h-4 w-4" /> Daftar gratis
                </Link>
                <p className="mt-3 text-xs text-navy-500">
                  Sudah punya akun?{" "}
                  <Link href="/login" className="font-bold text-brand-700 hover:underline">
                    Masuk
                  </Link>
                </p>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

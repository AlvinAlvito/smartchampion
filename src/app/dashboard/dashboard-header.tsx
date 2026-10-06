"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, Gamepad2, House, LogOut, Receipt, UserRound } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Beranda", icon: House, exact: true },
  { href: "/kelas", label: "Katalog Kelas", icon: BookOpen },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/dashboard/jadwal", label: "Jadwal", icon: CalendarDays },
  { href: "/dashboard/transaksi", label: "Transaksi", icon: Receipt },
  { href: "/dashboard/akun", label: "Akun", icon: UserRound },
];

export function DashboardHeader({ name }: { name: string }) {
  const pathname = usePathname();
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <header className="sticky top-0 z-40 border-b border-navy-100/60 bg-white/80 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo href="/dashboard" />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                title={n.label}
                aria-label={n.label}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition",
                  active ? "bg-brand-50 text-brand-700" : "text-navy-500 hover:bg-navy-50 hover:text-navy-800",
                )}
              >
                <n.icon className="h-4 w-4" /> <span className="hidden lg:inline">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/transaksi"
            className={cn("btn-icon md:hidden", pathname.startsWith("/dashboard/transaksi") && "bg-brand-50 text-brand-700")}
            aria-label="Transaksi"
            title="Transaksi"
          >
            <Receipt className="h-4 w-4" />
          </Link>
          <Link href="/dashboard/akun" className="flex items-center gap-2.5 rounded-2xl py-1 pl-1 pr-3 transition hover:bg-navy-50">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-brand-500 to-navy-700 text-xs font-bold text-white shadow-md">{initials}</span>
            <span className="hidden text-sm font-semibold text-navy-800 sm:block">{name.split(" ")[0]}</span>
          </Link>
          <form action={logoutAction} className="hidden md:block">
            <button className="btn-icon" aria-label="Keluar" title="Keluar">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  Receipt,
  BookOpen,
  Bot,
  BriefcaseBusiness,
  MessagesSquare,
  Megaphone,
  ClipboardList,
  Contact,
  Gamepad2,
  Globe,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareHeart,
  PanelLeftClose,
  PanelLeftOpen,
  Presentation,
  Send,
  Trophy,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

/** sales = hanya Superadmin & Admin Pelatihan; menu lain juga untuk Admin SmartChampion */
type Item = { href: string; label: string; icon: LucideIcon; exact?: boolean; sales?: boolean; superLabel?: string };

const ITEMS: Item[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/performa", label: "Performa Admin", icon: Trophy, sales: true },
  { href: "/admin/jobdesk", label: "Jobdesk", icon: BriefcaseBusiness, sales: true },
  { href: "/admin/leads", label: "Master Lead", icon: Contact, sales: true },
  { href: "/admin/blast", label: "Data Blast", icon: Send, sales: true },
  { href: "/admin/blast-wa", label: "Blast WhatsApp", icon: Megaphone, sales: true },
  { href: "/admin/chat", label: "Chat WA", superLabel: "Pantau Chat WA", icon: MessagesSquare },
  { href: "/admin/pendaftar", label: "Peserta Terdaftar", icon: ClipboardList },
  { href: "/admin/transaksi", label: "Transaksi", icon: Receipt, sales: true },
  { href: "/admin/produk", label: "Produk & Materi", icon: BookOpen },
  { href: "/admin/tutor", label: "Tutor", icon: Presentation },
  { href: "/admin/feedback", label: "Feedback Peserta", icon: MessageSquareHeart },
  { href: "/admin/games", label: "Games", icon: Gamepad2 },
  { href: "/admin/chatbot", label: "Chatbot AI", icon: Bot },
];

type User = { name: string; roleLabel: string; role: string };

function NavLinks({ items, onNavigate, collapsed = false }: { items: Item[]; onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((it) => {
        const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            onClick={onNavigate}
            aria-label={collapsed ? it.label : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-2xl py-2.5 text-sm font-semibold transition-all duration-200",
              collapsed ? "justify-center px-0" : "px-3.5",
              active ? "bg-white/12 text-white shadow-inner" : "text-navy-200 hover:bg-white/6 hover:text-white",
            )}
          >
            {active && <span className="absolute -left-3 top-1/2 h-6 w-1.5 -translate-y-1/2 rounded-r-full bg-linear-to-b from-brand-300 to-brand-500" />}
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-xl transition",
                active
                  ? "bg-linear-to-br from-brand-400 to-brand-700 text-white shadow-lg shadow-brand-900/50"
                  : "bg-white/5 text-navy-300 group-hover:text-white",
              )}
            >
              <it.icon className="h-4 w-4" />
            </span>
            {collapsed ? <Tooltip label={it.label} /> : it.label}
          </Link>
        );
      })}
      <Link
        href="/"
        onClick={onNavigate}
        aria-label={collapsed ? "Lihat situs" : undefined}
        className={cn(
          "group relative mt-2 flex items-center gap-3 rounded-2xl py-2.5 text-sm font-semibold text-navy-300 transition hover:bg-white/6 hover:text-white",
          collapsed ? "justify-center" : "px-3.5",
        )}
      >
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/5">
          <Globe className="h-4 w-4" />
        </span>
        {collapsed ? <Tooltip label="Lihat situs" /> : "Lihat situs"}
      </Link>
    </nav>
  );
}

/** Label melayang di kanan ikon saat sidebar diciutkan. */
function Tooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-xl bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-xl ring-1 ring-white/10 transition group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
      {label}
    </span>
  );
}

function UserCard({ user, collapsed = false }: { user: User; collapsed?: boolean }) {
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <span
          title={user.name + " · " + user.roleLabel}
          className="grid h-10 w-10 place-items-center rounded-2xl bg-linear-to-br from-brand-400 to-brand-700 text-sm font-bold text-white"
        >
          {initials}
        </span>
        <form action={logoutAction}>
          <button
            className="group relative grid h-10 w-10 place-items-center rounded-xl bg-white/8 text-navy-100 transition hover:bg-rose-500/20 hover:text-rose-200"
            aria-label="Keluar"
          >
            <LogOut className="h-4 w-4" />
            <Tooltip label="Keluar" />
          </button>
        </form>
      </div>
    );
  }
  return (
    <div className="rounded-3xl bg-white/6 p-3 ring-1 ring-white/10">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-400 to-brand-700 text-sm font-bold text-white">
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{user.name}</p>
          <p className="truncate text-xs text-navy-300">{user.roleLabel}</p>
        </div>
      </div>
      <form action={logoutAction} className="mt-3">
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/8 py-2 text-xs font-semibold text-navy-100 transition hover:bg-rose-500/20 hover:text-rose-200">
          <LogOut className="h-3.5 w-3.5" /> Keluar
        </button>
      </form>
    </div>
  );
}

const COLLAPSE_COOKIE = "pp_sidebar_collapsed";

export function AdminShell({ user, children, initialCollapsed = false }: { user: User; children: React.ReactNode; initialCollapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  // Status buka/tutup sidebar disimpan di cookie → server langsung merender posisi yang sama (tanpa kedip)
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = useCallback(() => {
    setCollapsed((c) => {
      document.cookie = COLLAPSE_COOKIE + "=" + (c ? "0" : "1") + "; path=/; max-age=31536000; samesite=lax";
      return !c;
    });
  }, []);
  // Pintasan keyboard: Ctrl/Cmd + B
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
  const pathname = usePathname();
  const items =
    user.role === "ROOT" || user.role === "SUPERADMIN"
      ? [...ITEMS.map((it) => (it.superLabel ? { ...it, label: it.superLabel } : it)), { href: "/admin/users", label: "Pengguna", icon: Users }]
      : user.role === "SMARTCHAMPION"
        ? ITEMS.filter((it) => !it.sales || ["/admin/leads", "/admin/jobdesk", "/admin/performa", "/admin/transaksi"].includes(it.href)).map((it) =>
            it.href === "/admin/performa" ? { ...it, label: "Performa Saya" } : it,
          )
        : ITEMS.map((it) => (it.href === "/admin/performa" ? { ...it, label: "Performa Saya" } : it));
  const current = [...items].reverse().find((it) => (it.exact ? pathname === it.href : pathname.startsWith(it.href)));

  const sidebar = (onNavigate?: () => void, mini = false) => (
    <div
      className={cn(
        "relative flex h-full flex-col bg-linear-to-b from-navy-950 via-navy-900 to-brand-950 py-5 transition-[padding] duration-300",
        mini ? "px-3" : "px-4",
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-20 top-40 h-60 w-60 rounded-full bg-brand-600/25 blur-3xl" />
      </div>
      <div className={cn("relative mb-7", mini ? "flex justify-center" : "px-1")}>
        {mini ? (
          <Link
            href="/admin"
            aria-label="Dashboard"
            className="grid h-10 w-10 place-items-center rounded-2xl bg-linear-to-br from-brand-500 via-brand-600 to-navy-700 text-white shadow-lg shadow-brand-600/30"
          >
            <GraduationCap className="h-5 w-5" />
          </Link>
        ) : (
          <Logo href="/admin" light />
        )}
      </div>
      <p className={cn("relative mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-navy-400", mini ? "text-center" : "px-3")}>
        {mini ? "•••" : "Menu"}
      </p>
      <div className={cn("relative flex-1", mini ? "overflow-visible" : "overflow-y-auto")}>
        <NavLinks items={items} onNavigate={onNavigate} collapsed={mini} />
      </div>
      <div className="relative mt-4">
        <UserCard user={user} collapsed={mini} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f2f7fb] lg:flex">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          "relative z-30 hidden transition-[width] duration-300 ease-out lg:sticky lg:top-0 lg:block lg:h-screen lg:shrink-0",
          collapsed ? "lg:w-20" : "lg:w-72",
        )}
      >
        {sidebar(undefined, collapsed)}
        <button
          onClick={toggle}
          className="absolute -right-3.5 top-7 z-40 grid h-7 w-7 place-items-center rounded-full bg-white text-navy-700 shadow-lg ring-1 ring-navy-100 transition hover:scale-110 hover:text-brand-600"
          aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
          title={(collapsed ? "Buka" : "Tutup") + " sidebar (Ctrl+B)"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </aside>

      {/* Topbar mobile */}
      <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-navy-100/60 bg-white/85 px-4 backdrop-blur-xl lg:hidden">
        <button onClick={() => setOpen(true)} className="btn-icon" aria-label="Buka menu">
          <Menu className="h-5 w-5" />
        </button>
        <p className="font-bold text-navy-900">{current?.label ?? "Admin"}</p>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-brand-500 to-navy-700 text-xs font-bold text-white">
          {user.name.charAt(0)}
        </span>
      </div>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-navy-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-[slide-in-left_0.3s_cubic-bezier(0.22,1,0.36,1)] shadow-2xl">
            {sidebar(() => setOpen(false))}
            <button
              onClick={() => setOpen(false)}
              className="absolute right-3 top-5 grid h-9 w-9 place-items-center rounded-xl text-navy-200 hover:bg-white/10"
              aria-label="Tutup menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <style>{`@keyframes slide-in-left{from{transform:translateX(-100%)}to{transform:translateX(0)}}`}</style>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
    </div>
  );
}

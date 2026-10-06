"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, Megaphone, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/blast-wa", label: "Ringkasan & Nomor", icon: Gauge, exact: true },
  { href: "/admin/blast-wa/kontak", label: "Kontak", icon: Users },
  { href: "/admin/blast-wa/kampanye", label: "Kampanye", icon: Megaphone },
];

export function BlastTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 ring-1 ring-navy-100" aria-label="Menu Blast WhatsApp">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition",
              active ? "bg-brand-600 text-white shadow" : "text-navy-500 hover:bg-navy-50 hover:text-navy-800",
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

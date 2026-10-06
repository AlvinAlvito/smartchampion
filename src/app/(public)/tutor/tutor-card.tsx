"use client";

import { useState } from "react";
import Link from "next/link";
import { Award, BookOpen, Briefcase, ChevronDown, GraduationCap, type LucideIcon } from "lucide-react";
import { TutorAvatar, listItems } from "@/components/tutor-avatar";
import { cn } from "@/lib/utils";

type Tutor = {
  id: number;
  nama: string;
  foto: string | null;
  bidang: string | null;
  pengalaman: string | null;
  prestasi: string | null;
  riwayatPendidikan: string | null;
  classes: { id: number; name: string; slug: string; jenjang: string }[];
};

const JENJANG: Record<string, string> = { SD: "SD", SMP: "SMP", SMA: "SMA", UMUM: "Umum" };

/** Kelas COC yang diampu tutor → tautan ke halaman kelas. */
function Classes({ items }: { items: Tutor["classes"] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-navy-400">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
          <BookOpen className="h-3.5 w-3.5" />
        </span>
        Kelas yang diampu ({items.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((c) => (
          <Link
            key={c.id}
            href={`/kelas/${c.slug}`}
            className="group inline-flex max-w-full items-center gap-1.5 rounded-xl bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-800 ring-1 ring-brand-100 transition hover:bg-brand-600 hover:text-white"
          >
            <span className="rounded-md bg-white px-1 text-[10px] font-bold text-brand-600 group-hover:bg-white/20 group-hover:text-white">{JENJANG[c.jenjang] ?? c.jenjang}</span>
            <span className="truncate">{c.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const PREVIEW = 3;

function Section({ icon: Icon, title, items, open, tone }: { icon: LucideIcon; title: string; items: string[]; open: boolean; tone: string }) {
  if (!items.length) return null;
  const shown = open ? items : items.slice(0, PREVIEW);
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-navy-400">
        <span className={cn("grid h-6 w-6 place-items-center rounded-lg", tone)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {title}
      </p>
      <ul className="space-y-1.5 pl-1">
        {shown.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm leading-snug text-navy-600">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
            <span className="min-w-0 wrap-break-word">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TutorCard({ tutor }: { tutor: Tutor }) {
  const [open, setOpen] = useState(false);
  const sections = [
    { icon: Award, title: "Prestasi", items: listItems(tutor.prestasi), tone: "bg-amber-50 text-amber-600" },
    { icon: Briefcase, title: "Pengalaman", items: listItems(tutor.pengalaman), tone: "bg-brand-50 text-brand-600" },
    { icon: GraduationCap, title: "Pendidikan", items: listItems(tutor.riwayatPendidikan), tone: "bg-sky-50 text-sky-600" },
  ];
  const more = sections.some((s) => s.items.length > PREVIEW);

  return (
    <article className="card card-hover flex flex-col overflow-hidden p-0!">
      <div className="relative bg-hero px-5 pb-12 pt-6 text-center text-white">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
        <p className="relative text-lg font-extrabold leading-tight">{tutor.nama}</p>
        {tutor.bidang && <p className="relative mt-1 text-sm font-semibold text-brand-200">{tutor.bidang}</p>}
      </div>
      <div className="-mt-10 flex justify-center">
        <TutorAvatar name={tutor.nama} src={tutor.foto} className="relative h-20 w-20 rounded-3xl text-2xl shadow-xl ring-4 ring-white" />
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5 pt-4">
        <Classes items={tutor.classes} />
        {sections.map((s) => (
          <Section key={s.title} {...s} open={open} />
        ))}
        {more && (
          <button onClick={() => setOpen((o) => !o)} className="mt-auto inline-flex items-center justify-center gap-1 self-center pt-1 text-sm font-bold text-brand-600 hover:text-brand-800">
            {open ? "Tampilkan lebih sedikit" : "Lihat selengkapnya"}
            <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
          </button>
        )}
      </div>
    </article>
  );
}

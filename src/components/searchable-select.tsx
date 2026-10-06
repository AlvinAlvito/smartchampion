"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchableOption = { value: string; label: string; keywords?: string };

export function SearchableSelect({
  name,
  value,
  options,
  placeholder = "Pilih...",
  searchPlaceholder = "Cari...",
  emptyLabel = "Kosongkan / lepas pilihan",
  disabled = false,
}: {
  name: string;
  value?: string | number | null;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(value == null ? "" : String(value));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = options.find((option) => option.value === selected);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("id-ID");
    if (!q) return options;
    return options.filter((option) => `${option.label} ${option.keywords ?? ""}`.toLocaleLowerCase("id-ID").includes(q));
  }, [options, query]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = (next: string) => {
    setSelected(next);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={root} className="relative">
      <input type="hidden" name={name} value={selected} />
      <button
        id={name}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="input flex w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={cn("min-w-0 truncate", !current && "text-navy-400")}>{current?.label ?? placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-navy-400" />
      </button>
      {open && !disabled && (
        <div className="absolute z-60 mt-2 w-full min-w-[280px] overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-2xl">
          <div className="relative border-b border-navy-100 p-2">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} className="input pl-9" />
          </div>
          <div role="listbox" className="max-h-64 overflow-y-auto p-2">
            <button type="button" role="option" aria-selected={!selected} onClick={() => choose("")} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-navy-500 hover:bg-navy-50">
              <X className="h-4 w-4" /> {emptyLabel}
            </button>
            {filtered.map((option) => (
              <button key={option.value} type="button" role="option" aria-selected={selected === option.value} onClick={() => choose(option.value)} className={cn("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-brand-50", selected === option.value && "bg-brand-50 font-semibold text-brand-700")}>
                <span>{option.label}</span>
                {selected === option.value && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
            {!filtered.length && <p className="px-3 py-6 text-center text-sm text-navy-400">Kelas tidak ditemukan.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Crown, Lock } from "lucide-react";
import { packageSavings, perSession } from "@/lib/packages";
import { cn, formatRupiah } from "@/lib/utils";

type Pkg = { id: number; sessions: number; price: number; label: string | null };

/** Pilih paket pertemuan VIP Privat → satu kali checkout & bayar. */
export function PackagePicker({ slug, packages, pricePerSession, canRegister }: { slug: string; packages: Pkg[]; pricePerSession: number; canRegister: boolean }) {
  const popular = packages.find((p) => p.label) ?? packages[Math.floor(packages.length / 2)];
  const [picked, setPicked] = useState<number | undefined>(popular?.id);
  const chosen = packages.find((p) => p.id === picked);

  if (!packages.length) {
    return <p className="rounded-2xl bg-navy-50 p-4 text-sm text-navy-500">Paket belum tersedia. Hubungi admin untuk info jadwal & harga.</p>;
  }

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Pilih paket pertemuan" className="space-y-2">
        {packages.map((p) => {
          const on = p.id === picked;
          const save = packageSavings(p, pricePerSession);
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPicked(p.id)}
              className={cn(
                "relative flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition",
                on ? "border-brand-500 bg-brand-50 shadow-md shadow-brand-200" : "border-navy-100 hover:border-brand-200 hover:bg-brand-50/40",
              )}
            >
              <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", on ? "border-brand-600 bg-brand-600 text-white" : "border-navy-200")}>
                {on && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-extrabold text-navy-900">{p.sessions}x pertemuan</span>
                  {p.label && <span className="rounded-full bg-linear-to-r from-amber-300 to-amber-500 px-2 py-0.5 text-[10px] font-extrabold uppercase text-navy-950">{p.label}</span>}
                </span>
                <span className="block text-xs text-navy-500">
                  {formatRupiah(perSession(p))}/pertemuan{save ? <b className="text-emerald-600"> · hemat {save}%</b> : null}
                </span>
              </span>
              <span className="shrink-0 text-right font-extrabold text-navy-900">{formatRupiah(p.price)}</span>
            </button>
          );
        })}
      </div>

      {chosen && (
        <div className="rounded-2xl bg-navy-50/70 px-4 py-3 text-sm">
          <div className="flex justify-between text-navy-500">
            <span>
              {chosen.sessions} × {formatRupiah(pricePerSession)}
            </span>
            <span className={packageSavings(chosen, pricePerSession) ? "line-through" : ""}>{formatRupiah(chosen.sessions * pricePerSession)}</span>
          </div>
          <div className="mt-1 flex justify-between font-extrabold text-navy-900">
            <span>Total bayar sekali</span>
            <span>{formatRupiah(chosen.price)}</span>
          </div>
        </div>
      )}

      {canRegister ? (
        <Link
          href={chosen ? `/kelas/${slug}/daftar?paket=${chosen.id}` : "#"}
          aria-disabled={!chosen}
          className={cn("btn-primary w-full py-3 text-base", !chosen && "pointer-events-none opacity-50")}
        >
          <Crown className="h-4 w-4" /> Daftar {chosen ? `${chosen.sessions}x pertemuan` : "paket"} <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <button disabled className="btn-secondary w-full">
          <Lock className="h-4 w-4" /> Pendaftaran ditutup
        </button>
      )}
    </div>
  );
}

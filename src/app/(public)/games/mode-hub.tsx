"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Lock } from "lucide-react";
import { Modal } from "@/components/modal";
import { isPremiumMode } from "@/lib/game-rules";
import { cn } from "@/lib/utils";
import { MODES, type ModeInfo } from "./modes";

/**
 * Kartu mode di Arena Game (/games): favorit tampil besar, sisanya di bawah.
 * Klik → /games?mode=<key> (pilih soal). Mode berbayar tanpa akses → dialog ajakan daftar kelas.
 */
export function ModeHub({ allModes, loggedIn, loginHref }: { allModes: boolean; loggedIn: boolean; loginHref: string }) {
  const [locked, setLocked] = useState<ModeInfo | null>(null);
  const favs = MODES.filter((m) => m.fav);
  const rest = MODES.filter((m) => !m.fav);
  const card = (m: ModeInfo, big: boolean) => {
    const isLocked = !allModes && isPremiumMode(m.key);
    const inner = (
      <>
        <span
          aria-hidden
          className={cn("absolute inset-0 -z-10 bg-cover bg-center transition duration-700 group-hover:scale-110", isLocked && "grayscale")}
          style={{ backgroundImage: `url(/games/modes/${m.key}.jpg)` }}
        />
        <span
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background: big
              ? `linear-gradient(0deg, rgba(${m.tone},0.97) 0%, rgba(${m.tone},0.78) 38%, rgba(${m.tone},0.05) 75%)`
              : `linear-gradient(0deg, rgba(${m.tone},0.98) 0%, rgba(${m.tone},0.85) 45%, rgba(${m.tone},0.1) 85%)`,
          }}
        />
        {isLocked && <span aria-hidden className="absolute inset-0 -z-10 bg-navy-950/40" />}
        <span className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {m.fav && <span className="rounded-full bg-linear-to-r from-rose-500 to-pink-500 px-2 py-0.5 text-[10px] font-black text-white shadow ring-1 ring-white/60">⭐ FAVORIT</span>}
          {m.isNew && <span className="rounded-full bg-sun-400 px-2 py-0.5 text-[10px] font-black text-navy-950 shadow">BARU</span>}
          {!isPremiumMode(m.key) && <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-black text-white shadow">GRATIS</span>}
        </span>
        {isLocked && (
          <span className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/95 text-navy-900 shadow-lg ring-2 ring-white/60 transition group-hover:scale-110">
            <Lock className="h-5 w-5" />
          </span>
        )}
        <span className={cn("mt-auto block", m.dark ? "text-navy-950" : "text-white")}>
          <span className={cn("flex items-center gap-2 font-extrabold drop-shadow-sm", big ? "text-xl" : "text-base")}>
            <m.icon className={cn(big ? "h-6 w-6" : "h-5 w-5", m.key === "classic" && "fill-current")} /> {m.name}
          </span>
          <span className={cn("mt-1 block text-xs font-semibold", big ? "max-w-md sm:text-sm" : "line-clamp-2", m.dark ? "text-navy-900/85" : "text-white/90")}>{m.desc}</span>
          <span
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black shadow transition group-hover:gap-2.5",
              isLocked ? "bg-white/90 text-navy-900" : m.dark ? "bg-navy-950 text-sun-300" : "bg-white text-navy-950",
            )}
          >
            {isLocked ? (
              <>
                <Lock className="h-3.5 w-3.5" /> Terkunci
              </>
            ) : (
              <>
                Pilih mode <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </span>
        </span>
      </>
    );
    const cls = cn(
      "group relative isolate flex flex-col overflow-hidden rounded-3xl p-4 text-left shadow-lg ring-1 ring-black/5 transition duration-300 hover:-translate-y-1 hover:shadow-2xl",
      big ? "min-h-56 sm:min-h-64 sm:p-5" : "min-h-48",
    );
    return isLocked ? (
      <button key={m.key} type="button" onClick={() => setLocked(m)} className={cls} aria-label={`${m.label} (terkunci)`}>
        {inner}
      </button>
    ) : (
      <Link key={m.key} href={`/games?mode=${m.key}#pilih-soal`} className={cls} aria-label={m.label}>
        {inner}
      </Link>
    );
  };

  return (
    <>
      <section id="mode" className="scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-pink-300">⭐ Paling banyak dimainkan</p>
            <h2 className="text-2xl font-extrabold text-white drop-shadow">Mode favorit</h2>
          </div>
          <p className="text-sm text-indigo-100/80">Pilih mode, lalu pilih kumpulan soal yang mau dimainkan.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">{favs.map((m) => card(m, true))}</div>
      </section>
      <section className="mt-10">
        <h2 className="mb-4 text-2xl font-extrabold text-navy-900">Semua mode lainnya</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{rest.map((m) => card(m, false))}</div>
      </section>
      <Modal
        open={!!locked}
        onClose={() => setLocked(null)}
        title={`Mode ${locked?.name ?? ""} masih terkunci 🔒`}
        icon={Lock}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setLocked(null)}>
              Nanti saja
            </button>
            <Link href="/kelas" className="btn-primary">
              Lihat katalog kelas <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        }
      >
        <div className="space-y-3 text-sm text-navy-700">
          <p>
            <b>Silakan daftar kelas untuk membuka semua games.</b> Mode berlabel gembok terbuka setelah kamu membeli minimal 1 produk (COC, VIP Privat,
            ACLB, dll.).
          </p>
          <p className="text-navy-500">Mode berlabel GRATIS (klasik, petualangan, lari lintasan & duel) bisa langsung dimainkan.</p>
          {!loggedIn && (
            <p className="rounded-xl bg-brand-50 p-3 text-brand-800">
              Sudah pernah daftar kelas?{" "}
              <Link href={loginHref} className="font-bold underline">
                Masuk dulu
              </Link>{" "}
              agar semua game terbuka.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

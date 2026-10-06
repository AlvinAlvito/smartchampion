import Link from "next/link";
import { CreditCard, Headset, MessageCircle, ShieldCheck } from "lucide-react";
import { Logo } from "./logo";
import { FlagCounter } from "./flag-counter";

export function SiteFooter() {
  return (
    <footer className="relative mt-24 overflow-hidden bg-hero text-navy-100">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <div className="container-page relative grid gap-10 py-14 md:grid-cols-4">
        <div className="space-y-4 md:col-span-2">
          <Logo light />
          <p className="max-w-sm text-sm leading-relaxed text-navy-200">
            Ekosistem pelatihan POSI: kelas pendampingan <b className="text-white">Champion Online Class</b> dan platform belajar mandiri{" "}
            <b className="text-white">Mimpi.mu</b>. Belajar terarah, jadi juara.
          </p>
          <div className="flex gap-2 text-xs">
            <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> Pembayaran aman
            </span>
            <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5">
              <CreditCard className="h-3.5 w-3.5 text-brand-300" /> Midtrans
            </span>
          </div>
        </div>
        <div className="text-sm">
          <p className="mb-3 font-bold text-white">Jelajahi</p>
          <ul className="space-y-2 text-navy-200">
            <li><Link href="/kelas" className="transition hover:text-white">Katalog kelas</Link></li>
            <li><Link href="/tutor" className="transition hover:text-white">Tutor kami</Link></li>
            <li><Link href="/games" className="transition hover:text-white">Games edukasi</Link></li>
            <li><Link href="/register" className="transition hover:text-white">Daftar akun</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <p className="mb-3 font-bold text-white">Butuh bantuan?</p>
          <a
            className="glass inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 font-semibold text-white transition hover:bg-white/20"
            href="https://wa.me/6282276994359"
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="h-4 w-4 text-emerald-300" /> Chat Admin
          </a>
          <p className="mt-3 flex items-center gap-2 text-navy-300">
            <Headset className="h-4 w-4" /> Senin–Sabtu, 08.00–20.00 WIB
          </p>
          <FlagCounter className="mt-4" />
        </div>
      </div>
      <div className="relative border-t border-white/10 py-5 text-center text-xs text-navy-300">© {new Date().getFullYear()} Yayasan Pendidikan POSI</div>
    </footer>
  );
}

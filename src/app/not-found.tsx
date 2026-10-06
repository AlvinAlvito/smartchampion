import Link from "next/link";
import { ArrowLeft, Compass, House } from "lucide-react";

export default function NotFound() {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-hero px-4 text-center text-white">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-40" />
      <div className="pointer-events-none absolute -left-20 top-10 h-80 w-80 animate-blob rounded-full bg-brand-500/30 blur-3xl" />
      <div className="relative animate-fade-up">
        <span className="mx-auto grid h-20 w-20 animate-float place-items-center rounded-[28px] bg-white/10 ring-1 ring-white/20">
          <Compass className="h-10 w-10 animate-spin-slow text-brand-200" />
        </span>
        <p className="mt-6 text-8xl font-extrabold tracking-tight text-gradient">404</p>
        <h1 className="mt-2 text-2xl font-bold">Halaman tidak ditemukan</h1>
        <p className="mx-auto mt-2 max-w-md text-navy-200">Halaman yang kamu cari mungkin sudah dipindahkan atau kamu tidak punya akses ke halaman ini.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-light">
            <House className="h-4 w-4" /> Ke beranda
          </Link>
          <Link href="/kelas" className="btn-outline-light">
            <ArrowLeft className="h-4 w-4" /> Lihat kelas
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect } from "react";
import { House, RotateCcw, TriangleAlert } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-[70vh] place-items-center px-4 py-16 text-center">
      <div className="card max-w-md animate-scale-in p-8">
        <span className="mx-auto grid h-16 w-16 animate-pop place-items-center rounded-3xl bg-rose-50 text-rose-500">
          <TriangleAlert className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-xl font-extrabold text-navy-900">Ups, terjadi kesalahan</h1>
        <p className="mt-2 text-sm text-navy-400">Halaman ini gagal dimuat. Coba lagi, atau kembali ke beranda jika masalah berlanjut.</p>
        {error.digest && <p className="mt-2 font-mono text-[11px] text-navy-300">Kode: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={reset} className="btn-primary">
            <RotateCcw className="h-4 w-4" /> Coba lagi
          </button>
          <Link href="/" className="btn-secondary">
            <House className="h-4 w-4" /> Beranda
          </Link>
        </div>
      </div>
    </div>
  );
}

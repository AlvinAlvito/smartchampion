import { Gamepad2, Medal, ShieldCheck, Sparkles } from "lucide-react";
import { Mascot } from "./mascot";

/** Kerangka halaman masuk / daftar: panel ilustrasi + kartu form. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-dots">
      <div className="container-page grid min-h-[calc(100vh-72px)] items-center gap-10 py-10 lg:grid-cols-2">
        <div className="relative hidden h-full max-h-[620px] overflow-hidden rounded-[36px] bg-hero p-10 text-white shadow-2xl lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-50" />
          <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 animate-blob rounded-full bg-brand-500/40 blur-3xl" />
          <div className="relative">
            <p className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-semibold text-brand-100">
              <Sparkles className="h-3.5 w-3.5" /> Pelatihan POSI
            </p>
            <h2 className="mt-6 text-4xl font-extrabold leading-tight">
              Satu akun untuk <span className="text-gradient">kelas, materi,</span> dan games.
            </h2>
          </div>
          <div className="pointer-events-none relative -my-4 flex items-end justify-center gap-2">
            <Mascot name="smarty" decorative className="h-36 w-auto animate-float drop-shadow-2xl" />
            <Mascot name="champy" decorative className="h-40 w-auto animate-float-slow drop-shadow-2xl [animation-delay:-2s]" />
          </div>
          <div className="relative space-y-3">
            {[
              { icon: Medal, t: "Belajar bersama tutor medalis" },
              { icon: Gamepad2, t: "Games edukasi dengan leaderboard" },
              { icon: ShieldCheck, t: "Pembayaran aman via Midtrans" },
            ].map((f, i) => (
              <div key={f.t} className="glass flex animate-fade-up items-center gap-3 rounded-2xl px-4 py-3" style={{ animationDelay: `${200 + i * 120}ms` }}>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-linear-to-br from-brand-400 to-brand-700">
                  <f.icon className="h-5 w-5" />
                </span>
                <span className="font-semibold">{f.t}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-md animate-fade-up">
          <div className="card p-7 sm:p-9">
            <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">{title}</h1>
            <p className="mb-7 mt-1.5 text-sm text-navy-400">{subtitle}</p>
            {children}
          </div>
          {footer && <div className="mt-5 text-center text-sm text-navy-500">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

import type { LucideIcon } from "lucide-react";

/** Header halaman bergaya hero kecil (navy → ungu) untuk halaman publik & peserta. */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-hero pb-20 pt-10 text-white sm:pt-14">
      <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
      <div className="pointer-events-none absolute -right-16 -top-10 h-72 w-72 animate-blob rounded-full bg-brand-500/30 blur-3xl" />
      <div className="container-page relative animate-fade-up">
        {eyebrow && (
          <p className="glass mb-4 inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-semibold text-brand-100">
            {Icon && <Icon className="h-3.5 w-3.5 text-brand-300" />} {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-navy-200">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}

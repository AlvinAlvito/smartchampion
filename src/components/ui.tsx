import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  gray: "bg-navy-50 text-navy-600 ring-1 ring-inset ring-navy-100",
  brand: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100",
  navy: "bg-navy-800 text-white",
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100",
  yellow: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100",
  red: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-100",
  blue: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("badge", TONES[tone], className)}>{children}</span>;
}

export function statusTone(status: string | null | undefined): Tone {
  const s = (status ?? "").toUpperCase();
  if (["PAID", "LUNAS", "OPEN", "SUDAH"].includes(s)) return "green";
  if (["PENDING", "FOLLOW-UP", "TRIAL", "DIARAHKAN", "RUNNING"].includes(s)) return "yellow";
  if (["LOST", "FAILED", "EXPIRED", "CANCELLED", "CLOSED", "BUKAN LEAD"].includes(s)) return "red";
  if (["DIHUBUNGI", "BARU"].includes(s)) return "blue";
  return "gray";
}

const ICON_TONES: Record<Tone, string> = {
  gray: "from-navy-400 to-navy-600",
  brand: "from-brand-500 to-brand-700",
  navy: "from-navy-600 to-navy-900",
  green: "from-emerald-400 to-emerald-600",
  yellow: "from-amber-400 to-orange-500",
  red: "from-rose-400 to-rose-600",
  blue: "from-sky-400 to-navy-500",
};

export function IconBox({ icon: Icon, tone = "brand", className }: { icon: LucideIcon; tone?: Tone; className?: string }) {
  return (
    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-linear-to-br text-white shadow-md", ICON_TONES[tone], className)}>
      <Icon className="h-5 w-5" />
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "brand",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
}) {
  return (
    <div className="card group relative min-w-0 overflow-hidden p-4! transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(19,62,87,0.35)] sm:p-5!">
      <div className={cn("pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-linear-to-br opacity-10 transition group-hover:scale-125 group-hover:opacity-20", ICON_TONES[tone])} />
      {/* Ikon diposisikan absolut agar label panjang punya ruang penuh & bisa turun baris */}
      {icon && <IconBox icon={icon} tone={tone} className="absolute right-3 top-3 h-9 w-9 rounded-xl sm:right-4 sm:top-4 sm:h-10 sm:w-10 sm:rounded-2xl" />}
      <div className={cn("min-w-0", icon && "pr-10 sm:pr-12")}>
        <p className="wrap-break-word text-[10px] font-bold uppercase leading-snug tracking-wide text-navy-400 sm:text-[11px] sm:tracking-wider">{label}</p>
        <p className="mt-1.5 wrap-break-word text-xl font-extrabold leading-tight tracking-tight text-navy-900 sm:text-2xl">{value}</p>
      </div>
      {hint && <p className="mt-1 text-xs text-navy-400">{hint}</p>}
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
  action,
  icon: Icon,
  eyebrow,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: LucideIcon;
  eyebrow?: string;
}) {
  return (
    <div className="mb-7 flex animate-fade-up flex-wrap items-end justify-between gap-4">
      <div className="flex items-start gap-3.5">
        {Icon && (
          <span className="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-brand-500 to-navy-700 text-white shadow-lg shadow-brand-500/25 sm:grid">
            <Icon className="h-6 w-6" />
          </span>
        )}
        <div>
          {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">{eyebrow}</p>}
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 sm:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-navy-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ title, icon: Icon, action }: { title: string; icon?: LucideIcon; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-navy-500">
        {Icon && <Icon className="h-4 w-4 text-brand-500" />}
        {title}
      </h2>
      {action}
    </div>
  );
}

export function QuotaBar({ filled, min, dark = false }: { filled: number; min: number; dark?: boolean }) {
  const pct = Math.min(100, Math.round((filled / Math.max(min, 1)) * 100));
  const done = filled >= min;
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className={cn("font-semibold", dark ? "text-white/80" : "text-navy-600")}>
          {filled}/{min} peserta
        </span>
        <span className={done ? "font-bold text-emerald-500" : dark ? "text-white/60" : "text-navy-400"}>
          {done ? "✓ Kuota terpenuhi" : `kurang ${min - filled} lagi`}
        </span>
      </div>
      <div className={cn("h-2.5 overflow-hidden rounded-full", dark ? "bg-white/15" : "bg-navy-50")}>
        <div
          className={cn(
            "h-full rounded-full bg-[length:200%_100%] animate-gradient transition-[width] duration-1000",
            done ? "bg-linear-to-r from-emerald-400 via-teal-400 to-emerald-500" : "bg-linear-to-r from-brand-500 via-sky-400 to-brand-700",
          )}
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
    </div>
  );
}

export function EmptyState({ title, desc, action, icon: Icon = Inbox }: { title: string; desc?: string; action?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="card flex flex-col items-center gap-3 border-dashed py-14 text-center">
      <span className="grid h-16 w-16 animate-float place-items-center rounded-3xl bg-linear-to-br from-brand-100 to-navy-100 text-brand-600">
        <Icon className="h-8 w-8" />
      </span>
      <p className="text-base font-bold text-navy-900">{title}</p>
      {desc && <p className="max-w-md text-sm text-navy-400">{desc}</p>}
      {action}
    </div>
  );
}

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="mt-1 animate-fade-in text-xs font-medium text-rose-600">{errors[0]}</p>;
}

export function Field({ label, htmlFor, children, errors, hint, className }: { label: string; htmlFor?: string; children: React.ReactNode; errors?: string[]; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-navy-400">{hint}</p>}
      <FieldError errors={errors} />
    </div>
  );
}

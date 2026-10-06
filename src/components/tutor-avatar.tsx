import { cn } from "@/lib/utils";

const GRADIENTS = ["from-brand-500 to-navy-700", "from-sun-500 to-sun-700", "from-sky-500 to-brand-600", "from-emerald-500 to-sky-700", "from-amber-500 to-rose-600"];

export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/** Foto tutor; bila belum ada foto → inisial di atas gradien (warna tetap per nama). */
export function TutorAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const g = GRADIENTS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % GRADIENTS.length];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- file lokal via /api/tutor-foto, tanpa optimasi gambar
    return <img src={src} alt={`Foto ${name}`} loading="lazy" className={cn("object-cover", className)} />;
  }
  return (
    <span aria-label={name} className={cn("grid place-items-center bg-linear-to-br font-extrabold text-white", g, className)}>
      {initialsOf(name)}
    </span>
  );
}

/** Teks daftar tersimpan (satu poin per baris) → array. */
export function listItems(text: string | null | undefined) {
  return (text ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

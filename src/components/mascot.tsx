/**
 * Maskot & logo Smart Champion: SMARTY (kucing kuning) & CHAMPY (kucing biru).
 * File WebP sudah dioptimalkan di /public/brand (sumber: assets.posi.id/smartchampion).
 * Sengaja <img> biasa (bukan next/image): build standalone di server Linux tidak membawa sharp.
 */
export const MASCOTS = {
  smarty: { src: "/brand/smarty-2026.webp", w: 615, h: 720, alt: "Smarty, maskot kucing kuning Smart Champion" },
  "smarty-idea": { src: "/brand/smarty-idea.webp", w: 407, h: 395, alt: "Smarty mendapat ide" },
  "smarty-laugh": { src: "/brand/smarty-laugh.webp", w: 420, h: 417, alt: "Smarty tertawa" },
  "smarty-shy": { src: "/brand/smarty-shy.webp", w: 420, h: 411, alt: "Smarty terkejut senang" },
  "smarty-sleep": { src: "/brand/smarty-sleep.webp", w: 420, h: 345, alt: "Smarty sedang sedih" },
  champy: { src: "/brand/champy-2026.webp", w: 624, h: 720, alt: "Champy, maskot kucing biru Smart Champion" },
  "champy-cheer": { src: "/brand/champy-1.webp", w: 591, h: 720, alt: "Champy mengacungkan jempol" },
  "champy-coin": { src: "/brand/champy-coin.webp", w: 402, h: 420, alt: "Champy bersorak juara" },
  "champy-idea": { src: "/brand/champy-idea.webp", w: 392, h: 420, alt: "Champy mendapat ide" },
  "champy-laugh": { src: "/brand/champy-laugh.webp", w: 420, h: 370, alt: "Champy tertawa" },
  "champy-sleep": { src: "/brand/champy-sleep.webp", w: 420, h: 369, alt: "Champy sedang sedih" },
  sc: { src: "/brand/sc.webp", w: 469, h: 512, alt: "Logo Smart Champion" },
  wordmark: { src: "/brand/smart-champion-logo-1-stroke.webp", w: 512, h: 383, alt: "Smart Champion" },
} as const;

export type MascotName = keyof typeof MASCOTS;

export function Mascot({
  name,
  className,
  priority = false,
  decorative = false,
}: {
  name: MascotName;
  className?: string;
  /** gambar di atas lipatan (hero) → dimuat segera */
  priority?: boolean;
  /** hanya hiasan → alt kosong agar tidak dibaca pembaca layar */
  decorative?: boolean;
}) {
  const m = MASCOTS[name];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={m.src}
      width={m.w}
      height={m.h}
      alt={decorative ? "" : m.alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      draggable={false}
      className={className}
    />
  );
}

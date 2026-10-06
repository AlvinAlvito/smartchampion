import { cn } from "@/lib/utils";

/** Penghitung pengunjung Flag Counter (flagcounter.com) — gambar eksternal, dihitung setiap kali termuat. */
export function FlagCounter({ className }: { className?: string }) {
  return (
    <a href="https://info.flagcounter.com/MHVa" target="_blank" rel="noopener noreferrer" className={cn("inline-block overflow-hidden rounded-lg", className)} title="Statistik pengunjung">
      {/* eslint-disable-next-line @next/next/no-img-element -- gambar penghitung eksternal, tidak boleh dioptimasi/di-cache ulang */}
      <img
        src="https://s01.flagcounter.com/count2/MHVa/bg_FFFFFF/txt_000000/border_CCCCCC/columns_3/maxflags_12/viewers_Pengunjung/labels_0/pageviews_0/flags_0/percent_0/"
        alt="Flag Counter"
        width={176}
        height={60}
        // eager: dihitung walau pengunjung tidak menggulir sampai footer
        loading="eager"
        className="block h-auto max-w-full"
      />
    </a>
  );
}

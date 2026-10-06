import Link from "next/link";
import { Mascot } from "./mascot";

/** Logo: bintang Smart Champion + nama "Pelatihan POSI" */
export function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5 font-extrabold tracking-tight">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white p-1 shadow-lg shadow-brand-900/15 ring-1 ring-sun-200 transition group-hover:rotate-[-6deg] group-hover:scale-105">
        <Mascot name="sc" className="h-full w-full object-contain" decorative priority />
      </span>
      <span className={light ? "text-white" : "text-navy-900"}>
        Pelatihan <span className={light ? "text-sun-300" : "text-brand-600"}>POSI</span>
      </span>
    </Link>
  );
}

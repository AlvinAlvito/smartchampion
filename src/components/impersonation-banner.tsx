import { Eye, Undo2 } from "lucide-react";
import { getSession } from "@/lib/session";
import { stopImpersonationAction } from "@/app/actions/impersonate";
import { ROLE_LABEL } from "@/lib/constants";

/** Penanda melayang saat root/admin sedang "masuk sebagai" akun lain, dengan tombol kembali. */
export async function ImpersonationBanner() {
  const session = await getSession();
  if (!session?.impersonatorId) return null;
  return (
    <div
      role="status"
      data-impersonation-banner
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-[95] mx-auto flex max-w-md animate-slide-up items-center gap-3 rounded-3xl bg-linear-to-r from-amber-400 to-orange-500 py-2 pl-4 pr-2 text-sm text-navy-950 shadow-[0_18px_40px_-12px_rgba(234,88,12,0.6)] ring-2 ring-white/70 md:bottom-5 lg:left-auto lg:right-5 lg:mx-0"
    >
      <Eye className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 leading-tight">
        <span className="block text-[11px] font-semibold opacity-80">Masuk sebagai</span>
        <b className="block truncate">
          {session.name} · {ROLE_LABEL[session.role]}
        </b>
      </p>
      <form action={stopImpersonationAction}>
        <button className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-2xl bg-navy-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-navy-800">
          <Undo2 className="h-3.5 w-3.5" /> Kembali ke {session.impersonatorName ?? "akun admin"}
        </button>
      </form>
    </div>
  );
}

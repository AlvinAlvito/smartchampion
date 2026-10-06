"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** Garis progres tipis di atas layar saat berpindah halaman. */
export function NavProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<{ active: boolean; key: string }>({ active: false, key: "" });
  const routeKey = `${pathname}?${searchParams.toString()}`;

  // Mulai saat link internal diklik
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setState({ active: true, key: `${location.pathname}?${location.search.slice(1)}` });
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (form.method.toLowerCase() === "get") setState({ active: true, key: `${location.pathname}?${location.search.slice(1)}` });
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  // Selesai ketika rute berubah (atau batas aman 8 detik)
  const active = state.active && state.key === routeKey;
  useEffect(() => {
    if (!state.active) return;
    const t = setTimeout(() => setState({ active: false, key: "" }), 8000);
    return () => clearTimeout(t);
  }, [state.active]);

  if (!active) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[120] h-[3px] overflow-hidden bg-brand-100/60">
      <div className="h-full w-2/5 animate-progress rounded-full bg-linear-to-r from-brand-500 via-sun-400 to-sky-400" />
    </div>
  );
}

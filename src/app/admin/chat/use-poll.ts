"use client";

import { useEffect, useRef } from "react";

/**
 * Jalankan `fn` segera lalu tiap `ms` milidetik. Berhenti sementara saat tab tidak terlihat
 * (hemat server) dan langsung jalan lagi ketika tab kembali dibuka.
 */
export function usePoll(fn: () => unknown, ms: number | null, deps: unknown[]) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (ms == null) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === "visible") {
        try {
          await ref.current();
        } catch {
          /* jaringan putus sesaat: coba lagi di putaran berikutnya */
        }
      }
      if (alive) timer = setTimeout(tick, ms);
    };
    void tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}

export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((data as { error?: string }).error ?? `HTTP ${r.status}`), { status: r.status });
  return data as T;
}

export async function postJson<T>(url: string, body: unknown): Promise<T & { error?: string; ok?: boolean }> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok && !data.error) (data as { error?: string }).error = r.status === 429 ? "Terlalu banyak permintaan. Tunggu sebentar." : `Gagal (HTTP ${r.status}).`;
  return data;
}

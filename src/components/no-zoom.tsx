"use client";

import { useEffect } from "react";

/**
 * Safari iOS mengabaikan `user-scalable=no` untuk pinch-zoom (demi aksesibilitas),
 * jadi gestur pinch diblokir lewat event gesture* khusus WebKit. Browser lain cukup dengan meta viewport.
 */
export function NoZoom() {
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();
    const opts = { passive: false } as const;
    const events = ["gesturestart", "gesturechange", "gestureend"];
    events.forEach((ev) => document.addEventListener(ev, block, opts));
    return () => events.forEach((ev) => document.removeEventListener(ev, block));
  }, []);
  return null;
}

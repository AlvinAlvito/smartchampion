"use client";

import { useMemo } from "react";

const COLORS = ["#2e89bc", "#14577d", "#84c3e5", "#22445f", "#38bdf8", "#f0abfc", "#ffffff"];

/** Konfeti ringan (CSS) untuk momen sukses. */
export function Confetti({ count = 48 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: (i * 37) % 100,
        delay: ((i * 53) % 100) / 100,
        color: COLORS[i % COLORS.length],
        rot: (i * 29) % 360,
      })),
    [count],
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-[440px] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece" style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, transform: `rotate(${p.rot}deg)` }} />
      ))}
    </div>
  );
}

"use client";

import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import type { VideoInfo } from "@/lib/video";

/** Pratinjau thumbnail → klik → pemutar video (iframe baru dimuat saat diputar agar halaman ringan) */
export function GuideVideo({ video, title }: { video: VideoInfo; title: string }) {
  const [play, setPlay] = useState(false);
  const [thumbOk, setThumbOk] = useState(true);
  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-3xl bg-navy-950 shadow-xl ring-1 ring-navy-100">
        {play ? (
          <iframe
            src={`${video.embed}${video.kind === "youtube" ? "&autoplay=1" : ""}`}
            title={title}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button type="button" onClick={() => setPlay(true)} className="group absolute inset-0" aria-label={`Putar video: ${title}`}>
            {thumbOk ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={video.thumb} alt="" onError={() => setThumbOk(false)} className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-105" />
            ) : (
              <span className="absolute inset-0 bg-linear-to-br from-brand-600 to-navy-900" />
            )}
            <span className="absolute inset-0 bg-linear-to-t from-navy-950/70 via-navy-950/10 to-transparent" />
            <span className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-brand-600 shadow-2xl transition group-hover:scale-110">
              <Play className="ml-1 h-9 w-9 fill-current" />
            </span>
            <span className="absolute bottom-4 left-5 right-5 text-left text-sm font-bold text-white drop-shadow">▶ Tonton video tutorial</span>
          </button>
        )}
      </div>
      <a href={video.watch} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
        Buka di {video.kind === "youtube" ? "YouTube" : "Google Drive"} <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

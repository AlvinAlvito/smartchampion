"use client";

import { useState, useSyncExternalStore } from "react";
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

const SMALL = "(max-width: 767px)";
function subscribeSmall(cb: () => void) {
  const mq = window.matchMedia(SMALL);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Video panduan: MP4 versi laptop / HP (diunggah ke website) dan/atau video YouTube–Drive, dengan tab pilihan */
export function GuideVideos({ laptop, hp, video, title }: { laptop?: string | null; hp?: string | null; video?: VideoInfo | null; title: string }) {
  const tabs = [
    ...(laptop ? [{ k: "laptop", l: "💻 Versi Laptop" }] : []),
    ...(hp ? [{ k: "hp", l: "📱 Versi HP" }] : []),
    ...(video ? [{ k: "link", l: video.kind === "youtube" ? "▶ YouTube" : "▶ Google Drive" }] : []),
  ];
  const small = useSyncExternalStore(subscribeSmall, () => window.matchMedia(SMALL).matches, () => false);
  const [picked, setPicked] = useState<string | null>(null);
  if (!tabs.length) return null;
  // belum memilih: di layar kecil langsung versi HP, selain itu tab pertama
  const tab = picked ?? (hp && small ? "hp" : tabs[0].k);
  const setTab = setPicked;
  const src = tab === "hp" ? hp : tab === "laptop" ? laptop : null;
  return (
    <div>
      {tabs.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Pilih versi video">
          {tabs.map((t) => (
            <button
              key={t.k}
              type="button"
              role="tab"
              aria-selected={tab === t.k}
              onClick={() => setTab(t.k)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === t.k ? "bg-navy-900 text-white shadow-md" : "bg-navy-50 text-navy-600 hover:bg-brand-50 hover:text-brand-700"}`}
            >
              {t.l}
            </button>
          ))}
        </div>
      )}
      {src ? (
        <>
          <video key={src} src={src} controls playsInline preload="metadata" className="aspect-video w-full rounded-3xl bg-navy-950 shadow-xl ring-1 ring-navy-100" aria-label={`Video: ${title}`} />
          <a href={src} download className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
            Unduh video
          </a>
        </>
      ) : (
        video && <GuideVideo video={video} title={title} />
      )}
    </div>
  );
}

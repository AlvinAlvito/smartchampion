"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Expand, Images, Megaphone, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ShowcasePost = { id: number; title: string; category: string | null; body: string; imageUrl: string | null };
export type ShowcaseImage = { id: number; url: string; caption: string | null };

const noopSubscribe = () => () => {};
const useMounted = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

/** Lapisan layar penuh (portal ke body agar tidak terpotong animasi/transform induk) */
function Overlay({ onClose, children, label }: { onClose: () => void; children: React.ReactNode; label: string }) {
  const mounted = useMounted();
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-[100] flex animate-fade-in items-center justify-center bg-navy-950/90 p-4 backdrop-blur-sm" onClick={onClose}>
      <button type="button" onClick={onClose} className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20" aria-label="Tutup">
        <X className="h-5 w-5" />
      </button>
      <div className="contents" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Lightbox gambar ---------------- */

function Lightbox({ images, index, onClose }: { images: ShowcaseImage[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index);
  const go = useCallback((d: number) => setI((x) => (x + d + images.length) % images.length), [images.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);
  const img = images[i];
  return (
    <Overlay onClose={onClose} label="Galeri foto">
      <figure className="relative flex max-h-full max-w-5xl flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={img.id} src={img.url} alt={img.caption ?? ""} className="max-h-[78vh] w-auto animate-fade-in rounded-2xl object-contain shadow-2xl" />
        {(img.caption || images.length > 1) && (
          <figcaption className="mt-4 text-center text-sm text-white/85">
            {img.caption}
            {images.length > 1 && (
              <span className="ml-2 text-white/50">
                {i + 1}/{images.length}
              </span>
            )}
          </figcaption>
        )}
      </figure>
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
            aria-label="Sebelumnya"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
            aria-label="Berikutnya"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}
    </Overlay>
  );
}

/* ---------------- Flyer di header ---------------- */

export function FlyerPreview({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative hidden w-44 shrink-0 rotate-2 overflow-hidden rounded-3xl shadow-2xl ring-4 ring-white/15 transition duration-300 hover:rotate-0 hover:scale-[1.03] md:block lg:w-52"
        aria-label="Perbesar flyer kelas"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`Flyer ${name}`} className="aspect-[4/5] w-full object-cover" />
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-linear-to-t from-navy-950/80 to-transparent pb-3 pt-8 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
          <Expand className="h-3.5 w-3.5" /> Lihat flyer
        </span>
      </button>
      {open && <Lightbox images={[{ id: 0, url, caption: null }]} index={0} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Versi layar kecil: tombol "Lihat flyer" di bawah judul */
export function FlyerPreviewMobile({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 py-1 pl-1 pr-3.5 text-xs font-bold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/25 md:hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`Flyer ${name}`} className="h-8 w-8 rounded-full object-cover" />
        <Expand className="h-3.5 w-3.5" /> Lihat flyer
      </button>
      {open && <Lightbox images={[{ id: 0, url, caption: null }]} index={0} onClose={() => setOpen(false)} />}
    </>
  );
}

/* ---------------- Mading (slider kartu) ---------------- */

export function MadingSlider({ posts }: { posts: ShowcasePost[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: posts.length <= 1 });
  const [reading, setReading] = useState<ShowcasePost | null>(null);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const w = card ? card.offsetWidth + 16 : el.clientWidth;
    setActive(Math.min(posts.length - 1, Math.round(el.scrollLeft / w)));
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  const scrollTo = (idx: number) => {
    const el = track.current;
    const card = el?.children[idx] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };
  useEffect(() => {
    onScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="card overflow-hidden">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-navy-900">
          <Megaphone className="h-5 w-5 text-brand-600" /> Mading kelas
        </h2>
        {posts.length > 1 && (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => scrollTo(Math.max(0, active - 1))}
              disabled={edges.start}
              className="grid h-9 w-9 place-items-center rounded-full bg-navy-50 text-navy-600 transition hover:bg-brand-100 hover:text-brand-700 disabled:opacity-35"
              aria-label="Mading sebelumnya"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollTo(Math.min(posts.length - 1, active + 1))}
              disabled={edges.end}
              className="grid h-9 w-9 place-items-center rounded-full bg-navy-50 text-navy-600 transition hover:bg-brand-100 hover:text-brand-700 disabled:opacity-35"
              aria-label="Mading berikutnya"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <div
        ref={track}
        onScroll={onScroll}
        className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {posts.map((p) => (
          <article
            key={p.id}
            className={cn(
              "group flex shrink-0 snap-start flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-navy-100 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-brand-100/60",
              posts.length === 1 ? "w-full" : "w-[82%] sm:w-[calc(50%-8px)]",
            )}
          >
            <div className="relative aspect-[16/10] overflow-hidden bg-linear-to-br from-brand-500 via-brand-700 to-navy-900">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
              ) : (
                <>
                  <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />
                  <Megaphone className="absolute bottom-4 right-4 h-16 w-16 -rotate-12 text-white/15" />
                  <p className="absolute inset-x-5 bottom-5 line-clamp-3 text-xl font-extrabold leading-tight text-white">{p.title}</p>
                </>
              )}
              {p.category && (
                <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-700 shadow-sm backdrop-blur">
                  {p.category}
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="line-clamp-2 font-bold leading-snug text-navy-900">{p.title}</h3>
              <p className="mt-2 line-clamp-3 flex-1 whitespace-pre-line text-sm leading-relaxed text-navy-500">{p.body}</p>
              <button type="button" onClick={() => setReading(p)} className="mt-4 self-start text-sm font-bold text-brand-600 transition hover:gap-2 hover:text-brand-700">
                Baca selengkapnya →
              </button>
            </div>
          </article>
        ))}
      </div>
      {posts.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {posts.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => scrollTo(i)}
              className={cn("h-1.5 rounded-full transition-all", i === active ? "w-6 bg-brand-600" : "w-1.5 bg-navy-200 hover:bg-navy-300")}
              aria-label={`Mading ${i + 1}`}
            />
          ))}
        </div>
      )}
      {reading && (
        <Overlay onClose={() => setReading(null)} label={reading.title}>
          <article className="max-h-[88vh] w-full max-w-2xl animate-fade-up overflow-y-auto rounded-[28px] bg-white shadow-2xl">
            {reading.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={reading.imageUrl} alt="" className="max-h-[50vh] w-full bg-navy-50 object-contain" />
            )}
            <div className="p-6 sm:p-8">
              {reading.category && <p className="text-xs font-bold uppercase tracking-wider text-brand-600">{reading.category}</p>}
              <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-navy-900">{reading.title}</h3>
              <p className="mt-4 whitespace-pre-line leading-relaxed text-navy-600">{reading.body}</p>
            </div>
          </article>
        </Overlay>
      )}
    </section>
  );
}

/* ---------------- Galeri (layout bento) ---------------- */

/** Pola ukuran ubin: gambar pertama besar, lalu variasi tinggi/lebar agar tidak monoton */
const TILE = ["col-span-2 row-span-2", "", "row-span-2", "", "col-span-2", "", "", "row-span-2", ""];

export function ClassGallery({ images }: { images: ShowcaseImage[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 9;
  const list = showAll ? images : images.slice(0, LIMIT);
  // 1–2 gambar: tampil sederhana tanpa pola bento
  const simple = images.length <= 2;
  return (
    <section className="card">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy-900">
        <Images className="h-5 w-5 text-brand-600" /> Galeri kelas
        <span className="text-sm font-medium text-navy-400">({images.length})</span>
      </h2>
      <div className={cn("grid gap-3", simple ? (images.length === 1 ? "grid-cols-1" : "grid-cols-2") : "grid-flow-row-dense auto-rows-[120px] grid-cols-2 sm:auto-rows-[150px] sm:grid-cols-4")}>
        {list.map((g, i) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setOpen(i)}
            className={cn(
              "group relative overflow-hidden rounded-2xl bg-navy-50 ring-1 ring-navy-100",
              simple ? "aspect-[4/3]" : TILE[i % TILE.length],
            )}
            aria-label={g.caption ? `Perbesar: ${g.caption}` : `Perbesar foto ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={g.url} alt={g.caption ?? ""} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
            <span className="absolute inset-0 bg-linear-to-t from-navy-950/70 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
            {g.caption && (
              <span className="absolute inset-x-3 bottom-2.5 line-clamp-2 text-left text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">{g.caption}</span>
            )}
          </button>
        ))}
      </div>
      {images.length > LIMIT && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="btn-secondary btn-sm mx-auto mt-4 flex">
          {showAll ? "Tampilkan lebih sedikit" : `Lihat semua ${images.length} foto`}
        </button>
      )}
      {open !== null && <Lightbox images={images} index={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

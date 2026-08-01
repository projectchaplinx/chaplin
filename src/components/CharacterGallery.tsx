"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

function uniqueImages(images: string[]) {
  return [...new Set(images.map((image) => image.trim()).filter(Boolean))];
}

export default function CharacterGallery({
  name,
  images,
}: {
  name: string;
  images: string[];
}) {
  const galleryImages = useMemo(() => uniqueImages(images), [images]);
  const [openImage, setOpenImage] = useState<string | null>(null);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const openIndex = openImage ? galleryImages.indexOf(openImage) : -1;
  const activeImage = openIndex >= 0 ? openImage : null;
  const lightboxOpen = Boolean(activeImage);

  useEffect(() => {
    if (!lightboxOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [lightboxOpen]);

  useEffect(() => {
    if (!activeImage || openIndex < 0 || galleryImages.length < 2) return;
    const adjacent = [
      galleryImages[(openIndex - 1 + galleryImages.length) % galleryImages.length],
      galleryImages[(openIndex + 1) % galleryImages.length],
    ];
    adjacent.forEach((src) => {
      const preload = new window.Image();
      preload.src = src;
    });
  }, [activeImage, galleryImages, openIndex]);

  const closeGallery = useCallback(() => {
    setOpenImage(null);
  }, []);

  const move = useCallback((direction: -1 | 1) => {
    if (openIndex < 0 || galleryImages.length < 2) return;
    const nextIndex = (openIndex + direction + galleryImages.length) % galleryImages.length;
    setOpenImage(galleryImages[nextIndex]);
  }, [galleryImages, openIndex]);

  useEffect(() => {
    if (!activeImage) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeGallery();
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeImage, closeGallery, move]);

  const lightbox = mounted && activeImage && openIndex >= 0 ? createPortal(
    <div
      className="fixed inset-0 z-[200] grid grid-rows-[auto_minmax(0,1fr)_auto] bg-black/95 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`${name} gallery image ${openIndex + 1} of ${galleryImages.length}`}
      data-character-gallery-lightbox
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeGallery();
      }}
    >
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Gallery {openIndex + 1} / {galleryImages.length}
          </p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={closeGallery}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/45 text-xl text-white transition-colors hover:border-white/50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Close gallery"
        >
          &times;
        </button>
      </header>

      <div
        className="relative min-h-0 overflow-hidden p-3 sm:p-5"
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) closeGallery();
        }}
        onTouchStart={(event) => {
          touchStartX.current = event.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStartX.current;
          const end = event.changedTouches[0]?.clientX;
          touchStartX.current = null;
          if (start === null || end === undefined || Math.abs(end - start) < 45) return;
          move(end < start ? 1 : -1);
        }}
      >
        <div className="relative mx-auto h-full w-full max-w-[92rem] overflow-hidden rounded-lg bg-black shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
          <Image
            src={activeImage}
            alt={`${name} — gallery photo ${openIndex + 1}`}
            fill
            priority
            sizes="100vw"
            className="select-none object-contain"
          />
        </div>

        {galleryImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => move(-1)}
              className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/65 text-xl text-white shadow-lg backdrop-blur-sm transition-colors hover:border-white/50 hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:left-7"
              aria-label="Previous image"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/65 text-xl text-white shadow-lg backdrop-blur-sm transition-colors hover:border-white/50 hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:right-7"
              aria-label="Next image"
            >
              →
            </button>
          </>
        )}
      </div>

      {galleryImages.length > 1 && (
        <div className="border-t border-white/10 bg-black/80 px-3 py-3 sm:px-6">
          <div className="chaplin-scrollbar mx-auto flex max-w-4xl snap-x gap-2 overflow-x-auto pb-1">
            {galleryImages.map((src, index) => (
              <button
                key={src}
                type="button"
                onClick={() => setOpenImage(src)}
                className={`relative h-14 w-20 shrink-0 snap-center overflow-hidden rounded-md border transition-colors sm:h-16 sm:w-24 ${
                  index === openIndex ? "border-accent" : "border-white/15 hover:border-white/45"
                }`}
                aria-label={`Open gallery image ${index + 1}`}
                aria-current={index === openIndex ? "true" : undefined}
              >
                <Image src={src} alt="" fill sizes="96px" className="object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <section className="poster-card rounded-md p-5" data-character-gallery>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-grey">Gallery</h2>
          <p className="mt-1 text-[9px] text-grey">Open an image, then browse with arrows or swipe.</p>
        </div>
        <span className="rounded-full border border-line px-2 py-1 font-mono text-[9px] text-grey">
          {galleryImages.length}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {galleryImages.map((src, index) => (
          <button
            key={src}
            type="button"
            onClick={(event) => {
              returnFocusRef.current = event.currentTarget;
              setOpenImage(src);
            }}
            className="group relative aspect-square overflow-hidden rounded-sm border border-transparent bg-black/20 transition-colors hover:border-accent focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label={`Open ${name} gallery image ${index + 1}`}
          >
            <Image
              src={src}
              alt={`${name} — gallery photo ${index + 1}`}
              fill
              sizes="(max-width: 640px) 33vw, 120px"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          </button>
        ))}
      </div>
      {lightbox}
    </section>
  );
}

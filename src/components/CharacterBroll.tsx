"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import type { Character } from "@/lib/types";
import { IconMicrophone, IconMusic, IconShuffle, IconWaveform } from "@/components/Icons";

type BrollState = {
  latestVideoUrl: string | null;
  voicePreviewUrl: string | null;
  latestDialogueUrl: string | null;
  latestSfxUrl: string | null;
  latestThemeUrl: string | null;
};

type AudioMode = "voice" | "sfx" | "theme";

const WAVEFORM_BARS = [34, 72, 48, 86, 58, 94, 42, 78, 54, 88, 38, 68, 46, 82, 52, 74];

export default function CharacterBroll({
  character,
  /*
    The scrim exists to keep overlaid text legible. When the name and tagline
    sit beside the frame rather than on top of it there is nothing to protect,
    and the gradient just dims a third of the performance.
  */
  scrim = true,
  /*
    "fill" stretches to a frame the caller has already shaped. "natural" makes
    this component size ITSELF from the media's own dimensions: the caller fixes
    a height, and the width follows the real aspect ratio. That is the only way
    a catalogue holding both 1280x720 clips and vertical ones can be shown
    without object-cover slicing something off one of them.
  */
  fit = "fill",
}: { character: Character; scrim?: boolean; fit?: "fill" | "natural" }) {
  // 16:9 until the real dimensions arrive, so the frame does not jump far.
  const [naturalRatio, setNaturalRatio] = useState(16 / 9);
  const posterRef = useRef<HTMLImageElement | null>(null);
  const dialogueRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const themeRef = useRef<HTMLAudioElement | null>(null);
  const [production, setProduction] = useState<BrollState | null>(null);
  const [playingMode, setPlayingMode] = useState<AudioMode | null>(null);
  const [mixing, setMixing] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function loadBroll() {
      fetch(`/api/generate?characterId=${encodeURIComponent(character.id)}`, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`B-roll state returned ${response.status}.`);
          return response.json();
        })
        .then((data: { production?: BrollState | null }) => {
          if (!cancelled) setProduction(data.production ?? null);
        })
        .catch(() => {
          if (!cancelled) setProduction(null);
        });
    }

    function handleMediaUpdated(event: Event) {
      const detail = (event as CustomEvent<{ characterId?: string }>).detail;
      if (detail?.characterId === character.id) loadBroll();
    }

    loadBroll();
    window.addEventListener("chaplin:media-updated", handleMediaUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("chaplin:media-updated", handleMediaUpdated);
    };
  }, [character.id]);

  useEffect(() => {
    if (!consoleOpen) return;
    const previousOverflow = document.body.style.overflow;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setConsoleOpen(false);
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [consoleOpen]);

  const videoSource = production?.latestVideoUrl ?? character.videoUrl ?? null;
  const dialogueSource = production?.latestDialogueUrl ?? production?.voicePreviewUrl ?? null;
  const sfxSource = production?.latestSfxUrl ?? null;
  const themeSource = production?.latestThemeUrl ?? null;
  const posterSource = character.bannerUrl ?? character.imageUrl ?? null;

  /*
    A priority image is usually already decoded by the time React hydrates, so
    its onLoad never fires on the client and the frame would keep the 16:9
    guess. Read the dimensions directly whenever the poster changes.
  */
  useEffect(() => {
    if (videoSource) return;
    const el = posterRef.current;
    if (!el || !el.complete || !el.naturalWidth || !el.naturalHeight) return;
    setNaturalRatio(el.naturalWidth / el.naturalHeight);
  }, [posterSource, videoSource]);

  const trackDetails = [
    {
      mode: "voice" as const,
      label: "Voice",
      description: production?.latestDialogueUrl ? "Latest performed dialogue" : "Locked voice preview",
      direction: character.voiceDesc,
      source: dialogueSource,
      icon: IconMicrophone,
    },
    {
      mode: "theme" as const,
      label: "Theme",
      description: "Character score",
      direction: character.themeDesc,
      source: themeSource,
      icon: IconMusic,
    },
    {
      mode: "sfx" as const,
      label: "Effects",
      description: "Signature sound",
      direction: character.sfxDesc,
      source: sfxSource,
      icon: IconWaveform,
    },
  ];
  const availableTracks = trackDetails.filter((track) => Boolean(track.source));

  function stopSound() {
    dialogueRef.current?.pause();
    sfxRef.current?.pause();
    themeRef.current?.pause();
    setPlayingMode(null);
    setMixing(false);
  }

  function trackRef(mode: AudioMode) {
    return mode === "voice" ? dialogueRef.current : mode === "sfx" ? sfxRef.current : themeRef.current;
  }

  async function playTrack(mode: AudioMode) {
    if (playingMode === mode && !mixing) {
      stopSound();
      return;
    }

    stopSound();
    const audio = trackRef(mode);
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = mode === "theme" ? 0.55 : 1;
    const played = await audio.play().then(() => true).catch(() => false);
    if (played) setPlayingMode(mode);
  }

  async function playSceneMix() {
    if (mixing) {
      stopSound();
      return;
    }

    stopSound();
    const layers = [
      { audio: themeRef.current, volume: 0.38 },
      { audio: sfxRef.current, volume: 0.72 },
      { audio: dialogueRef.current, volume: 1 },
    ].filter((layer): layer is { audio: HTMLAudioElement; volume: number } => Boolean(layer.audio));

    if (!layers.length) {
      setConsoleOpen(true);
      return;
    }

    setMixing(true);
    const results = await Promise.allSettled(
      layers.map(({ audio, volume }) => {
        audio.currentTime = 0;
        audio.volume = volume;
        return audio.play();
      }),
    );
    if (results.every((result) => result.status === "rejected")) setMixing(false);
  }

  function handleTrackEnded(mode: AudioMode) {
    if (playingMode === mode) setPlayingMode(null);
    if (!mixing) return;
    window.setTimeout(() => {
      const media = [dialogueRef.current, sfxRef.current, themeRef.current].filter(Boolean);
      if (media.every((audio) => audio?.paused || audio?.ended)) setMixing(false);
    }, 0);
  }

  const soundConsole = consoleOpen
    ? createPortal(
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/75 p-0 backdrop-blur-xl sm:items-center sm:p-6" role="presentation">
          <button
            type="button"
            aria-label="Close sound console"
            onClick={() => setConsoleOpen(false)}
            className="absolute inset-0 cursor-default"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="sound-console-title"
            className="sound-console relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-white/15 sm:rounded-[28px]"
          >
            <div className="relative min-h-44 overflow-hidden border-b border-white/10 p-5 sm:min-h-52 sm:p-6">
              {posterSource && (
                <Image src={posterSource} alt="" fill sizes="672px" className="object-cover object-[68%_22%] opacity-45" />
              )}
              <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(7,12,5,0.98),rgba(7,12,5,0.58)_60%,rgba(7,12,5,0.22))]" />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#11190d] to-transparent" />

              <div className="relative z-10 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-accent-secondary">Scene sound console</p>
                  <h2 id="sound-console-title" className="reel-title mt-1 text-3xl sm:text-4xl">{character.name}</h2>
                  <p className="mt-1 text-xs text-white/55">{availableTracks.length} of 3 sound layers ready</p>
                </div>
                <button
                  type="button"
                  onClick={() => setConsoleOpen(false)}
                  aria-label="Close sound console"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/30 text-lg text-white/70 backdrop-blur-md hover:border-accent hover:text-white"
                >
                  ×
                </button>
              </div>

              <div className="sound-console-wave relative z-10 mt-7 flex h-9 items-end gap-1" aria-hidden="true">
                {WAVEFORM_BARS.map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className={mixing ? "sound-console-wave-active" : ""}
                    style={{ height: `${height}%`, animationDelay: `${index * 55}ms` }}
                  />
                ))}
              </div>
            </div>

            <div className="chaplin-scrollbar overflow-y-auto p-4 sm:p-6">
              <button
                type="button"
                onClick={playSceneMix}
                disabled={availableTracks.length === 0}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  mixing
                    ? "border-accent-secondary bg-accent-secondary/15 shadow-[0_0_28px_rgba(7,210,190,0.14)]"
                    : "border-accent/55 bg-accent/10 hover:-translate-y-0.5 hover:bg-accent/15"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-full ${mixing ? "bg-accent-secondary text-paper" : "bg-accent text-white"}`}>
                    {mixing ? <span className="text-sm">Ⅱ</span> : <IconShuffle className="h-5 w-5" />}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{mixing ? "Pause the scene mix" : "Shuffle and play together"}</span>
                    <span className="mt-0.5 block text-[10px] text-white/50">
                      {dialogueSource ? "Voice + theme + effects, balanced live" : "Theme + effects; dialogue is optional"}
                    </span>
                  </span>
                </span>
                <span className="rounded-full border border-white/15 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-white/55">
                  {availableTracks.length} layers
                </span>
              </button>

              <div className="mt-4 grid gap-2.5">
                {trackDetails.map(({ mode, label, description, direction, source, icon: Icon }) => {
                  const active = playingMode === mode && !mixing;
                  return (
                    <article key={mode} className={`sound-track-card rounded-2xl border p-3.5 ${source ? "border-white/12" : "border-white/[0.07] opacity-55"}`}>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => playTrack(mode)}
                          disabled={!source}
                          aria-label={active ? `Pause ${label}` : `Play ${label}`}
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed ${
                            active ? "border-accent bg-accent text-white" : "border-white/18 bg-white/[0.055] text-white/75 hover:border-accent hover:text-white"
                          }`}
                        >
                          {active ? <span className="text-xs">Ⅱ</span> : <Icon className="h-4 w-4" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">{label}</p>
                            <span className={`text-[8px] font-semibold uppercase tracking-[0.16em] ${source ? "text-accent-secondary" : "text-white/35"}`}>
                              {source ? "Ready" : "Not made yet"}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] text-white/48">{description}</p>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/68">{direction}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      className={fit === "natural" ? "relative w-full max-w-full lg:h-full lg:w-auto" : "absolute inset-0"}
      style={fit === "natural" ? { aspectRatio: String(naturalRatio) } : undefined}
      data-character-broll
      data-broll-ratio={naturalRatio.toFixed(3)}
    >
      {posterSource ? (
        <Image
          src={posterSource}
          alt=""
          fill
          // The hero fills a max-w-6xl column, so it renders about 1104px wide.
          // Declaring 896px made Next serve an image the browser then upscaled
          // by roughly a quarter, which read as softness on the actor's face.
          sizes="(min-width: 1152px) 1104px, 100vw"
          quality={90}
          ref={posterRef}
          onLoad={(event) => {
            const el = event.currentTarget;
            if (!videoSource && el.naturalWidth && el.naturalHeight) {
              setNaturalRatio(el.naturalWidth / el.naturalHeight);
            }
          }}
          className={`object-cover object-[68%_22%] ${videoSource ? "" : "motion-safe:animate-[broll-drift_8s_ease-in-out_infinite_alternate]"}`}
          priority
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-end pr-[12%] text-[clamp(5rem,18vw,12rem)] font-black text-white/10 motion-safe:animate-[broll-drift_8s_ease-in-out_infinite_alternate]"
          style={{ background: `linear-gradient(135deg, hsl(${character.avatarHue} 35% 18%), #080b02)` }}
          aria-hidden="true"
        >
          {character.name.slice(0, 1)}
        </div>
      )}
      {videoSource && (
        <video
          src={videoSource}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            const el = event.currentTarget;
            if (el.videoWidth && el.videoHeight) setNaturalRatio(el.videoWidth / el.videoHeight);
          }}
          /* Anchored high and right to match the still. Only bites when the
             frame does not match the clip; with fit="natural" it does. */
          className="absolute inset-0 h-full w-full object-cover object-[68%_25%]"
        />
      )}
      {dialogueSource && <audio ref={dialogueRef} src={dialogueSource} preload="metadata" onEnded={() => handleTrackEnded("voice")} data-broll-track="voice" />}
      {sfxSource && <audio ref={sfxRef} src={sfxSource} preload="metadata" onEnded={() => handleTrackEnded("sfx")} data-broll-track="sfx" />}
      {themeSource && <audio ref={themeRef} src={themeSource} preload="metadata" onEnded={() => handleTrackEnded("theme")} data-broll-track="theme" />}

      {/*
        The name and tagline sit bottom-left inside max-w-[78%] on mobile and
        max-w-[52%] on desktop, so the scrim only needs to protect that column.
        It used to run the full width at 92% black falling to 55% mid-frame,
        which dulled the actor's face — object-[68%_22%] deliberately places
        it on the right. The fade now completes before the portrait begins, so
        the right side of the frame renders at full contrast.
      */}
      {scrim && (
        <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/45 to-transparent to-72% sm:via-black/28 sm:to-58%" />
      )}
      {availableTracks.length > 0 && (
        <div className="absolute right-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-end gap-2 sm:right-5" data-broll-audio-controls>
          <button
            type="button"
            onClick={playSceneMix}
            aria-label={mixing ? "Pause scene sound mix" : "Play voice, theme, and effects together"}
            className={`group flex h-10 items-center gap-2 rounded-full border px-3 shadow-xl backdrop-blur-xl transition-all sm:h-11 sm:px-4 ${
              mixing
                ? "scale-105 border-accent-secondary bg-accent-secondary text-paper"
                : "border-accent/70 bg-accent/85 text-white hover:scale-105 hover:bg-accent"
            }`}
          >
            {mixing ? <span className="text-xs">Ⅱ</span> : <IconShuffle className="h-4 w-4" />}
            <span className="hidden text-[10px] font-bold uppercase tracking-wide sm:inline">{mixing ? "Pause mix" : "Scene mix"}</span>
          </button>

          <div className="flex flex-col gap-1.5 rounded-full border border-white/15 bg-black/30 p-1.5 shadow-xl backdrop-blur-xl">
            {availableTracks.map(({ mode, label, icon: Icon }) => {
              const active = playingMode === mode && !mixing;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => playTrack(mode)}
                  aria-label={active ? `Pause ${label.toLowerCase()}` : `Play ${label.toLowerCase()}`}
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${
                    active ? "bg-accent text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {active ? <span className="text-[10px]">Ⅱ</span> : <Icon className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setConsoleOpen(true)}
            className="rounded-full border border-white/20 bg-black/45 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/75 shadow-xl backdrop-blur-xl hover:border-accent-secondary hover:text-white"
          >
            Sound details
          </button>
        </div>
      )}
      {soundConsole}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CHARACTER_STYLE_SHEET_VIEWS,
  characterStyleSheetPrompt,
  styleSheetPanels,
  type CharacterStyleSheetAsset,
} from "@/lib/character-style-sheet";
import type { Character } from "@/lib/types";

type ProductionState = {
  styleSheet: { url: string; assetId: string } | null;
  visualReference: { url: string; assetId: string | null; source: string } | null;
  assets: CharacterStyleSheetAsset[];
};

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error ?? `Request failed with status ${response.status}.`;
}

function StyleSheetSkeleton({
  characterName,
  referenceImage,
  elapsedSeconds,
}: {
  characterName: string;
  referenceImage: string;
  elapsedSeconds: number;
}) {
  return (
    <section aria-live="polite" aria-label="Style sheet generation progress">
      <div className="relative isolate aspect-video overflow-hidden rounded-2xl border border-accent-secondary/35 bg-[#101612]">
        {referenceImage && (
          // eslint-disable-next-line @next/next/no-img-element -- a temporary preview of stored creator media
          <img src={referenceImage} alt="" className="absolute inset-0 h-full w-full scale-105 object-cover opacity-20 blur-xl" />
        )}
        <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,.08)_45%,transparent_70%)]" />
        <div className="relative flex h-full flex-col justify-end bg-gradient-to-t from-black/90 via-black/35 to-transparent p-5">
          <span className="w-fit rounded-full border border-accent-secondary/35 bg-black/45 px-3 py-1 text-[8px] font-bold uppercase tracking-[0.16em] text-accent-secondary">
            Rendering review sheet
          </span>
          <h3 className="mt-3 font-serif text-xl text-ink">Building {characterName}&apos;s visual continuity</h3>
          <p className="mt-1 text-[10px] text-grey">Four-view composite · {elapsedSeconds}s elapsed</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink">Production references</h3>
          <span className="text-[9px] text-grey">Preparing 4 views</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHARACTER_STYLE_SHEET_VIEWS.map((view, index) => (
            <article key={view.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
              <div className="relative aspect-[4/9] overflow-hidden bg-white/[0.035]" style={{ animationDelay: `${index * 140}ms` }}>
                <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_15%,rgba(255,255,255,.08)_45%,transparent_75%)]" />
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] uppercase tracking-[0.12em] text-grey">Queued</span>
              </div>
              <p className="border-t border-white/8 px-2 py-2 text-center text-[8px] font-bold uppercase tracking-[0.12em] text-grey">{view.label}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function CharacterStyleSheetPanel({
  character,
  open,
  onClose,
}: {
  character: Character;
  open: boolean;
  onClose: () => void;
}) {
  const [production, setProduction] = useState<ProductionState | null>(null);
  const [wardrobe, setWardrobe] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0);
  const [generationBaselineAssetId, setGenerationBaselineAssetId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const loadSheet = useCallback(async (quiet = false) => {
    if (!quiet) {
      setLoading(true);
      setMessage("");
    }
    try {
      const response = await fetch(`/api/generate?characterId=${encodeURIComponent(character.id)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = await response.json() as { production?: ProductionState | null };
      setProduction(body.production ?? null);
    } catch (error) {
      if (!quiet) {
        setMessage(error instanceof Error ? error.message : "The style sheet could not be loaded.");
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [character.id]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => void loadSheet());
    return () => window.cancelAnimationFrame(frame);
  }, [loadSheet, open]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  useEffect(() => {
    if (!generating) return;
    const startedAt = Date.now();
    const elapsedTimer = window.setInterval(() => {
      setGenerationElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    const pollingTimer = window.setInterval(() => void loadSheet(true), 1500);
    return () => {
      window.clearInterval(elapsedTimer);
      window.clearInterval(pollingTimer);
    };
  }, [generating, loadSheet]);

  const panels = useMemo(
    () => styleSheetPanels(production?.assets ?? [], production?.styleSheet?.assetId),
    [production],
  );
  const referenceImage = production?.visualReference?.url ?? character.imageUrl ?? character.bannerUrl ?? "";
  const incomingSheetReady = Boolean(
    production?.styleSheet
      && production.styleSheet.assetId !== generationBaselineAssetId,
  );

  async function generateSheet() {
    if (!referenceImage) {
      setMessage("Choose an identity image before creating the style sheet.");
      return;
    }
    setGenerationElapsedSeconds(0);
    setGenerationBaselineAssetId(production?.styleSheet?.assetId ?? null);
    setGenerating(true);
    setMessage("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "image",
          characterId: character.id,
          character,
          imagePurpose: "character-sheet",
          prompt: characterStyleSheetPrompt(character, wardrobe),
          referenceImage,
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      await loadSheet(true);
      window.dispatchEvent(new CustomEvent("chaplin:media-updated", {
        detail: { characterId: character.id },
      }));
      setMessage("New style sheet created and connected to this actor’s future scenes.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The style sheet could not be created.");
    } finally {
      setGenerating(false);
      setGenerationBaselineAssetId(null);
    }
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close style sheet"
      />
      <aside
        className="character-style-sheet-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-[44rem] flex-col border-l border-white/12 bg-[#090d0a] shadow-[-24px_0_80px_rgba(0,0,0,.5)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-style-sheet-title"
        data-character-style-sheet
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-accent-secondary">
              Visual continuity
            </p>
            <h2 id="character-style-sheet-title" className="mt-1 font-serif text-2xl text-ink">
              {character.name} · Style sheet
            </h2>
            <p className="mt-1 max-w-xl text-[11px] leading-5 text-grey">
              The approved face, angles, build, and wardrobe used to keep this actor consistent in every scene.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/12 px-3 py-2 text-[10px] font-semibold text-grey hover:text-ink"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6" data-lenis-prevent>
          {loading && !production ? (
            <div className="grid min-h-72 place-items-center rounded-2xl border border-white/10 bg-white/[0.02]">
              <span className="text-[10px] uppercase tracking-[0.16em] text-grey">Loading style sheet…</span>
            </div>
          ) : generating && !incomingSheetReady ? (
            <StyleSheetSkeleton
              characterName={character.name}
              referenceImage={referenceImage}
              elapsedSeconds={generationElapsedSeconds}
            />
          ) : production?.styleSheet ? (
            <>
              <figure className="overflow-hidden rounded-2xl border border-accent-secondary/35 bg-black/25">
                {/* eslint-disable-next-line @next/next/no-img-element -- stored creator media uses dynamic public URLs */}
                <img
                  src={production.styleSheet.url}
                  alt={`${character.name} approved four-panel style sheet`}
                  className="aspect-video w-full object-cover"
                />
                <figcaption className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                  <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-accent-secondary">
                    Current sheet
                  </span>
                  <span className="text-[9px] text-grey">
                    {generating
                      ? `Composite arrived · ${generationElapsedSeconds}s elapsed`
                      : "Human review composite · not sent to video"}
                  </span>
                </figcaption>
              </figure>

              <section className="mt-5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink">Production references</h3>
                  <span className="text-[9px] text-grey">
                    {panels.size}/4 {generating ? "arriving" : "ready"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CHARACTER_STYLE_SHEET_VIEWS.map((view) => {
                    const panel = panels.get(view.id);
                    return (
                      <article key={view.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
                        {panel ? (
                          // eslint-disable-next-line @next/next/no-img-element -- stored creator media uses dynamic public URLs
                          <img src={panel.url} alt={`${character.name} ${view.label}`} className="aspect-[4/9] w-full bg-black/35 object-contain" />
                        ) : (
                          <div className="relative grid aspect-[4/9] place-items-center overflow-hidden bg-white/[0.035] text-[9px] text-grey">
                            {generating && (
                              <div className="absolute inset-0 animate-pulse bg-[linear-gradient(110deg,transparent_15%,rgba(255,255,255,.08)_45%,transparent_75%)]" />
                            )}
                            <span className="relative">{generating ? "Cropping view…" : "Preparing view"}</span>
                          </div>
                        )}
                        <p className="border-t border-white/8 px-2 py-2 text-center text-[8px] font-bold uppercase tracking-[0.12em] text-grey">
                          {view.label}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </section>
              {generating && panels.size < 4 && (
                <p className="mt-3 rounded-xl border border-accent-secondary/25 bg-accent-secondary/[0.05] px-4 py-3 text-[10px] text-grey">
                  Review sheet ready. Preparing {4 - panels.size} production reference{panels.size === 3 ? "" : "s"}…
                </p>
              )}
            </>
          ) : (
            <section className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 text-center">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-accent-secondary/40 text-xl text-accent-secondary">+</span>
                <h3 className="mt-4 font-serif text-xl">Create the actor’s first style sheet</h3>
                <p className="mx-auto mt-2 max-w-md text-[11px] leading-5 text-grey">
                  Chaplin will create one review sheet and four clean production references from the actor’s approved identity.
                </p>
              </div>
            </section>
          )}

          <section className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <label className="block text-[9px] font-bold uppercase tracking-[0.16em] text-grey">
              Wardrobe direction
              <textarea
                value={wardrobe}
                onChange={(event) => setWardrobe(event.target.value)}
                rows={3}
                maxLength={800}
                placeholder="Keep the actor’s canonical wardrobe, or describe the exact wardrobe to lock."
                className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-[11px] font-normal normal-case leading-5 tracking-normal text-ink outline-none placeholder:text-grey/55 focus:border-accent-secondary/60"
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[9px] leading-4 text-grey">Creates one still-image generation · 4 credits</p>
              <button
                type="button"
                onClick={() => void generateSheet()}
                disabled={loading || generating}
                className="magic-action rounded-full px-5 py-2.5 text-[10px] font-bold disabled:opacity-45"
                data-intelligence-action
                aria-busy={generating}
              >
                {generating ? "Creating style sheet…" : production?.styleSheet ? "Create updated sheet" : "Create style sheet"}
              </button>
            </div>
          </section>

          {message && (
            <p
              aria-live="polite"
              className={`mt-4 rounded-xl border px-4 py-3 text-[10px] leading-5 ${
                /created and connected/i.test(message)
                  ? "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-200"
                  : "border-accent/35 bg-accent/[0.06] text-ink"
              }`}
            >
              {message}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}

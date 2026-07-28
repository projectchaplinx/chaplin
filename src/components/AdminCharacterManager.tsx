"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import AdminDeleteCharacterButton from "@/components/AdminDeleteCharacterButton";

type AdminCharacter = {
  id: string;
  name: string;
  archetype: string;
  tagline: string;
  image_url: string | null;
  banner_url: string | null;
  license_type: string;
};

type AdminAsset = {
  id: string;
  character_id: string | null;
  kind: string;
  provider: string;
  url: string;
  created_at: string;
};

type AdminHomeSlot = {
  character_id: string;
  position: number;
  status: string;
};

const IMAGE_KINDS = new Set(["avatar", "banner", "gallery", "poster", "backdrop", "reference"]);
const AUDIO_KINDS = new Set(["dialogue", "sfx", "theme", "room_tone", "mixed_audio"]);
const VIDEO_KINDS = new Set(["video", "spark", "punch", "spot", "episode", "shot", "trailer"]);
type AssetTab = "all" | "image" | "video" | "audio" | "other";

const ASSET_TABS: Array<{ id: AssetTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "audio", label: "Audio" },
  { id: "other", label: "Other" },
];

function assetCategory(asset: AdminAsset): Exclude<AssetTab, "all"> {
  if (IMAGE_KINDS.has(asset.kind)) return "image";
  if (VIDEO_KINDS.has(asset.kind)) return "video";
  if (AUDIO_KINDS.has(asset.kind)) return "audio";
  return "other";
}

function assetName(asset: AdminAsset) {
  try {
    const pathname = new URL(asset.url).pathname;
    return decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? `${asset.kind} file`);
  } catch {
    return `${asset.kind} file`;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function AssetReview({
  asset,
  onInspect,
}: {
  asset: AdminAsset;
  onInspect: (asset: AdminAsset) => void;
}) {
  const category = assetCategory(asset);
  if (category === "image") {
    return (
      <button
        type="button"
        onClick={() => onInspect(asset)}
        className="group relative block aspect-video w-full overflow-hidden bg-black/35 text-left"
        aria-label={`Inspect ${assetName(asset)}`}
      >
        <Image
          src={asset.url}
          alt={`${asset.kind} preview`}
          fill
          unoptimized
          sizes="(min-width: 1280px) 30vw, (min-width: 640px) 50vw, 100vw"
          className="object-contain transition duration-200 group-hover:scale-[1.02]"
        />
        <span className="absolute bottom-2 right-2 rounded-full border border-white/20 bg-black/70 px-2 py-1 text-[8px] font-semibold uppercase tracking-wide text-white">
          View full size
        </span>
      </button>
    );
  }
  if (category === "video") {
    return (
      <video
        src={asset.url}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full bg-black object-contain"
        aria-label={`Play ${assetName(asset)}`}
      />
    );
  }
  if (category === "audio") {
    return (
      <div className="flex min-h-28 flex-col justify-center gap-3 bg-black/25 p-4">
        <div className="flex items-center gap-2 text-grey">
          <span className="text-xl" aria-hidden="true">♪</span>
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em]">
            Play {asset.kind.replaceAll("_", " ")}
          </span>
        </div>
        <audio
          src={asset.url}
          controls
          preload="metadata"
          className="h-9 w-full"
          aria-label={`Play ${assetName(asset)}`}
        />
      </div>
    );
  }
  return (
    <div className="flex min-h-28 items-center justify-center bg-black/25 p-4">
      <a
        href={asset.url}
        target="_blank"
        rel="noreferrer"
        className="rounded-full border border-line px-4 py-2 text-[9px] font-semibold text-grey hover:border-accent hover:text-accent"
      >
        Open file ↗
      </a>
    </div>
  );
}

export default function AdminCharacterManager({
  characters,
  assets: initialAssets,
  homeSlots,
  activeVoiceCharacterIds,
}: {
  characters: AdminCharacter[];
  assets: AdminAsset[];
  homeSlots: AdminHomeSlot[];
  activeVoiceCharacterIds: string[];
}) {
  const router = useRouter();
  const [deletedAssetIds, setDeletedAssetIds] = useState<Set<string>>(() => new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assetTab, setAssetTab] = useState<AssetTab>("all");
  const [previewAsset, setPreviewAsset] = useState<AdminAsset | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AdminAsset | null>(null);
  const [assetBusy, setAssetBusy] = useState(false);
  const [assetMessage, setAssetMessage] = useState("");
  const [homepageIds, setHomepageIds] = useState(() => (
    homeSlots
      .filter((slot) => slot.status === "published")
      .sort((left, right) => left.position - right.position)
      .map((slot) => slot.character_id)
  ));
  const [homepageBusy, setHomepageBusy] = useState(false);
  const [homepageMessage, setHomepageMessage] = useState("");
  const activeVoices = useMemo(() => new Set(activeVoiceCharacterIds), [activeVoiceCharacterIds]);
  const characterIds = useMemo(() => new Set(characters.map((character) => character.id)), [characters]);
  const homepageSelection = homepageIds.filter((id) => characterIds.has(id));
  const assets = useMemo(
    () => initialAssets.filter((asset) => !deletedAssetIds.has(asset.id)),
    [deletedAssetIds, initialAssets],
  );

  const assetsByCharacter = useMemo(() => {
    const grouped = new Map<string, AdminAsset[]>();
    for (const asset of assets) {
      if (!asset.character_id) continue;
      grouped.set(asset.character_id, [...(grouped.get(asset.character_id) ?? []), asset]);
    }
    return grouped;
  }, [assets]);

  useEffect(() => {
    if (!previewAsset) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewAsset(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [previewAsset]);

  function toggleHomepage(characterId: string) {
    setHomepageMessage("");
    setHomepageIds((current) => {
      const valid = current.filter((id) => characterIds.has(id));
      if (valid.includes(characterId)) return valid.filter((id) => id !== characterId);
      if (valid.length >= 10) {
        setHomepageMessage("The homepage supports up to 10 selected characters.");
        return valid;
      }
      return [...valid, characterId];
    });
  }

  function moveHomepage(characterId: string, delta: -1 | 1) {
    setHomepageMessage("");
    setHomepageIds((current) => {
      const reordered = current.filter((id) => characterIds.has(id));
      const index = reordered.indexOf(characterId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= reordered.length) return reordered;
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  }

  async function saveHomepage() {
    if (!homepageSelection.length || homepageBusy) {
      if (!homepageSelection.length) setHomepageMessage("Choose at least one character for the homepage.");
      return;
    }
    setHomepageBusy(true);
    setHomepageMessage("");
    try {
      const response = await fetch("/api/admin/homepage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterIds: homepageSelection }),
      });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "The homepage cast could not be saved.");
      setHomepageMessage(data.message ?? "Homepage cast saved.");
      window.dispatchEvent(new CustomEvent("chaplin:media-updated"));
      router.refresh();
    } catch (error) {
      setHomepageMessage(error instanceof Error ? error.message : "The homepage cast could not be saved.");
    } finally {
      setHomepageBusy(false);
    }
  }

  async function deleteAsset() {
    if (!selectedAsset?.character_id || assetBusy) return;
    setAssetBusy(true);
    setAssetMessage("");
    try {
      const response = await fetch(
        `/api/admin/characters/${encodeURIComponent(selectedAsset.character_id)}/assets/${encodeURIComponent(selectedAsset.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: selectedAsset.id }),
        },
      );
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error ?? "The character file could not be deleted.");
      setDeletedAssetIds((current) => new Set([...current, selectedAsset.id]));
      setAssetMessage(data.message ?? "Character file deleted.");
      setSelectedAsset(null);
      window.dispatchEvent(new CustomEvent("chaplin:media-updated"));
      router.refresh();
    } catch (error) {
      setAssetMessage(error instanceof Error ? error.message : "The character file could not be deleted.");
    } finally {
      setAssetBusy(false);
    }
  }

  return (
    <section className="mb-10" id="characters">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Catalogue control</p>
          <h2 className="reel-title mt-1 text-2xl">Characters and homepage</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-grey">
            Choose the exact homepage cast, inspect every file attached to an actor, or permanently remove the actor and their production history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line px-3 py-2 text-[10px] font-semibold text-grey">
            {homepageSelection.length}/10 on homepage
          </span>
          <button
            type="button"
            onClick={() => void saveHomepage()}
            disabled={homepageBusy || homepageSelection.length === 0}
            className="accent-btn rounded-full px-4 py-2 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          >
            {homepageBusy ? "Saving…" : "Save homepage cast"}
          </button>
        </div>
      </div>

      {homepageMessage && (
        <p className={`mb-3 rounded-md border px-3 py-2 text-xs ${
          /saved|appear/i.test(homepageMessage)
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {homepageMessage}
        </p>
      )}
      {assetMessage && (
        <p className={`mb-3 rounded-md border px-3 py-2 text-xs ${
          /deleted/i.test(assetMessage)
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/30 bg-red-500/10 text-red-300"
        }`}>
          {assetMessage}
        </p>
      )}

      <div className="space-y-3">
        {characters.map((character) => {
          const characterAssets = assetsByCharacter.get(character.id) ?? [];
          const categoryCounts = characterAssets.reduce<Record<Exclude<AssetTab, "all">, number>>(
            (counts, asset) => {
              counts[assetCategory(asset)] += 1;
              return counts;
            },
            { image: 0, video: 0, audio: 0, other: 0 },
          );
          const visibleAssets = assetTab === "all"
            ? characterAssets
            : characterAssets.filter((asset) => assetCategory(asset) === assetTab);
          const homeIndex = homepageSelection.indexOf(character.id);
          const isExpanded = expandedId === character.id;
          const artwork = character.image_url ?? character.banner_url;
          return (
            <article key={character.id} className="poster-card overflow-hidden rounded-md">
              <div className="grid gap-4 p-4 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
                <button
                  type="button"
                  onClick={() => toggleHomepage(character.id)}
                  aria-pressed={homeIndex >= 0}
                  className={`relative flex h-16 w-24 shrink-0 overflow-hidden rounded-md border text-left ${
                    homeIndex >= 0 ? "border-accent" : "border-line"
                  }`}
                  style={artwork ? {
                    backgroundImage: `linear-gradient(rgba(0,0,0,.1),rgba(0,0,0,.55)),url("${artwork.replaceAll('"', "%22")}")`,
                    backgroundPosition: "center",
                    backgroundSize: "cover",
                  } : undefined}
                >
                  <span className={`absolute left-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[9px] font-bold ${
                    homeIndex >= 0
                      ? "border-accent bg-accent text-paper"
                      : "border-white/30 bg-black/50 text-white/70"
                  }`}>
                    {homeIndex >= 0 ? homeIndex + 1 : "+"}
                  </span>
                  <span className="absolute bottom-1.5 left-2 text-[8px] font-semibold uppercase tracking-wide text-white">
                    {homeIndex >= 0 ? "On home" : "Add to home"}
                  </span>
                </button>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">{character.name}</h3>
                    <span className="rounded-full border border-line px-2 py-0.5 text-[8px] uppercase tracking-wide text-grey">
                      {character.archetype}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[8px] uppercase tracking-wide ${
                      activeVoices.has(character.id)
                        ? "border-emerald-500/40 text-emerald-400"
                        : "border-amber-500/40 text-amber-400"
                    }`}>
                      {activeVoices.has(character.id) ? "Voice locked" : "No locked voice"}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-grey">{character.tagline}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[9px] font-semibold uppercase tracking-wide text-grey">
                    <span>{characterAssets.length} files</span>
                    <span>{character.license_type}</span>
                    {homeIndex >= 0 && (
                      <span className="flex items-center gap-1">
                        Home position
                        <button
                          type="button"
                          onClick={() => moveHomepage(character.id, -1)}
                          disabled={homeIndex === 0}
                          aria-label={`Move ${character.name} earlier on homepage`}
                          className="rounded border border-line px-1.5 py-0.5 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveHomepage(character.id, 1)}
                          disabled={homeIndex === homepageSelection.length - 1}
                          aria-label={`Move ${character.name} later on homepage`}
                          className="rounded border border-line px-1.5 py-0.5 disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedId(isExpanded ? null : character.id);
                      setAssetTab("all");
                      setPreviewAsset(null);
                    }}
                    className="rounded-full border border-line px-3 py-1.5 text-[10px] font-semibold text-grey hover:border-accent hover:text-accent"
                  >
                    {isExpanded ? "Close files" : `Manage files (${characterAssets.length})`}
                  </button>
                  <Link
                    href={`/characters/${character.id}`}
                    className="rounded-full border border-line px-3 py-1.5 text-[10px] font-semibold text-grey hover:border-accent hover:text-accent"
                  >
                    View actor
                  </Link>
                  <Link
                    href={`/characters/${character.id}/studio`}
                    className="rounded-full border border-accent/50 px-3 py-1.5 text-[10px] font-semibold text-accent"
                  >
                    Open studio
                  </Link>
                  <AdminDeleteCharacterButton characterId={character.id} characterName={character.name} />
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-line bg-black/15 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">Character files</p>
                      <p className="mt-1 text-[10px] text-grey">Review every image, video, and audio file before deciding what to remove.</p>
                    </div>
                    <span className="text-[10px] text-grey">{characterAssets.length} total</span>
                  </div>
                  <div className="my-4 flex max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label={`${character.name} file types`}>
                    {ASSET_TABS.filter((tab) => (
                      tab.id === "all" || tab.id !== "other" || categoryCounts.other > 0
                    )).map((tab) => {
                      const count = tab.id === "all" ? characterAssets.length : categoryCounts[tab.id];
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={assetTab === tab.id}
                          onClick={() => setAssetTab(tab.id)}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-[9px] font-semibold transition ${
                            assetTab === tab.id
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-line text-grey hover:border-accent/60 hover:text-ink"
                          }`}
                        >
                          {tab.label} <span className="ml-1 opacity-70">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  {characterAssets.length === 0 ? (
                    <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-xs text-grey">
                      No generated or uploaded files are attached to this character.
                    </p>
                  ) : visibleAssets.length === 0 ? (
                    <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-xs text-grey">
                      No {ASSET_TABS.find((tab) => tab.id === assetTab)?.label.toLowerCase()} files are attached to this character.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {visibleAssets.map((asset) => (
                        <div key={asset.id} className="min-w-0 overflow-hidden rounded-md border border-line bg-paper/25">
                          <AssetReview asset={asset} onInspect={setPreviewAsset} />
                          <div className="flex min-w-0 flex-col justify-between border-t border-line p-3">
                            <div className="min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="rounded-full border border-line px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-wide text-grey">
                                  {asset.kind.replaceAll("_", " ")}
                                </span>
                                <span className="text-[8px] text-grey">{formatDate(asset.created_at)}</span>
                              </div>
                              <p className="mt-2 truncate text-[10px] font-semibold" title={assetName(asset)}>{assetName(asset)}</p>
                              <p className="mt-0.5 truncate text-[8px] text-grey">{asset.provider}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setAssetMessage("");
                                setSelectedAsset(asset);
                              }}
                              className="mt-2 self-start text-[9px] font-semibold text-red-400 hover:text-red-300 hover:underline"
                            >
                              Delete file
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {previewAsset && createPortal(
        <div
          className="fixed inset-0 z-[1000] grid min-h-full place-items-center overflow-y-auto bg-black/90 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${assetName(previewAsset)}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewAsset(null);
          }}
        >
          <div className="w-full max-w-6xl overflow-hidden rounded-xl border border-line bg-[#090c09] shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{assetName(previewAsset)}</p>
                <p className="mt-0.5 text-[9px] uppercase tracking-wide text-grey">
                  {previewAsset.kind.replaceAll("_", " ")} · {previewAsset.provider}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewAsset(null)}
                className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[10px] font-semibold text-grey hover:text-ink"
              >
                Close
              </button>
            </div>
            <div className="flex max-h-[75dvh] min-h-64 items-center justify-center bg-black p-3">
              <Image
                src={previewAsset.url}
                alt={`${previewAsset.kind} full-size preview`}
                width={1600}
                height={1000}
                unoptimized
                className="h-auto max-h-[72dvh] w-auto max-w-full object-contain"
              />
            </div>
            <div className="flex justify-end border-t border-line px-4 py-3">
              <a
                href={previewAsset.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-line px-3 py-1.5 text-[9px] font-semibold text-grey hover:border-accent hover:text-accent"
              >
                Open original ↗
              </a>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {selectedAsset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-[#090c09] p-5 shadow-2xl sm:p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-400">Permanent file deletion</p>
            <h3 className="reel-title mt-2 text-2xl">Delete this {selectedAsset.kind.replaceAll("_", " ")}?</h3>
            <p className="mt-3 text-xs leading-5 text-grey">
              <span className="font-semibold text-ink">{assetName(selectedAsset)}</span> will be removed from the actor, public feed references, and Chaplin storage when applicable. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={assetBusy}
                onClick={() => setSelectedAsset(null)}
                className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-grey"
              >
                Keep file
              </button>
              <button
                type="button"
                disabled={assetBusy}
                onClick={() => void deleteAsset()}
                className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {assetBusy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useChaplinStore } from "@/lib/store";
import { getCharacter, getUser, resumeForCharacter, ledgerForCharacter } from "@/lib/selectors";
import Chip from "@/components/Chip";
import CharacterSoundProfile from "@/components/CharacterSoundProfile";
import CharacterPersonalityCard from "@/components/CharacterPersonalityCard";
import EarningsSparkline from "@/components/EarningsSparkline";
import CharacterGallery from "@/components/CharacterGallery";
import CharacterConversationPanel from "@/components/CharacterConversationPanel";
import DeveloperAccessCard from "@/components/DeveloperAccessCard";
import CharacterBroll from "@/components/CharacterBroll";
import { IconArrowLeft } from "@/components/Icons";
import {
  ARCHETYPE_HUE,
  ARCHETYPE_LABEL,
  LICENSE_HUE,
  LICENSE_LABEL,
  compactNumber,
  money,
  formatDate,
  timeAgo,
} from "@/lib/format";

type CharacterVideoAsset = {
  id: string;
  url: string;
  durationSeconds: number | null;
  label: string;
  createdAt: string | null;
};

export default function CharacterProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const world = useChaplinStore((s) => s);
  const character = getCharacter(world, params.id);
  const [availableVideos, setAvailableVideos] = useState<CharacterVideoAsset[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);

  useEffect(() => {
    if (!character?.id) return;
    let active = true;
    const loadVideos = async () => {
      setVideosLoading(true);
      try {
        const response = await fetch(`/api/generate?characterId=${encodeURIComponent(character.id)}`, { cache: "no-store" });
        const data = await response.json() as {
          production?: {
            assets?: Array<{
              id: string;
              kind: string;
              url: string;
              duration_seconds: number | null;
              metadata: Record<string, unknown> | null;
              created_at: string;
            }>;
          };
        };
        if (!response.ok) throw new Error("Character media could not be loaded.");
        const seen = new Set<string>();
        const videos: CharacterVideoAsset[] = [];
        for (const asset of data.production?.assets ?? []) {
          if (asset.kind !== "video" || !asset.url || seen.has(asset.url)) continue;
          seen.add(asset.url);
          const outputType = typeof asset.metadata?.outputType === "string" ? asset.metadata.outputType : "";
          const duration = asset.duration_seconds;
          videos.push({
            id: asset.id,
            url: asset.url,
            durationSeconds: duration,
            label: outputType === "punch"
              ? "Punch master"
              : outputType === "spark"
                ? "Spark"
                : duration && duration <= 5
                  ? "Four-second scene"
                  : "Performance video",
            createdAt: asset.created_at,
          });
        }
        if (character.videoUrl && !seen.has(character.videoUrl)) {
          videos.unshift({
            id: "profile-video",
            url: character.videoUrl,
            durationSeconds: null,
            label: "Featured performance",
            createdAt: null,
          });
        }
        if (active) setAvailableVideos(videos);
      } catch {
        if (active) setAvailableVideos(character.videoUrl ? [{
          id: "profile-video",
          url: character.videoUrl,
          durationSeconds: null,
          label: "Featured performance",
          createdAt: null,
        }] : []);
      } finally {
        if (active) setVideosLoading(false);
      }
    };
    void loadVideos();
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ characterId?: string }>).detail;
      if (!detail?.characterId || detail.characterId === character.id) void loadVideos();
    };
    window.addEventListener("chaplin:media-updated", refresh);
    return () => {
      active = false;
      window.removeEventListener("chaplin:media-updated", refresh);
    };
  }, [character?.id, character?.videoUrl]);

  if (!character) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-grey mb-4">This AI actor isn&apos;t on the shelf (yet).</p>
        <Link href="/characters" className="text-accent hover:underline">
          ← Back to the Shelf
        </Link>
      </div>
    );
  }

  const maker = getUser(world, world.currentUserId);
  const characterId = character.id;
  const resume = resumeForCharacter(world, character.id);
  const ledger = ledgerForCharacter(world, character.id);
  const canProduce = world.activeRole === "admin" || world.activeRole === "maker";
  const canCast = canProduce;

  function openProductionStudio() {
    router.push(`/characters/${characterId}/studio`);
  }

  return (
    <div className="app-width min-w-0 overflow-x-clip px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/characters"
        className="inline-flex items-center gap-1.5 pl-2.5 pr-4 py-2 rounded-full poster-card text-sm font-semibold hover:text-accent transition-colors mb-3"
      >
        <IconArrowLeft className="w-4 h-4" />
        Shelf
      </Link>
      {world.activeRole === "admin" && (
        <Link
          href={`/characters/${character.id}/system`}
          className="ml-2 inline-flex items-center gap-2 rounded-full border border-[#07d2be]/35 bg-[#07d2be]/8 px-4 py-2 text-sm font-semibold text-[#36e0cd] transition-colors hover:bg-[#07d2be]/14"
        >
          <span className="h-2 w-2 rounded-full bg-[#07d2be] shadow-[0_0_12px_#07d2be]" />
          Master prompt
        </Link>
      )}
      {canProduce && (
        <button
          type="button"
          onClick={openProductionStudio}
          className="ml-2 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-accent-light"
        >
          Open production editor
        </button>
      )}

      {/*
        Details beside the frame, not on top of it.

        This used to be one full-bleed 16:9 stage with the name overlaid. Locked
        to the page width it rendered ~970px tall and pushed every detail below
        the fold; capping its height instead turned it into a ~3:1 letterbox,
        which object-cover then filled by cropping the sides off a portrait clip.
        Both failures come from forcing one wide frame to carry the whole page.

        So the frame is now sized from its HEIGHT and keeps a portrait ratio —
        the shape the clips are actually generated in — and the column beside it
        takes the space that cropping used to eat.
      */}
      <div className="poster-card overflow-hidden rounded-xl" data-character-profile-hero>
        <CharacterBroll character={character}>
          <div>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h1 className="reel-title text-2xl leading-tight text-ink sm:text-4xl">
                  {character.name}
                </h1>
                {maker && (
                  <span className="text-[11px] text-ink/65 sm:text-xs">
                    made by{" "}
                    <Link href="/studio" className="text-accent hover:underline">
                      {maker.name}
                    </Link>
                  </span>
                )}
              </div>
              <p data-broll-punchline className="mt-2 max-w-prose text-sm italic leading-relaxed text-ink/75 sm:text-base">
                &ldquo;{character.tagline}&rdquo;
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Chip compact label={ARCHETYPE_LABEL[character.archetype]} hue={ARCHETYPE_HUE[character.archetype]} />
                <Chip compact label={LICENSE_LABEL[character.licenseType]} hue={LICENSE_HUE[character.licenseType]} />
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-x-6 gap-y-4 border-t border-line pt-5 sm:grid-cols-6 lg:grid-cols-3 xl:grid-cols-6">
              {[
                { label: "Castings", value: String(character.stats.castings) },
                { label: "Fans", value: compactNumber(character.stats.fans) },
                { label: "Impressions", value: compactNumber(character.stats.socialImpressions) },
                { label: "Views", value: compactNumber(character.stats.socialViews) },
                { label: "Likes", value: compactNumber(character.stats.socialLikes) },
                { label: "Lifetime earnings", value: money(character.stats.earnings), accent: true },
              ].map((stat) => (
                <div key={stat.label}>
                  <dd className={`text-lg font-semibold sm:text-xl ${stat.accent ? "text-accent" : ""}`}>{stat.value}</dd>
                  <dt className="mt-0.5 text-[9px] uppercase tracking-wide text-grey sm:text-[10px]">{stat.label}</dt>
                </div>
              ))}
            </dl>

          {/* The conversation panel is further down the page; this is the door
              to it, so the left column offers the actor rather than just
              describing them. */}
          <a
            href="#talk"
            className="group flex items-center gap-3 rounded-xl border border-line bg-black/25 p-3 transition-colors hover:border-accent/50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm text-accent">
              ✦
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Talk to {character.name.split(" ")[0]}</span>
              <span className="mt-0.5 block text-[11px] text-grey">
                Ask anything — they answer in character, out loud.
              </span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-grey transition-colors group-hover:text-accent">›</span>
          </a>
        </CharacterBroll>
      </div>

      <div className="mt-6 scroll-mt-24" id="talk">
        <CharacterConversationPanel character={character} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {/* Left: personality, voice, license terms */}
        <div className="md:col-span-2 flex flex-col gap-6">
          <CharacterPersonalityCard character={character} />

          {character.galleryUrls && character.galleryUrls.length > 0 && (
            <CharacterGallery name={character.name} images={character.galleryUrls} />
          )}
        </div>

        {/* Right: license terms + earnings + CTA */}
        <div className="flex flex-col gap-6">
          <section className="poster-card overflow-hidden rounded-md">
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-grey">Available videos</h2>
                <p className="mt-0.5 text-[9px] text-grey">Spark, scenes, and finished performances</p>
              </div>
              <span className="rounded-full border border-accent-secondary/35 px-2 py-1 font-mono text-[9px] text-accent-secondary">
                {availableVideos.length}
              </span>
            </div>
            {videosLoading ? (
              <div className="flex items-center gap-2 px-4 py-5 text-xs text-grey">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                Loading performances…
              </div>
            ) : availableVideos.length ? (
              <div className="max-h-[34rem] space-y-3 overflow-y-auto p-3 scrollbar-thin">
                {availableVideos.map((video, index) => (
                  <article key={video.id} className="overflow-hidden rounded-lg border border-line bg-black/30" data-character-video-card>
                    <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
                      <video
                        src={video.url}
                        controls
                        playsInline
                        preload="metadata"
                        poster={character.imageUrl ?? character.bannerUrl}
                        className="absolute inset-0 h-full w-full object-cover object-center"
                        aria-label={`${video.label} for ${character.name}`}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-semibold">{video.label}</p>
                        <p className="mt-0.5 text-[8px] uppercase tracking-[0.12em] text-grey">
                          {video.durationSeconds ? `${Math.round(video.durationSeconds)} sec` : index === 0 ? "Profile selection" : "Saved video"}
                        </p>
                      </div>
                      {index === 0 && (
                        <span className="shrink-0 rounded-full bg-accent/15 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-accent">
                          Latest
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="px-4 py-5">
                <p className="text-xs font-semibold">No performance video yet</p>
                <p className="mt-1 text-[10px] leading-4 text-grey">
                  A Spark or generated scene will appear here as soon as it is saved.
                </p>
                {canProduce && (
                  <button
                    type="button"
                    onClick={openProductionStudio}
                    className="mt-3 rounded-full border border-accent/55 px-3 py-1.5 text-[9px] font-semibold text-accent"
                  >
                    Create the first video
                  </button>
                )}
              </div>
            )}
          </section>

          {canCast && (
            <Link
              href={`/studio/write?cast=${character.id}`}
              className="bg-accent text-paper font-semibold text-center px-4 py-3 rounded-sm hover:bg-accent-light transition-colors"
            >
              Cast {character.name.split(" ")[0]} in a story
            </Link>
          )}
          {world.activeRole === "maker" && (
            <Link
              href="/studio"
              className="border border-accent text-accent font-semibold text-center px-4 py-3 rounded-sm hover:bg-accent/10 transition-colors"
            >
              Manage {character.name.split(" ")[0]}
            </Link>
          )}
        </div>
      </div>

      <details className="group mt-6 rounded-md border border-line bg-black/10" data-character-record>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 hover:bg-white/[0.03] sm:px-6">
          <span>
            <span className="block text-sm font-semibold">Actor record</span>
            <span className="mt-0.5 block text-[11px] text-grey">Voice assets, casting history, licensing, and maker controls.</span>
          </span>
          <span className="rounded-full border border-line px-3 py-1.5 text-[10px] font-semibold text-grey transition-colors group-open:border-accent group-open:text-accent">Open details</span>
        </summary>
        <div className="grid gap-5 border-t border-line p-4 sm:p-6 lg:grid-cols-2">
          <CharacterSoundProfile character={character} canProduce={canProduce} onOpenProduction={openProductionStudio} />

          <section className="poster-card rounded-md p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-grey mb-2">Résumé: every story so far</h2>
            {resume.length === 0 ? (
              <p className="text-sm text-grey">Not cast yet. This story could be the first.</p>
            ) : (
              <ul className="divide-y divide-line">
                {resume.map(({ casting, story }) => {
                  const lineCount = story.scenes.reduce(
                    (n, sc) => n + sc.lines.filter((l) => l.characterId === character.id).length,
                    0,
                  );
                  return (
                    <li key={casting.id} className="py-3">
                      <Link href={`/stories/${story.id}`} className="flex items-center justify-between gap-3 hover:text-accent">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{story.title}</span>
                          <span className="block text-xs text-grey">{lineCount} line{lineCount === 1 ? "" : "s"} · cast {timeAgo(casting.timestamp)}</span>
                        </span>
                        <span className="shrink-0 text-xs text-grey">{casting.fee > 0 ? money(casting.fee) : "open"}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="poster-card rounded-md p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-grey mb-2">License terms</h2>
            <p className="text-sm mb-1">{LICENSE_LABEL[character.licenseType]}</p>
            <p className="text-xs text-grey">
              {character.licenseType === "open" && "Anyone can cast this AI actor for free. The maker still earns from fan tips."}
              {character.licenseType === "paid" && `Casting this AI actor costs ${money(character.royaltyRate)}, paid to the maker every time.`}
              {character.licenseType === "approval" && `The maker signs off on each story before ${character.name} can appear in it. Fee once approved: ${money(character.royaltyRate)}.`}
            </p>
            <p className="mt-3 text-[11px] text-grey">On the shelf since {formatDate(character.createdAt)}</p>
          </section>

          <section className="poster-card rounded-md p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-grey mb-2">Earnings over time</h2>
            <EarningsSparkline entries={ledger} />
          </section>

          {canProduce && <DeveloperAccessCard character={character} />}
        </div>
      </details>
    </div>
  );
}

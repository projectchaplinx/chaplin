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
import CharacterProfileHero from "@/components/CharacterProfileHero";
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

type CharacterProfileAccess = {
  canManage: boolean;
  canCast: boolean;
  isAdmin: boolean;
};

export default function CharacterProfilePage({
  initialCharacter,
  viewerAccess,
}: {
  initialCharacter: NonNullable<ReturnType<typeof getCharacter>>;
  viewerAccess: CharacterProfileAccess;
}) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const world = useChaplinStore((s) => s);
  const character = getCharacter(world, params.id) ?? initialCharacter;
  const [availableVideos, setAvailableVideos] = useState<CharacterVideoAsset[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);

  useEffect(() => {
    if (!character?.id) return;
    let active = true;
    const loadVideos = async () => {
      setVideosLoading(true);
      try {
        const response = await fetch(`/api/characters/${encodeURIComponent(character.id)}/media`, { cache: "no-store" });
        const data = await response.json() as {
          media?: {
            videos?: CharacterVideoAsset[];
          };
        };
        if (!response.ok) throw new Error("Character media could not be loaded.");
        const seen = new Set<string>();
        const videos: CharacterVideoAsset[] = [];
        for (const video of data.media?.videos ?? []) {
          if (!video.url || seen.has(video.url)) continue;
          seen.add(video.url);
          videos.push(video);
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

  const maker = getUser(world, character.makerId);
  const characterId = character.id;
  const resume = resumeForCharacter(world, character.id);
  const ledger = ledgerForCharacter(world, character.id);
  const canProduce = viewerAccess.canManage;
  const canCast = viewerAccess.canCast;
  const legacyHeroEnabled: boolean = false;

  function openProductionStudio() {
    router.push(`/characters/${characterId}/studio`);
  }

  return (
    <div className="character-profile-page app-width min-w-0 overflow-x-clip" data-character-profile-page>
      <div className="character-profile-toolbar">
        <Link href="/characters" className="character-profile-toolbar__shelf">
          <IconArrowLeft className="h-4 w-4" />
          Shelf
        </Link>
        {canProduce && (
          <button
            type="button"
            onClick={openProductionStudio}
            className="character-profile-toolbar__editor"
          >
            Open production editor
          </button>
        )}
      </div>

      <CharacterProfileHero
        character={character}
        makerName={maker?.name}
        canProduce={canProduce}
        canCast={canCast}
        performanceCount={availableVideos.length}
        onOpenProduction={openProductionStudio}
      />

      {/* Every actor gets the same casting stage, so profile cards never change
          size by media. 16:9 is the shape, but height is capped against the
          viewport: at full page width the ratio alone made this frame ~970px
          tall, which pushed the name, tagline and every stat below the fold —
          the actor's own page opened on nothing but a playing clip. The media
          is object-cover inside, so the cap crops rather than distorts. */}
      {legacyHeroEnabled && <div className="poster-card overflow-hidden rounded-xl" data-character-profile-hero>
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: "16 / 9", maxHeight: "62vh" }}
        >
          <CharacterBroll character={character} />
          <div className="absolute inset-0 flex max-w-[78%] flex-col justify-end gap-1 p-4 pb-4 sm:max-w-[52%] sm:gap-2 sm:p-8 lg:p-10">
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <h1 className="reel-title text-xl leading-none text-ink sm:text-4xl sm:leading-tight">
                {character.name}
              </h1>
              {maker && (
                <span className="text-[9px] text-ink/65 sm:text-xs">
                  made by{" "}
                  <Link href="/studio" className="text-accent hover:underline">
                    {maker.name}
                  </Link>
                </span>
              )}
            </div>
            <p data-broll-punchline className="line-clamp-2 text-xs italic leading-snug text-ink/75 sm:line-clamp-none sm:text-base sm:text-ink/80">
              &ldquo;{character.tagline}&rdquo;
            </p>
            <div className="mt-0.5 flex flex-wrap gap-1 sm:mt-1 sm:gap-1.5">
              <Chip compact label={ARCHETYPE_LABEL[character.archetype]} hue={ARCHETYPE_HUE[character.archetype]} />
              <Chip compact label={LICENSE_LABEL[character.licenseType]} hue={LICENSE_HUE[character.licenseType]} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-y divide-line border-t border-line sm:grid-cols-6 sm:divide-y-0">
          <div className="p-2.5 text-center sm:p-4">
            <p className="text-base font-semibold sm:text-xl">{character.stats.castings}</p>
            <p className="text-[8px] uppercase tracking-wide text-grey sm:text-[11px]">Castings</p>
          </div>
          <div className="p-2.5 text-center sm:p-4">
            <p className="text-base font-semibold sm:text-xl">{compactNumber(character.stats.fans)}</p>
            <p className="text-[8px] uppercase tracking-wide text-grey sm:text-[11px]">Fans</p>
          </div>
          <div className="p-2.5 text-center sm:p-4">
            <p className="text-base font-semibold sm:text-xl">{compactNumber(character.stats.socialImpressions)}</p>
            <p className="text-[8px] uppercase tracking-wide text-grey sm:text-[11px]">Impressions</p>
          </div>
          <div className="p-2.5 text-center sm:p-4">
            <p className="text-base font-semibold sm:text-xl">{compactNumber(character.stats.socialViews)}</p>
            <p className="text-[8px] uppercase tracking-wide text-grey sm:text-[11px]">Views</p>
          </div>
          <div className="p-2.5 text-center sm:p-4">
            <p className="text-base font-semibold sm:text-xl">{compactNumber(character.stats.socialLikes)}</p>
            <p className="text-[8px] uppercase tracking-wide text-grey sm:text-[11px]">Likes</p>
          </div>
          <div className="p-2.5 text-center sm:p-4">
            <p className="text-base font-semibold text-accent sm:text-xl">{money(character.stats.earnings)}</p>
            <p className="text-[8px] uppercase tracking-wide text-grey sm:text-[11px]">Lifetime earnings</p>
          </div>
        </div>
      </div>}

      {legacyHeroEnabled && <div className="mt-6">
        <CharacterConversationPanel character={character} />
      </div>}

      <div className="character-profile-below grid grid-cols-1 gap-6 md:grid-cols-3">
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
          {canProduce && (
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

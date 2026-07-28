"use client";

import Link from "next/link";
import CharacterBroll from "@/components/CharacterBroll";
import CharacterConversationPanel from "@/components/CharacterConversationPanel";
import Chip from "@/components/Chip";
import type { Character } from "@/lib/types";
import {
  ARCHETYPE_HUE,
  ARCHETYPE_LABEL,
  LICENSE_HUE,
  LICENSE_LABEL,
  compactNumber,
} from "@/lib/format";

export default function CharacterProfileHero({
  character,
  makerName,
  canProduce,
  canCast,
  performanceCount,
  onOpenProduction,
}: {
  character: Character;
  makerName?: string;
  canProduce: boolean;
  canCast: boolean;
  performanceCount: number;
  onOpenProduction: () => void;
}) {
  const firstName = character.name.split(" ")[0];
  const castPath = `/studio/write?cast=${character.id}`;
  const keyStats = [
    { label: "Castings", value: String(character.stats.castings) },
    { label: "Fans", value: compactNumber(character.stats.fans) },
    { label: "Reels", value: compactNumber(performanceCount) },
  ];

  return (
    <section className="character-profile-stage" data-character-profile-hero>
      <div className="character-profile-stage__rail">
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.23em] text-accent-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-secondary" />
              Live AI actor
            </p>
            <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-accent-secondary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-secondary" />
              Live
            </span>
          </div>

          <h1 className="reel-title mt-5 text-[clamp(2.8rem,5vw,5.5rem)] leading-[0.88] tracking-[-0.04em]">
            {character.name}
          </h1>
          {makerName && (
            <p className="mt-3 text-[10px] text-grey">
              Created by <Link href="/studio" className="font-semibold text-accent hover:underline">{makerName}</Link>
            </p>
          )}
          <p data-broll-punchline className="mt-5 max-w-[34rem] text-base italic leading-7 text-white/72 sm:text-lg">
            “{character.tagline}”
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Chip compact label={ARCHETYPE_LABEL[character.archetype]} hue={ARCHETYPE_HUE[character.archetype]} />
            <Chip compact label={LICENSE_LABEL[character.licenseType]} hue={LICENSE_HUE[character.licenseType]} />
          </div>

          <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10">
            {keyStats.map((stat) => (
              <div key={stat.label} className="bg-[#10170d]/90 px-2 py-3 text-center backdrop-blur-xl sm:px-3">
                <p className="truncate text-sm font-bold text-ink sm:text-lg">{stat.value}</p>
                <p className="mt-0.5 truncate text-[7px] font-semibold uppercase tracking-[0.1em] text-grey sm:text-[8px]">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link
              href={canCast ? castPath : `/auth?next=${encodeURIComponent(castPath)}`}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-center text-xs font-bold text-white shadow-[0_12px_30px_rgba(242,78,112,0.22)] transition hover:-translate-y-0.5"
            >
              <span aria-hidden="true">✦</span>
              Cast {firstName} in a story
            </Link>
            {canProduce && (
              <button
                type="button"
                onClick={onOpenProduction}
                className="min-h-11 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-xs font-semibold text-white/82 transition hover:border-accent-secondary hover:text-accent-secondary"
              >
                Open production editor
              </button>
            )}
          </div>
        </div>

        <CharacterConversationPanel character={character} variant="hero" />
      </div>

      <div className="character-profile-stage__media">
        <CharacterBroll character={character} variant="cinematic" />
      </div>
    </section>
  );
}

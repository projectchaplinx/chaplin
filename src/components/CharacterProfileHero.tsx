"use client";

import Link from "next/link";
import CharacterBroll from "@/components/CharacterBroll";
import CharacterConversationPanel from "@/components/CharacterConversationPanel";
import type { Character } from "@/lib/types";
import {
  ARCHETYPE_LABEL,
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
        <div className="character-profile-identity">
          <p className="character-profile-live-label">
            <span aria-hidden="true" />
            Live AI actor
          </p>

          <h1 className="character-profile-name">{character.name}</h1>

          {makerName && (
            <p className="character-profile-maker">
              by <Link href="/studio">{makerName}</Link>
            </p>
          )}

          <p data-broll-punchline className="character-profile-tagline">
            &ldquo;{character.tagline}&rdquo;
          </p>

          <div className="character-profile-chips">
            <span className="character-profile-chip character-profile-chip--archetype">
              {ARCHETYPE_LABEL[character.archetype]}
            </span>
            <span className="character-profile-chip character-profile-chip--license">
              {LICENSE_LABEL[character.licenseType]}
            </span>
          </div>
        </div>

        <div className="character-profile-stats">
          {keyStats.map((stat) => (
            <div key={stat.label}>
              <p>{stat.value}</p>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>

        <CharacterConversationPanel character={character} variant="hero" />

        <div className="character-profile-actions">
          <Link
            href={canCast ? castPath : `/auth?next=${encodeURIComponent(castPath)}`}
            className="character-profile-cast"
          >
            <span aria-hidden="true">✧</span>
            Cast {firstName}
          </Link>
          {canProduce && (
            <button
              type="button"
              onClick={onOpenProduction}
              className="character-profile-editor-link"
            >
              Open production editor <span aria-hidden="true">↗</span>
            </button>
          )}
        </div>
      </div>

      <div className="character-profile-stage__media">
        <CharacterBroll character={character} variant="cinematic" />
      </div>
    </section>
  );
}

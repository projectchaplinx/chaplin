import Link from "next/link";
import CharacterBroll from "@/components/CharacterBroll";
import Chip from "@/components/Chip";
import type { Character } from "@/lib/types";
import {
  ARCHETYPE_HUE,
  ARCHETYPE_LABEL,
  LICENSE_HUE,
  LICENSE_LABEL,
  compactNumber,
  money,
} from "@/lib/format";

export default function CharacterProfileStage({
  character,
  makerName,
}: {
  character: Character;
  makerName?: string;
}) {
  return (
    <div className="poster-card overflow-hidden rounded-xl" data-character-profile-hero>
      <CharacterBroll character={character}>
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h1 className="reel-title text-2xl leading-tight text-ink sm:text-4xl">
              {character.name}
            </h1>
            {makerName && (
              <span className="text-[11px] text-ink/65 sm:text-xs">
                made by{" "}
                <Link href="/studio" className="text-accent hover:underline">
                  {makerName}
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
      </CharacterBroll>
    </div>
  );
}

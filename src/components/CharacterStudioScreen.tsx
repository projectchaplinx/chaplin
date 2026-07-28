"use client";

import { useRouter } from "next/navigation";
import CharacterProductionStudio from "@/components/CharacterProductionStudio";
import StudioWorkspaceHeader from "@/components/studio/StudioWorkspaceHeader";
import type { Character } from "@/lib/types";

export default function CharacterStudioScreen({ character }: { character: Character }) {
  const router = useRouter();

  return (
    <main className="studio-shell min-h-[100dvh] bg-[#070a08] lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden" data-character-studio-shell>
      <StudioWorkspaceHeader
        mode="actor"
        projectName={character.name}
        status="Actor studio · autosaved"
        backHref={`/characters/${character.id}`}
        backLabel={character.name}
        actions={
          <button type="button" onClick={() => router.push(`/characters/${character.id}`)} className="rounded-md bg-accent px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-paper hover:bg-accent-light">
            Finish scene
          </button>
        }
      />
      <CharacterProductionStudio character={character} onExit={() => router.push(`/characters/${character.id}`)} />
    </main>
  );
}

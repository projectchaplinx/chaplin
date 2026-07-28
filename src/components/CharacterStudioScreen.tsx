"use client";

import { useRouter } from "next/navigation";
import CharacterProductionStudio from "@/components/CharacterProductionStudio";
import StudioWorkspaceHeader from "@/components/studio/StudioWorkspaceHeader";
import type { Character } from "@/lib/types";

export default function CharacterStudioScreen({
  character,
  initialMode = "actor",
}: {
  character: Character;
  initialMode?: "actor" | "scene";
}) {
  const router = useRouter();
  const mode = initialMode;

  return (
    <main
      className="studio-shell min-h-[100dvh] bg-[#070a08] lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden"
      data-character-studio-shell
      data-studio-mode={mode}
    >
      <StudioWorkspaceHeader
        mode={mode}
        projectName={character.name}
        status={mode === "scene" ? "Scene studio · actor and assets stay locked" : "Actor studio · autosaved"}
        backHref={`/characters/${character.id}`}
        backLabel={character.name}
        actorHref={`/characters/${character.id}/studio?mode=actor`}
        sceneHref={`/characters/${character.id}/studio?mode=scene`}
        actions={
          <button type="button" onClick={() => router.push(`/characters/${character.id}`)} className="rounded-md bg-accent px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-paper hover:bg-accent-light">
            {mode === "scene" ? "Finish scene" : "View actor"}
          </button>
        }
      />
      <CharacterProductionStudio character={character} onExit={() => router.push(`/characters/${character.id}`)} />
    </main>
  );
}

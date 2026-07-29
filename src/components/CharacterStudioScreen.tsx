"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CharacterProductionStudio from "@/components/CharacterProductionStudio";
import CharacterStyleSheetPanel from "@/components/CharacterStyleSheetPanel";
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
  const [styleSheetOpen, setStyleSheetOpen] = useState(false);

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
          <>
            <button
              type="button"
              onClick={() => setStyleSheetOpen(true)}
              className="rounded-md border border-accent-secondary/45 bg-accent-secondary/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent-secondary hover:bg-accent-secondary/10"
              data-open-character-style-sheet
            >
              <span className="hidden sm:inline">Style sheet</span>
              <span className="sm:hidden">Sheet</span>
            </button>
            <button type="button" onClick={() => router.push(`/characters/${character.id}`)} className="rounded-md bg-accent px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-paper hover:bg-accent-light">
              {mode === "scene" ? "Finish scene" : "View actor"}
            </button>
          </>
        }
      />
      <CharacterProductionStudio character={character} onExit={() => router.push(`/characters/${character.id}`)} />
      <CharacterStyleSheetPanel
        character={character}
        open={styleSheetOpen}
        onClose={() => setStyleSheetOpen(false)}
      />
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CharacterProductionStudio from "@/components/CharacterProductionStudio";
import CharacterStyleSheetPanel from "@/components/CharacterStyleSheetPanel";
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
      <CharacterProductionStudio
        character={character}
        onExit={() => router.push(`/characters/${character.id}`)}
        onOpenStyleSheet={() => setStyleSheetOpen(true)}
      />
      <CharacterStyleSheetPanel
        character={character}
        open={styleSheetOpen}
        onClose={() => setStyleSheetOpen(false)}
      />
    </main>
  );
}

import { characterSheetPrompt } from "@/lib/performance-reference";
import { buildProductionBible } from "@/lib/production-prompting";
import type { Character } from "@/lib/types";

export type CharacterStyleSheetAsset = {
  id: string;
  kind: string;
  url: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export const CHARACTER_STYLE_SHEET_VIEWS = [
  { id: "front", label: "Front" },
  { id: "three_quarter", label: "Three-quarter" },
  { id: "profile", label: "Profile" },
  { id: "full_body", label: "Full body" },
] as const;

export type CharacterStyleSheetView = (typeof CHARACTER_STYLE_SHEET_VIEWS)[number]["id"];

export function characterStyleSheetPrompt(character: Character, wardrobeOverride = "") {
  const bible = buildProductionBible(character);
  const recognition = (bible.visual.recognitionLocks ?? bible.visual.continuityRules)
    .slice(0, 6)
    .join("; ");
  const identity = [
    `${character.name}, an original fictional actor.`,
    `Visible age: ${bible.visual.perceivedAge}.`,
    `Face anchors: ${bible.visual.faceAnchors.join("; ")}.`,
    `Hair: ${bible.visual.hair}.`,
    `Build and silhouette: ${bible.visual.silhouette}.`,
    recognition ? `Recognition locks: ${recognition}.` : "",
  ].filter(Boolean).join(" ");

  return characterSheetPrompt({
    identity,
    ageState: "canonical present-day appearance",
    wardrobeState: wardrobeOverride.trim() || bible.visual.wardrobe,
  });
}

export function styleSheetPanels(
  assets: CharacterStyleSheetAsset[],
  compositeAssetId: string | null | undefined,
) {
  const panels = new Map<CharacterStyleSheetView, CharacterStyleSheetAsset>();
  for (const asset of assets) {
    const metadata = asset.metadata;
    if (metadata?.characterSheetRole !== "panel") continue;
    if (compositeAssetId && metadata?.compositeAssetId !== compositeAssetId) continue;
    const view = metadata?.characterSheetView;
    if (!CHARACTER_STYLE_SHEET_VIEWS.some((candidate) => candidate.id === view)) continue;
    const viewId = view as CharacterStyleSheetView;
    if (!panels.has(viewId)) panels.set(viewId, asset);
  }
  return panels;
}

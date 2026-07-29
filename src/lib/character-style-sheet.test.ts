import assert from "node:assert/strict";
import test from "node:test";
import {
  characterStyleSheetPrompt,
  styleSheetPanels,
  type CharacterStyleSheetAsset,
} from "@/lib/character-style-sheet";
import type { Character } from "@/lib/types";

function asset(
  id: string,
  view: string,
  compositeAssetId: string,
  createdAt = "2026-07-29T00:00:00.000Z",
): CharacterStyleSheetAsset {
  return {
    id,
    kind: "gallery",
    url: `https://example.com/${id}.png`,
    created_at: createdAt,
    metadata: {
      characterSheetRole: "panel",
      characterSheetView: view,
      compositeAssetId,
    },
  };
}

test("style sheet exposes only the four panels belonging to the current composite", () => {
  const panels = styleSheetPanels([
    asset("old-front", "front", "old-sheet"),
    asset("front", "front", "current-sheet"),
    asset("profile", "profile", "current-sheet"),
    asset("invalid", "expression", "current-sheet"),
  ], "current-sheet");

  assert.equal(panels.size, 2);
  assert.equal(panels.get("front")?.id, "front");
  assert.equal(panels.get("profile")?.id, "profile");
  assert.equal(panels.has("three_quarter"), false);
});

test("style sheet prompt rejects source-scene action and locks four neutral views", () => {
  const character = {
    id: "actor-1",
    makerId: "maker-1",
    name: "Test Actor",
    archetype: "hero",
    tagline: "Test",
    personality: "Measured under pressure.",
    voiceGender: "androgynous",
    voiceDesc: "Neutral",
    sfxDesc: "Neutral",
    themeDesc: "Neutral",
    avatarHue: 1,
    licenseType: "open",
    royaltyRate: 0,
    createdAt: "2026-07-29T00:00:00.000Z",
    stats: { castings: 0, fans: 0, earnings: 0, socialImpressions: 0, socialViews: 0, socialLikes: 0 },
  } satisfies Character;
  const prompt = characterStyleSheetPrompt(character);

  assert.match(prompt, /exactly four equal vertical panels/i);
  assert.match(prompt, /Ignore and remove the reference image's pose, action, location/i);
  assert.match(prompt, /full body/i);
});

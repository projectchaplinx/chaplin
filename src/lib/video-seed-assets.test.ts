import assert from "node:assert/strict";
import test from "node:test";
import {
  isCharacterStyleSheetAsset,
  isSelectableVideoSeedAsset,
} from "@/lib/video-seed-assets";

test("style-sheet composites and panels stay out of the animation seed shelf", () => {
  const composite = {
    kind: "gallery",
    metadata: {
      imagePurpose: "character-sheet",
      characterSheetRole: "composite",
      videoReferenceSafe: false,
    },
  };
  const panel = {
    kind: "gallery",
    metadata: {
      characterSheetRole: "panel",
      characterSheetView: "profile",
      compositeAssetId: "sheet-1",
      videoReferenceSafe: true,
    },
  };

  assert.equal(isCharacterStyleSheetAsset(composite), true);
  assert.equal(isSelectableVideoSeedAsset(composite), false);
  assert.equal(isCharacterStyleSheetAsset(panel), true);
  assert.equal(isSelectableVideoSeedAsset(panel), false);
});

test("scene and identity gallery images remain valid animation seeds", () => {
  assert.equal(isSelectableVideoSeedAsset({
    kind: "gallery",
    metadata: { imagePurpose: "scene", selectedForVideo: true },
  }), true);
  assert.equal(isSelectableVideoSeedAsset({
    kind: "gallery",
    metadata: { imagePurpose: "identity" },
  }), true);
});

test("explicitly unsafe and non-gallery assets cannot become animation seeds", () => {
  assert.equal(isSelectableVideoSeedAsset({
    kind: "gallery",
    metadata: { videoReferenceSafe: false },
  }), false);
  assert.equal(isSelectableVideoSeedAsset({
    kind: "video",
    metadata: {},
  }), false);
});

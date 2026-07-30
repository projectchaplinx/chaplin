import assert from "node:assert/strict";
import test from "node:test";
import { isCreatorSelectedFeedAsset, isGenerationVisibleInFeed, isPunchGeneration } from "./feed-visibility";

test("recognizes Punch from the job or persisted metadata", () => {
  assert.equal(isPunchGeneration("character_punch"), true);
  assert.equal(isPunchGeneration(null, { format: "punch" }), true);
  assert.equal(isPunchGeneration("episode", { format: "episode" }), false);
});

test("shows only approved generation categories in the public feed", () => {
  assert.equal(isGenerationVisibleInFeed({ sourceAssetId: "1", assetKind: "theme", mediaKind: "audio" }), true);
  assert.equal(isGenerationVisibleInFeed({ sourceAssetId: "2", assetKind: "dialogue", mediaKind: "audio", videoType: "character_punch" }), true);
  assert.equal(isGenerationVisibleInFeed({ sourceAssetId: "3", assetKind: "dialogue", mediaKind: "audio" }), false);
  assert.equal(isGenerationVisibleInFeed({ sourceAssetId: "4", assetKind: "sfx", mediaKind: "audio" }), false);
  assert.equal(isGenerationVisibleInFeed({ sourceAssetId: "5", assetKind: "voice-design", mediaKind: "audio" }), false);
  assert.equal(isGenerationVisibleInFeed({ sourceAssetId: "6", assetKind: "gallery", mediaKind: "image" }), true);
  assert.equal(isGenerationVisibleInFeed({ sourceAssetId: "7", assetKind: "video", mediaKind: "video" }), true);
});

test("manual audio is hidden because it cannot be verified as a theme or Punch line", () => {
  assert.equal(isGenerationVisibleInFeed({ mediaKind: "audio" }), false);
  assert.equal(isGenerationVisibleInFeed({ mediaKind: "image" }), true);
  assert.equal(isGenerationVisibleInFeed({ mediaKind: null }), true);
});

test("a comparison candidate stays out of the feed until it is chosen", () => {
  const candidate = {
    sourceAssetId: "asset-1",
    assetKind: "gallery",
    mediaKind: "image",
    jobMetadata: { comparisonCandidate: true },
  };
  // Both providers' stills used to publish; the discarded one muddied the actor.
  assert.equal(isGenerationVisibleInFeed(candidate), false);
  assert.equal(isGenerationVisibleInFeed({ ...candidate, selected: true }), true);
  assert.equal(isGenerationVisibleInFeed({
    ...candidate,
    assetMetadata: { selectedForProfileCover: true },
  }), true);
});

test("an ordinary still is unaffected by the candidate rule", () => {
  assert.equal(isGenerationVisibleInFeed({
    sourceAssetId: "asset-2",
    assetKind: "gallery",
    mediaKind: "image",
    jobMetadata: {},
  }), true);
});

test("recognizes persisted creator selections on both cover and scene assets", () => {
  assert.equal(isCreatorSelectedFeedAsset({ selectedForProfileCover: true }), true);
  assert.equal(isCreatorSelectedFeedAsset({ selectedForVideo: true }), true);
  assert.equal(isCreatorSelectedFeedAsset({ selectedForProfileCover: false }), false);
  assert.equal(isCreatorSelectedFeedAsset(null), false);
});

test("style-sheet composites and panels remain private workspace evidence", () => {
  assert.equal(isGenerationVisibleInFeed({
    sourceAssetId: "sheet-composite",
    assetKind: "gallery",
    mediaKind: "image",
    jobMetadata: { imagePurpose: "character-sheet", characterSheetRole: "composite" },
  }), false);
  assert.equal(isGenerationVisibleInFeed({
    sourceAssetId: "sheet-panel",
    assetKind: "gallery",
    mediaKind: "image",
    assetMetadata: {
      characterSheetRole: "panel",
      characterSheetView: "front",
      compositeAssetId: "sheet-composite",
    },
  }), false);
});

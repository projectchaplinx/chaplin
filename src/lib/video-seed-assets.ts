export type VideoSeedAssetLike = {
  kind: string;
  metadata: unknown;
};

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Character-sheet composites and their cropped views belong to the Style Sheet
 * workspace. They are identity evidence, not authored scene frames.
 */
export function isCharacterStyleSheetAsset(asset: VideoSeedAssetLike) {
  const metadata = metadataRecord(asset.metadata);
  return metadata.imagePurpose === "character-sheet"
    || metadata.characterSheetRole === "composite"
    || metadata.characterSheetRole === "panel"
    || typeof metadata.compositeAssetId === "string";
}

/**
 * The animation seed shelf accepts authored scene frames only. An identity
 * portrait proves the face but carries no playable world or action; animating
 * it directly is how five-second Sparks became lifeless moving headshots.
 */
export function isSelectableVideoSeedAsset(asset: VideoSeedAssetLike) {
  if (asset.kind !== "gallery" || isCharacterStyleSheetAsset(asset)) return false;
  const metadata = metadataRecord(asset.metadata);
  return metadata.imagePurpose === "scene"
    && metadata.videoReferenceSafe !== false;
}

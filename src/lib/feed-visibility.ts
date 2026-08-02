import { isCharacterStyleSheetAsset } from "@/lib/video-seed-assets";
type FeedGenerationVisibility = {
  assetMetadata?: unknown;
  assetKind?: string | null;
  jobMetadata?: unknown;
  mediaKind?: string | null;
  sourceAssetId?: string | null;
  videoType?: string | null;
  /** True when this asset is being published because a creator chose it. */
  selected?: boolean;
};

/**
 * A still generated as one of several options for the creator to compare.
 *
 * Every provider's attempt was published the moment it rendered, so a
 * two-provider pass put both candidates in the feed and the discarded one sat
 * there alongside the kept one, muddying who the character is. A candidate
 * stays private until it is chosen; choosing it is what publishes it.
 */
function isUnchosenComparisonCandidate(input: FeedGenerationVisibility) {
  if (input.selected || isCreatorSelectedFeedAsset(input.assetMetadata)) return false;
  const metadata = input.jobMetadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>).comparisonCandidate === true;
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
}

export function isCreatorSelectedFeedAsset(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  return record.selectedForProfileCover === true || record.selectedForVideo === true;
}

export function isPunchGeneration(videoType?: string | null, metadata?: unknown) {
  if (["punch", "character_punch"].includes(normalized(videoType))) return true;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  return [
    record.video_type,
    record.videoType,
    record.format,
    record.production_format,
    record.productionFormat,
  ].some((value) => ["punch", "character_punch"].includes(normalized(value)));
}

/**
 * Research and experiment output must never read as product. Sprint runs,
 * pipeline experiments, and sprint-test images carry markers on the asset or
 * job metadata; anything marked stays out of the public feed while remaining
 * fully visible in the admin research surfaces.
 */
function isResearchArtifact(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  return Boolean(
    record.directorSprintTwoRunId
    || record.directorSprintRunId
    || record.directorSprintGrant
    || record.pipelineExperimentId
    || record.pipelineExperiment
    || normalized(record.imagePurpose) === "sprint_test",
  );
}

/**
 * The public feed is a finished-work surface, not a mirror of every provider
 * event. Admin generation logs retain every asset regardless of this policy.
 */
export function isGenerationVisibleInFeed(input: FeedGenerationVisibility) {
  if (isResearchArtifact(input.assetMetadata) || isResearchArtifact(input.jobMetadata)) return false;
  if (isCharacterStyleSheetAsset({
    kind: input.assetKind ?? "",
    metadata: input.assetMetadata,
  }) || isCharacterStyleSheetAsset({ kind: "gallery", metadata: input.jobMetadata })) {
    return false;
  }
  if (isUnchosenComparisonCandidate(input)) return false;
  if (!input.sourceAssetId) return normalized(input.mediaKind) !== "audio";

  const kind = normalized(input.assetKind);
  if (kind === "theme") return true;
  if (kind === "dialogue") return isPunchGeneration(input.videoType, input.jobMetadata);
  if (["audio", "sfx", "voice", "voice_design", "voice_lock"].includes(kind)) return false;

  // Every other generated media kind currently maps to a still/image or video.
  return normalized(input.mediaKind) !== "audio";
}

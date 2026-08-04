import type { Reference, ShotJob } from "@/lib/shot-job";
import { compileShotJobPrompt, referencesForShot, shotJobSchema } from "@/lib/shot-job";

export type SeedanceShotCapabilities = {
  family: "1.x" | "2.0" | "2.5";
  apiAvailable: boolean;
  maxDurationMs: number;
  maxReferenceImages: number;
  maxReferenceVideos: number;
  maxReferenceAudio: number;
  acceptsReferenceImages: boolean;
  acceptsReferenceVideo: boolean;
  acceptsReferenceAudio: boolean;
  promptTimedMultiBeat: boolean;
  structuredShotsField: false;
  videoExtension: boolean;
  videoEditing: boolean;
  nativeClipJoining: false;
};

export type SeedanceSubmission =
  | { transport: "single-shot-2.0"; shotId: string; prompt: string; references: Reference[]; startFrameAsset?: string; endFrameAsset?: string }
  | { transport: "prompt-timed-multi-beat"; job: ShotJob; prompt: string; references: Reference[] };

export const SEEDANCE_EXTENSION_CONTINUITY = "Extend the video naturally, smooth motion continuity, no hard cuts, nothing appears out of thin air.";

export function buildSeedanceExtensionPrompt(direction: string) {
  const clean = direction.trim();
  if (!clean) throw new Error("Video extension needs a visible continuation direction.");
  return `${clean}\n${SEEDANCE_EXTENSION_CONTINUITY}`;
}

export function seedanceSpecializedEditStatus(feature: "subject-swap" | "wardrobe-swap" | "background-swap" | "bgm-strip" | "clip-join") {
  return {
    feature,
    available: false,
    reason: "ModelArk exposes generic VideoEditing, but this feature has no verified structured request contract on the Chaplin account.",
  } as const;
}

export function seedanceCapabilities(model: string): SeedanceShotCapabilities {
  /*
    Seedance 2.5 — dated 2026-08-02 from the official Dreamina prompt guide:
    The authenticated ModelArk catalogue declares multimodal generation,
    extension, and editing. Duration, reference-count, and structured-shot
    claims remain unverified and are not inferred from the model name.
  */
  if (/seedance-2-5|seedance-2\.5/i.test(model)) {
    return {
      family: "2.5",
      // The authenticated model catalogue exposes 2.5, but task creation on
      // this account returns ModelNotOpen. Keep production on the verified
      // ceiling until activation and a real 30-second control both pass.
      apiAvailable: false,
      maxDurationMs: 15_000,
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      maxReferenceAudio: 3,
      acceptsReferenceImages: true,
      acceptsReferenceVideo: true,
      acceptsReferenceAudio: true,
      promptTimedMultiBeat: true,
      structuredShotsField: false,
      videoExtension: true,
      videoEditing: true,
      nativeClipJoining: false,
    };
  }
  if (/dreamina-seedance-2-0/i.test(model)) {
    return {
      family: "2.0",
      apiAvailable: true,
      maxDurationMs: 15_000,
      maxReferenceImages: 9,
      maxReferenceVideos: 3,
      maxReferenceAudio: 3,
      acceptsReferenceImages: true,
      acceptsReferenceVideo: true,
      acceptsReferenceAudio: true,
      promptTimedMultiBeat: false,
      structuredShotsField: false,
      videoExtension: true,
      videoEditing: true,
      nativeClipJoining: false,
    };
  }
  return {
    family: "1.x",
    apiAvailable: true,
    maxDurationMs: 10_000,
    maxReferenceImages: 1,
    maxReferenceVideos: 0,
    maxReferenceAudio: 0,
    acceptsReferenceImages: false,
    acceptsReferenceVideo: false,
    acceptsReferenceAudio: false,
    promptTimedMultiBeat: false,
    structuredShotsField: false,
    videoExtension: false,
    videoEditing: false,
    nativeClipJoining: false,
  };
}

/**
 * No model name enables multi-shot by inference. The account probe must supply
 * a capability that explicitly confirms the transport before it can activate.
 */
export function adaptShotJobForSeedance(
  rawJob: ShotJob,
  probed?: SeedanceShotCapabilities,
): SeedanceSubmission[] {
  const job = shotJobSchema.parse(rawJob);
  const capability = probed ?? seedanceCapabilities(job.model_version);
  const referenceCounts = job.references.reduce((counts, reference) => {
    if (["character", "product", "style"].includes(reference.kind)) counts.images += 1;
    if (reference.kind === "motion") counts.videos += 1;
    if (reference.kind === "audio") counts.audio += 1;
    return counts;
  }, { images: 0, videos: 0, audio: 0 });
  if (referenceCounts.images > capability.maxReferenceImages
    || referenceCounts.videos > capability.maxReferenceVideos
    || referenceCounts.audio > capability.maxReferenceAudio) {
    throw new Error("Shot job exceeds the verified per-medium reference budget.");
  }
  if (capability.apiAvailable && capability.promptTimedMultiBeat) {
    return partitionShotJob(job, capability.maxDurationMs).map((partition) => ({
      transport: "prompt-timed-multi-beat" as const,
      job: partition,
      prompt: compileShotJobPrompt(partition),
      references: partition.references,
    }));
  }
  return job.shots.map((shot) => ({
    transport: "single-shot-2.0" as const,
    shotId: shot.id,
    prompt: compileShotJobPrompt({ ...job, shots: [{ ...shot, index: 0 }], total_duration_ms: shot.duration_ms }),
    references: referencesForShot(job, shot),
    ...(shot.start_frame_asset ? { startFrameAsset: shot.start_frame_asset } : {}),
    ...(shot.end_frame_asset ? { endFrameAsset: shot.end_frame_asset } : {}),
  }));
}

export function partitionShotJob(job: ShotJob, maxDurationMs: number): ShotJob[] {
  if (maxDurationMs <= 0) throw new Error("Model duration ceiling must be positive.");
  const partitions: ShotJob[] = [];
  let shots: ShotJob["shots"] = [];
  let duration = 0;
  const flush = () => {
    if (!shots.length) return;
    const referenceIds = new Set(shots.flatMap((shot) => shot.subject_refs));
    const references = job.references.filter((reference) =>
      referenceIds.has(reference.id) || ["style", "motion", "audio"].includes(reference.kind),
    );
    partitions.push(shotJobSchema.parse({
      ...job,
      shots: shots.map((shot, index) => ({ ...shot, index })),
      total_duration_ms: duration,
      references,
    }));
    shots = [];
    duration = 0;
  };
  for (const shot of job.shots) {
    if (shot.duration_ms > maxDurationMs) {
      throw new Error(`Shot ${shot.id} exceeds the probed ${maxDurationMs}ms model ceiling.`);
    }
    if (shots.length && duration + shot.duration_ms > maxDurationMs) flush();
    shots.push(shot);
    duration += shot.duration_ms;
  }
  flush();
  return partitions;
}

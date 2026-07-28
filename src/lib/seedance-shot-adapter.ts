import type { Reference, ShotJob } from "@/lib/shot-job";
import { compileShotJobPrompt, referencesForShot, shotJobSchema } from "@/lib/shot-job";

export type SeedanceShotCapabilities = {
  maxDurationMs: number;
  maxReferences: number;
  acceptsReferenceImages: boolean;
  acceptsReferenceVideo: boolean;
  acceptsReferenceAudio: boolean;
  structuredMultiShot: boolean;
};

export type SeedanceSubmission =
  | { transport: "single-shot-2.0"; shotId: string; prompt: string; references: Reference[]; startFrameAsset?: string; endFrameAsset?: string }
  | { transport: "multi-shot"; job: ShotJob; prompt: string; references: Reference[] };

export function seedanceCapabilities(model: string): SeedanceShotCapabilities {
  if (/dreamina-seedance-2-0/i.test(model)) {
    return {
      maxDurationMs: 15_000,
      maxReferences: 9,
      acceptsReferenceImages: true,
      acceptsReferenceVideo: true,
      acceptsReferenceAudio: true,
      structuredMultiShot: false,
    };
  }
  return {
    maxDurationMs: 10_000,
    maxReferences: 1,
    acceptsReferenceImages: false,
    acceptsReferenceVideo: false,
    acceptsReferenceAudio: false,
    structuredMultiShot: false,
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
  if (job.references.length > capability.maxReferences && capability.structuredMultiShot) {
    throw new Error(`Shot job exceeds the probed ${capability.maxReferences}-reference ceiling.`);
  }
  if (capability.structuredMultiShot) {
    return partitionShotJob(job, capability.maxDurationMs).map((partition) => ({
      transport: "multi-shot" as const,
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

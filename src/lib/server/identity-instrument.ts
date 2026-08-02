import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  createOpenAIResponse,
  openAIWritingModel,
} from "@/lib/server/openai-responses";
import { writeAutomaticDirectorEvaluation } from "@/lib/server/auto-evaluation";
import { appendProductionEvidence } from "@/lib/server/production-evidence";
import { ffmpegExecutable } from "@/lib/server/ffmpeg-runtime";

const execute = promisify(execFile);

/**
 * The identity instrument — the measurement the pipeline never had.
 *
 * Nothing in production ever compared generated pixels to the canonical
 * reference; identity drift was invisible until a human noticed. This module
 * samples a rendered clip at ~1 fps, shows the frames beside the actor's
 * canonical reference, and asks for a refutation-biased comparison. The
 * result is written through the canonical evaluation writer (automatic,
 * 1-5 scale, identity as hard gate) and appended to the chaplin-test
 * production-evidence study. It never blocks or fails a render.
 */

const MEASUREMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    identityContinuity: { type: "number", minimum: 0, maximum: 100 },
    wardrobeContinuity: { type: "number", minimum: 0, maximum: 100 },
    imageQuality: { type: "number", minimum: 0, maximum: 100 },
    driftNotes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
  },
  required: ["identityContinuity", "wardrobeContinuity", "imageQuality", "driftNotes"],
};

type MeasurementResult = {
  identityContinuity: number;
  wardrobeContinuity: number;
  imageQuality: number;
  driftNotes: string[];
};

export type IdentityMeasurementInput = {
  videoUrl: string;
  canonicalReferenceUrl: string;
  characterId: string;
  durationSeconds?: number;
  generationJobId?: string | null;
  pipelineRunId?: string | null;
  outputAssetId?: string | null;
  /** e.g. "shot 2 of 4", "assembled master" */
  label?: string;
};

async function sampleFrames(videoUrl: string, durationSeconds: number) {
  const directory = await mkdtemp(path.join(tmpdir(), "chaplin-identity-"));
  const videoPath = path.join(directory, "clip.mp4");
  const sheetPath = path.join(directory, "sheet.jpg");
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Download rendered clip: ${response.status}`);
    await writeFile(videoPath, Buffer.from(await response.arrayBuffer()));
    // ~1 fps, capped at 6 cells: a 5s shot fills 3x2; a 15s master samples
    // evenly across its whole length instead of only the first six seconds.
    const fps = durationSeconds > 6 ? Math.max(0.2, 6 / durationSeconds) : 1;
    await execute(ffmpegExecutable(), [
      "-y", "-i", videoPath,
      "-vf", `fps=${fps.toFixed(3)},scale=480:-2,tile=3x2:padding=2:margin=2`,
      "-frames:v", "1", "-q:v", "3", sheetPath,
    ], { timeout: 120_000, maxBuffer: 10 * 1024 * 1024, windowsHide: true });
    return { sheet: await readFile(sheetPath), cleanup: () => rm(directory, { recursive: true, force: true }).catch(() => undefined) };
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function measureIdentity(input: IdentityMeasurementInput) {
  const durationSeconds = Math.max(1, Math.min(120, input.durationSeconds ?? 5));
  const { sheet, cleanup } = await sampleFrames(input.videoUrl, durationSeconds);
  try {
    const { data, text } = await createOpenAIResponse({
      model: openAIWritingModel(process.env.OPENAI_RESEARCH_MODEL),
      instructions: [
        "You are Chaplin's automatic identity instrument. The first image is the actor's canonical reference — identity truth. The second is a chronological frame sheet from one rendered clip.",
        "Judge whether the person in the frames IS the canonical actor and stays the same person across frames. Score only visible evidence and bias toward refutation: score identityContinuity below 60 when face geometry, age, skin tone, or distinguishing marks visibly change or do not match.",
        "wardrobeContinuity covers clothing, hair, and carried props staying consistent across frames. imageQuality covers anatomy, artifacts, and exposure. driftNotes must name the frames and the specific change, or state that no drift was observed.",
        "This measurement carries no approval authority; a human reviews it later.",
      ].join("\n"),
      messages: [{
        role: "user",
        content: [
          { type: "input_text", text: `Clip: ${input.label ?? "one rendered shot"} · ${durationSeconds}s · character ${input.characterId}.` },
          { type: "input_image", image_url: input.canonicalReferenceUrl, detail: "high" },
          { type: "input_image", image_url: `data:image/jpeg;base64,${sheet.toString("base64")}`, detail: "high" },
        ],
      }],
      maxOutputTokens: 700,
      schema: MEASUREMENT_SCHEMA,
      schemaName: "identity_measurement",
    });
    const result = JSON.parse(text) as MeasurementResult;

    const evaluation = await writeAutomaticDirectorEvaluation({
      stage: "video",
      percentScores: {
        identity_wardrobe: Math.min(result.identityContinuity, result.wardrobeContinuity),
        image_quality: result.imageQuality,
      },
      generationJobId: input.generationJobId ?? null,
      pipelineRunId: input.pipelineRunId ?? null,
      outputAssetId: input.outputAssetId ?? null,
      evidence: {
        instrument: "identity-v1",
        label: input.label ?? "shot",
        identityContinuity: result.identityContinuity,
        wardrobeContinuity: result.wardrobeContinuity,
        imageQuality: result.imageQuality,
        driftNotes: result.driftNotes,
        providerResponseId: data.id ?? null,
      },
      reviewerNotes: "Automatic identity measurement (identity-v1). Partial dimensions by design; carries no approval authority.",
    });

    await appendProductionEvidence({
      observedAt: new Date().toISOString(),
      generationJobId: input.generationJobId ?? null,
      pipelineRunId: input.pipelineRunId ?? null,
      characterId: input.characterId,
      kind: "identity-measurement",
      detail: {
        label: input.label ?? "shot",
        durationSeconds,
        identityContinuity: result.identityContinuity,
        wardrobeContinuity: result.wardrobeContinuity,
        imageQuality: result.imageQuality,
        driftNotes: result.driftNotes,
        evaluationId: evaluation.id,
        gateStatus: evaluation.gateStatus,
      },
    }).catch(() => undefined);

    return {
      identityContinuity: result.identityContinuity,
      wardrobeContinuity: result.wardrobeContinuity,
      imageQuality: result.imageQuality,
      driftNotes: result.driftNotes,
      gateStatus: evaluation.gateStatus,
      evaluationId: evaluation.id,
    };
  } finally {
    await cleanup();
  }
}

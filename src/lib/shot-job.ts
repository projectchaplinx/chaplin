import { z } from "zod";
import { audioPlanSchema, DEFAULT_AUDIO_PLAN, type AudioPlan } from "@/lib/audio-plan";
import { finalizeVideoPrompt } from "@/lib/prompt-standards";

const assetIdSchema = z.string().trim().min(1);
const simpleActionSchema = z.string().trim().min(2).superRefine((action, context) => {
  if (/[;]|\b(?:and then|then|followed by|after that|before (?:he|she|they|it))\b|(?:[.!?]\s+){1,}/i.test(action)) {
    context.addIssue({
      code: "custom",
      message: "A beat may contain exactly one action. Split stacked actions into separate timecoded beats.",
    });
  }
  if (/\b(?:thinks?|remembers?|feels?|realizes?|backstory|smells?|scent|biomechanics?|muscle activation|joint angle)\b/i.test(action)) {
    context.addIssue({
      code: "custom",
      message: "Actions must be visible or audible intent, not thoughts, emotion labels, smells, backstory, or biomechanics.",
    });
  }
  if (/\bmirror\b/i.test(action) && /\b(?:into|toward|towards|approaches?)\b.{0,20}\bmirror\b/i.test(action)) {
    context.addIssue({ code: "custom", message: "Compose past mirrors, never movement into them." });
  }
});

export const beatSchema = z.object({
  at_ms: z.number().int().nonnegative(),
  action: simpleActionSchema,
}).strict();

export const referenceKindSchema = z.enum(["character", "product", "style", "motion", "audio"]);
export const referenceSchema = z.object({
  id: z.string().trim().min(1),
  kind: referenceKindSchema,
  asset_id: assetIdSchema,
  label: z.string().trim().regex(/^@(image|video|audio)\d+$/, "Use a provider address such as @image1, @video1, or @audio1."),
  character_reference_role: z.enum(["canonical", "panel", "composite"]).optional(),
}).strict();

export const seamSchema = z.enum([
  "frozen_handoff",
  "action_bridge",
  "match_cut",
  "portal",
  "hard_cut",
]);

export const shotSchema = z.object({
  id: z.string().trim().min(1),
  index: z.number().int().nonnegative(),
  duration_ms: z.number().int().positive(),
  framing: z.string().trim().min(2),
  camera_move: z.string().trim().min(2).superRefine((move, context) => {
    if (/[;,/]|\b(?:and then|followed by|then)\b/i.test(move)) {
      context.addIssue({ code: "custom", message: "Specify exactly one camera move, or use locked." });
    }
  }),
  beats: z.array(beatSchema).min(1),
  subject_refs: z.array(z.string().trim().min(1)).max(8),
  start_frame_asset: assetIdSchema.optional(),
  end_frame_asset: assetIdSchema.optional(),
  seam_to_next: seamSchema.default("hard_cut"),
  audio: audioPlanSchema.default(DEFAULT_AUDIO_PLAN),
}).strict().superRefine((shot, context) => {
  let previous = -1;
  shot.beats.forEach((beat, index) => {
    if (beat.at_ms >= shot.duration_ms) {
      context.addIssue({
        code: "custom",
        path: ["beats", index, "at_ms"],
        message: "Every beat must begin strictly inside the shot duration.",
      });
    }
    if (beat.at_ms <= previous) {
      context.addIssue({
        code: "custom",
        path: ["beats", index, "at_ms"],
        message: "Beat timecodes must be strictly increasing.",
      });
    }
    previous = beat.at_ms;
  });
});

export const shotJobSchema = z.object({
  shots: z.array(shotSchema).min(1),
  total_duration_ms: z.number().int().positive(),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1", "4:3", "3:4"]),
  references: z.array(referenceSchema).max(50),
  model_version: z.string().trim().min(1),
}).strict().superRefine((job, context) => {
  const duration = job.shots.reduce((total, shot) => total + shot.duration_ms, 0);
  if (duration !== job.total_duration_ms) {
    context.addIssue({
      code: "custom",
      path: ["total_duration_ms"],
      message: `Shot durations total ${duration}ms, not ${job.total_duration_ms}ms.`,
    });
  }
  job.shots.forEach((shot, index) => {
    if (shot.index !== index) {
      context.addIssue({ code: "custom", path: ["shots", index, "index"], message: "Shot indexes must be contiguous and zero-based." });
    }
  });
  const ids = new Set(job.references.map((reference) => reference.id));
  const trackedCharacters = new Set<string>();
  for (const [shotIndex, shot] of job.shots.entries()) {
    for (const ref of shot.subject_refs) {
      if (!ids.has(ref)) {
        context.addIssue({ code: "custom", path: ["shots", shotIndex, "subject_refs"], message: `Unknown reference ${ref}.` });
      }
      if (job.references.find((candidate) => candidate.id === ref)?.kind === "character") trackedCharacters.add(ref);
    }
  }
  if (trackedCharacters.size > 3) {
    context.addIssue({ code: "custom", path: ["references"], message: "A shot job may track at most three characters across cuts." });
  }
  const portals = job.shots.filter((shot) => shot.seam_to_next === "portal").length;
  if (portals > 1) {
    context.addIssue({ code: "custom", path: ["shots"], message: "A board may contain at most one portal seam." });
  }
  job.references.forEach((reference, index) => {
    if (reference.character_reference_role === "composite") {
      context.addIssue({
        code: "custom",
        path: ["references", index],
        message: "Composite character sheets are for human review only and cannot be attached to video generation.",
      });
    }
  });
  job.shots.slice(0, -1).forEach((shot, index) => {
    if (shot.seam_to_next === "frozen_handoff") {
      const closingAction = shot.beats.at(-1)?.action;
      const openingAction = job.shots[index + 1]?.beats[0]?.action;
      if (closingAction !== openingAction) {
        context.addIssue({
          code: "custom",
          path: ["shots", index, "seam_to_next"],
          message: "A frozen handoff must restate the previous closing action verbatim as the next opening beat.",
        });
      }
    }
  });
});

export type Beat = z.infer<typeof beatSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type Seam = z.infer<typeof seamSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type ShotJob = z.infer<typeof shotJobSchema>;

export const DEFAULT_BEAT_DURATION_MS = 3000;
export const MIN_SHOT_DURATION_MS = 1000;

export function normalizeCameraMove(cameraMove: string) {
  const value = cameraMove.trim();
  if (/^(?:locked|slow\b)|\b(?:whip|crash)\b/i.test(value)) return value;
  return `slow ${value}`;
}

export function durationFromPerformance(input: {
  measuredVoMs?: number | null;
  beatCount: number;
  modelMaxDurationMs: number;
}) {
  const voFirst = input.measuredVoMs ? input.measuredVoMs + 500 : 0;
  const beatDriven = Math.max(1, input.beatCount) * DEFAULT_BEAT_DURATION_MS;
  return Math.min(input.modelMaxDurationMs, Math.max(MIN_SHOT_DURATION_MS, voFirst || beatDriven));
}

export function seamFromBrief(brief: string): Seam {
  if (/\b(?:seamless|one take|flow)\b/i.test(brief)) return "frozen_handoff";
  if (/\b(?:morphs into|becomes)\b/i.test(brief)) return "match_cut";
  if (/\b(?:cut to|meanwhile|vignettes?)\b/i.test(brief)) return "hard_cut";
  return "hard_cut";
}

export function seamFromLegacyMotion(mode: "forward" | "chain" | "ff_lf"): Seam {
  if (mode === "chain") return "frozen_handoff";
  return "hard_cut";
}

export function buildShotJob(raw: z.input<typeof shotJobSchema>): ShotJob {
  const normalized = {
    ...raw,
    shots: raw.shots.map((shot, index) => ({
      ...shot,
      index,
      camera_move: normalizeCameraMove(shot.camera_move),
      seam_to_next: shot.seam_to_next ?? "hard_cut",
    })),
  };
  return shotJobSchema.parse(normalized);
}

function timecode(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
}

export function compileShotJobPrompt(rawJob: ShotJob, skinVisible = true) {
  const job = shotJobSchema.parse(rawJob);
  const references = job.references.map((reference) =>
    `${reference.label} = ${reference.kind} reference "${reference.id}" (${reference.asset_id})`,
  );
  let offset = 0;
  const shots = job.shots.map((shot) => {
    const refs = shot.subject_refs
      .map((id) => job.references.find((reference) => reference.id === id)?.label)
      .filter(Boolean)
      .join(", ");
    const beats = shot.beats.map((beat) =>
      `${timecode(offset + beat.at_ms)} ${beat.action}`,
    ).join("; ");
    const block = [
      `SHOT ${shot.index + 1} ${timecode(offset)}-${timecode(offset + shot.duration_ms)}.`,
      `Framing: ${shot.framing}. Camera: ${shot.camera_move}.`,
      refs ? `Tracked subjects: ${refs}. Re-establish screen position and facing after the cut; keep the camera on one side of the action line.` : "",
      `Visible beats: ${beats}.`,
      `Seam: ${shot.seam_to_next}.`,
      "Unnamed extras remain generic, non-readable, and carry no identity assertion.",
    ].filter(Boolean).join(" ");
    offset += shot.duration_ms;
    return block;
  });
  return finalizeVideoPrompt(`${references.join("\n")}\n${shots.join("\n")}`, skinVisible);
}

export function referencesForShot(job: ShotJob, shot: Shot): Reference[] {
  const ids = new Set(shot.subject_refs);
  return job.references.filter((reference) =>
    ids.has(reference.id) || ["style", "motion", "audio"].includes(reference.kind),
  );
}

export function audioPlanForShot(shot: Shot): AudioPlan {
  return shot.audio;
}

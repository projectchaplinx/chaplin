import type { PunchGenerationMode } from "@/lib/production-formats";

type PromptLine = {
  speaker: string;
  text: string;
};

export type PunchPromptScene = {
  setting: string;
  objective?: string;
  action?: string;
  camera?: string;
  lines: PromptLine[];
};

const PUNCH_WINDOWS = [
  [0, 4],
  [4, 8],
  [8, 12],
  [12, 15],
] as const;

/**
 * ModelArk accepts only whole-second Seedance 2.0 durations from 4 through 15.
 * The authored edit may still use a shorter or fractional portion of a source
 * clip; FFmpeg trims that provider-safe source to the solved board duration.
 */
export function providerDurationSeconds(
  mode: PunchGenerationMode,
  authoredDurationMs: number,
) {
  if (mode === "single-take") return 15;
  const authoredSeconds = Number.isFinite(authoredDurationMs) ? authoredDurationMs / 1000 : 4;
  return Math.min(15, Math.max(4, Math.ceil(authoredSeconds)));
}

export function buildPunchSingleTakePrompt(input: {
  title: string;
  logline: string;
  creativeDirection?: string;
  actorIdentity: string;
  themeDirection?: string;
  scenes: PunchPromptScene[];
}) {
  const scenes = input.scenes.slice(0, 4);
  if (scenes.length !== 4) {
    throw new Error("A 15-second single take needs exactly four authored beats.");
  }
  const timeline = scenes.map((scene, index) => {
    const [start, end] = PUNCH_WINDOWS[index];
    const dialogue = scene.lines.length
      ? scene.lines.map((line) => `${line.speaker} says exactly: "${line.text.replaceAll('"', "'")}"`).join(" ")
      : "No one speaks in this beat.";
    return [
      `${start}-${end}s — SHOT ${index + 1}`,
      `SETTING: ${scene.setting || "the established location"}.`,
      `STORY CHANGE: ${scene.objective || "the situation visibly changes"}.`,
      `VISIBLE ACTION: ${scene.action || "the actor completes one clear physical action"}.`,
      scene.camera ? `CAMERA: ${scene.camera}.` : "",
      `DIALOGUE: ${dialogue}`,
    ].filter(Boolean).join(" ");
  });

  return [
    `Create one finished 15-second audiovisual Punch titled "${input.title}".`,
    "This is one Seedance generation containing four clearly different internal shots and three motivated cuts. Do not return four files.",
    `STORY PROMISE: ${input.logline}.`,
    input.creativeDirection ? `CREATIVE DIRECTION: ${input.creativeDirection}.` : "",
    `IDENTITY CANON: ${input.actorIdentity}. Keep every named actor visually stable across all four shots; never blend, duplicate, age-shift, or replace a face.`,
    "TIMED SHOT PLAN:",
    ...timeline,
    "EDIT RHYTHM: Cut only at 4s, 8s, and 12s. Preserve screen direction, wardrobe, props, geography, and cause-and-effect across each cut. The final image must visibly land the story promise by 15s.",
    "FINISHED AUDIO: Generate synchronized production audio inside this video. Include the exact quoted dialogue with visible lip sync, location-specific room tone and background noise, physically motivated foreground effects, footsteps, cloth and handled objects, plus a restrained background score that supports rather than masks speech.",
    input.themeDirection ? `MUSIC DIRECTION: ${input.themeDirection}.` : "MUSIC DIRECTION: one restrained cinematic motif; no trailer boom and no wall-to-wall loud score.",
    "AUDIO RULES: Keep dialogue intelligible and centered. Use no narration, no additional lines, no singing, and no sounds that lack a visible or environmental source. Let ambience and score continue naturally across cuts.",
    "OUTPUT: One continuous 15-second 16:9 video with synchronized audio, no captions, no readable background text, no logo, and no watermark.",
  ].filter(Boolean).join("\n");
}

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
  [0, 15],
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

export type NativeMultiShotReference = {
  /** e.g. "@Image1" — the tag used inline in beat text. */
  tag: string;
  role: "canonical-identity" | "style-sheet-panel" | "product" | "style";
  description: string;
};

/**
 * Native multi-shot prompt, v2 — structured for the Seedance 2.5 contract
 * (dated 2026-08-02, official Dreamina guide): beat-by-beat timecodes,
 * @-tagged references, shot-size + movement camera grammar, and the guide's
 * own anti-drift practice of repeating wardrobe, props, and time of day at
 * every beat. One lens feel and palette is declared once and held.
 *
 * Dialogue is deliberately absent: spoken lines belong to the locked
 * ElevenLabs voice, and this template is used only for no-dialogue briefs
 * until reference-audio passes its controlled validation.
 */
export function buildNativeMultiShotPrompt(input: {
  title: string;
  logline: string;
  creativeDirection?: string;
  actorIdentity: string;
  references: NativeMultiShotReference[];
  lookContract: string;
  wardrobeLine: string;
  timeOfDay: string;
  totalDurationSeconds: 15 | 30;
  scenes: Array<{
    setting: string;
    objective?: string;
    action?: string;
    shotSize?: "CU" | "MCU" | "WS";
    cameraMove?: string;
    transitionOut?: string;
  }>;
  themeDirection?: string;
}) {
  const scenes = input.scenes.slice(0, 6);
  if (scenes.length < 2) throw new Error("A native multi-shot piece needs at least two beats.");
  const beatSeconds = input.totalDurationSeconds / scenes.length;
  const identityTags = input.references.filter((reference) => reference.role !== "product").map((reference) => reference.tag);
  const anchor = identityTags.length ? `${identityTags.join(" and ")} are the same single actor — identity truth.` : "";
  const beats = scenes.map((scene, index) => {
    const start = Math.round(index * beatSeconds);
    const end = index === scenes.length - 1 ? input.totalDurationSeconds : Math.round((index + 1) * beatSeconds);
    const camera = `${scene.shotSize ?? (index === 0 ? "WS" : "MCU")} ${scene.cameraMove ?? "camera locked"}`;
    return [
      `${String(start).padStart(2, "0")}–${String(end).padStart(2, "0")}s — BEAT ${index + 1}:`,
      `${scene.setting || "the established location"}. ${scene.objective || "The situation visibly changes."}`,
      `ACTION: ${scene.action || "the actor completes one clear physical action"}.`,
      `CAMERA: ${camera}.`,
      // The guide's anti-drift rule: restate wardrobe, props, and time of day
      // in every beat rather than trusting the model to remember beat one.
      `CONSTANT: ${input.wardrobeLine}; ${input.timeOfDay}.`,
      index < scenes.length - 1
        ? `TRANSITION: ${scene.transitionOut || "hard cut motivated by the action"}.`
        : "LANDING: hold the final image; no fade unless stated.",
      `END STATE: ${scene.action || "the actor completes one clear physical action"}. Arrive naturally; do not rush to this state.`,
    ].join(" ");
  });

  return [
    `Create one continuous ${input.totalDurationSeconds}-second video titled "${input.title}" with ${scenes.length} internal beats. One generation, not separate files.`,
    `STORY PROMISE: ${input.logline}.`,
    input.creativeDirection ? `CREATIVE DIRECTION: ${input.creativeDirection}.` : "",
    ...input.references.map((reference) => `${reference.tag} — ${reference.role}: ${reference.description}.`),
    anchor,
    `IDENTITY CANON: ${input.actorIdentity}. The actor matches ${identityTags[0] ?? "the supplied reference"} exactly in every beat; never blend, duplicate, beautify, age-shift, or substitute the face. Same face, same hairstyle, same outfit, same body type for the entire video.`,
    `LOOK CONTRACT: ${input.lookContract} Hold this one lens feel and palette across every beat.`,
    "TIMED BEAT PLAN:",
    ...beats,
    "MOTION RULES: Concrete, physically plausible motion only. Name no more than one moving subject per beat. No frozen figures.",
    "[SOUND] Strictly only naturally occurring sound and foley, no music allowed. Generate location-true ambience, footsteps, cloth, and handled objects only. No spoken words, no narration, no singing, and no lip movement implying speech: dialogue is performed by the locked voice and mixed separately.",
    "OUTPUT: one continuous vertical-safe video, no captions, no readable background text, no logo, no watermark.",
  ].filter(Boolean).join("\n");
}

export function buildPunchSingleTakePrompt(input: {
  title: string;
  logline: string;
  creativeDirection?: string;
  actorIdentity: string;
  themeDirection?: string;
  scenes: PunchPromptScene[];
}) {
  const scenes = input.scenes.slice(0, 1);
  if (scenes.length !== 1) {
    throw new Error("A 15-second single take needs exactly one authored scene.");
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
    "This is one continuous shot in one location and one unbroken moment. No cuts, inserts, montage, flashbacks, angle resets, location changes, or returns to the opening pose.",
    `STORY PROMISE: ${input.logline}.`,
    input.creativeDirection ? `CREATIVE DIRECTION: ${input.creativeDirection}.` : "",
    `IDENTITY CANON: ${input.actorIdentity}. Keep every named actor visually stable throughout; never blend, duplicate, age-shift, or replace a face.`,
    "CONTINUOUS 15-SECOND SHOT PLAN:",
    ...timeline,
    "PERFORMANCE RHYTHM: 0-4s establishes pressure, 4-11s develops one cause-and-effect action, and 11-15s lands its consequence in the same uninterrupted shot. Begin from the supplied first frame, evolve continuously, and finish in a visibly different story state without resetting.",
    "FINISHED AUDIO: Generate synchronized production audio inside this video. Include the exact quoted dialogue with visible lip sync, location-specific room tone and background noise, physically motivated foreground effects, footsteps, cloth and handled objects, plus a restrained background score that supports rather than masks speech.",
    input.themeDirection ? `MUSIC DIRECTION: ${input.themeDirection}.` : "MUSIC DIRECTION: one restrained cinematic motif; no trailer boom and no wall-to-wall loud score.",
    "AUDIO RULES: Keep dialogue intelligible and centered. Use no narration, no additional lines, no singing, and no sounds that lack a visible or environmental source. Let ambience and score evolve continuously without an edit.",
    "OUTPUT: One continuous 15-second 16:9 video with synchronized audio, no captions, no readable background text, no logo, and no watermark.",
  ].filter(Boolean).join("\n");
}

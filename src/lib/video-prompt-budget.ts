import { z } from "zod";
import { FILM_LOOK_LINE, SKIN_REALISM_BLOCK } from "@/lib/prompt-standards";

export const videoPromptModeSchema = z.enum(["image_to_video", "text_to_video", "native_multishot"]);
export type VideoPromptMode = z.infer<typeof videoPromptModeSchema>;

export type VideoPromptBudgetResult = {
  original: string;
  prompt: string;
  originalWords: number;
  finalWords: number;
  trimmed: boolean;
  dropped: Array<"world" | "biography" | "lighting">;
};

export function countPromptWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

const OPTIONAL_BLOCKS = [
  { key: "world" as const, pattern: /(?:^|\n)(?:WORLD|ATMOSPHERE):[^\n]*/gi },
  { key: "biography" as const, pattern: /(?:^|\n)(?:BIOGRAPHY|BACKSTORY):[^\n]*/gi },
  { key: "lighting" as const, pattern: /(?:^|\n)LIGHTING ADJECTIVES:[^\n]*/gi },
];

function trimToWords(value: string, maximum: number) {
  const ending = "No frozen figures. No music. No subtitles.";
  const hasFilm = value.includes(FILM_LOOK_LINE);
  const hasSkin = value.includes(SKIN_REALISM_BLOCK);
  const withoutEnding = value
    .replace(new RegExp(`${ending.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"), "")
    .replace(FILM_LOOK_LINE, "")
    .replace(SKIN_REALISM_BLOCK, "")
    .trim();
  const marker = "STYLE CONTRACT — VERBATIM:";
  const markerIndex = withoutEnding.indexOf(marker);
  const protectedStyle = markerIndex >= 0 ? withoutEnding.slice(markerIndex).trim() : "";
  const authored = markerIndex >= 0 ? withoutEnding.slice(0, markerIndex).trim() : withoutEnding;
  const protectedSuffix = [
    protectedStyle,
    hasFilm ? FILM_LOOK_LINE : "",
    hasSkin ? SKIN_REALISM_BLOCK : "",
    ending,
  ].filter(Boolean).join(" ");
  const remaining = maximum - countPromptWords(protectedSuffix);
  if (remaining < 12) throw new Error("The locked style contract leaves too little room for a valid 80-word motion prompt.");
  return `${authored.split(/\s+/).filter(Boolean).slice(0, remaining).join(" ")} ${protectedSuffix}`.trim();
}

export function budgetVideoPrompt(
  prompt: string,
  mode: VideoPromptMode,
  production = process.env.NODE_ENV === "production",
): VideoPromptBudgetResult {
  const originalWords = countPromptWords(prompt);
  const maximum = mode === "image_to_video" ? 80 : mode === "native_multishot" ? 1000 : 280;
  if (mode !== "image_to_video" || originalWords <= maximum) {
    return { original: prompt, prompt, originalWords, finalWords: originalWords, trimmed: false, dropped: [] };
  }
  let next = prompt;
  const dropped: VideoPromptBudgetResult["dropped"] = [];
  for (const block of OPTIONAL_BLOCKS) {
    if (countPromptWords(next) <= maximum) break;
    const replaced = next.replace(block.pattern, "");
    if (replaced !== next) dropped.push(block.key);
    next = replaced;
  }
  if (countPromptWords(next) > maximum) {
    if (!production) {
      throw new Error(`Image-to-video prompt is ${originalWords} words; hard cap is 80.`);
    }
    next = trimToWords(next, maximum);
  }
  return {
    original: prompt,
    prompt: next.trim(),
    originalWords,
    finalWords: countPromptWords(next),
    trimmed: next.trim() !== prompt.trim(),
    dropped,
  };
}

const CAMERA = /\b(?:camera locked|locked camera|dolly|push in|pull back|pan|tilt|track|crane|orbit|whip|crash|handheld)\b/i;
const EVENT = /\b(?:walks?|runs?|turns?|looks?|lifts?|drops?|opens?|closes?|sips?|blinks?|limps?|reaches?|grips?|descends?|crosses?|falls?|rises?)\b/i;
const CAMERA_VERB = /\b(?:camera|dolly|pan|tilt|track|crane|orbit|whip|crash)\b/i;
const SUBJECT_VERB = /\b(?:subject|actor|character|he|she|they|figure)\b.{0,60}\b(?:walks?|runs?|turns?|looks?|lifts?|drops?|opens?|blinks?|reaches?|grips?)\b/i;

export function motionGrammarIssues(prompt: string) {
  const issues: Array<{ level: "failure" | "warning"; message: string }> = [];
  if (!CAMERA.test(prompt)) issues.push({ level: "failure", message: "Name one camera move or state camera locked." });
  if (!EVENT.test(prompt)) issues.push({ level: "failure", message: "Name an in-scene event, not camera drift alone." });
  if (!/\bno frozen figures\b/i.test(prompt)) issues.push({ level: "failure", message: 'Include "no frozen figures".' });
  for (const sentence of prompt.split(/(?<=[.!?])\s+/)) {
    if (CAMERA_VERB.test(sentence) && SUBJECT_VERB.test(sentence)) {
      issues.push({ level: "warning", message: "Put subject movement and camera movement in separate sentences." });
      break;
    }
  }
  const positiveBody = prompt.split(/\b(?:NEGATIVE|EXCLUDE):/i)[0];
  if (/\bno (?:blur|shak(?:e|ing)|jitter|flicker|wobble)\b/i.test(positiveBody)) {
    issues.push({ level: "warning", message: "Move negated stability constraints to the negative field; state the positive picture behavior." });
  }
  return issues;
}

export function enforceMotionGrammar(input: { camera: string; event: string; constraints?: string }) {
  return [
    `Camera: ${input.camera.trim()}.`,
    `Subject event: ${input.event.trim()}.`,
    input.constraints?.trim() || "Stable picture, natural motion cadence, no frozen figures.",
  ].join(" ");
}

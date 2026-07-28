import { z } from "zod";
import {
  audioPlanSchema,
  DEFAULT_AUDIO_PLAN,
  lintAudioPlan,
  type AudioPlanIssue,
} from "@/lib/audio-plan";

export const adArcTemplateSchema = z.enum(["problem_solution", "journey_delivery"]);
export const adBoardModeSchema = z.enum(["emotional_counterpoint", "functional_explainer"]);
export const adSlotStatusSchema = z.enum([
  "draft",
  "still_approved",
  "queued",
  "rendering",
  "rendered",
  "failed",
]);
export const renderTierSchema = z.enum(["draft", "final"]);

const assetId = z.string().trim().min(1);
const prompt = z.string().trim().min(1);

export const motionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("forward"),
    first_frame_asset: assetId,
    prompt,
    no_target: z.literal(true),
  }).strict(),
  z.object({
    mode: z.literal("chain"),
    from_slot_id: z.string().trim().min(1),
    prompt,
  }).strict(),
  z.object({
    mode: z.literal("ff_lf"),
    first_frame_asset: assetId,
    last_frame_asset: assetId,
    prompt,
  }).strict(),
]);

export const adSlotAudioSchema = z.object({
  music: z.string().trim().default(""),
  sfx: z.string().trim().default(""),
}).strict();

export const adSlotSchema = z.object({
  id: z.string().trim().min(1),
  slot_no: z.number().int().min(1).max(8),
  segment: z.string().trim().min(1),
  description: z.string().trim().min(1),
  camera: z.string().trim().min(1),
  color_light: z.string().trim().min(1),
  set: z.string().trim().default(""),
  weather: z.string().trim().default(""),
  location: z.string().trim().default(""),
  audio: adSlotAudioSchema,
  audio_plan: audioPlanSchema.default(DEFAULT_AUDIO_PLAN),
  screen_text: z.string().trim().min(1).nullable().optional().default(null),
  vo_line: z.string().trim().min(1).nullable().optional().default(null),
  vo_kind: z.enum(["narration", "dialogue"]).default("narration"),
  duration_ms: z.number().int().positive(),
  image_prompt: z.string().trim().min(1),
  motion: motionSchema,
  motion_reason: z.string().trim().min(1).nullable().optional().default(null),
  identity_block: z.string().trim().min(1),
  wardrobe_state: z.string().trim().min(1),
  age_state: z.string().trim().min(1),
  product_visible: z.boolean().default(false),
  product_override_reason: z.string().trim().min(1).nullable().optional().default(null),
  tier: renderTierSchema.default("draft"),
  status: adSlotStatusSchema.default("draft"),
  rendered_asset_id: z.string().trim().min(1).nullable().optional().default(null),
  rendered_url: z.string().url().nullable().optional().default(null),
  dialogue_asset_id: z.string().trim().min(1).nullable().optional().default(null),
  dialogue_url: z.string().url().nullable().optional().default(null),
  dialogue_duration_ms: z.number().int().positive().nullable().optional().default(null),
}).strict();

export const adBoardSchema = z.object({
  arc_template: adArcTemplateSchema,
  mode: adBoardModeSchema,
  audio_mode: z.enum(["resolved", "legacy_stems"]).default("resolved"),
  timeline_authority: z.enum(["vo", "score"]).default("vo"),
  slots: z.array(adSlotSchema).length(8),
  product_id: z.string().trim().min(1).nullable().optional(),
  canonical_reference_asset: assetId,
  estimated_spend_usd: z.number().nonnegative().default(0),
  actual_spend_usd: z.number().nonnegative().default(0),
}).strict().superRefine((board, context) => {
  const numbers = board.slots.map((slot) => slot.slot_no);
  if (new Set(numbers).size !== 8 || numbers.some((value, index) => value !== index + 1)) {
    context.addIssue({ code: "custom", path: ["slots"], message: "An ad board must contain slots 1 through 8 in order." });
  }
});

export type AdMotion = z.infer<typeof motionSchema>;
export type AdSlot = z.infer<typeof adSlotSchema>;
export type AdBoard = z.infer<typeof adBoardSchema>;
export type AdArcTemplate = z.infer<typeof adArcTemplateSchema>;
export type AdBoardMode = z.infer<typeof adBoardModeSchema>;
export type RenderTier = z.infer<typeof renderTierSchema>;

export type AdBoardIssue = {
  level: "warning" | "failure";
  rule: "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | AudioPlanIssue["rule"];
  slotId: string;
  message: string;
};

type TemplateSlot = Pick<AdSlot, "segment" | "description" | "camera" | "color_light" | "product_visible">;

const PROBLEM_SOLUTION: TemplateSlot[] = [
  { segment: "THE CHAOS", description: "Immediate problem pressure; one readable failure.", camera: "handheld dutch medium-wide, unstable lateral correction", color_light: "harsh high-contrast cool practicals", product_visible: false },
  { segment: "THE CHAOS", description: "The same problem escalates through a different physical consequence.", camera: "handheld close-up with compressed perspective and nervous reframing", color_light: "harsh high-contrast cool practicals", product_visible: false },
  { segment: "THE CHAOS", description: "Peak friction in an extreme close-up; the old method fails.", camera: "handheld ECU, canted horizon, abrupt but grounded push", color_light: "harsh high-contrast with clipped hostile highlights", product_visible: false },
  { segment: "THE TURN", description: "Silence. The product enters as the decisive pivot.", camera: "locked static product reveal with one precise dolly settle", color_light: "flat neutral gray reset, clean separation", product_visible: true },
  { segment: "THE PAYOFF", description: "First parallel payoff: the problem becomes controlled.", camera: "stable dolly medium shot", color_light: "soft warm white beginning to return", product_visible: false },
  { segment: "THE PAYOFF", description: "Second parallel payoff escalates ease and confidence.", camera: "smooth lateral track with level horizon", color_light: "soft warm white with restrained color", product_visible: false },
  { segment: "THE PAYOFF", description: "Final human payoff lands with composed energy.", camera: "controlled orbit or static close-up", color_light: "controlled saturation and warm skin tone", product_visible: false },
  { segment: "THE CLOSE", description: "Glamour material ECUs, hero pack shot, and lockup.", camera: "macro ECU sequence resolved into a locked hero frame", color_light: "controlled saturation, polished specular highlights", product_visible: true },
];

const JOURNEY_DELIVERY: TemplateSlot[] = [
  { segment: "THE SETUP", description: "Establish the need, destination, and starting geography.", camera: "stable environmental wide with restrained push", color_light: "grounded neutral daylight", product_visible: false },
  { segment: "THE TRAVEL", description: "Progress through the first travel obstacle.", camera: "following track with readable screen direction", color_light: "cool directional travel light", product_visible: false },
  { segment: "THE TRAVEL", description: "Travel compresses; momentum and stakes increase.", camera: "leading track with firmer parallax", color_light: "higher contrast travel state", product_visible: false },
  { segment: "THE HUMAN", description: "Human pause and connection at the emotional pivot.", camera: "locked intimate close-up with still eyeline", color_light: "flat neutral gray reset into soft warm white", product_visible: true },
  { segment: "THE ARRIVAL", description: "Arrival changes the space and releases pressure.", camera: "smooth dolly reveal with level horizon", color_light: "soft warm white", product_visible: false },
  { segment: "THE REVEAL", description: "Reveal the first concrete benefit.", camera: "precise medium detail with controlled orbit", color_light: "warm controlled saturation", product_visible: false },
  { segment: "THE REVEAL", description: "Reveal the larger outcome and social proof.", camera: "stable composed wide-to-medium move", color_light: "full controlled saturation", product_visible: false },
  { segment: "THE CLOSE", description: "Product glamour details and final lockup.", camera: "macro ECUs resolved into a static hero pack shot", color_light: "polished controlled saturation", product_visible: true },
];

export const AD_ARC_TEMPLATES: Record<AdArcTemplate, readonly TemplateSlot[]> = {
  problem_solution: PROBLEM_SOLUTION,
  journey_delivery: JOURNEY_DELIVERY,
};

const TARGET_FRAME_LANGUAGE = /\b(?:ends?\s+on|lands?\s+on|final\s+frame|finish(?:es)?\s+on|resolves?\s+(?:to|into)|arrives?\s+at)\b/i;
const WORD = /[\p{L}\p{N}]+/gu;
const VO_STOPWORDS = new Set(["the", "and", "with", "that", "this", "from", "into", "your", "you", "our", "for", "are", "was", "but", "not", "then"]);

function contentWords(value: string) {
  return new Set((value.toLowerCase().match(WORD) ?? []).filter((word) => word.length > 3 && !VO_STOPWORDS.has(word)));
}

export function modeAVoVisualOverlap(voLine: string, description: string) {
  const voice = contentWords(voLine);
  const visual = contentWords(description);
  if (!voice.size || !visual.size) return 0;
  let shared = 0;
  for (const word of voice) if (visual.has(word)) shared += 1;
  return shared / Math.min(voice.size, visual.size);
}

export function forwardPromptHasTargetFrame(promptText: string) {
  return TARGET_FRAME_LANGUAGE.test(promptText);
}

export function stripForwardTargetFrameLanguage(promptText: string) {
  return promptText
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !TARGET_FRAME_LANGUAGE.test(sentence))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function chainDepth(board: AdBoard, slotId: string) {
  const slots = new Map(board.slots.map((slot) => [slot.id, slot]));
  const visited = new Set<string>();
  let current = slots.get(slotId);
  let depth = 0;
  while (current?.motion.mode === "chain") {
    if (visited.has(current.id)) return Number.POSITIVE_INFINITY;
    visited.add(current.id);
    depth += 1;
    current = slots.get(current.motion.from_slot_id);
  }
  return depth;
}

export function lintAdBoard(rawBoard: AdBoard): AdBoardIssue[] {
  const board = adBoardSchema.parse(rawBoard);
  const slots = new Map(board.slots.map((slot) => [slot.id, slot]));
  const issues: AdBoardIssue[] = [];
  for (const slot of board.slots) {
    if (slot.motion.mode === "forward" && forwardPromptHasTargetFrame(slot.motion.prompt)) {
      issues.push({ level: "failure", rule: "A1", slotId: slot.id, message: "Forward motion cannot describe a destination or final frame." });
    }
    if (slot.motion.mode === "chain") {
      const source = slots.get(slot.motion.from_slot_id);
      if (!source || source.status !== "rendered" || !source.rendered_asset_id) {
        issues.push({ level: "failure", rule: "A2", slotId: slot.id, message: "Chain motion requires a rendered source slot with a registered clip." });
      } else if (source.wardrobe_state !== slot.wardrobe_state) {
        issues.push({ level: "failure", rule: "A3", slotId: slot.id, message: "Wardrobe cannot change inside a motion chain." });
      }
      const depth = chainDepth(board, slot.id);
      if (depth > 3) issues.push({ level: "failure", rule: "A3", slotId: slot.id, message: "Chain depth exceeds three links; re-anchor from the canonical reference." });
      else if (depth >= 2) issues.push({ level: "warning", rule: "A3", slotId: slot.id, message: `Chain depth is ${depth}; the next link must re-anchor to control identity drift.` });
    }
    if (slot.motion.mode === "ff_lf") {
      if (!slot.motion_reason) issues.push({ level: "failure", rule: "A4", slotId: slot.id, message: "First/last-frame motion requires an operator reason." });
      issues.push({ level: "warning", rule: "A4", slotId: slot.id, message: "Target-frame mode compresses timing; motion may rush." });
    }
    if (board.mode === "emotional_counterpoint" && slot.vo_line && modeAVoVisualOverlap(slot.vo_line, slot.description) >= 0.35) {
      issues.push({ level: "warning", rule: "A5", slotId: slot.id, message: "Mode A voice-over appears to describe the picture instead of counterpointing it." });
    }
    if (slot.product_visible && ![4, 8].includes(slot.slot_no) && !slot.product_override_reason) {
      issues.push({ level: "failure", rule: "A6", slotId: slot.id, message: "Product may appear only in slots 4 and 8 unless an override reason is recorded." });
    }
    if (slot.slot_no <= 3 && slot.screen_text) {
      issues.push({ level: "failure", rule: "A6", slotId: slot.id, message: "Screen text must remain null during the chaos opening." });
    }
    for (const issue of lintAudioPlan({
      slot,
      plan: slot.audio_plan,
      audioReferenceAttached: slot.audio_plan.dialogue.owner === "native" && Boolean(slot.dialogue_url),
    })) {
      issues.push({ ...issue, slotId: slot.id });
    }
  }
  return issues;
}

export function assertAdSlotQueueable(board: AdBoard, slotId: string) {
  const slotIssues = lintAdBoard(board).filter((issue) => issue.slotId === slotId && issue.level === "failure");
  if (slotIssues.length) throw new Error(slotIssues.map((issue) => issue.message).join(" "));
}

export function reanchorOverdeepChains(board: AdBoard) {
  return adBoardSchema.parse({
    ...board,
    slots: board.slots.map((slot) => {
      if (slot.motion.mode !== "chain" || chainDepth(board, slot.id) <= 3) return slot;
      return {
        ...slot,
        motion: {
          mode: "forward" as const,
          first_frame_asset: board.canonical_reference_asset,
          prompt: stripForwardTargetFrameLanguage(slot.motion.prompt),
          no_target: true as const,
        },
        motion_reason: null,
      };
    }),
  });
}

export function voiceTimedDurationMs(measuredAudioMs: number | null, kind: AdSlot["vo_kind"]) {
  if (measuredAudioMs == null) return 4000;
  const gap = kind === "dialogue" ? 500 : 350;
  return Math.max(1, Math.ceil(measuredAudioMs + gap));
}

export function applyVoiceTimings(board: AdBoard, measuredAudioMs: Record<string, number | null>) {
  return adBoardSchema.parse({
    ...board,
    slots: board.slots.map((slot) => ({
      ...slot,
      duration_ms: slot.vo_line
        ? voiceTimedDurationMs(measuredAudioMs[slot.id] ?? null, slot.vo_kind)
        : 4000,
    })),
  });
}

export function applyScoreTimings(
  board: AdBoard,
  scoreDurationMs: number,
  movements: Array<{ name: "build" | "peak" | "quiet" | "resolve"; weight: number }>,
) {
  if (board.slots.some((slot) => Boolean(slot.vo_line?.trim()))) {
    throw new Error("A board with narration or dialogue must use VO timeline authority.");
  }
  const totalWeight = movements.reduce((sum, movement) => sum + Math.max(0, movement.weight), 0);
  if (!totalWeight) throw new Error("Score movements need positive timing weight.");
  const slots = board.slots.map((slot, index) => {
    const movement = movements[Math.min(index, movements.length - 1)];
    return { ...slot, duration_ms: Math.max(500, Math.round(scoreDurationMs * (movement.weight / totalWeight))) };
  });
  const difference = scoreDurationMs - slots.reduce((sum, slot) => sum + slot.duration_ms, 0);
  slots[slots.length - 1].duration_ms += difference;
  return adBoardSchema.parse({ ...board, timeline_authority: "score", slots });
}

export type AdRenderSlot = AdSlot & {
  source_slot_id: string;
  part: string | null;
};

export function expandLongAdSlots(board: AdBoard): AdRenderSlot[] {
  return board.slots.flatMap<AdRenderSlot>((slot) => {
    if (slot.duration_ms <= 5000) return [{ ...slot, source_slot_id: slot.id, part: null }];
    const count = Math.ceil(slot.duration_ms / 5000);
    const base = Math.floor(slot.duration_ms / count);
    let assigned = 0;
    return Array.from({ length: count }, (_, index) => {
      const duration = index === count - 1 ? slot.duration_ms - assigned : base;
      assigned += duration;
      return {
        ...slot,
        id: `${slot.id}${String.fromCharCode(97 + index)}`,
        duration_ms: duration,
        source_slot_id: slot.id,
        part: String.fromCharCode(97 + index),
      };
    });
  });
}

export function renderResolution(tier: RenderTier) {
  return tier === "final" ? "1080p" : "720p";
}

export function masterResolution() {
  return "4K" as const;
}

export function promoteSlotToFinal(board: AdBoard, slotId: string) {
  return adBoardSchema.parse({
    ...board,
    slots: board.slots.map((slot) => slot.id === slotId ? { ...slot, tier: "final" as const } : slot),
  });
}

export function boardSpend(jobs: Array<{ estimatedUsd?: number | null; actualUsd?: number | null }>) {
  return jobs.reduce<{ estimatedUsd: number; actualUsd: number }>(
    (total, job) => ({
      estimatedUsd: total.estimatedUsd + Math.max(0, job.estimatedUsd ?? 0),
      actualUsd: total.actualUsd + Math.max(0, job.actualUsd ?? 0),
    }),
    { estimatedUsd: 0, actualUsd: 0 },
  );
}

export function createAdBoard(input: {
  arcTemplate: AdArcTemplate;
  mode: AdBoardMode;
  canonicalReferenceAsset: string;
  identityBlock: string;
  wardrobeState: string;
  ageState: string;
  productId?: string | null;
  audioMode?: AdBoard["audio_mode"];
}): AdBoard {
  const defaults = AD_ARC_TEMPLATES[input.arcTemplate];
  return adBoardSchema.parse({
    arc_template: input.arcTemplate,
    mode: input.mode,
    audio_mode: input.audioMode ?? "resolved",
    product_id: input.productId ?? null,
    canonical_reference_asset: input.canonicalReferenceAsset,
    estimated_spend_usd: 0,
    actual_spend_usd: 0,
    slots: defaults.map((slot, index) => ({
      id: `slot-${index + 1}`,
      slot_no: index + 1,
      ...slot,
      set: "the established practical set visible in the slot",
      weather: "none",
      location: "the established story location",
      audio: { music: "", sfx: "" },
      audio_plan: DEFAULT_AUDIO_PLAN,
      screen_text: index < 3 ? null : null,
      vo_line: null,
      vo_kind: "narration",
      duration_ms: 4000,
      image_prompt: `${input.identityBlock}\nWARDROBE STATE: ${input.wardrobeState}\nAGE STATE: ${input.ageState}\n${slot.description}\nCAMERA: ${slot.camera}\nCOLOR AND LIGHT: ${slot.color_light}`,
      motion: {
        mode: "forward",
        first_frame_asset: input.canonicalReferenceAsset,
        prompt: "Continue the established action naturally with one physically plausible camera move.",
        no_target: true,
      },
      motion_reason: null,
      identity_block: input.identityBlock,
      wardrobe_state: input.wardrobeState,
      age_state: input.ageState,
      product_visible: slot.product_visible,
      product_override_reason: null,
      tier: "draft",
      status: "draft",
      rendered_asset_id: null,
      rendered_url: null,
      dialogue_asset_id: null,
      dialogue_url: null,
      dialogue_duration_ms: null,
    })),
  });
}

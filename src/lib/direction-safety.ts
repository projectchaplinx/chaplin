import { z } from "zod";
import type { AdMotion } from "@/lib/ad-board";
import type { AudioPlan } from "@/lib/audio-plan";
import {
  getCameraMovement,
  isCameraMovementId,
  type CameraMovementId,
} from "@/lib/camera-movements";
import { readCharacterCardV2, selectedWardrobeState } from "@/lib/character-card";
import type { CharacterProductionBible } from "@/lib/types";

export const DIRECTION_ARC_TEMPLATE = "hook_escalate_reverse_cliffhanger" as const;
export const energyStateSchema = z.enum(["static", "sustained", "action"]);
export const directionMotionModeSchema = z.enum(["forward", "chain"]);
export const framingConstraintSchema = z.enum(["readable", "non_readable"]);

export type EnergyState = z.infer<typeof energyStateSchema>;
export type DirectionMotionMode = Extract<AdMotion["mode"], "forward" | "chain">;
export type FramingConstraint = z.infer<typeof framingConstraintSchema>;
export type DialogueFramingConstraint = NonNullable<AudioPlan["dialogue"]["framing_constraint"]>;

export const scenePropSchema = z.object({
  name: z.string().trim().min(1),
  reason: z.string().trim().min(3),
  approved: z.boolean().default(false),
}).strict();

export const directionLineSchema = z.object({
  characterId: z.string().trim().min(1),
  text: z.string().trim().min(1),
}).strict();

export const directionSlotSchema = z.object({
  slotId: z.string().trim().min(1),
  sourceSlotId: z.string().trim().min(1),
  setting: z.string().trim().min(1),
  objective: z.string().trim().min(1),
  action: z.string().trim().min(1),
  energyState: energyStateSchema,
  lockedCharacterIds: z.array(z.string().trim().min(1)).max(3),
  dressing: z.string().trim().min(1),
  behaviorTell: z.object({
    characterId: z.string().trim().min(1),
    tell: z.string().trim().min(2),
  }).strict().nullable(),
  cameraMovementId: z.string().trim().min(1),
  durationMs: z.number().int().positive(),
  motionMode: directionMotionModeSchema,
  motionFromSlotId: z.string().trim().min(1).nullable(),
  framingConstraint: framingConstraintSchema,
  sensitiveNegatives: z.array(z.string().trim().min(1)),
  referencedProps: z.array(z.string().trim().min(1)),
  lines: z.array(directionLineSchema).max(1),
  dialogueFramingConstraint: z.literal("off_face").nullable(),
}).strict();

export const directionBoardSchema = z.object({
  arcTemplate: z.literal(DIRECTION_ARC_TEMPLATE),
  targetDurationMs: z.number().int().positive(),
  sceneProps: z.array(scenePropSchema),
  slots: z.array(directionSlotSchema).min(1),
}).strict().superRefine((board, context) => {
  const total = board.slots.reduce((sum, slot) => sum + slot.durationMs, 0);
  if (total !== board.targetDurationMs) {
    context.addIssue({
      code: "custom",
      path: ["slots"],
      message: `Direction slots total ${total}ms; target is ${board.targetDurationMs}ms.`,
    });
  }
});

export type SceneProp = z.infer<typeof scenePropSchema>;
export type DirectionSlot = z.infer<typeof directionSlotSchema>;
export type DirectionBoard = z.infer<typeof directionBoardSchema>;

export type DirectionCharacter = {
  id: string;
  name: string;
  productionBible: CharacterProductionBible;
  cardV2?: unknown;
};

export type UnsafeDirectionSlot = {
  slotId?: string;
  setting: string;
  objective: string;
  action: string;
  energyState?: EnergyState;
  lockedCharacterIds?: string[];
  cameraMovementId?: string;
  durationMs?: number;
  dialogueDurationMs?: number | null;
  motionMode?: DirectionMotionMode;
  motionFromSlotId?: string | null;
  framingConstraint?: FramingConstraint;
  referencedProps?: string[];
  lines: Array<{ characterId: string; text: string }>;
  dialogueFramingConstraint?: DialogueFramingConstraint | null;
};

export type UnsafeDirectionBoard = {
  scenes: UnsafeDirectionSlot[];
  sceneProps?: SceneProp[];
};

const ACTION = /\b(fight|fighting|attack|attacks|combat|strikes?|shoots?|fires?|chases?|sprints?|runs?|jumps?|leaps?|falls?|drops?|dives?|dodges?|wrestles?|grapples?|explodes?|erupts?|ropes?\s+(?:down|out)|fast[- ]ropes?)\b/i;
const SUSTAINED = /\b(descends?|walks?|advances?|holds?|watches?|waits?|tracks?|searches?|listens?|speaks?|says?|asks?|answers?|confronts?|negotiates?)\b/i;
const MINOR = /\b(child|children|minor|boy|girl|kid|toddler|teenager|schoolchild|infant)\b/i;
const INJURY = /\b(injur(?:y|ed|ies)|wound(?:ed|s)?|bleed(?:ing|s)?|bloodied|shot|stabbed|burned|burnt|unconscious|dead body|corpse)\b/i;
const WEAPON_AT_PERSON = /\b(?:gun|rifle|pistol|weapon|blade|knife|sword|bow)\b.{0,50}\b(?:aims?|points?|at|toward|towards)\b.{0,40}\b(?:person|man|woman|child|boy|girl|soldier|hero|actor)\b/i;
const PROP_TERMS = /\b(curved blade|weapon-arm|assault rifle|rifle|pistol|gun|knife|sword|blade|shield|bow|arrow|grenade|phone|radio|rope|briefcase|bottle|glass|key|book|torch|helmet)\b/gi;
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
};

export const IDENTITY_BUDGET: Record<EnergyState, number> = {
  action: 3,
  sustained: 3,
  static: 3,
};

export const CAMERA_BY_ENERGY: Record<EnergyState, readonly CameraMovementId[]> = {
  action: ["locked-off", "micro-push-in", "micro-lateral"],
  sustained: ["locked-off", "micro-push-in", "slow-dolly-in", "slow-dolly-out"],
  static: [],
};

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function energyFor(slot: UnsafeDirectionSlot): EnergyState {
  if (slot.energyState) return slot.energyState;
  const text = `${slot.objective} ${slot.action}`;
  if (ACTION.test(text)) return "action";
  if (slot.lines.length || SUSTAINED.test(text)) return "sustained";
  return "static";
}

function namedCharacterIds(slot: UnsafeDirectionSlot, characters: DirectionCharacter[]) {
  const explicit = slot.lockedCharacterIds?.filter((id) => characters.some((character) => character.id === id)) ?? [];
  const speakers = slot.lines.map((line) => line.characterId);
  const text = `${slot.objective} ${slot.action}`.toLowerCase();
  const named = characters.filter((character) => text.includes(character.name.toLowerCase())).map((character) => character.id);
  return unique([...explicit, ...speakers, ...named]);
}

function behaviorTell(character: DirectionCharacter | undefined) {
  return character?.productionBible.performance.underPressure
    || character?.productionBible.performance.signatureGesture
    || character?.productionBible.performance.restingExpression
    || "a restrained, repeatable pressure tell";
}

function cardProps(character: DirectionCharacter) {
  const card = readCharacterCardV2(character.cardV2);
  if (!card) return [];
  return Object.keys(card.wardrobe_states).flatMap((state) => selectedWardrobeState(card, state).state.props);
}

function referencedProps(slot: UnsafeDirectionSlot) {
  const detected = `${slot.objective} ${slot.action}`.match(PROP_TERMS) ?? [];
  return unique([...(slot.referencedProps ?? []), ...detected].map((prop) => prop.toLowerCase()));
}

function focusedSplitAction(action: string, identityId: string, characters: DirectionCharacter[]) {
  const focus = characters.find((character) => character.id === identityId);
  if (!focus) return action;
  if (/Every other person remains still, anonymous, and unreadable/i.test(action)) return action;
  const clauses = action
    .split(/\s*;\s*|\s+\b(?:while|as|and then|then)\b\s+/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const focused = clauses.find((clause) => clause.toLowerCase().includes(focus.name.toLowerCase()));
  const namesAnotherHero = characters.some((character) => (
    character.id !== identityId && action.toLowerCase().includes(character.name.toLowerCase())
  ));
  return focused
    ? `${focused.replace(/[.,;]\s*$/, "")}. Every other person remains still, anonymous, and unreadable.`
    : !namesAnotherHero
      ? `${focus.name}: ${action.replace(/[.,;]\s*$/, "")}. Every other person remains still, anonymous, and unreadable.`
    : `${focus.name} performs their side of the authored action beat. Every other person remains still, anonymous, and unreadable.`;
}

export function explicitShotCountFromBrief(brief: string) {
  const match = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\s*(?:shots?|scenes?|slots?|frames?)\b/i.exec(brief);
  if (!match) return null;
  const count = /^\d+$/.test(match[1]) ? Number(match[1]) : NUMBER_WORDS[match[1].toLowerCase()];
  return Number.isInteger(count) && count > 0 && count <= 24 ? count : null;
}

export function cameraAllowedForEnergy(energy: EnergyState, movementId: string | undefined) {
  if (!movementId || !isCameraMovementId(movementId)) return false;
  if (energy === "static") return true;
  return CAMERA_BY_ENERGY[energy].includes(movementId);
}

export function safeCameraForEnergy(energy: EnergyState, movementId: string | undefined): CameraMovementId {
  if (cameraAllowedForEnergy(energy, movementId)) return movementId as CameraMovementId;
  if (energy === "action") return "locked-off";
  if (energy === "sustained") return "slow-dolly-in";
  return isCameraMovementId(movementId) ? movementId : "slow-dolly-out";
}

function dialogueEstimateMs(lines: UnsafeDirectionSlot["lines"], measured?: number | null) {
  if (!lines.length) return null;
  if (measured && measured > 0) return Math.ceil(measured + 500);
  const words = lines[0].text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1500, Math.ceil(words * 375 + 500));
}

export function solveDirectionDurations(
  slots: Array<Pick<DirectionSlot, "slotId" | "energyState" | "lines"> & { dialogueDurationMs?: number | null }>,
  targetDurationMs: number,
) {
  const durations = slots.map((slot) => {
    const voice = dialogueEstimateMs(slot.lines, slot.dialogueDurationMs);
    return voice ?? (slot.energyState === "action" ? 3000 : 3000);
  });
  const actionMinimum = slots.filter((slot) => slot.energyState === "action").length * 3000;
  if (actionMinimum > targetDurationMs) {
    throw new Error(`Action-slot minimum is ${actionMinimum}ms, beyond the ${targetDurationMs}ms board target.`);
  }
  let total = durations.reduce((sum, value) => sum + value, 0);
  if (total > targetDurationMs) {
    for (let index = durations.length - 1; index >= 0 && total > targetDurationMs; index -= 1) {
      const minimum = slots[index].energyState === "action" ? 3000 : 1000;
      const reduction = Math.min(durations[index] - minimum, total - targetDurationMs);
      durations[index] -= reduction;
      total -= reduction;
    }
  }
  if (total > targetDurationMs) {
    throw new Error(`Dialogue and action require ${total}ms, beyond the ${targetDurationMs}ms board target.`);
  }
  for (let index = 0; total < targetDurationMs; index = (index + 1) % durations.length) {
    const preferredMaximum = slots[index].energyState === "action" ? 4000 : 4000;
    if (durations[index] >= preferredMaximum && durations.every((duration) => duration >= preferredMaximum)) {
      durations[durations.length - 1] += targetDurationMs - total;
      total = targetDurationMs;
      break;
    }
    const addition = Math.min(preferredMaximum - durations[index], targetDurationMs - total);
    durations[index] += Math.max(0, addition);
    total += Math.max(0, addition);
  }
  return Object.fromEntries(slots.map((slot, index) => [slot.slotId, durations[index]]));
}

function sensitiveFraming(slot: UnsafeDirectionSlot) {
  const text = `${slot.objective} ${slot.action}`;
  const sensitive = MINOR.test(text) || INJURY.test(text) || WEAPON_AT_PERSON.test(text);
  return sensitive
    ? {
        framingConstraint: "non_readable" as const,
        negatives: [
          "no readable minor face in a violent frame",
          "no graphic injury detail",
          "no weapon impact on a readable person",
          "use silhouette, partial framing, off-frame action, or reaction-only coverage",
        ],
      }
    : {
        framingConstraint: slot.framingConstraint ?? "readable" as const,
        negatives: [] as string[],
      };
}

function motionForSlot(slot: UnsafeDirectionSlot, previousSlotId: string | null, previousChainDepth: number) {
  const continuous = /\bCONTINUOUS\b/i.test(slot.setting)
    || /\b(continues?|carries?|still descending|same motion|without stopping)\b/i.test(slot.action);
  const requested = slot.motionMode;
  const wantsChain = Boolean(previousSlotId) && (requested === "chain" || continuous);
  const mode: DirectionMotionMode = wantsChain && previousChainDepth < 3 ? "chain" : "forward";
  return { mode, from: mode === "chain" ? previousSlotId : null, depth: mode === "chain" ? previousChainDepth + 1 : 0 };
}

/**
 * Applies production constraints after the writing model has authored the
 * dramatic beats. Objectives and arc order survive; unsafe execution details
 * are split, framed, timed, or demoted to unreadable dressing.
 */
export function applyDirectionSafety(input: {
  board: UnsafeDirectionBoard;
  characters: DirectionCharacter[];
  targetDurationMs: number;
}): DirectionBoard {
  const declaredProps = [...(input.board.sceneProps ?? [])];
  const cardPropSet = new Set(input.characters.flatMap(cardProps).map((prop) => prop.toLowerCase()));
  const requestedSlots = input.board.scenes.map((scene, index) => {
    const sourceSlotId = scene.slotId || String(index + 1);
    const energyState = energyFor(scene);
    const identities = namedCharacterIds(scene, input.characters);
    return { scene, sourceSlotId, slotId: sourceSlotId, energyState, identities };
  });

  const tellCoverage = new Set<string>();
  let previousChainDepth = 0;
  const slots: Array<DirectionSlot & { dialogueDurationMs?: number | null }> = requestedSlots.map((entry, index) => {
    const budget = IDENTITY_BUDGET[entry.energyState];
    let lockedCharacterIds = entry.identities.slice(0, budget);
    if (!lockedCharacterIds.length && input.characters.length) {
      lockedCharacterIds = [input.characters[index % input.characters.length].id];
    }
    const focusId = lockedCharacterIds.find((id) => !tellCoverage.has(id)) ?? lockedCharacterIds[0];
    const focus = input.characters.find((character) => character.id === focusId);
    if (focus) tellCoverage.add(focus.id);
    const props = referencedProps(entry.scene);
    for (const prop of props) {
      if (cardPropSet.has(prop) || declaredProps.some((candidate) => candidate.name.toLowerCase() === prop)) continue;
      declaredProps.push({
        name: prop,
        reason: `Required by direction slot ${entry.slotId}; approve before rendering.`,
        approved: false,
      });
    }
    const sensitive = sensitiveFraming(entry.scene);
    const previous = index > 0 ? requestedSlots[index - 1].slotId : null;
    const motion = motionForSlot(entry.scene, previous, previousChainDepth);
    previousChainDepth = motion.depth;
    return {
      slotId: entry.slotId,
      sourceSlotId: entry.sourceSlotId,
      setting: entry.scene.setting,
      objective: entry.scene.objective,
      action: entry.scene.action,
      energyState: entry.energyState,
      lockedCharacterIds,
      dressing: "Every other human is anonymous dressing only: no identity assertion or recognition locks; faces remain unreadable through backlight, smoke, distance, motion blur, or turned-away staging.",
      behaviorTell: focus ? { characterId: focus.id, tell: behaviorTell(focus) } : null,
      cameraMovementId: safeCameraForEnergy(entry.energyState, entry.scene.cameraMovementId),
      durationMs: 1,
      motionMode: motion.mode,
      motionFromSlotId: motion.from,
      framingConstraint: sensitive.framingConstraint,
      sensitiveNegatives: sensitive.negatives,
      referencedProps: props,
      lines: entry.energyState === "action" ? [] : entry.scene.lines.slice(0, 1),
      dialogueFramingConstraint: null,
      dialogueDurationMs: entry.scene.dialogueDurationMs,
    };
  });

  // Dialogue is never thrown into combat. Move it to a neighboring readable
  // beat when that beat is silent; otherwise cut it rather than creating two
  // simultaneous speakers.
  requestedSlots.forEach((entry, index) => {
    if (entry.energyState !== "action" || !entry.scene.lines.length) return;
    const line = entry.scene.lines[0];
    const target = slots.slice(index + 1).find((slot) => slot.energyState !== "action" && slot.lines.length === 0)
      ?? slots.slice(0, index).reverse().find((slot) => slot.energyState !== "action" && slot.lines.length === 0);
    if (target) {
      target.lines = [line];
    }
  });
  for (const slot of slots) {
    slot.dialogueFramingConstraint = slot.lines.length ? "off_face" : null;
  }

  // Every hero board carries at least one card behavior tell. If splitting and
  // dialogue reassignment left a selected hero uncovered, attach its tell to
  // the first readable slot without changing the dramatic objective.
  tellCoverage.clear();
  for (const slot of slots) {
    if (slot.behaviorTell && slot.lockedCharacterIds.includes(slot.behaviorTell.characterId)) {
      tellCoverage.add(slot.behaviorTell.characterId);
    }
  }
  for (const character of input.characters) {
    if (tellCoverage.has(character.id)) continue;
    const target = slots.find((slot) => (
      slot.lockedCharacterIds.includes(character.id)
      && (!slot.behaviorTell || tellCoverage.has(slot.behaviorTell.characterId))
    ))
      ?? slots.find((slot) => (
        slot.energyState === "static"
        && slot.lockedCharacterIds.length < IDENTITY_BUDGET.static
        && (!slot.behaviorTell || tellCoverage.has(slot.behaviorTell.characterId))
      ));
    if (target) {
      if (!target.lockedCharacterIds.includes(character.id)) target.lockedCharacterIds.push(character.id);
      target.behaviorTell = { characterId: character.id, tell: behaviorTell(character) };
      tellCoverage.add(character.id);
    }
  }

  const solved = solveDirectionDurations(slots, input.targetDurationMs);
  const parsed = directionBoardSchema.parse({
    arcTemplate: DIRECTION_ARC_TEMPLATE,
    targetDurationMs: input.targetDurationMs,
    sceneProps: declaredProps,
    slots: slots.map((slot) => {
      const parsedSlot = { ...slot };
      delete parsedSlot.dialogueDurationMs;
      return {
        ...parsedSlot,
        durationMs: solved[slot.slotId],
      };
    }),
  });
  return parsed;
}

export type DirectionIssue = {
  rule: "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7" | "D8";
  slotId: string;
  message: string;
};

export function lintDirectionBoard(rawBoard: DirectionBoard, characters: DirectionCharacter[]) {
  const board = directionBoardSchema.parse(rawBoard);
  const issues: DirectionIssue[] = [];
  const cardPropSet = new Set(characters.flatMap(cardProps).map((prop) => prop.toLowerCase()));
  const boardPropSet = new Set(board.sceneProps.map((prop) => prop.name.toLowerCase()));
  const tellCoverage = new Set<string>();
  const slotMap = new Map(board.slots.map((slot) => [slot.slotId, slot]));
  for (const slot of board.slots) {
    if (slot.lockedCharacterIds.length > IDENTITY_BUDGET[slot.energyState]) {
      issues.push({ rule: "D1", slotId: slot.slotId, message: `${slot.energyState} permits ${IDENTITY_BUDGET[slot.energyState]} locked identity.` });
    }
    if (!cameraAllowedForEnergy(slot.energyState, slot.cameraMovementId)) {
      issues.push({ rule: "D2", slotId: slot.slotId, message: `${slot.cameraMovementId} is unsafe for ${slot.energyState} energy.` });
    }
    if (slot.energyState === "action" && slot.lines.length) {
      issues.push({ rule: "D4", slotId: slot.slotId, message: "Action slots cannot carry dialogue." });
    }
    if (slot.lines.length > 1) {
      issues.push({ rule: "D4", slotId: slot.slotId, message: "Only one character may speak in a slot." });
    }
    if (slot.lines.length && slot.dialogueFramingConstraint !== "off_face") {
      issues.push({ rule: "D4", slotId: slot.slotId, message: "Dialogue without a locked native visual reference must be framed off-face." });
    }
    for (const prop of slot.referencedProps) {
      if (!cardPropSet.has(prop.toLowerCase()) && !boardPropSet.has(prop.toLowerCase())) {
        issues.push({ rule: "D5", slotId: slot.slotId, message: `Prop "${prop}" is outside card props and scene_props.` });
      }
    }
    const sensitive = MINOR.test(`${slot.objective} ${slot.action}`)
      || INJURY.test(`${slot.objective} ${slot.action}`)
      || WEAPON_AT_PERSON.test(`${slot.objective} ${slot.action}`);
    if (sensitive && slot.framingConstraint !== "non_readable") {
      issues.push({ rule: "D6", slotId: slot.slotId, message: "Sensitive action must use non_readable framing." });
    }
    if (!slot.motionMode) {
      issues.push({ rule: "D7", slotId: slot.slotId, message: "Every slot needs an explicit motion mode." });
    }
    if (slot.motionMode === "chain" && !slot.motionFromSlotId) {
      issues.push({ rule: "D7", slotId: slot.slotId, message: "Chain motion needs a source slot." });
    }
    if (slot.motionMode === "chain") {
      let depth = 0;
      let current: DirectionSlot | undefined = slot;
      const visited = new Set<string>();
      while (current?.motionMode === "chain" && current.motionFromSlotId) {
        if (visited.has(current.slotId)) {
          depth = Number.POSITIVE_INFINITY;
          break;
        }
        visited.add(current.slotId);
        depth += 1;
        current = slotMap.get(current.motionFromSlotId);
      }
      if (depth > 3) {
        issues.push({ rule: "D7", slotId: slot.slotId, message: "Chain depth exceeds three links; re-anchor from a forward frame." });
      }
    }
    if (slot.behaviorTell) tellCoverage.add(slot.behaviorTell.characterId);
    if (slot.behaviorTell && !slot.lockedCharacterIds.includes(slot.behaviorTell.characterId)) {
      issues.push({ rule: "D8", slotId: slot.slotId, message: "A behavior tell must belong to an identity locked in the same slot." });
    }
    const camera = getCameraMovement(slot.cameraMovementId);
    if (slot.energyState === "action" && camera && ["orbit", "vertical", "expressive"].includes(camera.category)) {
      issues.push({ rule: "D2", slotId: slot.slotId, message: "Orbit, crane/vertical, and expressive camera moves are hard-blocked during action." });
    }
  }
  const total = board.slots.reduce((sum, slot) => sum + slot.durationMs, 0);
  if (total !== board.targetDurationMs) {
    issues.push({ rule: "D3", slotId: "board", message: `Slots total ${total}ms instead of ${board.targetDurationMs}ms.` });
  }
  for (const character of characters) {
    if (!tellCoverage.has(character.id)) {
      issues.push({ rule: "D8", slotId: "board", message: `${character.name} has no card behavior tell on this board.` });
    }
  }
  return issues;
}

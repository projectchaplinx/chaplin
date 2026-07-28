import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDirectionSafety,
  cameraAllowedForEnergy,
  lintDirectionBoard,
} from "@/lib/direction-safety";
import { WAR_DROP_CHARACTERS, warDropBoard } from "@/lib/direction-safety-fixtures";
import { buildShotVideoPrompt, validateShotSequence } from "@/lib/shot-director";
import type { CameraMovementId } from "@/lib/camera-movements";

test("war-drop safety fixture preserves four beats while splitting unsafe action into five timed slots", () => {
  const board = warDropBoard();
  assert.equal(board.arcTemplate, "hook_escalate_reverse_cliffhanger");
  assert.equal(board.slots.length, 5);
  assert.deepEqual(board.slots.filter((slot) => slot.sourceSlotId === "3").map((slot) => slot.slotId), ["3a", "3b"]);
  assert.equal(board.slots.reduce((sum, slot) => sum + slot.durationMs, 0), 15_000);
  assert.deepEqual(lintDirectionBoard(board, WAR_DROP_CHARACTERS), []);
  assert.deepEqual(validateShotSequence(
    board.slots.map((slot) => ({ ...slot, cameraMovementId: slot.cameraMovementId as CameraMovementId })),
    5,
  ), { valid: true });

  const actionSlots = board.slots.filter((slot) => slot.energyState === "action");
  assert.ok(actionSlots.every((slot) => slot.lockedCharacterIds.length <= 1));
  assert.ok(actionSlots.every((slot) => slot.lines.length === 0));
  assert.ok(actionSlots.every((slot) => cameraAllowedForEnergy("action", slot.cameraMovementId)));
  assert.ok(actionSlots.every((slot) => slot.durationMs >= 3000 && slot.durationMs <= 4000));

  const continuousDescent = board.slots.find((slot) => slot.sourceSlotId === "2");
  assert.equal(continuousDescent?.motionMode, "chain");
  assert.equal(continuousDescent?.motionFromSlotId, "1");

  const sensitiveCliffhanger = board.slots.find((slot) => slot.sourceSlotId === "4");
  assert.equal(sensitiveCliffhanger?.framingConstraint, "non_readable");
  assert.ok(sensitiveCliffhanger?.sensitiveNegatives.length);

  const dialogueSlots = board.slots.filter((slot) => slot.lines.length);
  assert.ok(dialogueSlots.every((slot) => slot.energyState !== "action"));
  assert.ok(dialogueSlots.every((slot) => slot.lines.length === 1));
  assert.ok(dialogueSlots.every((slot) => slot.dialogueFramingConstraint === "off_face"));

  const closedProps = new Set(board.sceneProps.map((prop) => prop.name.toLowerCase()));
  assert.ok(board.slots.every((slot) => slot.referencedProps.every((prop) => closedProps.has(prop.toLowerCase()))));
  assert.ok(WAR_DROP_CHARACTERS.every((character) => board.slots.some((slot) => slot.behaviorTell?.characterId === character.id)));
});

test("controlled motion prompt names one moving subject and keeps camera motion in the camera field", () => {
  const slot = warDropBoard().slots.find((candidate) => candidate.slotId === "3a");
  assert.ok(slot);
  const prompt = buildShotVideoPrompt({
    productionTitle: "War Drop",
    productionLogline: "A hot landing reverses who holds the battlefield.",
    scene: { ...slot, cameraMovementId: slot.cameraMovementId as CameraMovementId },
    sceneIndex: 2,
    sceneCount: 5,
    format: "punch",
    actorName: "Rhea",
    actorIdentity: "The locked Rhea identity.",
  });
  assert.match(prompt, /Exactly one named moving subject: Rhea/);
  assert.match(prompt, /Every other person and all dressing remain explicitly still/);
  assert.match(prompt, /Camera drift: none; the camera is completely locked/);
  assert.match(prompt, /MOTION MODE: chain from rendered slot 2/);
  assert.match(prompt, /--duration 3\.000 --camerafixed true/);
  assert.doesNotMatch(prompt, /Kade leaps/i);
});

test("continuous motion re-anchors after the existing three-link chain cap", () => {
  const board = applyDirectionSafety({
    characters: [WAR_DROP_CHARACTERS[0]],
    targetDurationMs: 15_000,
    board: {
      scenes: Array.from({ length: 5 }, (_, index) => ({
        slotId: String(index + 1),
        setting: index === 0 ? "EXT. DROP ZONE - DAY" : "EXT. DROP ZONE - CONTINUOUS",
        objective: `Advance the carried descent beat ${index + 1}.`,
        action: `Rhea continues descending through layer ${index + 1}.`,
        energyState: "action" as const,
        lockedCharacterIds: ["hero-a"],
        cameraMovementId: "locked-off",
        lines: [],
      })),
    },
  });
  assert.deepEqual(board.slots.map((slot) => slot.motionMode), ["forward", "chain", "chain", "chain", "forward"]);
  assert.deepEqual(lintDirectionBoard(board, [WAR_DROP_CHARACTERS[0]]), []);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  CHARACTER_CREATION_CREDITS,
  PUNCH_15S_CREDITS,
  WELCOME_CREDITS,
  generationCreditAllocation,
  productionCreditCode,
  productionCreditCost,
} from "@/lib/credits";

test("the welcome grant covers one actor and one 15-second Punch", () => {
  assert.equal(CHARACTER_CREATION_CREDITS + PUNCH_15S_CREDITS, WELCOME_CREDITS);
});

test("production credits scale with an allowed runtime and reject mismatches", () => {
  assert.equal(productionCreditCost("spark", 5), 25);
  assert.equal(productionCreditCost("punch", 15), 75);
  assert.equal(productionCreditCost("episode", 60), 300);
  assert.equal(productionCreditCost("spot", 30), 150);
  assert.throws(() => productionCreditCost("punch", 5), /do not match/i);
  assert.equal(productionCreditCode("punch", 15), "production.punch.15");
  assert.deepEqual(generationCreditAllocation("voice-design"), { code: "voice.audition", credits: 3 });
  assert.deepEqual(generationCreditAllocation("video", { durationSeconds: 4 }), { code: "video.generate", credits: 20 });
});

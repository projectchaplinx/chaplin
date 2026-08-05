import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProductionCastIds, productionCastLimit } from "@/lib/production-formats";

test("a single-take Punch keeps one lead instead of creating an impossible multi-identity board", () => {
  assert.equal(productionCastLimit("punch", "single-take"), 1);
  assert.deepEqual(
    normalizeProductionCastIds(["lead", "foil", "lead", "third"], "punch", "single-take"),
    ["lead"],
  );
});

test("scene-clip productions preserve the selected ensemble", () => {
  assert.equal(productionCastLimit("punch", "scene-clips"), 6);
  assert.deepEqual(
    normalizeProductionCastIds(["lead", "foil", "third"], "punch", "scene-clips"),
    ["lead", "foil", "third"],
  );
});

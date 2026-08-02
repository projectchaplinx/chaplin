import assert from "node:assert/strict";
import test from "node:test";
import { canonicalAutoEvaluation, scoreFromPercent } from "@/lib/auto-evaluation";
import { normalizeDirectorScores } from "@/lib/director-evaluation";

test("percent measurements map onto the canonical 1-5 integer scale", () => {
  assert.equal(scoreFromPercent(0), 1);
  assert.equal(scoreFromPercent(10), 1);
  assert.equal(scoreFromPercent(45), 2);
  assert.equal(scoreFromPercent(50), 3);
  assert.equal(scoreFromPercent(72), 4);
  assert.equal(scoreFromPercent(96), 5);
  assert.equal(scoreFromPercent(100), 5);
  assert.equal(scoreFromPercent(Number.NaN), 1);
});

test("canonical auto evaluation round-trips through the read-path normalizer", () => {
  const { scores } = canonicalAutoEvaluation("video", {
    identity_wardrobe: 97,
    performance_believability: 72,
    cinematic_language: 86,
  });
  // The bug: 0-100 floats were persisted raw, and normalizeDirectorScores
  // silently discarded every entry — evaluations read back empty.
  assert.deepEqual(normalizeDirectorScores(scores), scores);
  assert.equal(scores.identity_wardrobe, 5);
  assert.equal(scores.performance_believability, 4);
});

test("identity below the gate threshold fails the hard gate", () => {
  const { summary } = canonicalAutoEvaluation("video", { identity_wardrobe: 40 });
  assert.equal(summary.gateStatus === "pass", false);
  assert.ok(summary.gateFailures.includes("identity_wardrobe"));
});

test("partial measurements never claim a completed scorecard", () => {
  const { summary } = canonicalAutoEvaluation("video", { identity_wardrobe: 90 });
  assert.ok(summary.scoredDimensions < summary.applicableDimensions);
});

test("unknown dimension names are rejected, not stored", () => {
  const { scores } = canonicalAutoEvaluation("video", {
    // @ts-expect-error — the old writer's invented names must not survive
    identity: 97,
    readability: 86,
  });
  assert.deepEqual(scores, {});
});

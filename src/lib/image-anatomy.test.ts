import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnatomyRetryDirection,
  buildSceneHandAnatomyDirection,
  parseSceneImageAnatomyReview,
} from "@/lib/image-anatomy";

test("scene anatomy direction assigns hands to actors and makes prop contact unambiguous", () => {
  const direction = buildSceneHandAnatomyDirection({
    actorNames: ["Nova Calloway"],
    action: "Nova holds a phone toward camera while her other hand settles on her chest.",
  });
  assert.match(direction, /one left hand and one right hand/i);
  assert.match(direction, /wrist.+forearm/i);
  assert.match(direction, /phone|important prop/i);
  assert.match(direction, /crop or occlude/i);
});

test("failed anatomy review produces a direct regeneration instruction", () => {
  const review = parseSceneImageAnatomyReview({
    pass: false,
    visibleHandCount: 3,
    extraHands: true,
    malformedHands: true,
    disconnectedLimbs: false,
    ambiguousPropContact: true,
    issues: ["A duplicate hand overlaps the actor's chest."],
    correction: "Separate the phone grip from the chest gesture.",
    confidence: "high",
  });
  const retry = buildAnatomyRetryDirection(review);
  assert.equal(review.pass, false);
  assert.equal(review.visibleHandCount, 3);
  assert.match(retry, /duplicate hand overlaps/i);
  assert.match(retry, /one left hand and one right hand/i);
  assert.match(retry, /do not patch/i);
});

test("a contradictory reviewer verdict cannot pass a flagged hand defect", () => {
  const review = parseSceneImageAnatomyReview({
    pass: true,
    visibleHandCount: 3,
    extraHands: true,
    malformedHands: false,
    disconnectedLimbs: false,
    ambiguousPropContact: false,
    issues: ["Three hands are visible on one actor."],
    correction: "Remove the duplicate chest hand.",
    confidence: "high",
  });
  assert.equal(review.pass, false);
});

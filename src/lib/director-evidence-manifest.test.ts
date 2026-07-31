import assert from "node:assert/strict";
import test from "node:test";
import { canMarkEvidenceEligible, compactEvidenceTags, evidenceNeedsReview } from "./director-evidence-manifest";

test("evidence remains separate and review gated", () => {
  assert.equal(evidenceNeedsReview({ reuseStatus: "reusable", culturallySensitive: false }), "discovered");
  assert.equal(evidenceNeedsReview({ reuseStatus: "restricted", culturallySensitive: false }), "needs-review");
  assert.equal(evidenceNeedsReview({ reuseStatus: "reusable", culturallySensitive: true }), "needs-review");
  assert.equal(canMarkEvidenceEligible("reusable", false), true);
  assert.equal(canMarkEvidenceEligible("metadata-only", false), false);
});

test("evidence tags are bounded and normalized", () => {
  assert.deepEqual(compactEvidenceTags(["Costume, Work", "costume", null]), ["costume", "work"]);
});

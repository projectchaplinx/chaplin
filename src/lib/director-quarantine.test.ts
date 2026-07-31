import assert from "node:assert/strict";
import test from "node:test";
import { evidenceQuarantineReasons, explicitPrincipleContradictions } from "@/lib/director-quarantine";

test("rights, sensitivity, and duplicate rules quarantine without a review decision", () => {
  const reasons = evidenceQuarantineReasons({
    reuseStatus: "restricted", culturallySensitive: true, contentHash: "same-hash",
  }, 2);
  assert.deepEqual(reasons.map((reason) => reason.ruleKey), [
    "restricted-rights", "culturally-sensitive", "duplicate-content-hash",
  ]);
});

test("only explicit opposite-polarity principles are quarantined as contradictions", () => {
  const approved = [{ id: "approved", studyTitle: "Readable Geography", candidatePrinciples: ["Always keep geography readable."] }];
  assert.equal(explicitPrincipleContradictions(["Never keep geography readable."], approved).length, 1);
  assert.equal(explicitPrincipleContradictions(["Keep the cut rhythm restrained."], approved).length, 0);
});


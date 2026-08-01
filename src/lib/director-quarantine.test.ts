import assert from "node:assert/strict";
import test from "node:test";
import { evidenceQuarantineReasons, explicitPrincipleContradictions, timedMediaReviewPackageReasons } from "@/lib/director-quarantine";

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

test("incomplete timed-media packages are quarantined without discarding analysis", () => {
  const reasons = timedMediaReviewPackageReasons({
    playbackUrl: "",
    studyId: "study",
    observationCount: 6,
    principleCount: 5,
    limitations: "Still samples require direct playback.",
    artifactPaths: {},
    audioAvailable: true,
  });
  assert.equal(reasons[0]?.ruleKey, "incomplete-review-package");
  assert.deepEqual(reasons[0]?.evidence.missing, [
    "trusted playback URL", "contact sheet", "evidence package", "waveform",
  ]);
});

test("complete timed-media packages remain reviewable", () => {
  assert.deepEqual(timedMediaReviewPackageReasons({
    playbackUrl: "https://tile.loc.gov/example.mp4",
    studyId: "study",
    observationCount: 3,
    principleCount: 2,
    limitations: "Human playback is still required.",
    artifactPaths: { contactSheet: "sheet.jpg", evidencePackage: "evidence.json", waveform: "wave.png" },
    audioAvailable: true,
  }), []);
});

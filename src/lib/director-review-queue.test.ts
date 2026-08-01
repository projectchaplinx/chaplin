import assert from "node:assert/strict";
import test from "node:test";
import { buildDirectorReviewQueue, directorReviewExitProgress } from "@/lib/director-review-queue";
import type { DirectorSceneStudy } from "@/lib/director-research";
import type { DirectorTimedMediaAnalysis } from "@/lib/director-timed-media";
import type { DirectorEvidenceManifest } from "@/lib/director-evidence-manifest";

function study(id: string, status: DirectorSceneStudy["status"], tags: string[]): DirectorSceneStudy {
  return {
    id, status, tags, studyTitle: id, workTitle: "Reference", sceneLocator: "record 1", durationSeconds: 15,
    periodLabel: "1960s", region: "United States", observations: [], candidatePrinciples: ["Keep geography readable."],
    limitations: "Narrow source sample.", reviewNotes: "", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", reviewedAt: null,
    source: { id: `source-${id}`, title: "Source", institution: "Archive", sourceUrl: "https://example.com", sourceKind: "institutional", rightsBasis: "Open research record.", accessNotes: "", campaignId: "", targetTags: [], researchQuestions: [], priority: "now", queueStatus: "analyzed", lastVerifiedAt: null },
  };
}

function analysis(id: string, studyId: string, playbackStatus: DirectorTimedMediaAnalysis["playbackStatus"]): DirectorTimedMediaAnalysis {
  return {
    id, studyId, playbackStatus, jobId: `job-${id}`, workTitle: id, itemUrl: "https://www.loc.gov/item/example/", mediaUrl: "https://tile.loc.gov/example.mp4", playbackUrl: "https://tile.loc.gov/example.mp4",
    startSecond: 0, durationSeconds: 30, queryKey: "camera", observations: [], candidatePrinciples: [], limitations: "", observationCount: 4, principleCount: 2, reviewNotes: "", models: {}, artifactUrls: {}, events: [], createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", reviewedAt: null,
  };
}

function manifest(id: string, reuseStatus: DirectorEvidenceManifest["reuseStatus"] = "reusable"): DirectorEvidenceManifest {
  return { id, sourceId: "source", researchJobId: "job", kind: "collection-item", provider: "met", externalId: id, canonicalUrl: "https://example.com/item", recordLocator: id, title: id, institution: "Museum", dateLabel: "ca. 3000 BCE", region: "Mesopotamia", tags: ["3000-bce", "materials"], facets: {}, rightsUri: null, rightsLabel: "Public domain", reuseStatus, culturallySensitive: false, status: "discovered", reviewNotes: "", contentHash: id, linkedStudyIds: [], updatedAt: "2026-08-01T00:00:00.000Z" };
}

test("playback gates always precede study approval", () => {
  const draft = study("timed", "draft", ["sound"]);
  const queue = buildDirectorReviewQueue([draft, study("plain", "draft", ["camera"])], [analysis("clip", draft.id, "required")]);
  assert.equal(queue[0]?.kind, "playback");
  assert.equal(queue.some((item) => item.id === `study:${draft.id}`), false);
});

test("verified playback unlocks the separate study decision", () => {
  const draft = study("timed", "draft", ["sound"]);
  const queue = buildDirectorReviewQueue([draft], [analysis("clip", draft.id, "verified")]);
  assert.deepEqual(queue.map((item) => item.id), [`study:${draft.id}`]);
});

test("persisted timed-media quarantine blocks a false positive playback decision", () => {
  const draft = study("timed", "draft", ["sound"]);
  const clip = analysis("clip", draft.id, "required");
  const queue = buildDirectorReviewQueue([draft], [clip], [], [{
    id: "assessment",
    entityKind: "timed-media",
    entityId: clip.id,
    ruleKey: "incomplete-review-package",
    reason: "Human review package is incomplete: missing trusted playback URL.",
    evidence: { missing: ["trusted playback URL"] },
    createdAt: "2026-08-01T00:00:00.000Z",
  }]);
  assert.match(queue[0]?.reason ?? "", /cannot receive a positive human verdict/i);
  assert.deepEqual(queue[0]?.quarantineReasons, ["Human review package is incomplete: missing trusted playback URL."]);
});

test("coverage gaps outrank already-covered draft material", () => {
  const approved = study("approved", "approved", ["camera"]);
  const queue = buildDirectorReviewQueue([approved, study("covered", "draft", ["camera"]), study("gap", "draft", ["sound"])], []);
  assert.equal(queue[0]?.id, "study:gap");
  assert.deepEqual(queue[0]?.coverageGaps.includes("sound"), true);
});

test("approved and rejected studies are never review actions and ties are stable", () => {
  const queue = buildDirectorReviewQueue([
    study("zeta", "draft", ["camera"]), study("alpha", "draft", ["camera"]),
    study("done", "approved", ["sound"]), study("no", "rejected", ["action"]),
  ], []);
  assert.deepEqual(queue.map((item) => item.id), ["study:alpha", "study:zeta"]);
});

test("item-level evidence is visible before study synthesis and unsafe rights cannot be promoted", () => {
  const queue = buildDirectorReviewQueue([], [], [manifest("safe"), manifest("restricted", "restricted")]);
  assert.deepEqual(queue.map((item) => item.kind), ["evidence", "evidence"]);
  assert.match(queue.find((item) => item.manifest?.id === "safe")?.reason ?? "", /human confirmation/i);
  assert.match(queue.find((item) => item.manifest?.id === "restricted")?.reason ?? "", /cannot be promoted/i);
  assert.equal(queue.find((item) => item.manifest?.id === "safe")?.coverageGaps.includes("3000-bce"), true);
  assert.match(queue.find((item) => item.manifest?.id === "restricted")?.quarantineReasons.join(" ") ?? "", /restricted/i);
});

test("studies without a playback package receive the approvable-now lane", () => {
  const queue = buildDirectorReviewQueue([study("document-study", "draft", ["blocking"])], []);
  assert.equal(queue[0]?.lane, "approvable-now");
});

test("duplicate content hashes remain visible but are quarantined", () => {
  const first = manifest("first");
  const second = { ...manifest("second"), contentHash: first.contentHash };
  const queue = buildDirectorReviewQueue([], [], [first, second]);
  assert.equal(queue.length, 2);
  assert.equal(queue.every((item) => item.quarantineReasons.some((reason) => /duplicate content hash/i.test(reason))), true);
});

test("coverage-gap count dominates lane priority", () => {
  const approved = study("known", "approved", ["camera", "1960s", "united", "states"]);
  const coveredPlayback = analysis("covered-clip", "covered-study", "required");
  const coveredStudy = study("covered-study", "draft", ["camera"]);
  const gapStudy = study("gap-study", "draft", ["sound", "silence", "rhythm", "acoustics"]);
  const queue = buildDirectorReviewQueue([approved, coveredStudy, gapStudy], [coveredPlayback]);
  assert.equal(queue[0]?.id, "study:gap-study");
});

test("P1 progress exposes the exact GPLC exit gates", () => {
  const studies = [
    ...Array.from({ length: 10 }, (_, index) => study(`draft-${index}`, "draft", ["camera"])),
    study("reviewed", "reviewed", ["sound"]),
  ];
  const pendingPlayback = analysis("clip", "draft-0", "required");
  const discovered = manifest("manifest");
  assert.deepEqual(directorReviewExitProgress(studies, [pendingPlayback], [discovered]), {
    draftStudies: 10,
    reviewedStudies: 1,
    playbackRequired: 1,
    discoveredManifests: 1,
    draftTarget: 9,
    exitReady: false,
  });
});

test("P1 progress passes only after every exit condition passes", () => {
  const studies = Array.from({ length: 9 }, (_, index) => study(`draft-${index}`, "draft", ["camera"]));
  const verified = analysis("clip", "draft-0", "verified");
  const eligible = { ...manifest("manifest"), status: "eligible" as const };
  assert.equal(directorReviewExitProgress(studies, [verified], [eligible]).exitReady, true);
});

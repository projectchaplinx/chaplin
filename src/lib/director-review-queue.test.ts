import assert from "node:assert/strict";
import test from "node:test";
import { buildDirectorReviewQueue } from "@/lib/director-review-queue";
import type { DirectorSceneStudy } from "@/lib/director-research";
import type { DirectorTimedMediaAnalysis } from "@/lib/director-timed-media";

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

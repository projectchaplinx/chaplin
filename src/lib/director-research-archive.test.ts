import assert from "node:assert/strict";
import test from "node:test";
import { buildDirectorResearchArchiveFolders, researchJobOutputSummary } from "@/lib/director-research-archive";
import type { DirectorEvidenceManifest } from "@/lib/director-evidence-manifest";
import type { DirectorResearchJob, DirectorResearchSourceRecord, DirectorSceneStudy } from "@/lib/director-research";
import type { DirectorTimedMediaAnalysis } from "@/lib/director-timed-media";

const source: DirectorResearchSourceRecord = { id: "s1", title: "Archive", institution: "Museum", sourceUrl: "https://example.com", sourceKind: "institutional", rightsBasis: "metadata", accessNotes: "", campaignId: "c1", targetTags: [], researchQuestions: [], priority: "now", queueStatus: "analyzed", lastVerifiedAt: null };
const job: DirectorResearchJob = { id: "j1", supersedesJobId: null, attemptSequence: 0, sourceId: "s1", sourceTitle: "Archive", sourceMode: "collection-discovery", queryKey: "q", queryLabel: "Query", status: "review-required", phase: "review", progress: 100, message: "Done", attempt: 1, maxAttempts: 3, model: null, errorMessage: null, evidenceCount: 1, output: { manifestIds: ["e1"] }, usage: {}, costUsd: 0, costMethod: "no-recorded-usage", pricingNote: "No provider usage recorded.", createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T01:00:00Z", startedAt: null, completedAt: null, events: [{ id: "1", kind: "job-status", phase: "review", status: "review-required", progress: 100, message: "Done", details: {}, actor: null, createdAt: "2026-08-01T01:00:00Z" }] };
const evidence: DirectorEvidenceManifest = { id: "e1", sourceId: "s1", researchJobId: "j1", kind: "collection-item", provider: "museum", externalId: "x", canonicalUrl: "https://example.com/x", recordLocator: "x", title: "Object", institution: "Museum", dateLabel: "1960", region: "US", tags: [], facets: {}, rightsUri: null, rightsLabel: "Public domain", reuseStatus: "reusable", culturallySensitive: false, status: "eligible", reviewNotes: "Reviewed from the canonical record.", contentHash: "hash-e1", linkedStudyIds: ["st1"], updatedAt: "2026-08-01T02:00:00Z" };
const media: DirectorTimedMediaAnalysis = { id: "m1", jobId: "j1", studyId: "st1", workTitle: "Film", itemUrl: "https://example.com/film", mediaUrl: "https://example.com/film.mp4", playbackUrl: "https://example.com/film.mp4", startSecond: 0, durationSeconds: 30, queryKey: "film", observations: [], candidatePrinciples: [], limitations: "", observationCount: 0, principleCount: 0, playbackStatus: "verified", reviewNotes: "Playback was reviewed directly.", models: {}, artifactUrls: { contactSheet: "https://example.com/sheet.jpg", evidencePackage: "https://example.com/evidence.json" }, events: [], createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T03:00:00Z", reviewedAt: null };
const study: DirectorSceneStudy = { id: "st1", studyTitle: "Study", workTitle: "Film", sceneLocator: "record", durationSeconds: null, periodLabel: "1960", region: "US", tags: [], observations: [], candidatePrinciples: [], limitations: "", reviewNotes: "", status: "approved", source, createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T04:00:00Z", reviewedAt: null };

test("groups every persisted research asset and update under its source", () => {
  const [folder] = buildDirectorResearchArchiveFolders({ sources: [source], jobs: [job], studies: [study], evidence: [evidence], media: [media] });
  assert.equal(folder.source.id, "s1");
  assert.equal(folder.assetCount, 3);
  assert.equal(folder.updateCount, 1);
  assert.equal(folder.latestAt, study.updatedAt);
  assert.deepEqual(folder.evidence.map((item) => item.id), ["e1"]);
});

test("summarizes durable worker output references", () => {
  assert.equal(researchJobOutputSummary({ manifestIds: ["a", "b"], studyId: "s" }), "2 evidence records · 1 draft study");
  assert.equal(researchJobOutputSummary({}), "No durable output yet");
});

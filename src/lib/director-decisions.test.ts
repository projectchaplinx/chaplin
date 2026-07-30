import assert from "node:assert/strict";
import test from "node:test";
import { buildDirectorDecisionDiagnostics, type DirectorDecisionTraceRecord } from "@/lib/director-decisions";
import { retrieveDirectorKnowledge } from "@/lib/director-brain";

function decision(
  id: string,
  runKind: DirectorDecisionTraceRecord["runKind"],
  status: DirectorDecisionTraceRecord["status"],
  brief: string,
): DirectorDecisionTraceRecord {
  const trace = retrieveDirectorKnowledge({
    brief,
    format: "punch",
    durationSeconds: 15,
    sceneCount: 4,
  });
  return {
    id,
    runKind,
    status,
    userId: "u-test",
    characterId: "c-test",
    storyId: null,
    generationJobId: null,
    pipelineRunId: null,
    brainVersion: trace.version,
    format: "punch",
    durationSeconds: 15,
    sceneCount: 4,
    briefExcerpt: brief,
    trace,
    provider: "",
    model: "",
    outcome: {},
    errorMessage: "",
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
    startedAt: null,
    completedAt: null,
  };
}

test("decision diagnostics expose live learning and outcome coverage", () => {
  const writing = decision("1", "writing", "succeeded", "A 1965 New York car pursuit.");
  writing.trace.approvedStudies = [{
    id: "study-1",
    studyTitle: "Route study",
    workTitle: "Test",
    sourceTitle: "Owned test",
    sourceUrl: null,
    sourceKind: "chaplin-test",
    rightsBasis: "Owned production evidence.",
    principles: ["Remove one route per beat."],
    score: 2,
  }];
  const render = decision("2", "render", "failed", "A 1965 New York car pursuit.");
  const diagnostics = buildDirectorDecisionDiagnostics([writing, render]);
  assert.equal(diagnostics.total, 2);
  assert.equal(diagnostics.writingRuns, 1);
  assert.equal(diagnostics.renderRuns, 1);
  assert.equal(diagnostics.succeeded, 1);
  assert.equal(diagnostics.failed, 1);
  assert.equal(diagnostics.periodResolved, 2);
  assert.equal(diagnostics.withApprovedResearch, 1);
  assert.ok(diagnostics.patternUsage.some((item) => item.id === "action-geography" && item.count === 2));
});

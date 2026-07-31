import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDirectorResearchExpansionAllowed,
  DIRECTOR_GPLC_LIMITS,
  directorResearchExpansionState,
} from "./director-gplc";

test("research expansion is dormant unless P4 is explicit", () => {
  assert.equal(directorResearchExpansionState({}).allowed, false);
  assert.equal(directorResearchExpansionState({ DIRECTOR_RESEARCH_PHASE: "P4" }).allowed, false);
  assert.equal(directorResearchExpansionState({
    DIRECTOR_RESEARCH_PHASE: "P4",
    DIRECTOR_RESEARCH_EXPANSION_ENABLED: "true",
  }).allowed, true);
  assert.throws(() => assertDirectorResearchExpansionAllowed({ DIRECTOR_RESEARCH_PHASE: "P2" }), /expansion is dormant/i);
});

test("hard generation and concurrency ceilings stay encoded", () => {
  assert.equal(DIRECTOR_GPLC_LIMITS.globalResearchLeases, 4);
  assert.equal(DIRECTOR_GPLC_LIMITS.metConcurrentRequests, 2);
  assert.equal(DIRECTOR_GPLC_LIMITS.candidatesPerCycle, 5);
  assert.equal(DIRECTOR_GPLC_LIMITS.cyclesPerDay, 1);
  assert.deepEqual(DIRECTOR_GPLC_LIMITS.shotDurationSeconds, { min: 4, max: 5 });
});


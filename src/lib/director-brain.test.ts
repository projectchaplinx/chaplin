import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDirectorPromptBlock,
  directorTraceDetails,
  retrieveDirectorKnowledge,
} from "@/lib/director-brain";

test("an action pursuit retrieves geography, escalation, rhythm, and AI continuity rules", () => {
  const trace = retrieveDirectorKnowledge({
    brief: "A 15-second car pursuit through 1965 New York where the driver loses the safe route.",
    format: "punch",
    durationSeconds: 15,
    sceneCount: 4,
  });
  assert.equal(trace.periodProfileId, "us-1960s-observed");
  assert.ok(trace.patternIds.includes("action-geography"));
  assert.ok(trace.patternIds.includes("action-escalation-ladder"));
  assert.ok(trace.patternIds.includes("ai-reference-chain"));
  assert.equal(trace.warnings.length, 0);
  assert.equal(trace.worldResolution?.status, "partial");
  assert.equal(trace.worldResolution?.place, "New York City");
  assert.deepEqual(trace.worldResolution?.missing, ["season-or-time", "immediate-location"]);
  assert.ok(trace.sourceIds.includes("loc-look-collection"));
  assert.equal(trace.attentionMap.length, 15);
  assert.equal(trace.attentionMap[9].phase, "reversal");
  assert.equal(trace.attentionMap[14].phase, "landing");
  assert.match(buildDirectorPromptBlock(trace), /Geography before velocity|Establish destination/i);
});

test("3000 BCE without a place is blocked from becoming a generic ancient style", () => {
  const trace = retrieveDirectorKnowledge({
    brief: "A tense escape in 3000 BCE.",
    format: "punch",
    durationSeconds: 15,
    sceneCount: 4,
  });
  assert.equal(trace.periodProfileId, null);
  assert.equal(trace.worldResolution?.status, "unresolved");
  assert.ok(trace.worldResolution?.missing.includes("place"));
  assert.match(trace.warnings.join(" "), /not one visual world/i);
  assert.match(buildDirectorPromptBlock(trace), /name a region or culture/i);
});

test("Uruk resolves to a sourced Mesopotamian material world", () => {
  const trace = retrieveDirectorKnowledge({
    brief: "Uruk, southern Mesopotamia around 3000 BCE: a clerk hides a clay account.",
    format: "spark",
    durationSeconds: 5,
    sceneCount: 1,
  });
  const details = directorTraceDetails(trace);
  assert.equal(details.period?.id, "uruk-3000-bce");
  assert.equal(trace.worldResolution?.place, "Uruk, southern Mesopotamia");
  assert.equal(trace.worldResolution?.roleOrCommunity, "Clerk");
  assert.equal(trace.worldResolution?.status, "partial");
  assert.ok(details.sources.some((source) => source.id === "met-uruk"));
  const prompt = buildDirectorPromptBlock(trace);
  assert.match(prompt, /mud-brick|clay tablets/i);
  assert.match(prompt, /Roman or Greek columns/i);
});

test("a complete 1976 Los Angeles coordinate resolves to dated local evidence", () => {
  const trace = retrieveDirectorKnowledge({
    brief: "Echo Park, Los Angeles, summer 1976 at sunset. A neighborhood mechanic closes a working garage as traffic passes.",
    format: "spark",
    durationSeconds: 5,
    sceneCount: 1,
  });
  assert.equal(trace.periodProfileId, "us-1970s-los-angeles");
  assert.deepEqual(trace.worldResolution, {
    status: "resolved",
    time: "1976",
    place: "Echo Park, Los Angeles, California",
    roleOrCommunity: "Mechanic",
    seasonOrTime: "Summer / Sunset",
    immediateLocation: "Garage",
    evidenceSourceIds: [
      "lapl-photo-collection",
      "lapl-sunset-strip-1976",
      "lapl-echo-park-1976",
      "lapl-hollywood-sunset-1976",
      "loc-la-used-cars-1970s",
    ],
    missing: [],
  });
  assert.match(buildDirectorPromptBlock(trace), /WORLD GAPS: none/i);
  assert.ok(trace.sourceIds.includes("lapl-echo-park-1976"));
});

test("a decade without a place stays unresolved instead of inventing Los Angeles", () => {
  const trace = retrieveDirectorKnowledge({
    brief: "A mechanic discovers sabotage in a garage in the 1970s.",
    format: "spark",
    durationSeconds: 5,
    sceneCount: 1,
  });
  assert.equal(trace.periodProfileId, null);
  assert.equal(trace.worldResolution?.status, "unresolved");
  assert.equal(trace.worldResolution?.place, null);
  assert.match(trace.warnings.join(" "), /not one visual world/i);
  assert.match(buildDirectorPromptBlock(trace), /avoid unsupported invention/i);
});
test("movie titles never become a request to copy protected expression", () => {
  const trace = retrieveDirectorKnowledge({
    brief: "Make an original vehicle pursuit with the relentless momentum of a famous car movie.",
    format: "punch",
    durationSeconds: 15,
    sceneCount: 4,
  });
  assert.match(buildDirectorPromptBlock(trace), /Do not recreate a protected movie scene/i);
});

test("human-approved research adds only reviewed abstract principles to the prompt", () => {
  const trace = retrieveDirectorKnowledge({
    brief: "An original chase whose route becomes progressively narrower.",
    format: "punch",
    durationSeconds: 15,
    sceneCount: 4,
  });
  trace.approvedStudies = [{
    id: "study-route-pressure",
    studyTitle: "Route pressure study",
    workTitle: "Rights-cleared Chaplin test",
    sourceTitle: "Chaplin production test 12",
    sourceUrl: null,
    sourceKind: "chaplin-test",
    rightsBasis: "Owned internal production test.",
    principles: ["Escalate a pursuit by visibly removing one viable route at each beat."],
    score: 4,
  }];
  const prompt = buildDirectorPromptBlock(trace);
  assert.match(prompt, /HUMAN-APPROVED RESEARCH PRINCIPLES/);
  assert.match(prompt, /removing one viable route/);
  assert.doesNotMatch(prompt, /Owned internal production test/);
});

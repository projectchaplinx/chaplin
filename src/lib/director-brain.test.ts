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
  assert.ok(details.sources.some((source) => source.id === "met-uruk"));
  const prompt = buildDirectorPromptBlock(trace);
  assert.match(prompt, /mud-brick|clay tablets/i);
  assert.match(prompt, /Roman or Greek columns/i);
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

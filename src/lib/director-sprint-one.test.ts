import assert from "node:assert/strict";
import test from "node:test";
import { finalizeDirectorSprintTriage, scoreDirectorPrinciple, type ProposedDirectorPrincipleAssessment } from "@/lib/director-sprint-one";

function principle(index: number, lane: ProposedDirectorPrincipleAssessment["lane"] = "candidate"): ProposedDirectorPrincipleAssessment {
  const axis = (["identity", "performance", "framing", "blocking"] as const)[index % 4]!;
  const axisScore = { identity: 95, performance: 82, framing: 70, blocking: 55 }[axis];
  return {
    studyId: `study-${index}`,
    timedMediaAnalysisId: `media-${index}`,
    playbackStatus: "required",
    playbackStartSecond: 0,
    playbackDurationSeconds: 30,
    studyTitle: `Study ${index}`,
    workTitle: `Work ${index}`,
    sourceTitle: `Source ${index}`,
    sourceUrl: "https://example.com",
    principleIndex: index,
    principleText: `Principle ${index}`,
    principleHash: `hash-${index}`,
    lane,
    characterAxis: axis,
    agreementKey: `hypothesis-${index}`,
    confidence: "high",
    rationale: "This directly serves a reusable character shot decision.",
    rejectionReason: lane === "discard" ? "Metadata rather than craft." : "",
    sourceStrength: "contact-sheet-only",
    characterAxisScore: axisScore,
    crossStudyAgreement: 2,
    productionReach: 4,
    model: "gpt-5.6-terra",
    responseId: "response",
  };
}

test("character relevance dominates agreement and reach in Sprint 1 ranking", () => {
  const strong = { ...principle(2), characterAxisScore: 90, crossStudyAgreement: 0, productionReach: 2 };
  const weak = { ...principle(1), characterAxisScore: 60, crossStudyAgreement: 8, productionReach: 5 };
  assert.ok(scoreDirectorPrinciple(strong) > scoreDirectorPrinciple(weak));
});

test("Sprint 1 retains at most 40 candidates and names only five playback items", () => {
  const result = finalizeDirectorSprintTriage(Array.from({ length: 52 }, (_, index) => principle(index)));
  assert.equal(result.filter((item) => item.lane === "candidate").length, 40);
  assert.equal(result.filter((item) => item.shortlistRank != null).length, 5);
  assert.ok(new Set(result.filter((item) => item.shortlistRank != null).map((item) => item.characterAxis)).size >= 3);
  assert.ok([...new Set(result.filter((item) => item.shortlistRank != null).map((item) => item.characterAxis))]
    .every((axis) => result.filter((item) => item.shortlistRank != null && item.characterAxis === axis).length <= 2));
  assert.deepEqual(result.filter((item) => item.shortlistRank != null).map((item) => item.shortlistRank), [1, 2, 3, 4, 5]);
});

test("discarded principle rows remain present with their reason", () => {
  const result = finalizeDirectorSprintTriage([principle(1, "discard"), principle(2)]);
  assert.equal(result.length, 2);
  assert.equal(result.find((item) => item.lane === "discard")?.rejectionReason, "Metadata rather than craft.");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  assertResearchTextIsAnalytical,
  buildDirectorResearchDiagnostics,
  normalizeDirectorStudyInput,
  parseObservationLines,
  rankApprovedDirectorResearch,
  scoreDirectorStudyForBrief,
  type DirectorSceneStudy,
} from "@/lib/director-research";

test("scene-study intake separates timed evidence, craft, transition, function, and inference", () => {
  const normalized = normalizeDirectorStudyInput({
    sourceTitle: "Licensed pursuit reference",
    sourceKind: "licensed",
    rightsBasis: "Internal analysis license permits craft study.",
    studyTitle: "Route-loss escalation",
    workTitle: "Reference film",
    durationSeconds: 15,
    region: "Los Angeles",
    tags: "vehicle, pursuit, action",
    observationLines: [
      "0-1 | Destination and pursuing vehicle share the wide frame | locked wide geography | engine bridges into closer frame | orient route and threat | the wide earns later compression | high",
      "5-6 | A blocked lane removes the safe route | driver insert and forward axis | impact sound leads the cut | impose route cost | escalation changes options rather than volume | medium",
    ].join("\n"),
    candidatePrinciples: "Establish destination and threat before accelerating.\nEscalate a pursuit by removing a route or tool.",
  });
  assert.equal(normalized.study.observations.length, 2);
  assert.equal(normalized.study.observations[1].startSecond, 5);
  assert.equal(normalized.study.candidatePrinciples.length, 2);
  assert.deepEqual(normalized.study.tags, ["vehicle", "pursuit", "action"]);
});

test("screenplays, transcripts, and long copied dialogue are rejected", () => {
  assert.throws(
    () => assertResearchTextIsAnalytical("INT. GARAGE - NIGHT\nDRIVER\nWe have to go.\nMECHANIC\nNot yet."),
    /observable craft analysis/i,
  );
  assert.throws(
    () => parseObservationLines('0-1 | "This is a copied line that continues for far longer than analytical evidence should ever need because the complete expressive dialogue is being preserved inside the study rather than its function."'),
    /observable craft analysis/i,
  );
});

test("approved-study retrieval scoring responds to brief vocabulary", () => {
  const study = {
    studyTitle: "Readable vehicle pursuit geography",
    workTitle: "Reference",
    periodLabel: "1960s",
    region: "Los Angeles",
    tags: ["vehicle", "pursuit", "action"],
    candidatePrinciples: ["Refresh screen direction after the route changes."],
  } as DirectorSceneStudy;
  assert.ok(scoreDirectorStudyForBrief(study, "A 1960s vehicle pursuit changes route") > 0);
  assert.equal(scoreDirectorStudyForBrief(study, "An intimate kitchen confession"), 0);
});

test("retrieval excludes relevant studies until a human approves them", () => {
  const study = {
    id: "route-study",
    studyTitle: "Readable vehicle pursuit geography",
    workTitle: "Owned reference",
    sceneLocator: "test",
    durationSeconds: 15,
    periodLabel: "1960s",
    region: "Los Angeles",
    tags: ["vehicle", "pursuit", "action"],
    observations: [],
    candidatePrinciples: ["Refresh screen direction after the route changes."],
    limitations: "",
    reviewNotes: "",
    status: "draft",
    source: {
      id: "source",
      title: "Chaplin pursuit test",
      institution: "Chaplin",
      sourceUrl: null,
      sourceKind: "chaplin-test",
      rightsBasis: "Owned internal production test.",
      accessNotes: "",
      campaignId: "",
      targetTags: [],
      researchQuestions: [],
      priority: "next",
      queueStatus: "queued",
      lastVerifiedAt: null,
    },
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    reviewedAt: null,
  } as DirectorSceneStudy;
  assert.equal(rankApprovedDirectorResearch([study], "vehicle pursuit", 4).length, 0);
  assert.equal(rankApprovedDirectorResearch([{ ...study, status: "approved" }], "vehicle pursuit", 4).length, 1);
});

test("research diagnostics expose coverage gaps and overlapping studies for human comparison", () => {
  const baseStudy = {
    workTitle: "Chaplin tests",
    sceneLocator: "test",
    durationSeconds: 15,
    periodLabel: "",
    region: "",
    observations: [{
      startSecond: 0,
      endSecond: 2,
      evidence: "The exit remains visible.",
      craft: "wide",
      transition: "",
      narrativeJob: "orientation",
      inference: "Geography precedes speed.",
      confidence: "high" as const,
    }],
    candidatePrinciples: ["Show the route before acceleration."],
    limitations: "",
    reviewNotes: "Approved internal evidence.",
    status: "approved" as const,
    source: {
      id: "source-1",
      title: "Owned test",
      institution: "Chaplin",
      sourceUrl: null,
      sourceKind: "chaplin-test" as const,
      rightsBasis: "Owned internal production test.",
      accessNotes: "",
      campaignId: "",
      targetTags: [],
      researchQuestions: [],
      priority: "next" as const,
      queueStatus: "queued" as const,
      lastVerifiedAt: null,
    },
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    reviewedAt: "2026-07-29T00:00:00.000Z",
  };
  const diagnostics = buildDirectorResearchDiagnostics([
    { ...baseStudy, id: "study-a", studyTitle: "Route clarity", tags: ["action", "camera"] },
    { ...baseStudy, id: "study-b", studyTitle: "Route pressure", tags: ["action", "camera"], source: { ...baseStudy.source, id: "source-2" } },
  ]);
  assert.equal(diagnostics.approvedStudies, 2);
  assert.equal(diagnostics.sourceCount, 2);
  assert.equal(diagnostics.confidence.high, 2);
  assert.equal(diagnostics.coverage.find((entry) => entry.domain === "action")?.approvedStudies, 2);
  assert.equal(diagnostics.coverage.find((entry) => entry.domain === "sound")?.approvedStudies, 0);
  assert.deepEqual(diagnostics.comparisonQueue[0]?.sharedTags, ["action", "camera"]);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  filterPlaybackSafeDirectorResearch,
  assertResearchTextIsAnalytical,
  buildDirectorResearchDiagnostics,
  normalizeDirectorStudyInput,
  parseObservationLines,
  directorResearchSourceMode,
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
      "5-6 | A blocked lane removes the safe route | driver insert and forward axis | impact leads the cut | impose route cost | escalation changes options rather than volume | medium | engine drops out before one close impact | silence isolates the new route cost",
    ].join("\n"),
    candidatePrinciples: "Establish destination and threat before accelerating.\nEscalate a pursuit by removing a route or tool.",
  });
  assert.equal(normalized.study.observations.length, 2);
  assert.equal(normalized.study.observations[1].startSecond, 5);
  assert.equal(normalized.study.candidatePrinciples.length, 2);
  assert.deepEqual(normalized.study.tags, ["vehicle", "pursuit", "action"]);
  assert.match(normalized.study.observations[1].audioEvidence ?? "", /engine drops out/i);
  assert.match(normalized.study.observations[1].soundFunction ?? "", /route cost/i);
});

test("research evidence accepts attributable document locators without fake timestamps", () => {
  const observations = parseObservationLines([
    "section: Camera movement | The documentation distinguishes a locked camera from a controlled move. | camera | comparison | capability boundary | Treat the distinction as a selectable production constraint. | medium",
    "api-field: duration | The request contract lists bounded duration values. | timing | request validation | provider compatibility | Validate duration before dispatch. | high",
  ].join("\n"));
  assert.equal(observations[0].locator?.kind, "section");
  assert.equal(observations[0].startSecond, undefined);
  assert.equal(observations[1].locator?.kind, "api-field");
});

test("research sources route to distinct evidence workflows", () => {
  const base = { sourceKind: "institutional" as const, sourceUrl: "https://example.com", targetTags: ["period"], title: "Museum essay" };
  assert.equal(directorResearchSourceMode(base), "document");
  assert.equal(directorResearchSourceMode({ ...base, title: "Smithsonian Open Access collections and API" }), "collection-discovery");
  assert.equal(directorResearchSourceMode({ ...base, title: "Met Collection API material-world discovery" }), "collection-discovery");
  assert.equal(directorResearchSourceMode({ ...base, sourceKind: "provider-research", title: "Video API" }), "provider-doc");
  assert.equal(directorResearchSourceMode({ ...base, sourceKind: "public-domain", title: "Film viewing file", sourceUrl: "https://example.com/film.webm", targetTags: ["public-domain-scene"] }), "timed-media");
  assert.equal(directorResearchSourceMode({ ...base, sourceKind: "public-domain", title: "Public Domain Films from the National Film Registry", targetTags: ["public-domain-scene"] }), "provenance");
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

test("resolved geography prevents cross-region research bleed", () => {
  const india = { studyTitle: "Indian textile evidence", workTitle: "Reference", region: "India", periodLabel: "India, 17th century", tags: ["india", "textile"], candidatePrinciples: ["Preserve textile material continuity."] } as DirectorSceneStudy;
  const japan = { studyTitle: "Edo garment evidence", workTitle: "Reference", region: "Japan", periodLabel: "Edo Japan", tags: ["japan", "kimono"], candidatePrinciples: ["Preserve textile material continuity."] } as DirectorSceneStudy;
  assert.equal(scoreDirectorStudyForBrief(india, "Edo Japan kimono textile continuity"), 0);
  assert.ok(scoreDirectorStudyForBrief(japan, "Edo Japan kimono textile continuity") > 0);
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

test("timed-film research stays out of retrieval until direct playback is verified", () => {
  const timedStudy = {
    id: "timed-study",
    status: "approved",
    studyTitle: "Readable western entrance",
    workTitle: "Rights-cleared film",
    region: "United States",
    periodLabel: "1930s",
    tags: ["blocking"],
    candidatePrinciples: ["Orient the social hierarchy before the entrance changes it."],
  } as DirectorSceneStudy;
  const unrelatedStudy = { ...timedStudy, id: "owned-study", source: { sourceKind: "chaplin-test" } } as DirectorSceneStudy;

  assert.deepEqual(
    filterPlaybackSafeDirectorResearch([timedStudy, unrelatedStudy], [
      { studyId: timedStudy.id, playbackStatus: "required" },
    ]).map((study) => study.id),
    [unrelatedStudy.id],
  );
  assert.deepEqual(
    filterPlaybackSafeDirectorResearch([timedStudy, unrelatedStudy], [
      { studyId: timedStudy.id, playbackStatus: "verified" },
    ]).map((study) => study.id),
    [timedStudy.id, unrelatedStudy.id],
  );
  assert.deepEqual(
    filterPlaybackSafeDirectorResearch([timedStudy], [
      { studyId: timedStudy.id, playbackStatus: "rejected" },
    ]),
    [],
  );
});

test("research diagnostics expose coverage gaps and overlapping studies for human comparison", () => {
  const baseStudy = {
    workTitle: "Chaplin tests",
    sceneLocator: "test",
    durationSeconds: 15,
    periodLabel: "United States, 1968",
    region: "Los Angeles, United States",
    observations: [{
      startSecond: 0,
      endSecond: 2,
      evidence: "The exit remains visible.",
      craft: "wide",
      transition: "",
      narrativeJob: "orientation",
      inference: "Geography precedes speed.",
      confidence: "high" as const,
      audioEvidence: "A distant engine falls below the measured ambient bed.",
      soundFunction: "The withdrawal makes the visible exit feel less reachable.",
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
  assert.equal(diagnostics.reviewReady, 0);
  assert.equal(diagnostics.incompleteDrafts, 0);
  assert.equal(diagnostics.totalObservedSeconds, 30);
  assert.equal(diagnostics.sourceCount, 2);
  assert.equal(diagnostics.confidence.high, 2);
  assert.equal(diagnostics.coverage.find((entry) => entry.domain === "action")?.approvedStudies, 2);
  assert.equal(diagnostics.coverage.find((entry) => entry.domain === "sound")?.approvedStudies, 0);
  assert.equal(diagnostics.soundEvidenceStudies, 2);
  assert.equal(diagnostics.soundObservedSeconds, 4);
  assert.equal(diagnostics.periodEvidenceStudies, 2);
  assert.equal(diagnostics.periodRegions, 1);
  assert.deepEqual(diagnostics.comparisonQueue[0]?.sharedTags, ["action", "camera"]);
  const readyDraft = {
    ...baseStudy,
    id: "study-ready",
    studyTitle: "Ready evidence",
    status: "draft" as const,
    tags: ["action", "camera"],
    observations: [
      baseStudy.observations[0],
      { ...baseStudy.observations[0], startSecond: 2, endSecond: 4 },
      { ...baseStudy.observations[0], startSecond: 4, endSecond: 6 },
    ],
    limitations: "Timed visual-only evidence with no audio claims and a deliberately narrow source sample.",
  };
  const queueDiagnostics = buildDirectorResearchDiagnostics([
    readyDraft,
    { ...readyDraft, id: "study-incomplete", observations: [], limitations: "" },
  ]);
  assert.equal(queueDiagnostics.reviewReady, 1);
  assert.equal(queueDiagnostics.incompleteDrafts, 1);
});

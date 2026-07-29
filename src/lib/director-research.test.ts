import assert from "node:assert/strict";
import test from "node:test";
import {
  assertResearchTextIsAnalytical,
  normalizeDirectorStudyInput,
  parseObservationLines,
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


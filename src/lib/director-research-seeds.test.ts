import assert from "node:assert/strict";
import test from "node:test";
import { DIRECTOR_RESEARCH_CAMPAIGN } from "@/lib/director-research-campaign";
import { assertResearchTextIsAnalytical } from "@/lib/director-research";
import { DIRECTOR_RESEARCH_STUDY_SEEDS } from "@/lib/director-research-seeds";

test("study seeds reference campaign sources and contain analytical evidence", () => {
  const campaignUrls = new Set(DIRECTOR_RESEARCH_CAMPAIGN.map((source) => source.sourceUrl));
  const seedKeys = DIRECTOR_RESEARCH_STUDY_SEEDS.map((seed) => `${seed.sourceUrl}\n${seed.studyTitle}\n${seed.sceneLocator}`);
  assert.ok(DIRECTOR_RESEARCH_STUDY_SEEDS.length >= 2, "corpus milestone needs at least two contrasting timed studies");
  assert.equal(new Set(seedKeys).size, seedKeys.length, "study seeds must be unique");
  assert.ok(DIRECTOR_RESEARCH_STUDY_SEEDS.reduce((total, seed) => total + seed.durationSeconds, 0) >= 100);
  for (const seed of DIRECTOR_RESEARCH_STUDY_SEEDS) {
    assert.ok(campaignUrls.has(seed.sourceUrl), `${seed.id} has no campaign source`);
    assert.ok(seed.observations.length >= 3, `${seed.id} needs at least three timed observations`);
    assert.ok(seed.candidatePrinciples.length >= 1, `${seed.id} needs candidate principles`);
    assert.equal(new Set(seed.candidatePrinciples).size, seed.candidatePrinciples.length, `${seed.id} repeats a principle`);
    assert.ok(seed.limitations.length >= 40, `${seed.id} needs meaningful limitations`);
    assertResearchTextIsAnalytical([
      ...seed.observations.flatMap((observation) => [observation.evidence, observation.inference]),
      ...seed.candidatePrinciples,
      seed.limitations,
    ].join("\n"));
  }
});

test("study seed observations cover the researched extract without gaps", () => {
  for (const seed of DIRECTOR_RESEARCH_STUDY_SEEDS) {
    assert.equal(seed.observations[0]?.startSecond, 0);
    for (let index = 0; index < seed.observations.length; index += 1) {
      const observation = seed.observations[index];
      assert.ok(["low", "medium", "high"].includes(observation.confidence));
      assert.ok(observation.endSecond > observation.startSecond);
      if (index > 0) {
        assert.equal(observation.startSecond, seed.observations[index - 1].endSecond);
      }
    }
    assert.equal(seed.observations.at(-1)?.endSecond, seed.durationSeconds);
  }
});

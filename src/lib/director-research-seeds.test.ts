import assert from "node:assert/strict";
import test from "node:test";
import { DIRECTOR_RESEARCH_CAMPAIGN } from "@/lib/director-research-campaign";
import { assertResearchTextIsAnalytical } from "@/lib/director-research";
import { DIRECTOR_RESEARCH_STUDY_SEEDS } from "@/lib/director-research-seeds";

test("study seeds reference campaign sources and contain analytical evidence", () => {
  const campaignUrls = new Set(DIRECTOR_RESEARCH_CAMPAIGN.map((source) => source.sourceUrl));
  for (const seed of DIRECTOR_RESEARCH_STUDY_SEEDS) {
    assert.ok(campaignUrls.has(seed.sourceUrl), `${seed.id} has no campaign source`);
    assert.ok(seed.observations.length >= 2, `${seed.id} needs timed observations`);
    assert.ok(seed.candidatePrinciples.length >= 1, `${seed.id} needs candidate principles`);
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

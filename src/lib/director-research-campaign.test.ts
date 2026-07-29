import assert from "node:assert/strict";
import test from "node:test";
import {
  DIRECTOR_RESEARCH_CAMPAIGN,
  DIRECTOR_RESEARCH_CAMPAIGN_VERSION,
  DIRECTOR_RESEARCH_COVERAGE_TARGETS,
} from "@/lib/director-research-campaign";

test("research campaign has unique authoritative sources with explicit rights and questions", () => {
  assert.match(DIRECTOR_RESEARCH_CAMPAIGN_VERSION, /^\d{4}\.\d{2}\.\d{2}-[a-z]$/);
  assert.equal(new Set(DIRECTOR_RESEARCH_CAMPAIGN.map((item) => item.id)).size, DIRECTOR_RESEARCH_CAMPAIGN.length);
  assert.equal(new Set(DIRECTOR_RESEARCH_CAMPAIGN.map((item) => item.sourceUrl)).size, DIRECTOR_RESEARCH_CAMPAIGN.length);
  for (const item of DIRECTOR_RESEARCH_CAMPAIGN) {
    assert.match(item.sourceUrl, /^https:\/\//);
    assert.ok(item.rightsBasis.length >= 30, `${item.id} needs a specific rights basis`);
    assert.ok(item.targetTags.length >= 2, `${item.id} needs coverage tags`);
    assert.ok(item.researchQuestions.length >= 2, `${item.id} needs research questions`);
  }
});

test("campaign covers every declared research track and coverage target", () => {
  const tracks = new Set(DIRECTOR_RESEARCH_CAMPAIGN.map((item) => item.track));
  assert.deepEqual(
    [...tracks].sort(),
    ["ai-production", "film-craft", "period-world", "public-domain-scene"],
  );
  for (const target of DIRECTOR_RESEARCH_COVERAGE_TARGETS) {
    assert.ok(target.targetApprovedStudies > 0);
    assert.ok(
      DIRECTOR_RESEARCH_CAMPAIGN.some((item) => item.targetTags.includes(target.id)),
      `${target.id} has no queued source`,
    );
  }
});

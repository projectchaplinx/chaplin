import assert from "node:assert/strict";
import test from "node:test";
import { DIRECTOR_RESEARCH_QUERY_PLANS, evidenceFallsWithinPlan, northAmericanLocation, plansForResearchSource } from "./director-research-query-plan";

test("gap plans are unique, bounded, and resolve a provider", () => {
  assert.equal(new Set(DIRECTOR_RESEARCH_QUERY_PLANS.map((plan) => plan.id)).size, DIRECTOR_RESEARCH_QUERY_PLANS.length);
  assert.ok(DIRECTOR_RESEARCH_QUERY_PLANS.every((plan) => plan.query.length >= 12 && plan.layers.length >= 3 && plan.preferredProviders.length >= 1));
  assert.ok(plansForResearchSource("Met Collection API material-world discovery").length >= 6);
  assert.ok(plansForResearchSource("Library of Congress structured era-evidence discovery").length >= 2);
});

test("query evidence filters reject wrong dates and foreign locations", () => {
  const plan = DIRECTOR_RESEARCH_QUERY_PLANS.find((item) => item.id === "late20-north-america-infrastructure")!;
  assert.equal(evidenceFallsWithinPlan("1984", plan), true);
  assert.equal(evidenceFallsWithinPlan("1500", plan), false);
  assert.equal(northAmericanLocation("Grand Rapids, Michigan"), true);
  assert.equal(northAmericanLocation("Baghdad, Iraq"), false);
});

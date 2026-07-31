import assert from "node:assert/strict";
import test from "node:test";
import { estimateDirectorResearchCost } from "@/lib/director-research-cost";

test("prices recorded Terra tokens without inventing absent usage", () => {
  const cost = estimateDirectorResearchCost({ input_tokens: 1_000_000, output_tokens: 100_000 });
  assert.equal(cost.costUsd, 4);
  assert.equal(cost.costMethod, "rate-card-estimate");
  assert.equal(estimateDirectorResearchCost({}).costMethod, "no-recorded-usage");
});

test("marks timed-media cost partial when audio token rate is unavailable", () => {
  const cost = estimateDirectorResearchCost({
    visualSynthesis: { input_tokens: 1_000, output_tokens: 100 },
    audioPerception: { prompt_tokens_details: { audio_tokens: 600 } },
  });
  assert.equal(cost.costMethod, "partial-rate-card");
  assert.equal(cost.excludedAudioTokens, 600);
  assert.match(cost.pricingNote, /explicitly excluded/i);
});

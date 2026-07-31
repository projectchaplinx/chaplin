export type DirectorResearchCostMethod = "rate-card-estimate" | "partial-rate-card" | "no-recorded-usage" | "unknown-rate";

export type DirectorResearchCost = {
  inputTokens: number;
  outputTokens: number;
  excludedAudioTokens: number;
  costUsd: number;
  costMethod: DirectorResearchCostMethod;
  pricingNote: string;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function estimateDirectorResearchCost(
  usage: Record<string, unknown>,
  rates: { inputPerMillion?: number; outputPerMillion?: number } = {},
): DirectorResearchCost {
  const visual = record(usage.visualSynthesis);
  const audio = record(usage.audioPerception);
  const audioPromptDetails = record(audio.prompt_tokens_details);
  const inputTokens = number(usage.input_tokens) + number(visual.input_tokens);
  const outputTokens = number(usage.output_tokens) + number(visual.output_tokens);
  const excludedAudioTokens = number(audioPromptDetails.audio_tokens);
  const inputRate = rates.inputPerMillion ?? 2.5;
  const outputRate = rates.outputPerMillion ?? 15;
  const costUsd = Math.round(((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000) * 1e8) / 1e8;
  if (!Object.keys(usage).length) {
    return { inputTokens, outputTokens, excludedAudioTokens, costUsd: 0, costMethod: "no-recorded-usage", pricingNote: "No provider-token usage was recorded. $0 is recorded usage, not proof that no external cost occurred." };
  }
  if (excludedAudioTokens) {
    return { inputTokens, outputTokens, excludedAudioTokens, costUsd, costMethod: "partial-rate-card", pricingNote: `Minimum known cost from GPT-5.6 Terra text tokens at $${inputRate}/M input and $${outputRate}/M output; gpt-audio-1.5 audio-token cost is unpriced and explicitly excluded.` };
  }
  if (inputTokens || outputTokens) {
    return { inputTokens, outputTokens, excludedAudioTokens, costUsd, costMethod: "rate-card-estimate", pricingNote: `Estimated from recorded GPT-5.6 Terra tokens at $${inputRate}/M input and $${outputRate}/M output.` };
  }
  return { inputTokens, outputTokens, excludedAudioTokens, costUsd: 0, costMethod: "unknown-rate", pricingNote: "Provider usage exists but no safe rate mapping is available; $0 remains explicitly unknown rather than invented." };
}

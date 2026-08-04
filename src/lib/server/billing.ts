import "server-only";

export type GenerationUsage = {
  inputTokens?: number;
  outputTokens?: number;
  inputCharacters?: number;
  outputCharacters?: number;
  durationSeconds?: number;
  imageCount?: number;
  previewCount?: number;
  providerTokens?: number;
  providerCredits?: number;
  providerUsage?: Record<string, unknown>;
};

export type GenerationBilling = {
  usage: GenerationUsage;
  providerCredits: number | null;
  normalizedTokens: number;
  costUsd: number;
  usdToInrRate: number;
  costInr: number;
  costMethod: "provider" | "rate-card-estimate" | "unknown-rate" | "no-charge";
  pricingNote: string;
};

const ELEVEN_TTS_USD_PER_1K_CHARACTERS = Number(
  process.env.ELEVEN_TTS_USD_PER_1K_CHARACTERS ?? "0.10"
);
const ELEVEN_SFX_USD_PER_MINUTE = Number(
  process.env.ELEVEN_SFX_USD_PER_MINUTE ?? "0.12"
);
const ELEVEN_MUSIC_USD_PER_MINUTE = Number(
  process.env.ELEVEN_MUSIC_USD_PER_MINUTE ?? "0.15"
);
const SEEDREAM_USD_PER_IMAGE = Number(process.env.SEEDREAM_USD_PER_IMAGE ?? "0.04");
const OPENAI_IMAGE_USD_PER_IMAGE = Number(process.env.OPENAI_IMAGE_USD_PER_IMAGE ?? "0.041");
const OPENAI_TERRA_INPUT_USD_PER_MILLION_TOKENS = Number(
  process.env.OPENAI_TERRA_INPUT_USD_PER_MILLION_TOKENS ?? "2.5"
);
const OPENAI_TERRA_OUTPUT_USD_PER_MILLION_TOKENS = Number(
  process.env.OPENAI_TERRA_OUTPUT_USD_PER_MILLION_TOKENS ?? "15"
);
const SEEDANCE_2_0_USD_PER_SECOND = Number(
  process.env.SEEDANCE_2_0_USD_PER_SECOND ?? process.env.SEEDANCE_USD_PER_SECOND ?? "0.10"
);
const SEEDANCE_2_5_USD_PER_SECOND = process.env.SEEDANCE_2_5_USD_PER_SECOND == null
  ? null
  : Number(process.env.SEEDANCE_2_5_USD_PER_SECOND);
const ANTHROPIC_INPUT_USD_PER_MILLION_TOKENS = Number(
  process.env.ANTHROPIC_INPUT_USD_PER_MILLION_TOKENS ?? "2"
);
const ANTHROPIC_OUTPUT_USD_PER_MILLION_TOKENS = Number(
  process.env.ANTHROPIC_OUTPUT_USD_PER_MILLION_TOKENS ?? "10"
);
const NORMALIZED_TOKENS_PER_USD = Number(process.env.CHAPLIN_TOKENS_PER_USD ?? "1000");
const FALLBACK_USD_TO_INR = Number(process.env.USD_TO_INR_RATE ?? "96.45");

let cachedExchangeRate: { value: number; fetchedAt: number } | null = null;

async function usdToInrRate() {
  if (process.env.USD_TO_INR_RATE) return FALLBACK_USD_TO_INR;
  if (cachedExchangeRate && Date.now() - cachedExchangeRate.fetchedAt < 6 * 60 * 60 * 1000) {
    return cachedExchangeRate.value;
  }
  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR", {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    const data = (await response.json()) as { rates?: { INR?: number } };
    if (response.ok && Number.isFinite(data.rates?.INR)) {
      cachedExchangeRate = { value: Number(data.rates?.INR), fetchedAt: Date.now() };
      return cachedExchangeRate.value;
    }
  } catch {
    // Use the explicit fallback below when the exchange-rate service is unavailable.
  }
  return FALLBACK_USD_TO_INR;
}

function round(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export async function calculateGenerationBilling(input: {
  kind: string;
  provider?: string;
  model?: string;
  usage?: GenerationUsage;
  providerCostUsd?: number;
}): Promise<GenerationBilling> {
  const usage = input.usage ?? {};
  let costUsd = 0;
  let costMethod: GenerationBilling["costMethod"] = "rate-card-estimate";
  let pricingNote = "";

  if (Number.isFinite(input.providerCostUsd)) {
    costUsd = Number(input.providerCostUsd);
    costMethod = "provider";
    pricingNote = "Dollar cost returned by the provider.";
  } else if (input.kind === "voice-design") {
    costUsd = ((usage.inputCharacters ?? 0) / 1000) * ELEVEN_TTS_USD_PER_1K_CHARACTERS;
    pricingNote = `Estimated at $${ELEVEN_TTS_USD_PER_1K_CHARACTERS}/1K preview characters across all candidates.`;
  } else if (input.kind === "voice-lock") {
    costMethod = "no-charge";
    pricingNote = "Saving an already generated voice is treated as a no-charge operation.";
  } else if (input.kind === "dialogue") {
    const billableCharacters = usage.providerCredits ?? usage.inputCharacters ?? 0;
    costUsd = (billableCharacters / 1000) * ELEVEN_TTS_USD_PER_1K_CHARACTERS;
    pricingNote = `ElevenLabs v3 at $${ELEVEN_TTS_USD_PER_1K_CHARACTERS}/1K billable characters${usage.providerCredits == null ? " (input-character estimate)" : " using the provider's character-cost header"}.`;
  } else if (input.kind === "sfx") {
    costUsd = ((usage.durationSeconds ?? 0) / 60) * ELEVEN_SFX_USD_PER_MINUTE;
    pricingNote = `ElevenLabs Sound Effects rate-card estimate at $${ELEVEN_SFX_USD_PER_MINUTE}/minute.`;
  } else if (input.kind === "theme") {
    costUsd = ((usage.durationSeconds ?? 0) / 60) * ELEVEN_MUSIC_USD_PER_MINUTE;
    pricingNote = `ElevenLabs Music rate-card estimate at $${ELEVEN_MUSIC_USD_PER_MINUTE}/minute.`;
  } else if (input.kind === "gallery") {
    const provider = input.provider?.toLowerCase();
    if (provider === "openai") {
      costUsd = (usage.imageCount ?? 1) * OPENAI_IMAGE_USD_PER_IMAGE;
      pricingNote = `OpenAI ${input.model ?? "image"} rate-card estimate at $${OPENAI_IMAGE_USD_PER_IMAGE}/image; provider token usage is stored separately. Override with OPENAI_IMAGE_USD_PER_IMAGE when quality or size changes.`;
    } else if (provider === "openrouter") {
      costUsd = 0;
      pricingNote = "OpenRouter did not return a billed dollar amount. Token usage is stored, but cost remains zero rather than inventing a rate.";
    } else {
      costUsd = (usage.imageCount ?? 1) * SEEDREAM_USD_PER_IMAGE;
      pricingNote = `Seedream estimate at $${SEEDREAM_USD_PER_IMAGE}/image; override with SEEDREAM_USD_PER_IMAGE when your ModelArk contract differs.`;
    }
  } else if (input.kind === "video") {
    const is25 = /seedance-2-5|seedance-2\.5/i.test(input.model ?? "");
    const rate = is25 ? SEEDANCE_2_5_USD_PER_SECOND : SEEDANCE_2_0_USD_PER_SECOND;
    if (rate == null || !Number.isFinite(rate)) {
      costMethod = "unknown-rate";
      costUsd = 0;
      pricingNote = "Seedance 2.5 usage has no verified dollar rate. Configure SEEDANCE_2_5_USD_PER_SECOND from the actual ModelArk contract; no 1.8x estimate was invented.";
    } else {
      costUsd = (usage.durationSeconds ?? 0) * rate;
      pricingNote = `Seedance ${is25 ? "2.5" : "2.0/legacy"} estimate at $${rate}/second; use the model-specific rate environment variable when the ModelArk contract differs.`;
    }
  } else if (input.kind === "openai-prompt") {
    costUsd = ((usage.inputTokens ?? 0) / 1_000_000) * OPENAI_TERRA_INPUT_USD_PER_MILLION_TOKENS
      + ((usage.outputTokens ?? 0) / 1_000_000) * OPENAI_TERRA_OUTPUT_USD_PER_MILLION_TOKENS;
    pricingNote = `OpenAI GPT-5.6 Terra estimate at $${OPENAI_TERRA_INPUT_USD_PER_MILLION_TOKENS}/M input tokens and $${OPENAI_TERRA_OUTPUT_USD_PER_MILLION_TOKENS}/M output tokens; override the OpenAI Terra rate variables when pricing changes.`;
  } else if (input.kind === "anthropic-prompt") {
    costUsd = ((usage.inputTokens ?? 0) / 1_000_000) * ANTHROPIC_INPUT_USD_PER_MILLION_TOKENS
      + ((usage.outputTokens ?? 0) / 1_000_000) * ANTHROPIC_OUTPUT_USD_PER_MILLION_TOKENS;
    pricingNote = `Anthropic estimate at $${ANTHROPIC_INPUT_USD_PER_MILLION_TOKENS}/M input tokens and $${ANTHROPIC_OUTPUT_USD_PER_MILLION_TOKENS}/M output tokens; override the Anthropic rate variables when pricing changes.`;
  } else {
    costMethod = "no-charge";
    pricingNote = "No rate card is configured for this operation.";
  }

  const exchangeRate = await usdToInrRate();
  const roundedUsd = round(costUsd, 8);
  return {
    usage,
    providerCredits: Number.isFinite(usage.providerCredits) ? Number(usage.providerCredits) : null,
    normalizedTokens: Math.ceil(roundedUsd * NORMALIZED_TOKENS_PER_USD),
    costUsd: roundedUsd,
    usdToInrRate: round(exchangeRate, 6),
    costInr: round(roundedUsd * exchangeRate, 4),
    costMethod,
    pricingNote: `${pricingNote} Chaplin token normalization: ${NORMALIZED_TOKENS_PER_USD} tokens per USD.`,
  };
}

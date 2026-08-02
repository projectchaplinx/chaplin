import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { OpenAIInputMessage } from "@/lib/server/openai-responses";

/**
 * Claude fallback for the writing brain.
 *
 * OpenAI is the configured writing provider, but when its account runs out of
 * credits every Magic Write, actor generation, and identity measurement dies
 * with an opaque "try again". This transport lets those callers fall back to
 * Claude (claude-sonnet-5 by default, ANTHROPIC_MODEL to override) instead of
 * failing. It is a fallback, not a routing change: the pipeline configuration
 * still names OpenAI, and the guard that keeps the writing stage from being
 * *configured* onto Anthropic stays intact.
 */

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

let cachedClient: Anthropic | null = null;

export function anthropicFallbackAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * True when Claude should be tried FIRST rather than only after an OpenAI
 * failure. Set CHAPLIN_WRITING_PROVIDER=anthropic while the OpenAI account
 * is out of credits to skip the doomed round trip entirely.
 */
export function anthropicIsPrimaryWriter() {
  return process.env.CHAPLIN_WRITING_PROVIDER?.trim().toLowerCase() === "anthropic"
    && anthropicFallbackAvailable();
}

/** Provider failures that mean "OpenAI cannot serve anyone right now". */
export function isOpenAIOutOfService(status: number, message: string) {
  if (/no credits remaining|insufficient_quota|exceeded your current quota|billing/i.test(message)) return true;
  return status === 401 || status === 402 || status === 429;
}

function client() {
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

export function anthropicModel() {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

type AnthropicImageSource =
  | { type: "url"; url: string }
  | { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string };

function imageSource(imageUrl: string): AnthropicImageSource | null {
  const dataMatch = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/i.exec(imageUrl);
  if (dataMatch) {
    return {
      type: "base64",
      media_type: dataMatch[1].toLowerCase() as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: dataMatch[2],
    };
  }
  if (/^https?:\/\//i.test(imageUrl)) return { type: "url", url: imageUrl };
  return null;
}

function anthropicContent(message: OpenAIInputMessage): Anthropic.MessageParam["content"] {
  if (typeof message.content === "string") return message.content;
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const item of message.content) {
    if (item.type === "input_text") {
      blocks.push({ type: "text", text: item.text });
    } else if (item.type === "input_image") {
      const source = imageSource(item.image_url);
      if (source) blocks.push({ type: "image", source });
    }
  }
  return blocks.length ? blocks : "(empty)";
}

/*
  Anthropic structured outputs reject numeric, string-length, and array-count
  constraints (minItems, maxItems, minLength, pattern, minimum, ...) with a
  400 — schemas written for OpenAI's json_schema mode routinely carry them.
  Strip the unsupported keywords recursively; the semantic constraints are
  already restated in the prompt text, so the output shape still holds.
*/
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "minItems", "maxItems", "uniqueItems", "contains", "minContains", "maxContains",
  "minLength", "maxLength", "pattern",
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minProperties", "maxProperties", "patternProperties", "propertyNames",
  "default", "examples",
]);

export function sanitizeSchemaForAnthropic(schema: Record<string, unknown>): Record<string, unknown> {
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !UNSUPPORTED_SCHEMA_KEYWORDS.has(key))
        .map(([key, entry]) => [key, clean(entry)]),
    );
  };
  return clean(schema) as Record<string, unknown>;
}

/**
 * Runs the same request shape the OpenAI transport takes, on Claude.
 * With a schema, structured outputs guarantee the first text block is valid
 * JSON matching it — same contract the OpenAI json_schema path provided.
 * Failures are rethrown with a [CLAUDE-...] code so the UI can show exactly
 * what went wrong instead of a generic retry message.
 */
type AnthropicWritingRequest = {
  instructions: string;
  messages: OpenAIInputMessage[];
  maxOutputTokens: number;
  schema?: Record<string, unknown>;
  schemaName?: string;
};

function anthropicRequestBody(input: AnthropicWritingRequest) {
  // Non-streaming stays under SDK HTTP timeouts at ~16K; adaptive thinking on
  // claude-sonnet-5 shares max_tokens with the response text, so give the
  // caller's budget headroom rather than passing it through exactly.
  const maxTokens = Math.min(16000, Math.max(4096, input.maxOutputTokens + 6000));
  return {
    model: anthropicModel(),
    max_tokens: maxTokens,
    system: input.instructions,
    messages: input.messages.map((message) => ({
      role: message.role === "assistant" ? "assistant" as const : "user" as const,
      content: anthropicContent(message),
    })),
    ...(input.schema
      ? {
          output_config: {
            format: {
              type: "json_schema" as const,
              schema: sanitizeSchemaForAnthropic(input.schema),
            },
          },
        }
      : {}),
  };
}

function finishAnthropicResponse(response: Anthropic.Message) {
  if (response.stop_reason === "refusal") {
    throw new Error("[CLAUDE-REFUSAL] Claude declined this request for safety reasons.");
  }
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  if (!text) throw new Error("[CLAUDE-EMPTY] Claude returned no writing output.");
  if (response.stop_reason === "max_tokens") {
    throw new Error("[CLAUDE-TRUNCATED] Claude reached the output-token limit before finishing.");
  }
  return {
    text,
    id: response.id,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
    },
  };
}

function codedAnthropicError(error: unknown): Error {
  if (error instanceof Anthropic.APIError) {
    return new Error(`[CLAUDE-${error.status ?? "NET"}] ${error.message}`);
  }
  if (error instanceof Error && /^\[CLAUDE-/.test(error.message)) return error;
  return new Error(`[CLAUDE-UNKNOWN] ${error instanceof Error ? error.message : "Claude request failed."}`);
}

/**
 * Streaming variant: text deltas reach the caller as they generate, so the
 * studio's progressive field reveal works exactly as it did on OpenAI.
 */
export async function streamAnthropicResponse(
  input: AnthropicWritingRequest,
  onDelta: (delta: string) => void,
) {
  try {
    const stream = client().messages.stream(anthropicRequestBody(input));
    stream.on("text", (delta) => onDelta(delta));
    const response = await stream.finalMessage();
    return finishAnthropicResponse(response);
  } catch (error) {
    throw codedAnthropicError(error);
  }
}

export async function createAnthropicResponse(input: AnthropicWritingRequest) {
  try {
    const response = await client().messages.create(anthropicRequestBody(input));
    return finishAnthropicResponse(response);
  } catch (error) {
    throw codedAnthropicError(error);
  }
}

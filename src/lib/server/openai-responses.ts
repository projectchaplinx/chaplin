import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_OPENAI_WRITING_MODEL = "gpt-5.6-terra";

export type OpenAIInputContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "low" | "high" | "auto" };

export type OpenAIInputMessage = {
  role: "user" | "assistant";
  content: string | OpenAIInputContent[];
};

export type OpenAIResponseUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: Record<string, unknown>;
  output_tokens_details?: Record<string, unknown>;
};

export type OpenAIResponseData = {
  id?: string;
  status?: string;
  incomplete_details?: { reason?: string };
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: OpenAIResponseUsage;
  error?: { message?: string };
};

function imageMediaType(reference: string) {
  const pathname = reference.toLowerCase().split(/[?#]/, 1)[0];
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".gif")) return "image/gif";
  return "image/webp";
}

export async function openAIInputImage(
  reference: string,
  detail: "low" | "high" | "auto" = "low",
): Promise<OpenAIInputContent> {
  if (/^https?:\/\//i.test(reference) || /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(reference)) {
    return { type: "input_image", image_url: reference, detail };
  }
  if (!reference.startsWith("/")) throw new Error("Actor visual reference is not a valid image URL.");
  const publicRoot = path.resolve(process.cwd(), "public");
  const filePath = path.resolve(publicRoot, `.${reference}`);
  const relativePath = path.relative(publicRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Actor visual reference escaped the public directory.");
  }
  const bytes = await readFile(filePath);
  return {
    type: "input_image",
    image_url: `data:${imageMediaType(reference)};base64,${bytes.toString("base64")}`,
    detail,
  };
}

export function openAIWritingModel(configuredModel?: string | null) {
  const candidate = configuredModel?.trim();
  if (candidate?.startsWith("gpt-")) return candidate;
  return process.env.OPENAI_WRITING_MODEL?.trim() || DEFAULT_OPENAI_WRITING_MODEL;
}

export function openAIOutputText(data: OpenAIResponseData) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text ?? "")
    .join("")
    .trim();
}

export function openAIUsage(data: OpenAIResponseData) {
  const inputTokens = Number(data.usage?.input_tokens ?? 0);
  const outputTokens = Number(data.usage?.output_tokens ?? 0);
  return {
    inputTokens,
    outputTokens,
    providerTokens: inputTokens + outputTokens,
    providerUsage: data.usage ?? {},
  };
}

export function buildOpenAIResponseBody(input: {
  model: string;
  instructions: string;
  messages: OpenAIInputMessage[];
  maxOutputTokens: number;
  schema?: Record<string, unknown>;
  schemaName?: string;
  stream?: boolean;
}) {
  return {
    model: input.model,
    instructions: input.instructions,
    input: input.messages,
    max_output_tokens: input.maxOutputTokens,
    reasoning: { effort: "none" },
    store: false,
    stream: input.stream === true,
    ...(input.schema
      ? {
          text: {
            format: {
              type: "json_schema",
              name: input.schemaName ?? "chaplin_output",
              strict: true,
              schema: input.schema,
            },
          },
        }
      : {}),
  };
}

export async function requestOpenAIResponse(input: Parameters<typeof buildOpenAIResponseBody>[0]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildOpenAIResponseBody(input)),
    signal: AbortSignal.timeout(90_000),
    cache: "no-store",
  });
}

export async function createOpenAIResponse(input: Parameters<typeof buildOpenAIResponseBody>[0]) {
  const response = await requestOpenAIResponse(input);
  const data = await response.json() as OpenAIResponseData;
  if (!response.ok) throw new Error(data.error?.message || `OpenAI returned ${response.status}.`);
  if (data.status === "incomplete") {
    throw new Error(data.incomplete_details?.reason === "max_output_tokens"
      ? "OpenAI reached the output-token limit."
      : "OpenAI returned an incomplete response.");
  }
  const text = openAIOutputText(data);
  if (!text) throw new Error("OpenAI returned no writing output.");
  return { response, data, text, usage: openAIUsage(data) };
}

type LegacyContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "input_text"; text: string }
      | { type: "input_image"; image_url: string; detail?: "low" | "high" | "auto" }
      | {
          type: "image";
          source:
            | { type: "url"; url: string }
            | { type: "base64"; media_type: string; data: string };
        }
    >;

function convertLegacyContent(content: LegacyContent): string | OpenAIInputContent[] {
  if (typeof content === "string") return content;
  return content.map((item): OpenAIInputContent => {
    if (item.type === "text" || item.type === "input_text") {
      return { type: "input_text", text: item.text };
    }
    if (item.type === "input_image") {
      return { type: "input_image", image_url: item.image_url, detail: item.detail ?? "low" };
    }
    return {
      type: "input_image",
      image_url: item.source.type === "url"
        ? item.source.url
        : `data:${item.source.media_type};base64,${item.source.data}`,
      detail: "low",
    };
  });
}

/**
 * Temporary compatibility bridge for Chaplin's existing message routes.
 * It accepts their former message-shaped request object, sends the work only
 * to OpenAI Responses, and returns the old response envelope so downstream
 * parsing and streaming UI can migrate without a product regression.
 */
export async function requestOpenAIFromLegacyMessages(options: RequestInit) {
  const legacy = JSON.parse(String(options.body ?? "{}")) as {
    model?: string;
    max_tokens?: number;
    system?: string;
    messages?: Array<{ role?: string; content?: LegacyContent }>;
    output_config?: { format?: { schema?: Record<string, unknown> } };
    stream?: boolean;
  };
  const model = openAIWritingModel(legacy.model);
  const result = await createOpenAIResponse({
    model,
    instructions: legacy.system ?? "",
    messages: (legacy.messages ?? []).map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: convertLegacyContent(message.content ?? ""),
    })),
    maxOutputTokens: Math.max(1, Number(legacy.max_tokens ?? 2000)),
    schema: legacy.output_config?.format?.schema,
    schemaName: legacy.output_config?.format?.schema ? "chaplin_output" : undefined,
  });
  const headers = new Headers({
    "content-type": legacy.stream ? "text/event-stream" : "application/json",
    "request-id": result.data.id ?? "",
  });
  if (legacy.stream) {
    const events = [
      { type: "message_start", message: { usage: { input_tokens: result.usage.inputTokens } } },
      { type: "content_block_delta", delta: { type: "text_delta", text: result.text } },
      { type: "message_delta", usage: { output_tokens: result.usage.outputTokens } },
    ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
    return new Response(events, { status: 200, headers });
  }
  return Response.json({
    content: [{ type: "text", text: result.text }],
    usage: {
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
    },
    stop_reason: result.data.status === "completed" ? "end_turn" : result.data.status,
  }, { headers });
}

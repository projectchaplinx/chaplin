import { loadEnvConfig } from "@next/env";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

type CliArgs = Record<string, string>;

function parseArgs(values: string[]) {
  const args: CliArgs = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    args[key] = next;
    index += 1;
  }
  return args;
}

function positiveNumber(value: string | undefined, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be greater than zero.`);
  return parsed;
}

function imageMediaType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  throw new Error("Contact sheet must be PNG, JPEG, or WebP.");
}

function outputText(data: Record<string, unknown>) {
  if (typeof data.output_text === "string") return data.output_text;
  const output = Array.isArray(data.output) ? data.output : [];
  return output
    .flatMap((item) => item && typeof item === "object" && Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : [])
    .filter((item): item is { type: string; text: string } => Boolean(
      item && typeof item === "object" && (item as { type?: unknown }).type === "output_text" && typeof (item as { text?: unknown }).text === "string",
    ))
    .map((item) => item.text)
    .join("");
}

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    workTitle: { type: "string" },
    samplingLimitations: { type: "string" },
    cells: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          approximateSecond: { type: "number" },
          visibleEvidence: { type: "string" },
          framing: { type: "string" },
          blocking: { type: "string" },
          lighting: { type: "string" },
          pressureEvidence: { type: "string" },
        },
        required: ["index", "approximateSecond", "visibleEvidence", "framing", "blocking", "lighting", "pressureEvidence"],
      },
    },
    recommendedPassages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          startSecond: { type: "number" },
          durationSeconds: { type: "number" },
          reason: { type: "string" },
          visualEvidence: { type: "string" },
          reviewQuestions: { type: "array", items: { type: "string" } },
        },
        required: ["startSecond", "durationSeconds", "reason", "visualEvidence", "reviewQuestions"],
      },
    },
  },
  required: ["workTitle", "samplingLimitations", "cells", "recommendedPassages"],
} as const;

async function main() {
  loadEnvConfig(process.cwd());
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing.");
  const args = parseArgs(process.argv.slice(2));
  const imageArg = args.image?.trim();
  const workTitle = args.work?.trim();
  if (!imageArg) throw new Error("Pass --image with a contact-sheet path inside this repository.");
  if (!workTitle) throw new Error("Pass --work with the rights-cleared work title.");
  const intervalSeconds = positiveNumber(args.interval, "--interval");
  const rows = positiveNumber(args.rows, "--rows");
  const columns = positiveNumber(args.columns, "--columns");
  const imagePath = path.resolve(process.cwd(), imageArg);
  const relative = path.relative(process.cwd(), imagePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Contact sheet must stay inside the Chaplin repository.");
  }
  const mediaType = imageMediaType(imagePath);
  const file = await stat(imagePath);
  if (!file.isFile() || file.size > 10 * 1024 * 1024) throw new Error("Contact sheet must be a file no larger than 10 MB.");
  const bytes = await readFile(imagePath);
  const focus = args.focus?.trim() || "story change, framing, blocking, lighting, geography, edit opportunities, and visible pressure";
  const model = args.model?.trim() || process.env.OPENAI_WRITING_MODEL?.trim() || "gpt-5.6-terra";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      instructions: "You assist a rights-aware film-craft research ledger. Record observable visual evidence only. Do not quote dialogue, reproduce subtitles, infer protected screenplay text, identify performers from appearance, or claim sound evidence from a still image. Treat every result as a draft requiring human verification.",
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Analyze this ${rows} by ${columns} contact sheet for ${workTitle}. Cells run left-to-right, top-to-bottom, sampled every ${intervalSeconds} seconds starting near zero. Focus on ${focus}. Describe only what is visibly supported, state sampling limitations, and recommend three 90-second passages for direct image-and-sound review.`,
          },
          {
            type: "input_image",
            image_url: `data:${mediaType};base64,${bytes.toString("base64")}`,
            detail: "high",
          },
        ],
      }],
      max_output_tokens: 7000,
      reasoning: { effort: "none" },
      text: {
        format: {
          type: "json_schema",
          name: "director_contact_sheet_analysis",
          strict: true,
          schema: ANALYSIS_SCHEMA,
        },
      },
      store: false,
    }),
  });
  const data = await response.json() as Record<string, unknown> & { error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `OpenAI returned ${response.status}.`);
  const text = outputText(data);
  if (!text) throw new Error("OpenAI returned no contact-sheet analysis.");
  const parsed = JSON.parse(text) as Record<string, unknown>;
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model,
    humanReviewRequired: true,
    ...parsed,
  }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

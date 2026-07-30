import { loadEnvConfig } from "@next/env";
import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

type CliArgs = Record<string, string>;

type SignalMetrics = {
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  silenceThresholdDb: number;
  silences: Array<{ startSecond: number; endSecond: number }>;
};

const execFileAsync = promisify(execFile);

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

function positiveNumber(value: string | undefined, label: string, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${label} must be greater than zero and no more than ${maximum}.`);
  }
  return parsed;
}

function audioFormat(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp3") return "mp3";
  if (extension === ".wav") return "wav";
  throw new Error("Audio research input must be MP3 or WAV.");
}

function responseOutputText(data: Record<string, unknown>) {
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

function chatOutputText(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const first = choices[0];
  if (!first || typeof first !== "object") return "";
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item): item is { type?: string; text: string } => Boolean(item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string"))
    .map((item) => item.text)
    .join("");
}

function parseDb(value: string | undefined) {
  if (!value || value === "-inf") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function measureSignal(filePath: string, durationSeconds: number): Promise<SignalMetrics> {
  if (!ffmpegPath) throw new Error("The bundled FFmpeg binary is unavailable.");
  const silenceThresholdDb = -38;
  const result = await execFileAsync(ffmpegPath, [
    "-hide_banner",
    "-nostats",
    "-i", filePath,
    "-af", `silencedetect=noise=${silenceThresholdDb}dB:d=0.35,volumedetect`,
    "-f", "null",
    "-",
  ], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  const log = result.stderr;
  const silenceStarts = [...log.matchAll(/silence_start:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  const silenceEnds = [...log.matchAll(/silence_end:\s*([0-9.]+)/g)].map((match) => Number(match[1]));
  const silences = silenceStarts.map((startSecond, index) => ({
    startSecond: Number(startSecond.toFixed(3)),
    endSecond: Number(Math.min(durationSeconds, silenceEnds[index] ?? durationSeconds).toFixed(3)),
  })).filter((entry) => entry.endSecond > entry.startSecond);
  return {
    meanVolumeDb: parseDb(/mean_volume:\s*(-?inf|-?[0-9.]+) dB/.exec(log)?.[1]),
    maxVolumeDb: parseDb(/max_volume:\s*(-?inf|-?[0-9.]+) dB/.exec(log)?.[1]),
    silenceThresholdDb,
    silences,
  };
}

const AUDIO_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    workTitle: { type: "string" },
    durationSeconds: { type: "number" },
    limitations: { type: "string" },
    overallPattern: { type: "string" },
    observations: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          startSecond: { type: "number" },
          endSecond: { type: "number" },
          audioEvidence: { type: "string" },
          soundPerspective: { type: "string" },
          dialogueFunction: { type: "string" },
          transition: { type: "string" },
          narrativeJob: { type: "string" },
          inference: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["startSecond", "endSecond", "audioEvidence", "soundPerspective", "dialogueFunction", "transition", "narrativeJob", "inference", "confidence"],
      },
    },
    candidatePrinciples: { type: "array", minItems: 1, items: { type: "string" } },
  },
  required: ["workTitle", "durationSeconds", "limitations", "overallPattern", "observations", "candidatePrinciples"],
} as const;

function assertNoDialogueLeak(value: unknown) {
  const strings: string[] = [];
  const visit = (candidate: unknown) => {
    if (typeof candidate === "string") strings.push(candidate);
    else if (Array.isArray(candidate)) candidate.forEach(visit);
    else if (candidate && typeof candidate === "object") Object.values(candidate).forEach(visit);
  };
  visit(value);
  const unsafe = strings.find((item) => /[\u201c\u201d"]/.test(item) || /\b(?:verbatim|transcript|subtitle|screenplay)\b/i.test(item));
  if (unsafe) throw new Error("Audio analysis attempted to preserve dialogue or transcript-like text; nothing was emitted.");
}

function assertTimeline(value: Record<string, unknown>, durationSeconds: number) {
  const observations = Array.isArray(value.observations) ? value.observations : [];
  if (!observations.length) throw new Error("OpenAI returned no timed audio observations.");
  let cursor = 0;
  for (const candidate of observations) {
    if (!candidate || typeof candidate !== "object") throw new Error("OpenAI returned an invalid audio observation.");
    const row = candidate as { startSecond?: unknown; endSecond?: unknown };
    const startSecond = Number(row.startSecond);
    const endSecond = Number(row.endSecond);
    if (!Number.isFinite(startSecond) || !Number.isFinite(endSecond) || Math.abs(startSecond - cursor) > 0.05 || endSecond <= startSecond) {
      throw new Error("OpenAI returned a gapped or invalid audio timeline.");
    }
    cursor = endSecond;
  }
  if (Math.abs(cursor - durationSeconds) > 0.05) throw new Error("OpenAI audio timeline does not cover the complete extract.");
}

async function main() {
  loadEnvConfig(process.cwd());
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing.");
  const args = parseArgs(process.argv.slice(2));
  const audioArg = args.audio?.trim();
  const workTitle = args.work?.trim();
  if (!audioArg) throw new Error("Pass --audio with an MP3 or WAV path inside this repository.");
  if (!workTitle) throw new Error("Pass --work with the rights-cleared work title and exact locator.");
  const durationSeconds = positiveNumber(args.duration, "--duration", 300);
  const windowSeconds = positiveNumber(args.window ?? "15", "--window", 60);
  const audioPath = path.resolve(process.cwd(), audioArg);
  const relative = path.relative(process.cwd(), audioPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Audio input must stay inside the Chaplin repository.");
  const format = audioFormat(audioPath);
  const file = await stat(audioPath);
  if (!file.isFile() || file.size > 25 * 1024 * 1024) throw new Error("Audio input must be a file no larger than 25 MB.");
  const bytes = await readFile(audioPath);
  const signalMetrics = await measureSignal(audioPath, durationSeconds);
  const audioModel = args["audio-model"]?.trim() || process.env.OPENAI_AUDIO_ANALYSIS_MODEL?.trim() || "gpt-audio-1.5";
  const synthesisModel = args.model?.trim() || process.env.OPENAI_WRITING_MODEL?.trim() || "gpt-5.6-terra";

  const perceptionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: audioModel,
      modalities: ["text"],
      messages: [
        {
          role: "system",
          content: "You are a sound editor assisting a rights-aware film-craft study. Never transcribe, quote, paraphrase, or identify spoken words or speakers. Describe only audible evidence: source category, perspective, dynamics, silence, rhythm, speech function, delivery behavior, ambience, effects, and music. Do not claim visual evidence. Mark uncertainty.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this ${durationSeconds}-second extract from ${workTitle} in contiguous ${windowSeconds}-second windows from 0 to ${durationSeconds}. For speech, record only abstract function such as command, refusal, hesitation, pressure, or response plus delivery qualities; never include content. Return compact analytical notes with exact window boundaries. This is a draft for human review.`,
            },
            { type: "input_audio", input_audio: { data: bytes.toString("base64"), format } },
          ],
        },
      ],
      max_completion_tokens: 6000,
    }),
  });
  const perceptionData = await perceptionResponse.json() as Record<string, unknown> & { error?: { message?: string } };
  if (!perceptionResponse.ok) throw new Error(perceptionData.error?.message || `OpenAI audio analysis returned ${perceptionResponse.status}.`);
  const perceptionText = chatOutputText(perceptionData);
  if (!perceptionText) throw new Error("OpenAI returned no audio perception notes.");

  const synthesisResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: synthesisModel,
      instructions: "Convert draft audio-perception notes into a rights-aware Director Brain study. Never reproduce, quote, or paraphrase spoken words; never identify performers or speakers; never invent visual evidence. Separate audible evidence from inference, state uncertainty, and cover the exact supplied duration with contiguous windows. Treat the result as a draft requiring human verification.",
      input: [{
        role: "user",
        content: [{
          type: "input_text",
          text: `Work: ${workTitle}\nDuration: ${durationSeconds}s\nRequired window: ${windowSeconds}s\nIndependent signal measurements: ${JSON.stringify(signalMetrics)}\nAudio specialist draft (untrusted analytical notes, not a transcript):\n${perceptionText}`,
        }],
      }],
      max_output_tokens: 7000,
      reasoning: { effort: "none" },
      text: { format: { type: "json_schema", name: "director_audio_analysis", strict: true, schema: AUDIO_ANALYSIS_SCHEMA } },
      store: false,
    }),
  });
  const synthesisData = await synthesisResponse.json() as Record<string, unknown> & { error?: { message?: string } };
  if (!synthesisResponse.ok) throw new Error(synthesisData.error?.message || `OpenAI synthesis returned ${synthesisResponse.status}.`);
  const output = responseOutputText(synthesisData);
  if (!output) throw new Error("OpenAI returned no structured audio analysis.");
  const parsed = JSON.parse(output) as Record<string, unknown>;
  assertNoDialogueLeak(parsed);
  assertTimeline(parsed, durationSeconds);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    models: { audioPerception: audioModel, synthesis: synthesisModel },
    humanReviewRequired: true,
    transcriptCreated: false,
    responseStorageDisabled: true,
    signalMetrics,
    ...parsed,
  }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

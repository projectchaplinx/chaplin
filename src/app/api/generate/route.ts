import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  beginGeneration,
  completeGeneration,
  failGeneration,
  getCharacterProviderHealth,
  getCharacterProductionState,
  saveCharacterVoice,
  saveMediaAsset,
  saveRemoteMediaAsset,
  listCharacters,
  listActiveVoiceIds,
  getSupabaseAdminClient,
  selectCharacterSfxAsset,
} from "@/lib/server/supabase-admin";
import { calculateGenerationBilling } from "@/lib/server/billing";
import { generationCreditAllocation } from "@/lib/credits";
import type { Character } from "@/lib/types";
import {
  MIN_VOICE_DESIGN_CHARACTERS,
  voiceDesignAuditionText,
} from "@/lib/voice-preview";
import { dialogueForSpeech } from "@/lib/dialogue-performance";
import {
  settingBoolean,
  settingNumber,
  settingString,
  normalizePipelineConfig,
  type PipelineStageConfig,
  type PipelineStageId,
} from "@/lib/pipeline-config";
import { getPipelineConfig } from "@/lib/server/pipeline-config";
import { requireOwnedCharacter, requireRequestIdentity } from "@/lib/server/auth";
import {
  authorizeDirectorSprintGeneration,
  finishDirectorSprintDecisionTrace,
  startDirectorSprintDecisionTrace,
} from "@/lib/server/director-sprint-test";
import {
  assertRequestBodySize,
  enforceRateLimit,
  securityErrorStatus,
} from "@/lib/server/request-security";
import { assertPromptConsistency, readCharacterCardV2 } from "@/lib/character-card";
import {
  assertSignatureSfxPrompt,
  assertThemePromptV2,
  composeCharacterSignatureSfxEvents,
  composeSignatureSfxEventPrompt,
  isThemeDurationPreset,
  withThemeDurationDirection,
} from "@/lib/production-prompting";
import { assembleSignatureSfx } from "@/lib/server/signature-sfx";
import { measureStoredAudioMs } from "@/lib/server/ad-board-media";
import { enforceThemeDuration } from "@/lib/server/audio-postprocess";
import {
  prepareSeedanceAudioPrompt,
  seedanceAudioCapability,
  seedanceSupportsAudioReference,
} from "@/lib/seedance-audio";
import { resolveAudioScene } from "@/lib/audio-scene";
import {
  audioPlanUsesNative,
  buildAudioSceneBlock,
  lintAudioPlan,
  resolveAudioPlan,
  type AudioPlan,
} from "@/lib/audio-plan";
import {
  buildElevenMusicRequest,
  buildThemePlan,
  themePlanTargetMilliseconds,
  type ThemePlanKind,
} from "@/lib/theme-composition-plan";
import { compactVisualDirection, requestsStylizedImage } from "@/lib/prompt-compaction";
import { bannedPromptWord, finalizeVideoPrompt, withStandingInjections } from "@/lib/prompt-standards";
import { budgetVideoPrompt, motionGrammarIssues } from "@/lib/video-prompt-budget";
import { injectStyleContract } from "@/lib/style-contract";
import { providerScheduler } from "@/lib/provider-scheduler";
import { cropCharacterSheet } from "@/lib/server/character-sheet-crop";
import { buildPromptHandoff } from "@/lib/prompt-handoff";
import { PromptLintError } from "@/lib/prompt-lint";
import {
  buildAnatomyRetryDirection,
  parseSceneImageAnatomyReview,
  SCENE_IMAGE_ANATOMY_REVIEW_INSTRUCTIONS,
  SCENE_IMAGE_ANATOMY_SCHEMA,
  type SceneImageAnatomyReview,
} from "@/lib/image-anatomy";
import {
  createOpenAIResponse,
  openAIInputImage,
  openAIWritingModel,
} from "@/lib/server/openai-responses";
import {
  reclaimableChaplinVoices,
  reclaimableOwnedChaplinVoices,
  supersededChaplinVoices,
  type ElevenLabsVoiceSummary,
} from "@/lib/elevenlabs-voices";
import { deleteElevenLabsVoice } from "@/lib/server/elevenlabs";
import { elevenLabsApiKey } from "@/lib/elevenlabs-config";
import {
  adBoardSchema,
  assertAdSlotQueueable,
  renderResolution,
  stripForwardTargetFrameLanguage,
  type AdSlot,
  type RenderTier,
} from "@/lib/ad-board";

export const runtime = "nodejs";
export const maxDuration = 300;

const ELEVEN_ROOT = "https://api.elevenlabs.io";
const ELEVEN_API = `${ELEVEN_ROOT}/v1`;
const MODEL_ARK_API = "https://ark.ap-southeast.bytepluses.com/api/v3";
/** Marker so a caller can tell an orphaned voice from any other provider error. */
export const ORPHANED_VOICE = "ORPHANED_VOICE";
const OPENROUTER_IMAGE_API = "https://openrouter.ai/api/v1/images";
const OPENAI_IMAGE_API = "https://api.openai.com/v1/images";
const DIALOGUE_MODEL = "eleven_multilingual_v2";
const DIALOGUE_VOICE_SETTINGS = {
  stability: 0.78,
  similarity_boost: 0.9,
  style: 0,
  use_speaker_boost: true,
};

type Input = Record<string, unknown>;

class RequestValidationError extends Error {}

class ElevenLabsRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(message);
  }
}

function text(input: Input, key: string, min = 1, max = 4000) {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length < min || value.length > max) {
    throw new RequestValidationError(`${key} must be between ${min} and ${max} characters.`);
  }
  return value.trim();
}

function elevenKey() {
  return elevenLabsApiKey();
}

function modelArkKey() {
  const key = process.env.SEEDANCE_API_KEY ?? process.env.SEEDREAM_API_KEY;
  if (!key) {
    throw new Error("SEEDANCE_API_KEY (or SEEDREAM_API_KEY) is not configured.");
  }
  return key;
}

function requireStage(stage: PipelineStageConfig, label: string) {
  if (!stage.enabled) throw new Error(`${label} generation is paused by Super Admin.`);
}

function stageForGenerationAction(action: string): PipelineStageId | null {
  if (["voice-design", "voice-save", "speech"].includes(action)) return "voice";
  if (action === "sfx" || action === "signature-sfx") return "sfx";
  if (action === "theme") return "theme";
  if (action === "image") return "image";
  if (action === "video") return "video";
  return null;
}

function directedPrompt(stage: PipelineStageConfig, prompt: string) {
  return [stage.promptPrelude.trim(), prompt.trim()].filter(Boolean).join("\n\n");
}

function mediaPromptWarnings(character: Character | undefined, prompt: string, target: "image" | "video") {
  const card = readCharacterCardV2(character?.cardV2);
  return card ? assertPromptConsistency(prompt, card, target) : [];
}

const REALISM_DIRECTION = "OUTPUT MEDIUM: A visually striking live-action cinematic photograph of a real human being, captured through a physical camera and lens. Preserve natural facial asymmetry, pores, fine hair, believable hands, tactile fabric, grounded body weight, physically plausible light, optical depth, and restrained film grain. Do not render an illustration, cartoon, anime frame, digital painting, 3D render, CGI character, doll, or wax figure.";
const REALISM_NEGATIVE = "cartoon, anime, illustration, digital painting, concept art, 3D render, CGI character, game art, doll-like face, wax figure, airbrushed skin, synthetic skin, over-smoothed face";

/**
 * Provider refusals that are prompt-shaped rather than infrastructural. These are
 * recoverable: the same shot usually renders once the phrasing that tripped the
 * filter is softened. Anything else (auth, quota, network) must still fail fast.
 */
function isSafetyRejection(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /safety system|safety guidelines|blocked_generation|may contain real person|content[ _]policy|rejected by the safety/i.test(message);
}

/**
 * Escalating softening passes. Attempt 1 removes real-person framing (the
 * BytePlus "input image may contain real person" trigger); attempt 2 also
 * neutralises depicted violence, which is what OpenAI's filter rejects on fight
 * beats. Identity locks and scene structure are deliberately left intact.
 */
function softenPromptForSafety(prompt: string, attempt: number) {
  let softened = prompt;
  if (attempt >= 1) {
    softened = softened
      .replace(/\breal human being\b/gi, "original fictional character")
      .replace(/\breal (?:human|person|people)\b/gi, "fictional character")
      .replace(/\bphotoreal(?:istic)?\b/gi, "naturalistic")
      .replace(/\blive[- ]action\b/gi, "cinematic")
      .replace(/\bcelebrity likeness\b/gi, "recognisable likeness");
  }
  if (attempt >= 2) {
    softened = softened
      .replace(/\b(?:punch(?:es|ing)?|strike[sd]?|blood(?:y)?|weapon|knife|gun|violence|violent|fight(?:s|ing)?)\b/gi, "confrontation")
      .replace(/^CONTACT:.*$/gm, "CONTACT: Stage the confrontation as held tension, braced stances, and blocked movement. Do not depict impact or injury.");
  }
  return softened;
}

const MAX_IMAGE_ATTEMPTS = 3;
const MAX_ANATOMY_ATTEMPTS = 3;

/**
 * Scene audio direction.
 *
 * The video prompts were written for silent motion plates, because dialogue,
 * signature SFX, and theme are produced as separate stems and mixed in
 * assembly. Simply switching Seedance's generate_audio on would leave the model
 * with contradictory instructions — the request asks for sound while the prompt
 * demands silence — and any speech it invented would not be the actor's locked
 * voice, which is the one thing a persistent AI actor cannot afford to lose.
 *
 * So when audio is enabled the silent-plate directives are replaced with a
 * diegetic-only brief: the model supplies room tone, foley, and weather, while
 * spoken words and score stay with the locked voice and character theme.
 */
const REPLICATE_API = "https://api.replicate.com/v1";

/** Replicate's own docs call this a token; the deployment stores it as a key. */
function replicateToken() {
  return process.env.REPLICATE_API_KEY ?? process.env.REPLICATE_API_TOKEN;
}

/**
 * Open-weights video fallbacks. Every commercial image-to-video vendor
 * (Seedance, Kling, Runway, Veo, Sora) sits behind a face-detection layer that
 * refuses a photoreal human seed image — which is exactly what a Chaplin
 * identity still is. Running open weights on a GPU host removes that layer
 * entirely: there is no vendor policy between the request and the model.
 *
 * Input field names differ per model and change as models are revised, so the
 * mapping is configuration rather than code. Override the video stage's
 * `replicateFallbacks` setting with a JSON array to retarget without a deploy.
 */
type ReplicateFallback = {
  model: string;
  imageField?: string;
  promptField?: string;
  input?: Record<string, unknown>;
};

/*
  Field names verified against each model's live OpenAPI schema, not guessed.
  Duration is expressed in FRAMES, not seconds, and differs per model:
    wan-2.2-i2v-fast  num_frames  81-121 (81 recommended)  resolution 480p|720p
    ltx-video         length      default 97               target_size 640
  480p keeps the rescue path cheaper than the primary provider; raise it in the
  video stage's `replicateFallbacks` setting if quality matters more than cost.
  Deliberately excludes tencent/hunyuan-video (text-to-video only, no image
  input) and kwaivgi/kling-* (same vendor face filter this path exists to avoid).
*/
const DEFAULT_REPLICATE_FALLBACKS: ReplicateFallback[] = [
  {
    model: "wan-video/wan-2.2-i2v-fast",
    imageField: "image",
    promptField: "prompt",
    input: { resolution: "480p", num_frames: 81 },
  },
  { model: "lightricks/ltx-video", imageField: "image", promptField: "prompt" },
];

function replicateFallbacks(stage: PipelineStageConfig): ReplicateFallback[] {
  const raw = settingString(stage, "replicateFallbacks", "").trim();
  if (!raw) return DEFAULT_REPLICATE_FALLBACKS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_REPLICATE_FALLBACKS;
    const entries = parsed.filter((entry): entry is ReplicateFallback =>
      Boolean(entry) && typeof (entry as ReplicateFallback).model === "string");
    return entries.length ? entries : DEFAULT_REPLICATE_FALLBACKS;
  } catch {
    // A malformed override must not silently disable the fallback entirely.
    return DEFAULT_REPLICATE_FALLBACKS;
  }
}

async function replicateVideo(input: {
  entry: ReplicateFallback;
  prompt: string;
  imageUrl: string;
  pollIntervalMs: number;
  maximumPolls: number;
}) {
  const token = replicateToken();
  if (!token) throw new Error("REPLICATE_API_KEY (or REPLICATE_API_TOKEN) is not configured.");
  const body: Record<string, unknown> = {
    [input.entry.promptField ?? "prompt"]: input.prompt,
    ...(input.entry.input ?? {}),
  };
  // Replicate fetches the reference itself, so the public storage URL is passed
  // straight through rather than being inlined as base64.
  if (input.imageUrl) body[input.entry.imageField ?? "image"] = input.imageUrl;

  const created = await fetch(`${REPLICATE_API}/models/${input.entry.model}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Hold the connection briefly so short renders return without any polling.
      Prefer: "wait",
    },
    body: JSON.stringify({ input: body }),
  });
  let prediction = await created.json() as {
    id?: string; status?: string; output?: unknown; error?: string; detail?: string;
    metrics?: Record<string, unknown>; urls?: { get?: string };
  };
  if (!created.ok) {
    throw new Error(`Replicate ${input.entry.model} returned ${created.status}: ${prediction.detail ?? prediction.error ?? "unknown error"}`);
  }
  const predictionId = prediction.id;
  if (!predictionId) throw new Error(`Replicate ${input.entry.model} did not return a prediction id.`);
  // Replicate returns the canonical poll URL; prefer it over rebuilding one.
  const pollUrl = prediction.urls?.get ?? `${REPLICATE_API}/predictions/${encodeURIComponent(predictionId)}`;

  for (let attempt = 0; attempt < input.maximumPolls; attempt += 1) {
    if (["succeeded", "failed", "canceled"].includes(String(prediction.status))) break;
    await new Promise((resolve) => setTimeout(resolve, input.pollIntervalMs));
    const poll = await fetch(pollUrl, { headers: { Authorization: `Bearer ${token}` } });
    prediction = await poll.json() as typeof prediction;
  }
  if (prediction.status !== "succeeded") {
    throw new Error(prediction.error ?? `Replicate ${input.entry.model} ${prediction.status ?? "timed out"}.`);
  }
  // Models return either a single URL or a list of frames/renditions.
  const output = prediction.output;
  const videoUrl = Array.isArray(output) ? output[output.length - 1] : output;
  if (typeof videoUrl !== "string") {
    throw new Error(`Replicate ${input.entry.model} completed without returning a video URL.`);
  }
  return { videoUrl, taskId: predictionId, usage: prediction.metrics, requestId: predictionId };
}

function visualGenerationPrompt(stage: PipelineStageConfig, prompt: string, kind: "image" | "video") {
  if (kind === "video") return compactVisualDirection(prompt, kind);
  const stylized = requestsStylizedImage(prompt);
  const explicitStyle = stylized
    ? prompt.split(/[\n.!?;]/).map((clause) => clause.trim()).find((clause) => requestsStylizedImage(clause))
    : "";
  const medium = stylized
    ? `OUTPUT MEDIUM: Preserve this explicit style consistently: ${explicitStyle?.slice(0, 180) || "the requested stylized medium"}. Do not drift into photorealism or an unrelated visual language.`
    : REALISM_DIRECTION;
  const brief = compactVisualDirection(prompt, kind);
  const adminDirection = stage.promptPrelude.replace(/\s+/g, " ").trim().slice(0, 400);
  return [medium, brief, adminDirection].filter(Boolean).join("\n\n");
}

function imageGenerationPrompt(stage: PipelineStageConfig, prompt: string) {
  return visualGenerationPrompt(stage, prompt, "image");
}

function providerPrompt(stage: PipelineStageConfig, prompt: string, maximumCharacters: number) {
  const direction = prompt.replace(/\s+/g, " ").trim();
  const adminDirection = stage.promptPrelude.replace(/\s+/g, " ").trim();
  return [direction, adminDirection]
    .filter(Boolean)
    .join(" ")
    .slice(0, maximumCharacters)
    .trim();
}

function voiceDesignDescription(stage: PipelineStageConfig, description: string) {
  const direction = description.replace(/\s+/g, " ").trim();
  const adminDirection = stage.promptPrelude.replace(/\s+/g, " ").trim();
  return [direction, adminDirection].filter(Boolean).join(" ").slice(0, 1000).trim();
}

async function modelArk(pathname: string, body?: object) {
  const response = await fetch(`${MODEL_ARK_API}${pathname}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${modelArkKey()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const error = data?.error as { message?: string; code?: string } | undefined;
    throw new Error(
      `BytePlus ModelArk returned ${response.status}: ${error?.message ?? error?.code ?? "Unknown provider error"}`
    );
  }
  return {
    data: data ?? {},
    requestId: response.headers.get("x-request-id") ?? response.headers.get("request-id"),
  };
}

function headerNumber(response: Response, name: string) {
  const raw = response.headers.get(name);
  if (raw == null || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function stableVoiceSeed(characterId: string) {
  let hash = 2166136261;
  for (const character of characterId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function recordNumber(record: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(record?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

async function eleven(pathname: string, body: Record<string, unknown>) {
  const key = elevenKey();
  if (!key) throw new Error("ELEVEN_LABS_API_KEY is not configured.");
  const effectiveBody = { ...body };
  if (pathname.startsWith("/text-to-voice/design")) {
    const auditionText = typeof effectiveBody.text === "string" ? effectiveBody.text.trim() : "";
    effectiveBody.text = auditionText.length >= MIN_VOICE_DESIGN_CHARACTERS
      ? auditionText
      : voiceDesignAuditionText(auditionText);
    if (String(effectiveBody.text).length < MIN_VOICE_DESIGN_CHARACTERS) {
      throw new Error("Voice audition preparation failed to meet ElevenLabs' 100-character minimum.");
    }
  }
  if (pathname.startsWith("/sound-generation")) {
    const soundDescription = typeof effectiveBody.text === "string"
      ? effectiveBody.text.replace(/\s+/g, " ").trim()
      : "";
    effectiveBody.text = soundDescription.slice(0, 450).trim();
    if (!effectiveBody.text) {
      throw new Error("SFX generation needs a sound description.");
    }
  }
  const response = await fetch(`${ELEVEN_API}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": key },
    body: JSON.stringify(effectiveBody),
  });
  if (!response.ok) {
    const detail = await response.text();
    /*
      ElevenLabs voices belong to the account that created them, so changing the
      API key orphans every voice designed under the old one. That reads as an
      ordinary provider error, and it used to fail the whole production - a
      character built last week could no longer be used in a scene at all.

      It is marked here so callers can recognise it and carry on without the
      line rather than losing the shot.
    */
    if (response.status === 404 || /voice_not_found|voice does not exist/i.test(detail)) {
      throw new Error(`${ORPHANED_VOICE}: this actor's locked voice does not exist on the current ElevenLabs account. Re-lock the voice to restore their dialogue.`);
    }
    throw new ElevenLabsRequestError(
      `ElevenLabs returned ${response.status}: ${detail.slice(0, 500)}`,
      response.status,
      detail,
    );
  }
  return response;
}

function voiceLimitReached(error: unknown) {
  return error instanceof ElevenLabsRequestError
    && /voice_limit_reached|maximum amount of custom voices/i.test(error.detail);
}

async function listPersonalGeneratedVoices() {
  const key = elevenKey();
  if (!key) throw new Error("ELEVEN_LABS_API_KEY is not configured.");
  const response = await fetch(
    `${ELEVEN_ROOT}/v2/voices?page_size=100&voice_type=personal&category=generated&sort=created_at_unix&sort_direction=asc`,
    { headers: { "xi-api-key": key }, cache: "no-store" },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs could not list older voices (${response.status}): ${detail.slice(0, 300)}`);
  }
  const payload = await response.json() as { voices?: ElevenLabsVoiceSummary[] };
  return Array.isArray(payload.voices) ? payload.voices : [];
}

async function reclaimSupersededActorVoices(
  characterId: string,
  activeVoiceId: string | null | undefined,
) {
  const key = elevenKey();
  if (!key) throw new Error("ELEVEN_LABS_API_KEY is not configured.");
  const candidates = supersededChaplinVoices(
    await listPersonalGeneratedVoices(),
    characterId,
    activeVoiceId,
    2,
  );
  for (const candidate of candidates) {
    const deleteResponse = await fetch(
      `${ELEVEN_API}/voices/${encodeURIComponent(candidate.voice_id)}`,
      { method: "DELETE", headers: { "xi-api-key": key } },
    );
    if (!deleteResponse.ok) {
      const detail = await deleteResponse.text();
      throw new Error(`ElevenLabs could not remove superseded voice ${candidate.voice_id} (${deleteResponse.status}): ${detail.slice(0, 300)}`);
    }
  }
  return candidates;
}

async function imageInput(reference: string) {
  if (/^(https?:|data:)/.test(reference)) return reference;
  if (!reference.startsWith("/")) throw new Error("Reference image must be a generated URL or a public character asset.");
  const publicRoot = path.resolve(process.cwd(), "public");
  const filePath = path.resolve(publicRoot, `.${reference}`);
  const relativePath = path.relative(publicRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) throw new Error("Invalid reference image path.");
  const bytes = await readFile(filePath);
  const contentType = reference.endsWith(".png") ? "image/png" : reference.endsWith(".jpg") || reference.endsWith(".jpeg") ? "image/jpeg" : "image/webp";
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

type GeneratedImage = {
  bytes?: ArrayBuffer;
  remoteUrl?: string;
  contentType: string;
  providerUsage?: Record<string, unknown>;
  requestId?: string | null;
};

async function reviewSceneImageAnatomy(input: {
  image: GeneratedImage;
  prompt: string;
}): Promise<SceneImageAnatomyReview> {
  const imageReference = input.image.remoteUrl
    ?? `data:${input.image.contentType};base64,${Buffer.from(input.image.bytes!).toString("base64")}`;
  const imageContent = await openAIInputImage(imageReference, "high");
  const result = await createOpenAIResponse({
    model: openAIWritingModel(),
    instructions: SCENE_IMAGE_ANATOMY_REVIEW_INSTRUCTIONS,
    messages: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            "Inspect this generated scene frame before it is admitted to the Chaplin Studio.",
            "Return pass=false for any visible extra hand, malformed fingers, disconnected limb, branching arm, or ambiguous overlapping hand-to-prop contact.",
            "Do not penalize a hand that is naturally cropped, hidden, or outside the frame.",
            `Original scene direction:\n${input.prompt.slice(0, 6000)}`,
          ].join("\n\n"),
        },
        imageContent,
      ],
    }],
    maxOutputTokens: 800,
    schema: SCENE_IMAGE_ANATOMY_SCHEMA,
    schemaName: "scene_image_anatomy_review",
  });
  return parseSceneImageAnatomyReview(JSON.parse(result.text));
}

function imageProvider(provider: string) {
  const normalized = provider.trim().toLowerCase();
  if (["byteplus", "modelark", "seedream"].includes(normalized)) return "byteplus";
  if (["openrouter", "open-router"].includes(normalized)) return "openrouter";
  if (["openai", "chatgpt", "gpt-image"].includes(normalized)) return "openai";
  throw new Error(`Unsupported image provider "${provider}". Choose byteplus, openrouter, or openai in Super Admin.`);
}

function imageStageForPreset(stage: PipelineStageConfig, input: Input): PipelineStageConfig {
  const preset = typeof input.imagePreset === "string" ? input.imagePreset.trim() : "";
  if (!preset) return stage;
  if (preset === "gpt-image-2") {
    return {
      ...stage,
      provider: "openai",
      model: "gpt-image-2",
      settings: { ...stage.settings, size: "1536x1024", quality: "medium", outputFormat: "png" },
    };
  }
  if (preset === "nano-banana-2") {
    return {
      ...stage,
      provider: "openrouter",
      model: "google/gemini-3.1-flash-image",
      settings: { ...stage.settings, resolution: "2K", aspectRatio: "16:9" },
    };
  }
  if (preset === "dola-seedream-5") {
    return {
      ...stage,
      provider: "byteplus",
      model: "dola-seedream-5-0-pro-260628",
      settings: { ...stage.settings, size: "2560x1440", outputFormat: "png", watermark: false, sequentialImageGeneration: "disabled" },
    };
  }
  throw new RequestValidationError("imagePreset must be gpt-image-2, nano-banana-2, or dola-seedream-5.");
}

async function providerError(response: Response, provider: string) {
  const detail = await response.text();
  let message = detail;
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string } | string; message?: string };
    message = typeof parsed.error === "string"
      ? parsed.error
      : parsed.error?.message ?? parsed.message ?? detail;
  } catch {
    // Keep the provider's plain-text error.
  }
  throw new Error(`${provider} returned ${response.status}: ${message.slice(0, 700)}`);
}

function decodeBase64Image(value: string, contentType = "image/png") {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value);
  const encoded = match?.[2] ?? value;
  const resolvedContentType = match?.[1] ?? contentType;
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length) throw new Error("The image provider returned an empty image.");
  return {
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    contentType: resolvedContentType,
  };
}

async function referenceImageFile(reference: string, index: number) {
  const input = await imageInput(reference);
  if (input.startsWith("data:")) {
    const decoded = decodeBase64Image(input);
    const extension = decoded.contentType.includes("jpeg") ? "jpg" : decoded.contentType.split("/")[1] || "png";
    return {
      blob: new Blob([decoded.bytes], { type: decoded.contentType }),
      filename: `reference-${index + 1}.${extension}`,
    };
  }
  const response = await fetch(input, { signal: AbortSignal.timeout(30000), cache: "no-store" });
  if (!response.ok) throw new Error(`Reference image download failed with ${response.status}.`);
  const bytes = await response.arrayBuffer();
  const contentType = response.headers.get("content-type")?.split(";")[0] || "image/png";
  const extension = contentType.includes("jpeg") ? "jpg" : contentType.split("/")[1] || "png";
  return {
    blob: new Blob([bytes], { type: contentType }),
    filename: `reference-${index + 1}.${extension}`,
  };
}

async function generateWithOpenRouter(
  stage: PipelineStageConfig,
  prompt: string,
  references: string[]
): Promise<GeneratedImage> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured.");
  const body: Record<string, unknown> = {
    model: stage.model,
    prompt,
    n: 1,
    resolution: settingString(stage, "resolution", "2K"),
    aspect_ratio: settingString(stage, "aspectRatio", "16:9"),
  };
  // Nano Banana's current OpenRouter endpoints expose resolution, aspect ratio,
  // one output, and references. Do not send unsupported quality/format knobs.
  if (!/^google\/gemini-.+-image$/i.test(stage.model)) {
    body.quality = settingString(stage, "quality", "medium");
    body.output_format = settingString(stage, "outputFormat", "png");
  }
  if (references.length) {
    body.input_references = await Promise.all(references.map(async (reference) => ({
      type: "image_url",
      image_url: { url: await imageInput(reference) },
    })));
  }
  const response = await fetch(OPENROUTER_IMAGE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://projectchaplin.com",
      "X-Title": "Chaplin",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) await providerError(response, "OpenRouter");
  const data = await response.json() as {
    id?: string;
    data?: Array<{ b64_json?: string; media_type?: string }>;
    usage?: Record<string, unknown>;
  };
  const image = data.data?.[0];
  if (!image?.b64_json) throw new Error("OpenRouter completed without returning an image.");
  return {
    ...decodeBase64Image(image.b64_json, image.media_type ?? "image/png"),
    providerUsage: data.usage,
    requestId: response.headers.get("x-request-id") ?? data.id ?? null,
  };
}

async function generateWithOpenAI(
  stage: PipelineStageConfig,
  prompt: string,
  references: string[]
): Promise<GeneratedImage> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured.");
  const requestedSize = settingString(stage, "size", "1536x1024");
  // GPT Image accepts its own supported sizes; retain a safe landscape default
  // when this stage was previously configured for Seedream's 2560Ã—1440 output.
  const size = ["1024x1024", "1024x1536", "1536x1024", "auto"].includes(requestedSize)
    ? requestedSize
    : "1536x1024";
  const quality = settingString(stage, "quality", "medium");
  const outputFormat = settingString(stage, "outputFormat", "png");
  let response: Response;
  if (references.length) {
    const form = new FormData();
    form.set("model", stage.model);
    form.set("prompt", prompt);
    form.set("size", size);
    form.set("quality", quality);
    form.set("output_format", outputFormat);
    const files = await Promise.all(references.map(referenceImageFile));
    files.forEach((file) => form.append("image[]", file.blob, file.filename));
    response = await fetch(`${OPENAI_IMAGE_API}/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } else {
    response = await fetch(`${OPENAI_IMAGE_API}/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: stage.model,
        prompt,
        size,
        quality,
        output_format: outputFormat,
        n: 1,
      }),
    });
  }
  if (!response.ok) await providerError(response, "OpenAI");
  const data = await response.json() as {
    data?: Array<{ b64_json?: string }>;
    usage?: Record<string, unknown>;
  };
  const image = data.data?.[0];
  if (!image?.b64_json) throw new Error("OpenAI completed without returning an image.");
  return {
    ...decodeBase64Image(image.b64_json, `image/${outputFormat}`),
    providerUsage: data.usage,
    requestId: response.headers.get("x-request-id"),
  };
}

function lockVisualIdentity(prompt: string, hasReference: boolean) {
  if (!hasReference) return prompt;
  return `${prompt}\n\nVISUAL IDENTITY LOCK: The attached image is the canonical seed for this actor. Preserve the exact same person: facial geometry, eye spacing and shape, nose, mouth, jaw, skin tone and texture, hairline, hair, apparent age, body proportions, and signature wardrobe materials. The requested prompt may change only performance, blocking, camera, lighting, environment, and story action. Do not reinterpret, beautify, average, recast, age-shift, gender-shift, or redesign the actor.`;
}

export async function GET(request: Request) {
  try {
    const identity = await requireRequestIdentity(request);
    const characterId = new URL(request.url).searchParams.get("characterId");
    if (characterId) await requireOwnedCharacter(identity, characterId);
    const [production, providers, pipeline] = characterId
      ? await Promise.all([
          getCharacterProductionState(characterId),
          getCharacterProviderHealth(characterId),
          getPipelineConfig(),
        ])
      : [null, null, await getPipelineConfig()];
    return Response.json({
      elevenLabs: Boolean(elevenKey()),
      seedModels: Boolean(process.env.SEEDANCE_API_KEY ?? process.env.SEEDREAM_API_KEY),
      openRouter: Boolean(process.env.OPENROUTER_API_KEY),
      openAI: Boolean(process.env.OPENAI_API_KEY),
      database: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      production,
      providers,
      pipeline,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load generation state.";
    return Response.json({ error: message }, { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 400) });
  }
}

export async function POST(request: Request) {
  let jobId: string | undefined;
  let generationCompleted = false;
  let directorSprintGrant: Awaited<ReturnType<typeof authorizeDirectorSprintGeneration>> | null = null;
  let directorSprintTraceId: string | null = null;
  try {
    assertRequestBodySize(request, 256 * 1024);
    const identity = await requireRequestIdentity(request);
    const input = (await request.json()) as Input;
    const action = text(input, "action", 1, 30);
    const characterId = text(input, "characterId", 1, 100);
    await requireOwnedCharacter(identity, characterId);
    if (identity.role !== "admin") {
      await enforceRateLimit({
        request,
        bucket: "generation-total",
        limit: 100,
        windowSeconds: 24 * 60 * 60,
        identityId: identity.id,
      });
      await enforceRateLimit({
        request,
        bucket: `generation-${action}`,
        limit: action === "video" ? 6 : action === "image" ? 20 : 30,
        windowSeconds: 24 * 60 * 60,
        identityId: identity.id,
      });
    }
    if (input.directorSprint && typeof input.directorSprint === "object") {
      if (identity.role !== "admin") throw new Error("Super Admin access is required for the controlled Director Sprint 1 test.");
      const request = input.directorSprint as Record<string, unknown>;
      const stage = stageForGenerationAction(action);
      if (stage !== "image" && stage !== "video") {
        throw new RequestValidationError("Director Sprint 1 only permits its controlled image and video stages.");
      }
      directorSprintGrant = await authorizeDirectorSprintGeneration({
        testId: text(request, "testId", 1, 100),
        variantId: text(request, "variantId", 1, 40),
        stage,
        characterId,
      });
      input.prompt = directorSprintGrant.prompt;
      input.durationSeconds = 5;
      input.comparisonCandidate = true;
      input.pipelineExperiment = {
        id: directorSprintGrant.experimentId,
        variantId: directorSprintGrant.variantId,
        stage,
        config: directorSprintGrant.stageConfig,
      };
      if (stage === "image") input.imagePurpose = "sprint-test";
      if (stage === "video") input.referenceImage = directorSprintGrant.referenceImageUrl;
    }
    let requestCharacter: Character | undefined;
    if (input.character && typeof input.character === "object") {
      const character = input.character as Character;
      if (character.id !== characterId) throw new RequestValidationError("AI actor identity does not match this generation request.");
      const exists = (await listCharacters()).some((candidate) => candidate.id === character.id);
      if (!exists) throw new RequestValidationError("Create and save this AI actor before generating media.");
      requestCharacter = character;
    }

    if (action === "sfx-select") {
      const assetId = text(input, "assetId", 1, 100);
      return Response.json(await selectCharacterSfxAsset({ characterId, assetId }));
    }

    if (action === "voice-capacity-list") {
      const [voices, activeVoiceIds, characters] = await Promise.all([
        listPersonalGeneratedVoices(),
        listActiveVoiceIds(),
        listCharacters(),
      ]);
      const visibleCharacters = identity.role === "admin"
        ? characters
        : characters.filter((character) => character.makerId === identity.id);
      const visibleCharacterIds = new Set(visibleCharacters.map((character) => character.id));
      const characterNames = new Map(visibleCharacters.map((character) => [character.id, character.name]));
      const candidates = (identity.role === "admin"
        ? reclaimableChaplinVoices(voices, activeVoiceIds, characterId, true)
        : reclaimableOwnedChaplinVoices(voices, activeVoiceIds, visibleCharacterIds)
      ).slice(0, 50);
      return Response.json({
        candidates: candidates.map((voice) => ({
          voiceId: voice.voice_id,
          name: voice.name || "Unnamed Chaplin voice",
          characterId: voice.labels?.character_id ?? null,
          characterName: characterNames.get(voice.labels?.character_id ?? "") ?? null,
          project: voice.labels?.project ?? null,
          createdAtUnix: voice.created_at_unix ?? null,
        })),
      });
    }

    if (action === "voice-capacity-delete") {
      const voiceId = text(input, "voiceId", 1, 200);
      const confirmedVoiceId = text(input, "confirmedVoiceId", 1, 200);
      if (voiceId !== confirmedVoiceId) {
        throw new RequestValidationError("Voice deletion requires confirmation of the exact selected voice.");
      }
      const [voices, activeVoiceIds, characters] = await Promise.all([
        listPersonalGeneratedVoices(),
        listActiveVoiceIds(),
        listCharacters(),
      ]);
      const visibleCharacterIds = new Set(
        (identity.role === "admin"
          ? characters
          : characters.filter((character) => character.makerId === identity.id)
        ).map((character) => character.id),
      );
      const candidate = (identity.role === "admin"
        ? reclaimableChaplinVoices(voices, activeVoiceIds, characterId, true)
        : reclaimableOwnedChaplinVoices(voices, activeVoiceIds, visibleCharacterIds)
      ).find((voice) => voice.voice_id === voiceId);
      if (!candidate) {
        throw new RequestValidationError("That voice is active, outside your Studio, or no longer reclaimable.");
      }
      await deleteElevenLabsVoice(candidate.voice_id);
      const registrations = await getSupabaseAdminClient()
        .from("character_voices")
        .delete()
        .eq("provider", "elevenlabs")
        .eq("provider_voice_id", candidate.voice_id)
        .neq("status", "active");
      if (registrations.error) {
        throw new Error(`Remove stale voice registration: ${registrations.error.message}`);
      }
      return Response.json({
        deleted: true,
        voiceId: candidate.voice_id,
        message: `${candidate.name || "The inactive voice"} was deleted. One ElevenLabs custom-voice slot is now free.`,
      });
    }

    let pipeline = await getPipelineConfig();
    let experimentId: string | undefined;
    let experimentVariantId: string | undefined;
    if (input.pipelineExperiment && typeof input.pipelineExperiment === "object") {
      if (identity.role !== "admin") throw new Error("Super Admin access is required for isolated pipeline tests.");
      const experiment = input.pipelineExperiment as Record<string, unknown>;
      experimentId = text(experiment, "id", 1, 100);
      experimentVariantId = text(experiment, "variantId", 1, 40);
      const stageId = stageForGenerationAction(action);
      if (!stageId) throw new RequestValidationError("This generation action cannot run in Pipeline Lab.");
      if (experiment.stage !== stageId) throw new RequestValidationError("Experiment stage does not match the requested generation action.");
      const stageOverride = experiment.config;
      if (!stageOverride || typeof stageOverride !== "object") {
        throw new RequestValidationError("Pipeline Lab requires an isolated stage configuration.");
      }
      pipeline = normalizePipelineConfig({
        ...pipeline,
        stages: { ...pipeline.stages, [stageId]: stageOverride },
      }, {
        revision: pipeline.revision,
        updatedAt: pipeline.updatedAt,
        updatedBy: pipeline.updatedBy,
      });
    }
    const startGeneration = async (details: {
      characterId: string;
      kind: string;
      provider: string;
      model: string;
      prompt?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const creditAllocation = generationCreditAllocation(details.kind, details.metadata);
      const handoff = requestCharacter ? buildPromptHandoff(requestCharacter) : null;
      const cardByKind: Record<string, string[]> = {
        "voice-design": ["voice"],
        "voice-lock": ["voice"],
        dialogue: ["dialogue"],
        sfx: ["sfx"],
        theme: ["theme"],
        gallery: ["scene-still", "identity-still", "sheet"],
        avatar: ["identity-still", "sheet"],
        banner: ["identity-still", "sheet"],
        video: ["motion"],
      };
      const relevantCards = cardByKind[details.kind] ?? [];
      const blockingResult = handoff && relevantCards.length
        ? {
            ...handoff.lint,
            failures: handoff.lint.failures.filter((issue) => relevantCards.includes(issue.cardId)),
          }
        : null;
      /*
        The linter is a set of regex heuristics over a *synthetic* handoff, not a
        measurement of the prompt actually being sent. Treating its output as a
        hard gate took the whole studio down: a repeated boilerplate phrase (L1)
        and the word "shoes" appearing in a prompt whose wardrobe string did not
        enumerate footwear (L4) were enough to fail Voice and Still and stop
        Studio Auto. Findings are recorded on the job and returned to the client
        so they stay visible, but they no longer cancel paid work. Set
        CHAPLIN_BLOCK_ON_PROMPT_LINT=true to restore hard blocking.
      */
      if (blockingResult?.failures.length && process.env.CHAPLIN_BLOCK_ON_PROMPT_LINT === "true") {
        throw new PromptLintError({ ...blockingResult, pass: false });
      }
      const generationJobId = await beginGeneration({
        ...details,
        metadata: {
          ...(details.metadata ?? {}),
          userId: identity.id,
          creditActionCode: creditAllocation.code,
          creditAllocation: creditAllocation.credits,
          creditBilling: "included",
          ...(handoff ? { prompt_lint: handoff.lint } : {}),
          ...(blockingResult?.failures.length
            ? { prompt_lint_advisory: blockingResult.failures }
            : {}),
          ...(directorSprintGrant ? {
            directorSprint: {
              testId: directorSprintGrant.testId,
              variantId: directorSprintGrant.variantId,
              stage: directorSprintGrant.stage,
              principle: directorSprintGrant.traceVariant.principle,
            },
          } : {}),
        },
        experimentId,
        experimentVariantId,
      });
      if (directorSprintGrant) {
        try {
          directorSprintTraceId = await startDirectorSprintDecisionTrace({
            grant: directorSprintGrant,
            generationJobId,
            userId: identity.id,
            provider: details.provider,
            model: details.model,
          });
        } catch (error) {
          await failGeneration(generationJobId, error instanceof Error ? error.message : "Could not persist the Sprint 1 decision trace.");
          throw error;
        }
      }
      return generationJobId;
    };
    const resolveStyleContractText = async () => {
      const explicit = typeof input.styleContractText === "string" ? input.styleContractText.trim().slice(0, 5000) : "";
      if (explicit) return explicit;
      const boardId = typeof input.boardId === "string" ? input.boardId.trim() : "";
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(boardId)) return "";
      let query = getSupabaseAdminClient().from("style_contracts").select("contract_text").eq("board_id", boardId);
      if (identity.role !== "admin") query = query.eq("owner_id", identity.id);
      const result = await query.maybeSingle();
      if (result.error) throw new Error(`Load style contract: ${result.error.message}`);
      return result.data?.contract_text?.trim().slice(0, 5000) ?? "";
    };

    if (action === "voice-design") {
      const voiceConfig = pipeline.stages.voice;
      requireStage(voiceConfig, "Voice");
      const description = voiceDesignDescription(voiceConfig, text(input, "description", 20, 4000));
      const previewText = voiceDesignAuditionText(text(input, "previewText", 12, 1000), requestCharacter);
      jobId = await startGeneration({ characterId, kind: "voice-design", provider: voiceConfig.provider, model: voiceConfig.model, prompt: description });
      const response = await eleven("/text-to-voice/design?output_format=mp3_44100_128", {
        voice_description: description,
        text: previewText,
        model_id: voiceConfig.model,
        guidance_scale: settingNumber(voiceConfig, "guidanceScale", 4),
      });
      const data = await response.json();
      const previews = Array.isArray(data.previews) ? data.previews : [];
      const billing = await calculateGenerationBilling({
        kind: "voice-design",
        usage: {
          inputCharacters: previewText.length * previews.length,
          durationSeconds: previews.reduce((total: number, preview: { duration_secs?: number }) => total + Number(preview.duration_secs ?? 0), 0),
          previewCount: previews.length,
          providerCredits: headerNumber(response, "character-cost"),
        },
      });
      await completeGeneration(jobId, undefined, { previewCount: previews.length }, billing, response.headers.get("request-id"));
      return Response.json(data);
    }

    if (action === "voice-save") {
      const voiceConfig = pipeline.stages.voice;
      requireStage(voiceConfig, "Voice");
      const description = voiceDesignDescription(voiceConfig, text(input, "description", 20, 4000));
      const generatedVoiceId = text(input, "generatedVoiceId", 1, 200);
      const currentProduction = await getCharacterProductionState(characterId);
      if (currentProduction.voiceId === generatedVoiceId) {
        return Response.json({ voice_id: generatedVoiceId, already_locked: true });
      }
      jobId = await startGeneration({ characterId, kind: "voice-lock", provider: "elevenlabs", model: "text-to-voice", prompt: description });
      const saveVoice = () => eleven("/text-to-voice", {
        voice_name: text(input, "name", 1, 100),
        voice_description: description,
        generated_voice_id: generatedVoiceId,
        labels: { project: "chaplin", character_id: characterId },
      });
      let response: Response;
      let reclaimedVoices: ElevenLabsVoiceSummary[] = [];
      try {
        response = await saveVoice();
      } catch (error) {
        if (!voiceLimitReached(error)) throw error;
        reclaimedVoices = await reclaimSupersededActorVoices(characterId, currentProduction.voiceId);
        if (!reclaimedVoices.length) {
          throw new Error(
            "This ElevenLabs account has reached its custom-voice limit. Open Manage unused voices to reclaim an inactive voice from your Studio, or use Super Admin for account-wide voice control.",
          );
        }
        response = await saveVoice();
      }
      const data = await response.json();
      await saveCharacterVoice({ characterId, voiceId: data.voice_id, description, previewUrl: data.preview_url });
      await completeGeneration(
        jobId,
        undefined,
        {
          voiceId: data.voice_id,
          ...(reclaimedVoices.length
            ? { reclaimedVoiceIds: reclaimedVoices.map((voice) => voice.voice_id) }
            : {}),
        },
        await calculateGenerationBilling({ kind: "voice-lock" }),
        response.headers.get("request-id")
      );
      return Response.json({
        ...data,
        reclaimed_voice_count: reclaimedVoices.length,
      });
    }

    if (action === "speech") {
      const voiceConfig = pipeline.stages.voice;
      requireStage(voiceConfig, "Voice");
      const speechText = text(input, "speechText", 1, 5000);
      const performanceText = dialogueForSpeech(speechText);
      if (!performanceText) throw new Error("Dialogue must include words for the actor to perform.");
      const production = await getCharacterProductionState(characterId);
      const voiceId = production.voiceId;
      if (!voiceId) throw new Error("This character has no active locked voice. Lock a voice before generating dialogue.");
      const seed = stableVoiceSeed(characterId);
      const dialogueModel = settingString(voiceConfig, "dialogueModel", DIALOGUE_MODEL);
      const voiceSettings = {
        stability: settingNumber(voiceConfig, "stability", DIALOGUE_VOICE_SETTINGS.stability),
        similarity_boost: settingNumber(voiceConfig, "similarityBoost", DIALOGUE_VOICE_SETTINGS.similarity_boost),
        style: settingNumber(voiceConfig, "style", DIALOGUE_VOICE_SETTINGS.style),
        use_speaker_boost: settingBoolean(voiceConfig, "speakerBoost", DIALOGUE_VOICE_SETTINGS.use_speaker_boost),
      };
      jobId = await startGeneration({ characterId, kind: "dialogue", provider: voiceConfig.provider, model: dialogueModel, prompt: speechText });
      const response = await eleven(`/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
        text: performanceText,
        model_id: dialogueModel,
        voice_settings: voiceSettings,
        seed,
      });
      const bytes = await response.arrayBuffer();
      const voiceMetadata = {
        voiceId,
        model: dialogueModel,
        seed,
        voiceSettings,
        performanceText,
      };
      const asset = await saveMediaAsset({
        characterId,
        kind: "dialogue",
        provider: "elevenlabs",
        bytes,
        contentType: "audio/mpeg",
        prompt: speechText,
        metadata: voiceMetadata,
      });
      const measuredDurationMs = await measureStoredAudioMs(asset.url).catch(() => null);
      await completeGeneration(
        jobId,
        asset.id,
        voiceMetadata,
        await calculateGenerationBilling({
          kind: "dialogue",
          usage: {
            inputCharacters: performanceText.length,
            providerCredits: headerNumber(response, "character-cost"),
          },
        }),
        response.headers.get("request-id")
      );
      return new Response(bytes, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "X-Asset-Url": asset.url,
          "X-Asset-Id": asset.id,
          "X-Voice-Id": voiceId,
          "X-Voice-Model": dialogueModel,
          ...(measuredDurationMs ? { "X-Audio-Duration-Ms": String(measuredDurationMs) } : {}),
        },
      });
    }

    if (action === "sfx") {
      const sfxConfig = pipeline.stages.sfx;
      requireStage(sfxConfig, "SFX");
      /*
        The bound was 1000, which is stricter than the 450-character clamp this
        line immediately applies. A per-scene effect brief carries the scene's
        visible action and the actor's sound identity, so a detailed scene blew
        past 1000 and the whole shot-packages step failed with "prompt must be
        between 1 and 1000 characters" - no clips, no master, no video. The
        bound now only guards absurd payloads; providerPrompt still decides what
        reaches the provider.
      */
      const prompt = providerPrompt(sfxConfig, text(input, "prompt", 1, 4000), 450);
      const requestedDuration = Number(input.durationSeconds);
      const minimumDuration = settingNumber(sfxConfig, "minimumDurationSeconds", 0.5);
      const maximumDuration = Math.max(minimumDuration, settingNumber(sfxConfig, "maximumDurationSeconds", 2));
      const durationSeconds = Number.isFinite(requestedDuration)
        ? Math.min(maximumDuration, Math.max(minimumDuration, requestedDuration))
        : settingNumber(sfxConfig, "durationSeconds", 1.5);
      jobId = await startGeneration({ characterId, kind: "sfx", provider: sfxConfig.provider, model: sfxConfig.model, prompt });
      const response = await eleven("/sound-generation?output_format=mp3_44100_192", {
        text: prompt,
        duration_seconds: durationSeconds,
        prompt_influence: settingNumber(sfxConfig, "promptInfluence", 0.55),
        loop: settingBoolean(sfxConfig, "loop", false),
        model_id: sfxConfig.model,
      });
      const bytes = await response.arrayBuffer();
      const asset = await saveMediaAsset({ characterId, kind: "sfx", provider: "elevenlabs", bytes, contentType: "audio/mpeg", prompt, durationSeconds });
      await completeGeneration(
        jobId,
        asset.id,
        undefined,
        await calculateGenerationBilling({
          kind: "sfx",
          usage: {
            inputCharacters: prompt.length,
            durationSeconds,
            providerCredits: headerNumber(response, "character-cost"),
          },
        }),
        response.headers.get("request-id")
      );
      return new Response(bytes, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Asset-Url": asset.url, "X-Asset-Id": asset.id, "X-SFX-Duration": String(durationSeconds) } });
    }

    if (action === "signature-sfx") {
      const sfxConfig = pipeline.stages.sfx;
      requireStage(sfxConfig, "SFX");
      if (!requestCharacter) {
        throw new RequestValidationError("A complete actor identity is required to build the layered signature SFX.");
      }
      const card = readCharacterCardV2(requestCharacter.cardV2);
      const events = composeCharacterSignatureSfxEvents(requestCharacter);
      const minimumDuration = Math.max(1, settingNumber(sfxConfig, "minimumDurationSeconds", 1));
      const maximumDuration = Math.min(3, Math.max(minimumDuration, settingNumber(sfxConfig, "maximumDurationSeconds", 3)));
      const promptInfluence = settingNumber(sfxConfig, "promptInfluence", 0.55);
      const loop = settingBoolean(sfxConfig, "loop", false);
      const generatedEvents: Array<{
        id: string;
        label: string;
        assetId: string;
        url: string;
        startMs: number;
        gainDb: number;
        durationSeconds: number;
      }> = [];

      for (const event of events) {
        const durationSeconds = Math.min(maximumDuration, Math.max(minimumDuration, event.duration_seconds));
        const prompt = providerPrompt(sfxConfig, composeSignatureSfxEventPrompt(event), 450);
        assertSignatureSfxPrompt(prompt);
        const providerSettings = {
          duration_seconds: durationSeconds,
          prompt_influence: promptInfluence,
          loop,
        };
        jobId = await startGeneration({
          characterId,
          kind: "sfx-event",
          provider: sfxConfig.provider,
          model: sfxConfig.model,
          prompt,
          metadata: {
            signatureSfxRole: "event",
            grammarVersion: "v3",
            eventSource: card?.signature_sfx_events?.length ? "character-card-v2" : "derived-modern-palette",
            eventId: event.id,
            startMs: event.start_ms,
            gainDb: event.gain_db,
            providerSettings,
          },
        });
        const response = await eleven("/sound-generation?output_format=mp3_44100_192", {
          text: prompt,
          ...providerSettings,
          model_id: sfxConfig.model,
        });
        const bytes = await response.arrayBuffer();
        const eventMetadata = {
          signatureSfxRole: "event",
          grammarVersion: "v3",
          eventSource: card?.signature_sfx_events?.length ? "character-card-v2" : "derived-modern-palette",
          providerOutputFormat: "mp3_44100_192",
          eventId: event.id,
          eventLabel: event.label,
          startMs: event.start_ms,
          gainDb: event.gain_db,
          providerSettings,
        };
        const asset = await saveMediaAsset({
          characterId,
          kind: "sfx",
          provider: "elevenlabs",
          bytes,
          contentType: response.headers.get("content-type") ?? "audio/mpeg",
          prompt,
          durationSeconds,
          metadata: eventMetadata,
        });
        await completeGeneration(
          jobId,
          asset.id,
          eventMetadata,
          await calculateGenerationBilling({
            kind: "sfx",
            usage: {
              inputCharacters: prompt.length,
              durationSeconds,
              providerCredits: headerNumber(response, "character-cost"),
            },
          }),
          response.headers.get("request-id"),
        );
        generatedEvents.push({
          id: event.id,
          label: event.label,
          assetId: asset.id,
          url: asset.url,
          startMs: event.start_ms,
          gainDb: event.gain_db,
          durationSeconds,
        });
      }

      // All paid provider jobs are already complete. Assembly is a separate,
      // local operation and must not rewrite a successful provider job.
      jobId = undefined;
      const signature = await assembleSignatureSfx({
        characterId,
        timeline: generatedEvents.map((event) => ({
          assetId: event.assetId,
          startMs: event.startMs,
          gainDb: event.gainDb,
        })),
      });
      return Response.json({
        url: signature.url,
        assetId: signature.id,
        durationSeconds: signature.durationSeconds,
        events: generatedEvents,
      });
    }

    if (action === "theme") {
      const themeConfig = pipeline.stages.theme;
      requireStage(themeConfig, "Theme");
      const configuredDuration = settingNumber(themeConfig, "durationSeconds", 8);
      const requestedDuration = input.durationSeconds == null ? configuredDuration : Number(input.durationSeconds);
      if (!isThemeDurationPreset(requestedDuration)) {
        throw new RequestValidationError("Theme duration must be one of 5, 8, or 15 seconds.");
      }
      const compositionPlanEnabled = settingBoolean(themeConfig, "compositionPlanEnabled", true);
      const themeKind: ThemePlanKind = input.themeKind === "scene_15s" || requestedDuration === 15
        ? "scene_15s"
        : "ident_8s";
      const durationSeconds = compositionPlanEnabled
        ? themePlanTargetMilliseconds(themeKind) / 1000
        : requestedDuration;
      if (compositionPlanEnabled && !requestCharacter) {
        throw new RequestValidationError("Composition-plan theme generation requires the saved AI actor identity.");
      }
      const prompt = compositionPlanEnabled
          ? undefined
          : withThemeDurationDirection(
            directedPrompt(themeConfig, text(input, "prompt", 10, 3000)),
            requestedDuration,
          );
      if (prompt && process.env.NODE_ENV !== "production") assertThemePromptV2(prompt);
      const sceneBrief = typeof input.sceneBrief === "string" ? input.sceneBrief.trim().slice(0, 1000) : undefined;
      const compositionPlan = compositionPlanEnabled && requestCharacter
        ? buildThemePlan(requestCharacter, themeKind, sceneBrief)
        : undefined;
      // A composition plan is always addressed to music_v1, so the ledger, the
      // output format and the request all have to agree on that.
      const themeModel = compositionPlanEnabled ? "music_v1" : themeConfig.model;
      const outputFormat = themeModel === "music_v2" ? "mp3_48000_192" : "mp3_44100_128";
      const generationMetadata = {
        grammarVersion: compositionPlanEnabled ? "plan-v2" : "v3-legacy",
        generationMode: compositionPlanEnabled ? "composition-plan" : "legacy-prompt",
        themeKind,
        requestedDurationSeconds: durationSeconds,
        providerDurationParameter: compositionPlanEnabled
          ? "composition_plan.chunks.duration_ms"
          : "music_length_ms",
        providerDurationMilliseconds: durationSeconds * 1000,
        providerOutputFormat: outputFormat,
        providerEnforcesChunkDurations: false,
        compositionPlan,
      };
      jobId = await startGeneration({
        characterId,
        kind: "theme",
        provider: themeConfig.provider,
        model: themeModel,
        prompt,
        metadata: generationMetadata,
      });
      const response = await eleven(`/music?output_format=${outputFormat}`, buildElevenMusicRequest({
        mode: compositionPlanEnabled ? "composition-plan" : "legacy-prompt",
        plan: compositionPlan,
        prompt,
        durationMilliseconds: durationSeconds * 1000,
        /*
          The mode decides the model. ElevenLabs accepts composition plans on
          music_v1 only, so a plan request must go to music_v1 whatever the
          stage is configured with - otherwise a correct plan was refused for
          being addressed to the wrong model.
        */
        modelId: themeModel,
        forceInstrumental: settingBoolean(themeConfig, "forceInstrumental", true),
        signWithC2pa: settingBoolean(themeConfig, "signWithC2pa", false),
      }));
      const delivered = await enforceThemeDuration(await response.arrayBuffer(), durationSeconds);
      const durationMetadata = {
        ...generationMetadata,
        originalDurationSeconds: delivered.originalDurationSeconds,
        deliveredDurationSeconds: delivered.deliveredDurationSeconds,
        durationTrimmed: delivered.trimmed,
        fadeOutMilliseconds: delivered.fadeOutMilliseconds,
        postprocessStatus: delivered.postprocessStatus,
        postprocessMessage: delivered.postprocessMessage,
      };
      const asset = await saveMediaAsset({
        characterId,
        kind: "theme",
        provider: "elevenlabs",
        bytes: delivered.bytes,
        contentType: response.headers.get("content-type") ?? "audio/mpeg",
        prompt,
        durationSeconds: delivered.deliveredDurationSeconds,
        metadata: { songId: response.headers.get("song-id"), ...durationMetadata },
      });
      await completeGeneration(
        jobId,
        asset.id,
        { songId: response.headers.get("song-id"), ...durationMetadata },
        await calculateGenerationBilling({
          kind: "theme",
          usage: {
            inputCharacters: prompt?.length ?? JSON.stringify(compositionPlan).length,
            durationSeconds: delivered.originalDurationSeconds,
            providerCredits: headerNumber(response, "character-cost"),
          },
        }),
        response.headers.get("request-id") ?? response.headers.get("song-id")
      );
      return new Response(delivered.bytes, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "X-Asset-Url": asset.url,
          "X-Theme-Original-Duration": String(delivered.originalDurationSeconds),
          "X-Theme-Delivered-Duration": String(delivered.deliveredDurationSeconds),
        },
      });
    }

    if (action === "image") {
      const imageConfig = imageStageForPreset(pipeline.stages.image, input);
      requireStage(imageConfig, "Image");
      // Same reasoning as the video action: compaction (1800 for image) is what
      // bounds the provider payload, so this only rejects absurd input.
      const requestedPrompt = text(input, "prompt", 10, 12000);
      const imagePurpose = input.imagePurpose === "scene"
        ? "scene"
        : input.imagePurpose === "character-sheet"
          ? "character-sheet"
          : input.imagePurpose === "sprint-test"
            ? "sprint-test"
          : "identity";
      const requestedReference = typeof input.referenceImage === "string" ? input.referenceImage : "";
      const requestedReferences = Array.isArray(input.referenceImages)
        ? input.referenceImages
          .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
          .slice(0, 10)
        : [];
      const identityVariationKey = imagePurpose === "identity"
        ? (typeof input.identityVariationKey === "string" && input.identityVariationKey.trim()
            ? input.identityVariationKey.trim().slice(0, 80)
            : crypto.randomUUID())
        : null;
      // Ensemble scenes name every actor in frame. Absent or single-entry casts
      // leave the existing single-actor path completely unchanged.
      const requestedCastIds = Array.isArray(input.castCharacterIds)
        ? input.castCharacterIds
          .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
          .map((value) => value.trim())
          .slice(0, 6)
        : [];
      const castIds = [...new Set([characterId, ...requestedCastIds].filter(Boolean))];
      const isEnsembleShot = imagePurpose === "scene" && castIds.length > 1;
      const production = await getCharacterProductionState(characterId);
      const canonicalReference = production.visualReference;
      // One canonical reference per actor, in cast order, so reference N lines up
      // with "ACTOR LOCK … matches reference image N" in the composed prompt.
      const ensembleReferences = isEnsembleShot
        ? (await Promise.all(
            castIds.map(async (id) => {
              if (id === characterId) return canonicalReference?.url ?? "";
              const state = await getCharacterProductionState(id);
              return state.visualReference?.url ?? "";
            }),
          )).filter(Boolean)
        : [];
      // Rebuilding an identity must not feed the existing face back into the
      // image model. Scene frames inherit the selected canonical actor, while
      // a character sheet deliberately uses the newly generated identity hero
      // supplied by the editor as its first and strongest reference.
      const preserveIdentity = imagePurpose !== "identity";
      const references = preserveIdentity
        ? (imagePurpose === "character-sheet"
            ? [
                requestedReference,
                ...requestedReferences,
                canonicalReference?.url ?? "",
              ]
            : isEnsembleShot
              ? [
                  ...ensembleReferences,
                  ...requestedReferences,
                ]
              : [
                  canonicalReference?.url ?? requestedReference,
                  /*
                    The actor's style sheet rides alongside the hero still. A
                    single still shows one angle, so the model had no view of
                    the actor it was not already looking at and filled the gaps
                    from whoever else was in the production - which is how one
                    character was drawn carrying another's weapon. The sheet
                    supplies the face from every angle, the build, the wardrobe
                    and the props that actually belong to them.
                  */
                  production.styleSheet?.url ?? "",
                  ...requestedReferences,
                ]
          ).filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
        : [];
      const reference = references[0] ?? "";
      const stylizedOutput = requestsStylizedImage(requestedPrompt);
      const generatedPrompt = imageGenerationPrompt(imageConfig, requestedPrompt);
      const newIdentityPrompt = generatedPrompt.replace(
        /Use the canonical reference as identity truth\.\s*/i,
        "",
      );
      const prompt = preserveIdentity
        ? lockVisualIdentity(generatedPrompt, Boolean(reference))
        : `${newIdentityPrompt}\n\nFRESH CASTING PASS ${identityVariationKey}: Create a new original fictional actor from this written brief only. No image reference is attached. Keep explicit user requirements such as medium, age range, cultural context, presentation, and essential wardrobe, but cast a materially different face with its own facial proportions and natural asymmetry. Do not copy, preserve, or derive the face, pose, camera angle, or location from any existing profile, gallery, cover, or previous attempt.`;
      const rawNegativePrompt = settingString(
        imageConfig,
        "negativePrompt",
        "multiple people, duplicate face, celebrity likeness, generic pose, plastic skin, distorted anatomy, extra hands, duplicate hands, extra fingers, fused fingers, branching wrists, disconnected arms, overlapping hand anatomy, text, logo, UI, border, watermark"
      );
      // "multiple people" is correct for a solo portrait and fatal for a
      // two-hander — it is the instruction that erased the second actor. For an
      // ensemble, swap it for the failure mode that actually threatens the shot:
      // the two references collapsing into one blended face.
      const configuredNegativePrompt = isEnsembleShot
        ? [
            rawNegativePrompt
              .split(",")
              .map((term) => term.trim())
              .filter((term) => term && !/^(?:multiple people|duplicate face|two people|group|crowd)$/i.test(term))
              .join(", "),
            "blended faces, merged bodies, face swap between actors, one actor duplicated, missing actor, cloned twins",
          ].filter(Boolean).join(", ")
        : rawNegativePrompt;
      const cardNegativePrompt = readCharacterCardV2(requestCharacter?.cardV2)?.identity_locks.negative_prompt;
      const referenceMetadata = {
        imagePurpose,
        // Set when this still is one of several rendered for the creator to
        // compare; it stays out of the feed until one is chosen.
        comparisonCandidate: input.comparisonCandidate === true,
        referenceImage: reference || null,
        referenceAssetId: imagePurpose === "scene" || imagePurpose === "sprint-test" ? canonicalReference?.assetId ?? null : null,
        referenceSource: preserveIdentity
          ? imagePurpose === "character-sheet"
            ? "generated-identity-hero"
            : canonicalReference?.source ?? (requestedReference ? "request-fallback" : null)
          : "new-identity-no-reference",
        referenceImages: references,
        referenceCount: references.length,
        identityVariationKey,
        castCharacterIds: castIds,
        ensembleShot: isEnsembleShot,
      };
      const provider = imageProvider(imageConfig.provider);
      const exclusions = stylizedOutput
        ? [configuredNegativePrompt, cardNegativePrompt].filter(Boolean).join(", ")
        : [configuredNegativePrompt, cardNegativePrompt, REALISM_NEGATIVE].filter(Boolean).join(", ");
      const seedreamFive = provider === "byteplus" && /seedream-5-0/i.test(imageConfig.model);
      const providerReadyPrompt = provider === "byteplus"
        ? seedreamFive
          ? `${prompt}\n\nEXCLUDE: ${exclusions}`
          : prompt
        : `${prompt}\n\nEXCLUDE: ${exclusions}`;
      const styleContractText = await resolveStyleContractText();
      const effectivePrompt = injectStyleContract(
        withStandingInjections(providerReadyPrompt, Boolean(requestCharacter)),
        styleContractText ? { contract_text: styleContractText } : null,
      );
      const bannedImagePhrase = bannedPromptWord(effectivePrompt);
      if (bannedImagePhrase) {
        throw new RequestValidationError(`Image prompt contains banned phrase "${bannedImagePhrase}".`);
      }
      const consistencyWarnings = mediaPromptWarnings(requestCharacter, effectivePrompt, "image");
      jobId = await startGeneration({
        characterId,
        kind: "gallery",
        provider,
        model: imageConfig.model,
        prompt: effectivePrompt,
        metadata: {
          ...referenceMetadata,
          ...(consistencyWarnings.length ? { characterCardConsistencyWarnings: consistencyWarnings } : {}),
        },
      });
      const runImageProvider = async (promptText: string): Promise<GeneratedImage> => {
        if (provider === "openrouter") {
          return generateWithOpenRouter(imageConfig, promptText, references);
        }
        if (provider === "openai") {
          return generateWithOpenAI(imageConfig, promptText, references);
        }
        const seedreamFivePro = /dola-seedream-5-0-pro/i.test(imageConfig.model);
        const generationRequest: Record<string, unknown> = {
          model: imageConfig.model,
          prompt: promptText,
          size: settingString(imageConfig, "size", "2560x1440"),
          response_format: "url",
          watermark: settingBoolean(imageConfig, "watermark", false),
        };
        if (seedreamFive) {
          generationRequest.output_format = settingString(imageConfig, "outputFormat", "png");
        } else {
          generationRequest.negative_prompt = exclusions;
        }
        if (!seedreamFivePro) {
          generationRequest.sequential_image_generation = settingString(imageConfig, "sequentialImageGeneration", "disabled");
        }
        if (references.length) {
          const imageReferences = await Promise.all(references.map((value) => imageInput(value)));
          generationRequest.image = imageReferences.length === 1 ? imageReferences[0] : imageReferences;
        }
        const response = await modelArk("/images/generations", generationRequest);
        const result = response.data;
        const images = result.data as Array<{ url?: string }> | undefined;
        const remoteUrl = images?.[0]?.url;
        if (!remoteUrl) throw new Error("Seedream completed without returning an image.");
        return {
          remoteUrl,
          contentType: "image/png",
          providerUsage: result.usage as Record<string, unknown> | undefined,
          requestId: response.requestId,
        };
      };

      // Provider acceptance is only the first gate. Scene frames are inspected
      // before persistence, and any visible anatomy failure is regenerated from
      // the original written scene with a precise correction. A rejected frame
      // never becomes a Studio asset.
      let generated: GeneratedImage | null = null;
      let safetyAttempts = 0;
      let safetySoftened = false;
      let anatomyReview: SceneImageAnatomyReview | null = null;
      let anatomyRetryAttempts = 0;
      let imageProviderRequestCount = 0;
      let generatedImageCount = 0;
      let providerReportedCostUsd = 0;
      let finalGenerationPrompt = effectivePrompt;
      const anatomyAttemptLimit = imagePurpose === "scene" ? MAX_ANATOMY_ATTEMPTS : 1;
      const safetyAttemptLimit = imagePurpose === "sprint-test" ? 1 : MAX_IMAGE_ATTEMPTS;
      for (let anatomyAttempt = 0; anatomyAttempt < anatomyAttemptLimit; anatomyAttempt += 1) {
        const qualityPrompt = anatomyAttempt === 0 || !anatomyReview
          ? effectivePrompt
          : `${effectivePrompt}\n\n${buildAnatomyRetryDirection(anatomyReview)}`;
        let candidate: GeneratedImage | null = null;
        for (let safetyAttempt = 0; safetyAttempt < safetyAttemptLimit; safetyAttempt += 1) {
          const attemptPrompt = safetyAttempt === 0
            ? qualityPrompt
            : softenPromptForSafety(qualityPrompt, safetyAttempt);
          try {
            imageProviderRequestCount += 1;
            candidate = await providerScheduler(
              provider,
              settingNumber(imageConfig, "concurrencyCap", 4),
            ).submit(attemptPrompt, runImageProvider);
            generatedImageCount += 1;
            providerReportedCostUsd += recordNumber(candidate.providerUsage, "cost_usd", "cost") ?? 0;
            safetySoftened = safetySoftened || safetyAttempt > 0;
            finalGenerationPrompt = attemptPrompt;
            break;
          } catch (error) {
            if (!isSafetyRejection(error) || safetyAttempt === safetyAttemptLimit - 1) throw error;
            safetyAttempts += 1;
          }
        }
        if (!candidate) throw new Error("Image generation did not return a result.");
        if (imagePurpose !== "scene") {
          generated = candidate;
          break;
        }
        anatomyReview = await reviewSceneImageAnatomy({
          image: candidate,
          prompt: qualityPrompt,
        });
        if (anatomyReview.pass) {
          generated = candidate;
          break;
        }
        anatomyRetryAttempts = anatomyAttempt + 1;
      }
      if (!generated) {
        const issues = anatomyReview?.issues.length
          ? anatomyReview.issues.join("; ")
          : anatomyReview?.correction || "visible hand anatomy failed review";
        throw new Error(`Scene frame failed anatomy review after ${MAX_ANATOMY_ATTEMPTS} attempts: ${issues}`);
      }
      const providerMetadata = {
        ...referenceMetadata,
        ...(imagePurpose === "character-sheet"
          ? { characterSheetRole: "composite", videoReferenceSafe: false }
          : {}),
        ...(safetyAttempts ? { safetyRetryAttempts: safetyAttempts, safetyPromptSoftened: safetySoftened } : {}),
        ...(imagePurpose === "scene" && anatomyReview
          ? {
              anatomyReview,
              anatomyRetryAttempts,
              imageProviderRequestCount,
              generatedImageCount,
            }
          : {}),
        provider,
        model: imageConfig.model,
        quality: settingString(imageConfig, "quality", "medium"),
        size: settingString(imageConfig, "size", "2560x1440"),
        ...(consistencyWarnings.length ? { characterCardConsistencyWarnings: consistencyWarnings } : {}),
      };
      const asset = generated.remoteUrl
        ? await saveRemoteMediaAsset({
            characterId,
            kind: "gallery",
            provider,
            remoteUrl: generated.remoteUrl,
            prompt: finalGenerationPrompt,
            metadata: providerMetadata,
          })
        : await saveMediaAsset({
            characterId,
            kind: "gallery",
            provider,
            bytes: generated.bytes!,
            contentType: generated.contentType,
            prompt: finalGenerationPrompt,
            metadata: providerMetadata,
          });
      const providerUsage = generated.providerUsage;
      const panelAssetIds = imagePurpose === "character-sheet"
        ? await cropCharacterSheet({
            characterId,
            compositeAssetId: asset.id,
            compositeUrl: asset.url,
            provider,
            prompt: finalGenerationPrompt,
          })
        : null;
      const inputTokens = recordNumber(providerUsage, "prompt_tokens", "input_tokens");
      const outputTokens = recordNumber(providerUsage, "completion_tokens", "output_tokens");
      const providerTokens = recordNumber(providerUsage, "total_tokens")
        ?? ((inputTokens ?? 0) + (outputTokens ?? 0) || undefined);
      await completeGeneration(
        jobId,
        asset.id,
        providerMetadata,
        await calculateGenerationBilling({
          kind: "gallery",
          provider,
          model: imageConfig.model,
          usage: {
            imageCount: generatedImageCount,
            inputTokens,
            outputTokens,
            providerTokens,
            providerUsage,
          },
          providerCostUsd: providerReportedCostUsd > 0 ? providerReportedCostUsd : undefined,
        }),
        generated.requestId
      );
      generationCompleted = true;
      if (directorSprintGrant) {
        await finishDirectorSprintDecisionTrace({
          traceId: directorSprintTraceId,
          grant: directorSprintGrant,
          status: "succeeded",
          assetId: asset.id,
        });
      }
      return Response.json({
        url: asset.url,
        assetId: asset.id,
        ...(panelAssetIds ? { compositeAssetId: asset.id, panelAssetIds } : {}),
        provider,
        model: imageConfig.model,
        ...(imagePurpose === "scene"
          ? {
              qualityReview: {
                anatomyPassed: true,
                retryAttempts: anatomyRetryAttempts,
              },
            }
          : {}),
      });
    }

    if (action === "video") {
      const videoConfig = pipeline.stages.video;
      requireStage(videoConfig, "Video");
      /*
        This ceiling used to be 3000, which is stricter than the compaction the
        route immediately applies (1450 for video). A full director's prompt is
        longer than 3000, so pipeline runs died at the shot-packages step with
        "prompt must be between 10 and 3000 characters" before compaction — the
        very thing that would have trimmed it — ever ran. The bound now only
        guards against absurd payloads; compactVisualDirection still decides what
        actually reaches the provider.
      */
      const requestedPrompt = text(input, "prompt", 10, 12000);
      const styleContractText = await resolveStyleContractText();
      let boardSlot: AdSlot | null = null;
      let adBoard: import("@/lib/ad-board").AdBoard | null = null;
      if (input.adBoard !== undefined) {
        const board = adBoardSchema.parse(input.adBoard);
        adBoard = board;
        const boardSlotId = text(input, "boardSlotId", 1, 200);
        assertAdSlotQueueable(board, boardSlotId);
        boardSlot = board.slots.find((slot) => slot.id === boardSlotId) ?? null;
        if (!boardSlot) throw new RequestValidationError("Ad-board slot was not found.");
      }
      const tier: RenderTier = boardSlot?.tier
        ?? (input.tier === "draft" ? "draft" : "final");
      const draftTaskId = typeof input.draftTaskId === "string" ? input.draftTaskId.trim() : "";
      const boardMotionPrompt = boardSlot
        ? boardSlot.motion.mode === "forward"
          ? stripForwardTargetFrameLanguage(boardSlot.motion.prompt)
          : boardSlot.motion.prompt
        : "";
      const silentPrompt = boardSlot
        ? [
            boardSlot.identity_block,
            `WARDROBE STATE: ${boardSlot.wardrobe_state}`,
            `AGE STATE: ${boardSlot.age_state}`,
            requestedPrompt,
            boardMotionPrompt,
          ].join("\n")
        : requestedPrompt;
      const requestedReference = typeof input.referenceImage === "string" ? input.referenceImage : "";
      const requestedLastFrame = typeof input.lastFrameImage === "string" ? input.lastFrameImage : "";
      if (boardSlot?.motion.mode === "ff_lf" && !requestedLastFrame) {
        throw new RequestValidationError("First/last-frame motion requires the supplied last-frame asset URL.");
      }
      const requestedReferenceAudio = typeof input.referenceAudio === "string" ? input.referenceAudio.trim() : "";
      const requestedDialogueText = typeof input.dialogueText === "string" ? input.dialogueText.trim() : "";
      const wantsCompleteNativeAudio = input.nativeAudio === true;
      const production = await getCharacterProductionState(characterId);
      const canonicalReference = production.visualReference;
      // A production-approved frame is more specific than the actor's general
      // profile image and must remain the binding source for image-to-video.
      const reference = requestedReference || canonicalReference?.url || "";
      if (boardSlot?.motion.mode === "ff_lf" && !reference) {
        throw new RequestValidationError("First/last-frame motion requires the supplied first-frame asset URL.");
      }
      // Applied after compaction so the audio brief is never trimmed away.
      const durationSeconds = boardSlot
        ? boardSlot.duration_ms / 1000
        : Number.isFinite(Number(input.durationSeconds))
          ? Math.min(12, Math.max(1, Number(input.durationSeconds)))
          : settingNumber(videoConfig, "durationSeconds", 5);
      const card = readCharacterCardV2(requestCharacter?.cardV2);
      const voiceSlot = card ? (card.voice_slots.primary ?? Object.values(card.voice_slots)[0]) : undefined;
      const resolvedAudioPlan = boardSlot && adBoard
        ? resolveAudioPlan(
            boardSlot,
            seedanceAudioCapability(videoConfig.model),
            {
              delivery_at_rest: voiceSlot?.pacing,
              delivery_under_pressure: voiceSlot?.pressure_delivery,
              signature_sfx: card?.signature_sfx_events?.flatMap((event) => [event.label, event.prompt]) ?? [],
            },
            adBoard.audio_mode,
          )
        : null;
      const referenceAudio = resolvedAudioPlan
        ? resolvedAudioPlan.dialogue.owner === "native" ? boardSlot?.dialogue_url ?? "" : ""
        : requestedReferenceAudio;
      const dialogueText = boardSlot?.vo_line ?? requestedDialogueText;
      const wantsSceneAudio = resolvedAudioPlan
        ? audioPlanUsesNative(resolvedAudioPlan)
        : settingBoolean(videoConfig, "generateAudio", true);
      if (wantsCompleteNativeAudio && !wantsSceneAudio) {
        throw new RequestValidationError("One complete take requires native Seedance audio to be enabled in Pipeline Lab.");
      }
      const composedPrompt = visualGenerationPrompt(videoConfig, silentPrompt, "video");
      const basePrompt = wantsCompleteNativeAudio
        ? composedPrompt
        : resolvedAudioPlan
        ? composedPrompt
        : prepareSeedanceAudioPrompt({
            prompt: composedPrompt,
            generateAudio: wantsSceneAudio,
            referenceAudioUrl: referenceAudio,
            dialogueText,
          });
      const referenceMetadata = {
        referenceImage: reference || null,
        referenceAssetId: requestedReference ? null : canonicalReference?.assetId ?? null,
        referenceSource: requestedReference ? "production-approved-frame" : canonicalReference?.source ?? null,
        tier,
        resolution: boardSlot ? renderResolution(tier) : settingString(videoConfig, "resolution", "720p"),
        ...(boardSlot
          ? {
              adBoardSlotId: boardSlot.id,
              motionMode: boardSlot.motion.mode,
              motionReason: boardSlot.motion_reason,
              identity_block: boardSlot.identity_block,
              wardrobe_state: boardSlot.wardrobe_state,
              age_state: boardSlot.age_state,
            }
          : {}),
      };
      /*
        An explicit audio plan opts a shot into the AUDIO SCENE grammar. Without
        one the prompt is unchanged, so the silent-plate and ambient paths keep
        behaving exactly as before. resolveAudioScene owns the Path A / Path B
        decision: a model that cannot take the locked recording is never asked
        to voice the actor, and such a shot is marked post-mix instead.
      */
      const audioPlan = input.audioPlan && typeof input.audioPlan === "object"
        ? input.audioPlan as { ambience?: unknown; sfxMoments?: unknown }
        : null;
      const audioScene = !resolvedAudioPlan && audioPlan?.ambience
        ? resolveAudioScene({
            model: videoConfig.model,
            generateAudio: wantsSceneAudio,
            shotDurationSeconds: durationSeconds,
            plan: {
              dialogueLine: dialogueText || undefined,
              ambience: String(audioPlan.ambience),
              sfxMoments: Array.isArray(audioPlan.sfxMoments)
                ? (audioPlan.sfxMoments as Array<{ description?: unknown; atSeconds?: unknown }>)
                    .filter((moment) => moment && typeof moment.description === "string")
                    .map((moment) => ({
                      description: String(moment.description),
                      atSeconds: Number(moment.atSeconds) || 0,
                    }))
                : [],
            },
            speakerName: requestCharacter?.name,
            /*
              Claim the reference exactly when the request will carry it. A shot
              with a line sends the still as reference media so the voice can
              ride along and the actor speaks; a shot without one keeps its
              first frame and is post-mixed. The prompt has to agree with the
              transport, or the model is told to lip-sync to nothing.
            */
            referenceAudioUrl: (referenceAudio && dialogueText && seedanceSupportsAudioReference(videoConfig.model))
              ? referenceAudio
              : undefined,
          })
        : null;
      const audioReadyPrompt = resolvedAudioPlan
        ? `${basePrompt}\n${buildAudioSceneBlock({
            plan: resolvedAudioPlan,
            durationMs: boardSlot!.duration_ms,
            delivery: boardSlot!.slot_no <= 3 ? voiceSlot?.pressure_delivery : voiceSlot?.pacing,
          })}`
        : audioScene?.block ? `${basePrompt}\n${audioScene.block}` : basePrompt;
      const standardizedVideoPrompt = finalizeVideoPrompt(
        injectStyleContract(
          [
            motionGrammarIssues(audioReadyPrompt).some((issue) => /camera move/i.test(issue.message))
              ? "Camera: slow push in."
              : "",
            motionGrammarIssues(audioReadyPrompt).some((issue) => /in-scene event/i.test(issue.message))
              ? `Subject event: ${requestedPrompt}.`
              : "",
            audioReadyPrompt,
          ].filter(Boolean).join("\n"),
          styleContractText ? { contract_text: styleContractText } : null,
        ),
        Boolean(requestCharacter),
      );
      const styledVideoPrompt = wantsCompleteNativeAudio
        ? standardizedVideoPrompt.replace(/\bNo music\.\s*/gi, "").trim()
        : standardizedVideoPrompt;
      const motionIssues = motionGrammarIssues(styledVideoPrompt);
      const motionFailures = motionIssues.filter((issue) => issue.level === "failure");
      if (motionFailures.length) {
        throw new RequestValidationError(motionFailures.map((issue) => issue.message).join(" "));
      }
      const promptBudget = budgetVideoPrompt(
        styledVideoPrompt,
        wantsCompleteNativeAudio ? "native_multishot" : "image_to_video",
      );
      const prompt = promptBudget.prompt;
      const bannedVideoPhrase = bannedPromptWord(prompt);
      if (bannedVideoPhrase) {
        throw new RequestValidationError(`Video prompt contains banned phrase "${bannedVideoPhrase}".`);
      }
      if (resolvedAudioPlan && boardSlot) {
        const audioFailures = lintAudioPlan({
          slot: boardSlot,
          plan: resolvedAudioPlan,
          videoPrompt: prompt,
          audioReferenceAttached: resolvedAudioPlan.dialogue.owner === "native" && Boolean(referenceAudio),
        }).filter((issue) => issue.level === "failure");
        if (audioFailures.length) {
          throw new RequestValidationError(audioFailures.map((issue) => `${issue.rule}: ${issue.message}`).join(" "));
        }
      }
      const consistencyWarnings = mediaPromptWarnings(requestCharacter, prompt, "video");
      jobId = await startGeneration({
        characterId,
        kind: "video",
        provider: videoConfig.provider,
        model: videoConfig.model,
        prompt,
        // The ledger records how a shot's audio was produced, so a delivered cut
        // that needs its line mixed in is identifiable without re-reading the
        // prompt.
        metadata: {
          ...referenceMetadata,
          promptBudget: {
            originalWords: promptBudget.originalWords,
            finalWords: promptBudget.finalWords,
            trimmed: promptBudget.trimmed,
            dropped: promptBudget.dropped,
            originalPrompt: promptBudget.trimmed ? promptBudget.original : null,
          },
          motionGrammarWarnings: motionIssues.filter((issue) => issue.level === "warning").map((issue) => issue.message),
          ...(consistencyWarnings.length ? { characterCardConsistencyWarnings: consistencyWarnings } : {}),
          ...(audioScene
            ? {
                audioMode: audioScene.mode,
                audioPostMix: audioScene.postMix,
                dialogueCharacters: dialogueText.length,
              }
            : {}),
          ...(resolvedAudioPlan
            ? {
                audioPlan: resolvedAudioPlan,
                audioLayers: {
                  dialogue: resolvedAudioPlan.dialogue.owner,
                  ambience: resolvedAudioPlan.ambience.owner,
                  sfx: resolvedAudioPlan.sfx.owner,
                  music: resolvedAudioPlan.music.owner,
                },
                dialogueCharacters: dialogueText.length,
                ttsCharacters: dialogueText.length,
                sfxJobs: resolvedAudioPlan.sfx.owner === "generated" ? resolvedAudioPlan.sfx.events.length : 0,
              }
            : {}),
          durationSeconds,
          generationMode: wantsCompleteNativeAudio ? "single-take" : "scene-clip",
          nativeAudio: wantsCompleteNativeAudio,
        },
      });
      const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
      if (boardSlot?.motion.mode === "ff_lf") {
        content.push(
          { type: "image_url", image_url: { url: await imageInput(reference) }, role: "first_frame" },
          { type: "image_url", image_url: { url: await imageInput(requestedLastFrame) }, role: "last_frame" },
        );
      } else if (reference) {
        content.push({ type: "image_url", image_url: { url: await imageInput(reference) } });
      }
      const pollIntervalMs = settingNumber(videoConfig, "pollIntervalSeconds", 5) * 1000;
      const maximumPolls = settingNumber(videoConfig, "maximumPolls", 55);

      /*
        A speaking shot needs the locked voice attached, and ModelArk refuses a
        request that carries both first/last frame content and reference media.
        The still was kept as the first frame, so every dialogue shot dropped
        the voice and no scene ever lip-synced - characters just moved around.

        The conflict is between the two *roles*, not between an image and audio.
        So for a shot that actually has a line, the still is sent as reference
        media alongside the voice: identity is still anchored, and the actor can
        speak. Exact-first-frame locking is the thing traded away, and only on
        shots where someone talks.
      */
      const wantsLipSync = boardSlot?.motion.mode !== "ff_lf"
        && Boolean(referenceAudio)
        && Boolean(dialogueText)
        && resolvedAudioPlan?.dialogue.owner !== "post_mix"
        && seedanceSupportsAudioReference(videoConfig.model);

      const runVideoTask = async (
        model: string,
        lipSync = false,
        taskPrompt = prompt,
        taskGenerateAudio = wantsSceneAudio,
        taskReferenceAudio = referenceAudio,
      ) => {
        const taskContent = tier === "final" && draftTaskId
          ? [{ type: "draft_task", draft_task: { id: draftTaskId } }]
          : lipSync
          ? [
              { type: "text", text: taskPrompt },
              ...(reference
                ? [{ type: "image_url", image_url: { url: await imageInput(reference) }, role: "reference_image" }]
                : []),
              { type: "audio_url", audio_url: { url: taskReferenceAudio }, role: "reference_audio" },
            ]
          : [
              { type: "text", text: taskPrompt },
              ...content.slice(1),
            ];
        /*
          ModelArk rejects a request that carries both, with
          "first/last frame content cannot be mixed with reference media
          content" - so the approved still and the locked-voice reference are
          mutually exclusive, and asking for both failed the shot outright.

          The still wins. It is the identity lock and the exact frame the shot
          animates from; losing it would let the actor's face drift, which is a
          worse failure than mixing the line in afterwards. A shot that keeps
          its first frame therefore renders without the audio reference and is
          post-mixed, which is the path resolveAudioScene already describes.
        */
        const canAttachAudio = !lipSync
          && Boolean(taskReferenceAudio)
          && seedanceSupportsAudioReference(model)
          && !reference;
        if (canAttachAudio) {
          taskContent.push({
            type: "audio_url",
            audio_url: { url: taskReferenceAudio },
            role: "reference_audio",
          });
        }
        const createdResponse = await modelArk("/contents/generations/tasks", {
          model,
          content: taskContent,
          resolution: boardSlot ? renderResolution(tier) : settingString(videoConfig, "resolution", "720p"),
          duration: durationSeconds,
          ratio: settingString(videoConfig, "ratio", "16:9"),
          generate_audio: taskGenerateAudio,
          watermark: settingBoolean(videoConfig, "watermark", false),
          ...(boardSlot && tier === "draft" ? { draft: true } : {}),
        });
        const taskId = createdResponse.data.id;
        if (typeof taskId !== "string") throw new Error("Seedance did not return a task ID.");
        let task: Record<string, unknown> = {};
        /*
          Ask before waiting.

          This slept a full interval before its first check, so a shot that was
          already finished still cost that interval, and every later check was
          up to one interval behind the provider. The studio therefore kept
          showing a progress bar for a video the feed and asset canvas had
          already received. Polling now checks immediately and sleeps only
          between attempts, which removes a guaranteed dead wait from every
          render and halves the average detection lag.
        */
        for (let attempt = 0; attempt < maximumPolls; attempt += 1) {
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          task = (await modelArk(`/contents/generations/tasks/${encodeURIComponent(taskId)}`)).data;
          if (task.status === "succeeded") break;
          if (["failed", "cancelled", "expired"].includes(String(task.status))) {
            const providerError = task.error as { message?: string } | undefined;
            throw new Error(providerError?.message ?? `Seedance task ${task.status}.`);
          }
        }
        if (task.status !== "succeeded") throw new Error("Seedance timed out before completion.");
        const generated = task.content as { video_url?: string } | undefined;
        if (!generated?.video_url) throw new Error("Seedance completed without returning a video.");
        return {
          videoUrl: generated.video_url,
          taskId,
          usage: task.usage as Record<string, unknown> | undefined,
          requestId: createdResponse.requestId,
        };
      };

      /*
        The Dreamina line refuses image-to-video whenever the seed still reads as
        a photograph of a real person — which is exactly what Chaplin's identity
        stills are designed to look like, so the better the still, the more
        reliably the shot is rejected. Softening the prompt cannot help: the
        refusal is about the input image, not the text. Fall back to the raw
        ByteDance model, which carries a different policy, before losing the shot.
      */
      const fallbackVideoModel = settingString(videoConfig, "fallbackModel", "seedance-1-5-pro-251215");
      const seedanceCandidates = [videoConfig.model, fallbackVideoModel]
        .filter((model, index, models) => (
          model
          && models.indexOf(model) === index
          && (!wantsCompleteNativeAudio || /dreamina-seedance-2-0/i.test(model))
        ));
      if (wantsCompleteNativeAudio && seedanceCandidates.length === 0) {
        throw new RequestValidationError("One complete 15-second take requires a Seedance 2.0 model.");
      }
      // Seedance first (cheapest, already contracted), then open weights, which
      // have no likeness filter and so cannot refuse a photoreal seed image.
      const configuredVideoAttempts: Array<{ provider: "byteplus" | "replicate"; model: string; entry?: ReplicateFallback }> = [
        ...seedanceCandidates.map((model) => ({ provider: "byteplus" as const, model })),
        ...(!wantsCompleteNativeAudio && replicateToken()
          ? replicateFallbacks(videoConfig).map((entry) => ({ provider: "replicate" as const, model: entry.model, entry }))
          : []),
      ];
      // Sprint 1 is a strict one-cycle experiment: exactly one provider attempt
      // may represent each variant. A fallback would silently turn six tests
      // into more than six generated videos and invalidate the comparison.
      const videoAttempts = directorSprintGrant ? configuredVideoAttempts.slice(0, 1) : configuredVideoAttempts;
      let videoUrl = "";
      let taskId = "";
      let videoModelUsed = videoConfig.model;
      let videoProviderUsed: "byteplus" | "replicate" = "byteplus";
      let videoUsage: Record<string, unknown> | undefined;
      let videoRequestId: string | null | undefined;
      let audioPlanUsed: AudioPlan | null = resolvedAudioPlan;
      let nativeAudioRequested = Boolean(resolvedAudioPlan && audioPlanUsesNative(resolvedAudioPlan));
      const rejectedModels: string[] = [];
      for (const attempt of videoAttempts) {
        try {
          const attemptPlan = boardSlot && adBoard
            ? resolveAudioPlan(
                boardSlot,
                attempt.provider === "byteplus"
                  ? seedanceAudioCapability(attempt.model)
                  : { audio_reference_input: false, native_audio_output: false, max_audio_ref_ms: 0 },
                {
                  delivery_at_rest: voiceSlot?.pacing,
                  delivery_under_pressure: voiceSlot?.pressure_delivery,
                  signature_sfx: card?.signature_sfx_events?.flatMap((event) => [event.label, event.prompt]) ?? [],
                },
                adBoard.audio_mode,
              )
            : null;
          const rawAttemptPrompt = attemptPlan && boardSlot
            ? `${basePrompt}\n${buildAudioSceneBlock({
                plan: attemptPlan,
                durationMs: boardSlot.duration_ms,
                delivery: boardSlot.slot_no <= 3 ? voiceSlot?.pressure_delivery : voiceSlot?.pacing,
              })}`
            : prompt;
          const attemptGrammarPrompt = [
            motionGrammarIssues(rawAttemptPrompt).some((issue) => /camera move/i.test(issue.message))
              ? "Camera: slow push in."
              : "",
            motionGrammarIssues(rawAttemptPrompt).some((issue) => /in-scene event/i.test(issue.message))
              ? `Subject event: ${requestedPrompt}.`
              : "",
            rawAttemptPrompt,
          ].filter(Boolean).join("\n");
          const standardizedAttemptPrompt = finalizeVideoPrompt(
              injectStyleContract(attemptGrammarPrompt, styleContractText ? { contract_text: styleContractText } : null),
              Boolean(requestCharacter),
            );
          const attemptPrompt = budgetVideoPrompt(
            wantsCompleteNativeAudio
              ? standardizedAttemptPrompt.replace(/\bNo music\.\s*/gi, "").trim()
              : standardizedAttemptPrompt,
            wantsCompleteNativeAudio ? "native_multishot" : "image_to_video",
          ).prompt;
          const attemptReferenceAudio = attemptPlan
            ? attemptPlan.dialogue.owner === "native" ? boardSlot?.dialogue_url ?? "" : ""
            : referenceAudio;
          const attemptGenerateAudio = attemptPlan ? audioPlanUsesNative(attemptPlan) : wantsSceneAudio;
          const attemptLipSync = attemptPlan
            ? attemptPlan.dialogue.owner === "native"
              && Boolean(attemptReferenceAudio)
              && attempt.provider === "byteplus"
              && seedanceSupportsAudioReference(attempt.model)
            : wantsLipSync && attempt.provider === "byteplus" && seedanceSupportsAudioReference(attempt.model);
          const result = await providerScheduler(
            attempt.provider,
            settingNumber(videoConfig, "concurrencyCap", 3),
          ).submit(attemptPrompt, async (scheduledPrompt) => attempt.provider === "replicate"
            ? replicateVideo({
                entry: attempt.entry!,
                prompt: scheduledPrompt,
                imageUrl: reference,
                pollIntervalMs,
                maximumPolls,
              })
            : (async () => {
                if (attemptPlan) {
                  return runVideoTask(
                    attempt.model,
                    attemptLipSync,
                    scheduledPrompt,
                    attemptGenerateAudio,
                    attemptReferenceAudio,
                  );
                }
                /*
                  Try the speaking shot first, then fall back to the silent
                  path. If ModelArk rejects the reference-media pairing, a
                  render must still happen: the line is mixed in afterwards
                  rather than the whole shot failing.
                */
                if (wantsLipSync && attempt.provider === "byteplus" && seedanceSupportsAudioReference(attempt.model)) {
                  try {
                    return await runVideoTask(attempt.model, true, scheduledPrompt);
                  } catch (lipSyncError) {
                    const detail = lipSyncError instanceof Error ? lipSyncError.message : "";
                    if (!/content|reference|not valid|invalid/i.test(detail)) throw lipSyncError;
                  }
                }
                return runVideoTask(attempt.model, false, scheduledPrompt);
              })());
          videoUrl = result.videoUrl;
          taskId = result.taskId;
          videoUsage = result.usage;
          videoRequestId = result.requestId;
          videoModelUsed = attempt.model;
          videoProviderUsed = attempt.provider;
          audioPlanUsed = attemptPlan ?? resolvedAudioPlan;
          nativeAudioRequested = Boolean(attemptPlan && audioPlanUsesNative(attemptPlan));
          break;
        } catch (error) {
          const isLastAttempt = attempt === videoAttempts[videoAttempts.length - 1];
          if (!isSafetyRejection(error) || isLastAttempt) throw error;
          rejectedModels.push(`${attempt.model}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const asset = await saveRemoteMediaAsset({
        characterId,
        kind: "video",
        provider: videoProviderUsed,
        remoteUrl: videoUrl,
        prompt,
        durationSeconds,
        metadata: {
          taskId,
          videoModel: videoModelUsed,
          videoProvider: videoProviderUsed,
          ...(rejectedModels.length ? { safetyRejectedModels: rejectedModels } : {}),
          ...(audioPlanUsed
            ? {
                audioPlan: audioPlanUsed,
                nativeAudioRequested,
                ttsCharacters: dialogueText.length,
                sfxJobs: audioPlanUsed.sfx.owner === "generated" ? audioPlanUsed.sfx.events.length : 0,
              }
            : {}),
          ...referenceMetadata,
          ...(consistencyWarnings.length ? { characterCardConsistencyWarnings: consistencyWarnings } : {}),
        },
      });
      const providerUsage = videoUsage;
      await completeGeneration(
        jobId,
        asset.id,
        {
          taskId,
          videoModel: videoModelUsed,
          videoProvider: videoProviderUsed,
          ...(rejectedModels.length ? { safetyRejectedModels: rejectedModels } : {}),
          ...(audioPlanUsed
            ? {
                audioPlan: audioPlanUsed,
                nativeAudioRequested,
                ttsCharacters: dialogueText.length,
                sfxJobs: audioPlanUsed.sfx.owner === "generated" ? audioPlanUsed.sfx.events.length : 0,
              }
            : {}),
          ...referenceMetadata,
          ...(consistencyWarnings.length ? { characterCardConsistencyWarnings: consistencyWarnings } : {}),
        },
        await calculateGenerationBilling({
          kind: "video",
          usage: { durationSeconds, providerUsage, providerTokens: recordNumber(providerUsage, "total_tokens", "output_tokens") },
          providerCostUsd: recordNumber(providerUsage, "cost_usd", "cost"),
        }),
        videoRequestId ?? taskId
      );
      generationCompleted = true;
      if (directorSprintGrant) {
        await finishDirectorSprintDecisionTrace({
          traceId: directorSprintTraceId,
          grant: directorSprintGrant,
          status: "succeeded",
          assetId: asset.id,
        });
      }
      return Response.json({ url: asset.url, assetId: asset.id, taskId, tier });
    }

    return Response.json({ error: "Unknown generation action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    if (jobId && !generationCompleted) await failGeneration(jobId, message);
    if (directorSprintGrant && directorSprintTraceId && !generationCompleted) {
      await finishDirectorSprintDecisionTrace({
        traceId: directorSprintTraceId,
        grant: directorSprintGrant,
        status: "failed",
        errorMessage: message,
      }).catch((traceError) => console.error("Fail Sprint 1 decision trace:", traceError));
    }
    const status = securityErrorStatus(
      error,
      message === "Sign in to continue."
        ? 401
        : error instanceof RequestValidationError || error instanceof SyntaxError
          ? 400
          : 500,
    );
    return Response.json({ error: message }, { status });
  }
}

import "server-only";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { assertResearchTextIsAnalytical } from "@/lib/director-research";
import { timedMediaLocator } from "@/lib/director-timed-media";
import type { DirectorResearchEvent } from "@/lib/director-research";
import type { DirectorTimedMediaAnalysis, DirectorTimedMediaObservation } from "@/lib/director-timed-media";
import { createOpenAIResponse, openAIWritingModel } from "@/lib/server/openai-responses";
import { createDirectorStudy } from "@/lib/server/director-research";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

const execFileAsync = promisify(execFile);

export type TimedMediaJobInput = {
  itemId: string;
  itemUrl: string;
  mediaUrl: string;
  playbackUrl: string;
  mediaObjectId: string;
  workTitle: string;
  dateLabel: string;
  region: string;
  passageLabel: string;
  startSecond: number;
  durationSeconds: number;
};

type TimedMediaObservation = {
  startSecond: number;
  endSecond: number;
  evidence: string;
  craft: string;
  transition: string;
  narrativeJob: string;
  inference: string;
  confidence: "low" | "medium" | "high";
  audioEvidence: string;
  soundFunction: string;
};

type TimedMediaResult = {
  studyTitle: string;
  periodLabel: string;
  region: string;
  tags: string[];
  observations: TimedMediaObservation[];
  candidatePrinciples: string[];
  limitations: string;
};

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["studyTitle", "periodLabel", "region", "tags", "observations", "candidatePrinciples", "limitations"],
  properties: {
    studyTitle: { type: "string" },
    periodLabel: { type: "string" },
    region: { type: "string" },
    tags: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 16 },
    observations: {
      type: "array", minItems: 3, maxItems: 8,
      items: {
        type: "object", additionalProperties: false,
        required: ["startSecond", "endSecond", "evidence", "craft", "transition", "narrativeJob", "inference", "confidence", "audioEvidence", "soundFunction"],
        properties: {
          startSecond: { type: "number" }, endSecond: { type: "number" }, evidence: { type: "string" },
          craft: { type: "string" }, transition: { type: "string" }, narrativeJob: { type: "string" },
          inference: { type: "string" }, confidence: { type: "string", enum: ["low", "medium", "high"] },
          audioEvidence: { type: "string" }, soundFunction: { type: "string" },
        },
      },
    },
    candidatePrinciples: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 8 },
    limitations: { type: "string" },
  },
} as const;

function validateInput(value: unknown): TimedMediaJobInput {
  if (!value || typeof value !== "object") throw new Error("Timed-media job has no evidence contract.");
  const row = value as Partial<TimedMediaJobInput>;
  const media = new URL(String(row.mediaUrl ?? ""));
  const playback = new URL(String(row.playbackUrl ?? row.mediaUrl ?? ""));
  const item = new URL(String(row.itemUrl ?? ""));
  const startSecond = Number(row.startSecond);
  const durationSeconds = Number(row.durationSeconds);
  if (media.protocol !== "https:" || media.hostname !== "tile.loc.gov") throw new Error("Timed media must use the trusted Library of Congress media host.");
  if (playback.protocol !== "https:" || playback.hostname !== "tile.loc.gov") throw new Error("Timed media playback must use the trusted Library of Congress media host.");
  if (item.protocol !== "https:" || item.hostname !== "www.loc.gov") throw new Error("Timed media must retain its Library of Congress item record.");
  if (!Number.isFinite(startSecond) || startSecond < 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 90) {
    throw new Error("Timed-media passage must be between 0 and 90 seconds with a valid start.");
  }
  const required = [row.itemId, row.workTitle, row.passageLabel];
  if (required.some((candidate) => typeof candidate !== "string" || !candidate.trim())) throw new Error("Timed-media identity is incomplete.");
  return {
    itemId: row.itemId!.trim(), itemUrl: item.toString(), mediaUrl: media.toString(),
    playbackUrl: playback.toString(),
    mediaObjectId: typeof row.mediaObjectId === "string" ? row.mediaObjectId.trim() : "",
    workTitle: row.workTitle!.trim(), dateLabel: typeof row.dateLabel === "string" ? row.dateLabel.trim() : "",
    region: typeof row.region === "string" && row.region.trim() ? row.region.trim() : "United States",
    passageLabel: row.passageLabel!.trim(), startSecond, durationSeconds,
  };
}

async function ffmpeg(args: string[], timeout = 150_000) {
  if (!ffmpegPath) throw new Error("The bundled FFmpeg binary is unavailable.");
  try {
    return await execFileAsync(ffmpegPath, ["-hide_banner", "-nostdin", "-y", ...args], {
      windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024,
    });
  } catch (cause) {
    const error = cause as Error & { stderr?: string; killed?: boolean; signal?: string };
    const detail = (error.stderr || error.message).replace(/\s+/g, " ").trim().slice(-1200);
    throw new Error(`FFmpeg evidence extraction failed${error.killed ? " after timeout" : ""}: ${detail}`);
  }
}

function safeFfmpegNumber(value: number) {
  return String(Math.round(value * 1000) / 1000);
}

async function extractEvidence(input: TimedMediaJobInput, directory: string) {
  const clipPath = path.join(directory, "research-clip.mp4");
  const sheetPath = path.join(directory, "contact-sheet.jpg");
  const audioPath = path.join(directory, "audio.mp3");
  const waveformPath = path.join(directory, "waveform.png");
  const interval = Math.max(0.5, input.durationSeconds / 12);
  await ffmpeg([
    "-ss", safeFfmpegNumber(input.startSecond), "-i", input.mediaUrl,
    "-t", safeFfmpegNumber(input.durationSeconds), "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", "scale=640:-2", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
    "-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart", clipPath,
  ], 210_000);
  await ffmpeg([
    "-i", clipPath, "-map", "0:v:0", "-an",
    "-vf", `fps=1/${interval},scale=320:-2,tile=4x3:padding=2:margin=2`,
    "-frames:v", "1", "-update", "1", "-q:v", "3", sheetPath,
  ]);
  const sheet = await readFile(sheetPath);
  if (!sheet.length || sheet.length > 10 * 1024 * 1024) throw new Error("Contact-sheet extraction produced an invalid evidence image.");
  let audio: Buffer | null = null;
  let signalMetrics: Record<string, unknown> = { available: false };
  try {
    await ffmpeg([
      "-i", clipPath, "-map", "0:a:0", "-vn",
      "-ac", "1", "-ar", "16000", "-b:a", "48k", audioPath,
    ]);
    const audioStat = await stat(audioPath);
    if (audioStat.size > 0 && audioStat.size <= 25 * 1024 * 1024) {
      audio = await readFile(audioPath);
      try {
        const measurement = await ffmpeg(["-i", audioPath, "-af", "volumedetect", "-f", "null", "-"]);
        signalMetrics = {
          available: true,
          meanVolumeDb: Number(/mean_volume:\s*(-?[0-9.]+)/.exec(measurement.stderr)?.[1] ?? NaN),
          maxVolumeDb: Number(/max_volume:\s*(-?[0-9.]+)/.exec(measurement.stderr)?.[1] ?? NaN),
        };
      } catch {
        signalMetrics = { available: true };
      }
      await ffmpeg([
        "-i", audioPath, "-filter_complex", "showwavespic=s=1000x180:colors=0x36e0cd",
        "-frames:v", "1", "-update", "1", waveformPath,
      ]);
    }
  } catch {
    signalMetrics = { available: false, reason: "No usable audio stream in this passage." };
  }
  const waveform = await readFile(waveformPath).catch(() => null);
  return { sheet, waveform, audio, signalMetrics, interval };
}

async function uploadResearchArtifacts(jobId: string, artifacts: {
  sheet: Buffer;
  waveform: Buffer | null;
  evidencePackage: Buffer;
}) {
  const storage = getSupabaseAdminClient().storage.from("director-research");
  const paths = {
    contactSheet: `timed-media/${jobId}/contact-sheet.jpg`,
    ...(artifacts.waveform ? { waveform: `timed-media/${jobId}/waveform.png` } : {}),
    evidencePackage: `timed-media/${jobId}/evidence-package.json`,
  };
  const uploads = [
    storage.upload(paths.contactSheet, artifacts.sheet, { contentType: "image/jpeg", upsert: true }),
    storage.upload(paths.evidencePackage, artifacts.evidencePackage, { contentType: "application/json", upsert: true }),
    ...(artifacts.waveform && paths.waveform
      ? [storage.upload(paths.waveform, artifacts.waveform, { contentType: "image/png", upsert: true })]
      : []),
  ];
  const results = await Promise.all(uploads);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(`Archive Director Brain research assets: ${failed.error.message}`);
  return paths;
}

function chatOutputText(data: Record<string, unknown>) {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const message = choices[0] && typeof choices[0] === "object" ? (choices[0] as { message?: unknown }).message : null;
  const content = message && typeof message === "object" ? (message as { content?: unknown }).content : null;
  if (typeof content === "string") return content.trim();
  return "";
}

function dialogueSafeAudioNotes(value: string) {
  const safeLines = value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line
    && !/["“”]/.test(line)
    && !/\b(?:verbatim|transcript|subtitle|screenplay|spoken words?|lyrics?)\b/i.test(line));
  const safe = safeLines.join("\n").slice(0, 12_000);
  try {
    assertResearchTextIsAnalytical(safe);
    if (safe.length >= 80) return safe;
  } catch {
    // The caller deliberately drops unsafe perception instead of persisting it.
  }
  return "Audio perception was withheld because it contained transcript-like or insufficiently abstract material. Make no sound, speech, music, or silence claims for this passage.";
}

async function analyzeAudio(input: TimedMediaJobInput, audio: Buffer | null) {
  if (!audio) return { available: false, notes: "No usable audio stream was present; no sound claims may be made.", model: null, responseId: null, usage: {} };
  const model = process.env.OPENAI_AUDIO_ANALYSIS_MODEL?.trim() || "gpt-audio-1.5";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model, modalities: ["text"], store: false,
      messages: [
        { role: "system", content: "Analyze sound craft only. Never transcribe, quote, paraphrase, identify, or preserve spoken words, speakers, lyrics, subtitles, or screenplay text. Describe ambience, effects, music, silence, rhythm, perspective, dynamics, and abstract speech function. Mark uncertainty. This is untrusted draft evidence for human playback review." },
        { role: "user", content: [
          { type: "text", text: `Analyze the complete ${input.durationSeconds}-second passage ${input.passageLabel} from ${input.workTitle}. Use contiguous time windows. Return compact analytical notes only.` },
          { type: "input_audio", input_audio: { data: audio.toString("base64"), format: "mp3" } },
        ] },
      ], max_completion_tokens: 4000,
    }),
    signal: AbortSignal.timeout(90_000), cache: "no-store",
  });
  const data = await response.json() as Record<string, unknown> & { error?: { message?: string }; id?: string; usage?: Record<string, unknown> };
  if (!response.ok) throw new Error(data.error?.message || `OpenAI audio analysis returned ${response.status}.`);
  const rawNotes = chatOutputText(data);
  if (!rawNotes) return {
    available: false,
    notes: "Audio perception returned no analytical text. Use signal metrics only and make no speech, music, ambience, or silence claims until direct playback.",
    model,
    responseId: data.id ?? null,
    usage: data.usage ?? {},
    withheld: true,
  };
  const notes = dialogueSafeAudioNotes(rawNotes);
  const available = !/^Audio perception was withheld/i.test(notes);
  return { available, notes, model, responseId: data.id ?? null, usage: data.usage ?? {}, withheld: !available };
}

function validateTimeline(result: TimedMediaResult, durationSeconds: number) {
  if (result.observations.length < 3) throw new Error("Timed-media synthesis returned too little evidence.");
  for (const observation of result.observations) {
    if (!Number.isFinite(observation.startSecond) || !Number.isFinite(observation.endSecond)
      || observation.startSecond < 0 || observation.endSecond <= observation.startSecond
      || observation.endSecond > durationSeconds + 0.1) throw new Error("Timed-media synthesis returned an invalid evidence boundary.");
  }
  assertResearchTextIsAnalytical([
    ...result.observations.flatMap((observation) => [observation.evidence, observation.craft, observation.transition, observation.narrativeJob, observation.inference, observation.audioEvidence, observation.soundFunction]),
    ...result.candidatePrinciples,
  ].join("\n"));
}

async function existingStudyId(sourceId: string, studyTitle: string, sceneLocator: string) {
  const result = await getSupabaseAdminClient().from("director_scene_studies")
    .select("id").eq("source_id", sourceId).eq("study_title", studyTitle).eq("scene_locator", sceneLocator).maybeSingle();
  if (result.error) throw new Error(`Check timed-media study: ${result.error.message}`);
  return result.data?.id ? String(result.data.id) : null;
}

export async function processDirectorTimedMedia(inputValue: unknown, context: {
  jobId: string;
  queryKey: string;
  sourceId: string;
  sourceTitle: string;
  sourceKind: "public-domain";
  institution: string;
  rightsBasis: string;
  accessNotes: string;
  createdBy: string;
  progress: (phase: string, progress: number, message: string) => Promise<void>;
}) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured.");
  const input = validateInput(inputValue);
  const directory = await mkdtemp(path.join(tmpdir(), "chaplin-director-media-"));
  try {
    await context.progress("extracting-media", 20, `Extracting ${input.passageLabel.toLowerCase()} without retaining raw media`);
    const extracted = await extractEvidence(input, directory);
    await context.progress("analyzing-sound", 45, extracted.audio ? "Reading sound structure without transcription" : "No audio stream; continuing with visual evidence only");
    const audio = await analyzeAudio(input, extracted.audio);
    await context.progress("analyzing-picture", 65, "Reading framing, blocking, geography, and edit changes");
    const model = openAIWritingModel(process.env.OPENAI_RESEARCH_MODEL);
    const visualResult = await createOpenAIResponse({
      model,
      instructions: [
        "You are Chaplin's rights-aware film-craft evidence analyst.",
        "The image is a 4 by 3 contact sheet read left-to-right, top-to-bottom.",
        "Record only visible evidence and the supplied abstract sound notes. Never identify performers.",
        "Never quote, reconstruct, paraphrase, or store dialogue, lyrics, subtitles, screenplay text, or expressive source prose.",
        "Separate evidence from inference. Every observation uses seconds relative to this extract, within its exact duration.",
        "Use empty audioEvidence and soundFunction when no sound evidence exists. Mark sampled visual claims medium or low when motion between cells is uncertain.",
        "The result is a draft that cannot enter production until direct human playback review and separate study approval.",
      ].join("\n"),
      messages: [{ role: "user", content: [
        { type: "input_text", text: [
          `WORK: ${input.workTitle}`,
          `PASSAGE: ${input.passageLabel}; source ${input.startSecond}-${input.startSecond + input.durationSeconds}s; analysis clock 0-${input.durationSeconds}s`,
          `PERIOD: ${input.dateLabel || "Unresolved"}; REGION: ${input.region}`,
          `SAMPLING: 12 visual cells approximately every ${extracted.interval.toFixed(3)} seconds.`,
          `SIGNAL METRICS: ${JSON.stringify(extracted.signalMetrics)}`,
          `ABSTRACT SOUND NOTES: ${audio.notes}`,
        ].join("\n") },
        { type: "input_image", image_url: `data:image/jpeg;base64,${extracted.sheet.toString("base64")}`, detail: "high" },
      ] }],
      maxOutputTokens: 6500,
      schema: RESULT_SCHEMA,
      schemaName: "director_timed_media_analysis",
    });
    const result = JSON.parse(visualResult.text) as TimedMediaResult;
    validateTimeline(result, input.durationSeconds);
    await context.progress("persisting-draft", 85, "Writing an evidence package that still requires direct playback");
    const sceneLocator = timedMediaLocator(input.startSecond, input.durationSeconds);
    let studyId = await existingStudyId(context.sourceId, result.studyTitle, sceneLocator);
    if (!studyId) {
      studyId = await createDirectorStudy({
        sourceTitle: context.sourceTitle, institution: context.institution, sourceUrl: input.itemUrl,
        sourceKind: context.sourceKind, rightsBasis: context.rightsBasis, accessNotes: context.accessNotes,
        studyTitle: result.studyTitle, workTitle: input.workTitle, sceneLocator,
        durationSeconds: input.durationSeconds, periodLabel: result.periodLabel || input.dateLabel,
        region: result.region || input.region, tags: result.tags,
        observationLines: result.observations.map((observation) => [
          `${observation.startSecond}-${observation.endSecond}`, observation.evidence, observation.craft,
          observation.transition, observation.narrativeJob, observation.inference, observation.confidence,
          observation.audioEvidence, observation.soundFunction,
        ].join(" | ")).join("\n"),
        candidatePrinciples: result.candidatePrinciples.join("\n"),
        limitations: `${result.limitations} Direct playback of ${sceneLocator} is required before review.`,
      }, context.createdBy);
    }
    const contentHash = createHash("sha256").update(JSON.stringify({ input, result })).digest("hex");
    const generatedAt = new Date().toISOString();
    const evidencePackage = Buffer.from(JSON.stringify({
      schemaVersion: "director-timed-media-evidence.1",
      generatedAt,
      provenance: {
        sourceId: context.sourceId,
        sourceTitle: context.sourceTitle,
        institution: context.institution,
        rightsBasis: context.rightsBasis,
        itemId: input.itemId,
        itemUrl: input.itemUrl,
        mediaUrl: input.mediaUrl,
        playbackUrl: input.playbackUrl,
        mediaObjectId: input.mediaObjectId,
        workTitle: input.workTitle,
        passageLabel: input.passageLabel,
        startSecond: input.startSecond,
        durationSeconds: input.durationSeconds,
      },
      method: {
        rawMediaRetained: false,
        contactSheetCells: 12,
        intervalSeconds: extracted.interval,
        signalMetrics: extracted.signalMetrics,
        models: { visualSynthesis: model, audioPerception: audio.model },
        providerResponseIds: { visualSynthesis: visualResult.data.id ?? null, audioPerception: audio.responseId },
        providerUsage: { visualSynthesis: visualResult.usage.providerUsage, audioPerception: audio.usage },
      },
      findings: result,
      review: {
        status: "required",
        humanPlaybackRequired: true,
        productionRetrievalAllowed: false,
      },
      contentHash,
    }, null, 2), "utf8");
    const artifactPaths = await uploadResearchArtifacts(context.jobId, {
      sheet: extracted.sheet,
      waveform: extracted.waveform,
      evidencePackage,
    });
    const persisted = await getSupabaseAdminClient().from("director_timed_media_analyses").upsert({
      source_id: context.sourceId, research_job_id: context.jobId, study_id: studyId, query_key: context.queryKey,
      item_id: input.itemId, item_url: input.itemUrl, media_url: input.mediaUrl, playback_url: input.playbackUrl, media_object_id: input.mediaObjectId,
      work_title: input.workTitle, start_second: input.startSecond, duration_seconds: input.durationSeconds,
      visual_analysis: { contactSheetCells: 12, intervalSeconds: extracted.interval, sampling: "transient" },
      audio_analysis: { available: audio.available }, signal_metrics: extracted.signalMetrics,
      observations: result.observations, candidate_principles: result.candidatePrinciples, limitations: result.limitations,
      models: { visualSynthesis: model, audioPerception: audio.model },
      provider_response_ids: { visualSynthesis: visualResult.data.id ?? null, audioPerception: audio.responseId },
      provider_usage: { visualSynthesis: visualResult.usage.providerUsage, audioPerception: audio.usage },
      artifact_paths: artifactPaths, content_hash: contentHash, playback_status: "required",
      created_by: context.createdBy, updated_at: generatedAt,
    }, { onConflict: "source_id,query_key" }).select("id").single();
    if (persisted.error || !persisted.data) throw new Error(`Persist timed-media evidence: ${persisted.error?.message ?? "No record returned."}`);
    return {
      analysisId: String(persisted.data.id), studyId, observationCount: result.observations.length,
      principleCount: result.candidatePrinciples.length, model,
      usage: { visualSynthesis: visualResult.usage.providerUsage, audioPerception: audio.usage },
      providerResponseIds: { visualSynthesis: visualResult.data.id ?? null, audioPerception: audio.responseId },
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

type TimedMediaRow = {
  id: string; research_job_id: string; study_id: string | null; work_title: string;
  item_url: string; media_url: string; playback_url: string; start_second: number | string; duration_seconds: number | string;
  query_key: string; observations: unknown; candidate_principles: unknown; playback_status: DirectorTimedMediaAnalysis["playbackStatus"];
  limitations: string; review_notes: string; models: Record<string, unknown> | null; created_at: string; updated_at: string; reviewed_at: string | null;
  artifact_paths: Record<string, unknown> | null;
};

function observationsFromRow(value: unknown): DirectorTimedMediaObservation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DirectorTimedMediaObservation => Boolean(
    item && typeof item === "object"
    && Number.isFinite(Number((item as DirectorTimedMediaObservation).startSecond))
    && Number.isFinite(Number((item as DirectorTimedMediaObservation).endSecond))
  ));
}

function analysisFromRow(
  row: TimedMediaRow,
  artifactUrls: DirectorTimedMediaAnalysis["artifactUrls"] = {},
  events: DirectorResearchEvent[] = [],
): DirectorTimedMediaAnalysis {
  const observations = observationsFromRow(row.observations);
  const candidatePrinciples = Array.isArray(row.candidate_principles)
    ? row.candidate_principles.filter((item): item is string => typeof item === "string")
    : [];
  return {
    id: row.id, jobId: row.research_job_id, studyId: row.study_id, workTitle: row.work_title,
    itemUrl: row.item_url, mediaUrl: row.media_url, playbackUrl: row.playback_url || row.media_url, startSecond: Number(row.start_second),
    durationSeconds: Number(row.duration_seconds), queryKey: row.query_key,
    observations, candidatePrinciples, limitations: row.limitations,
    observationCount: observations.length, principleCount: candidatePrinciples.length,
    playbackStatus: row.playback_status, reviewNotes: row.review_notes, models: row.models ?? {},
    artifactUrls, events,
    createdAt: row.created_at, updatedAt: row.updated_at, reviewedAt: row.reviewed_at,
  };
}

function artifactPathEntries(row: TimedMediaRow) {
  const paths = row.artifact_paths ?? {};
  return (["contactSheet", "waveform", "evidencePackage"] as const)
    .map((key) => [key, typeof paths[key] === "string" ? String(paths[key]) : ""] as const)
    .filter((entry) => entry[1]);
}

export async function listDirectorTimedMediaAnalyses(limit = 200) {
  const result = await getSupabaseAdminClient().from("director_timed_media_analyses").select("*")
    .order("updated_at", { ascending: false }).limit(Math.max(1, Math.min(500, limit)));
  if (result.error) {
    if (/director_timed_media_analyses|schema cache|does not exist/i.test(result.error.message)) return [];
    throw new Error(`Load timed-media analyses: ${result.error.message}`);
  }
  const rows = (result.data ?? []) as TimedMediaRow[];
  const supabase = getSupabaseAdminClient();
  const storage = supabase.storage.from("director-research");
  const jobIds = rows.map((row) => row.research_job_id);
  const analysisIds = rows.map((row) => row.id);
  const [jobEventsResult, analysisEventsResult] = await Promise.all([
    jobIds.length
      ? supabase.from("director_research_events").select("*").in("job_id", jobIds).order("created_at", { ascending: true }).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    analysisIds.length
      ? supabase.from("director_research_events").select("*").in("analysis_id", analysisIds).order("created_at", { ascending: true }).limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const eventRows = [...(jobEventsResult.data ?? []), ...(analysisEventsResult.data ?? [])] as Array<Record<string, unknown>>;
  const eventsByJob = new Map<string, DirectorResearchEvent[]>();
  for (const event of eventRows) {
    const jobId = typeof event.job_id === "string" ? event.job_id : "";
    if (!jobId) continue;
    const id = String(event.id ?? "");
    const existing = eventsByJob.get(jobId) ?? [];
    if (existing.some((item) => item.id === id)) continue;
    existing.push({
      id,
      kind: String(event.event_kind ?? "update"),
      phase: String(event.phase ?? ""),
      status: String(event.status ?? ""),
      progress: event.progress == null ? null : Number(event.progress),
      message: String(event.message ?? ""),
      details: event.details && typeof event.details === "object" && !Array.isArray(event.details) ? event.details as Record<string, unknown> : {},
      actor: typeof event.actor === "string" ? event.actor : null,
      createdAt: String(event.created_at ?? ""),
    });
    eventsByJob.set(jobId, existing);
  }
  return Promise.all(rows.map(async (row) => {
    const entries = artifactPathEntries(row);
    const artifactUrls: DirectorTimedMediaAnalysis["artifactUrls"] = {};
    await Promise.all(entries.map(async ([key, artifactPath]) => {
      const signed = await storage.createSignedUrl(artifactPath, 60 * 60);
      if (!signed.error && signed.data?.signedUrl) artifactUrls[key] = signed.data.signedUrl;
    }));
    const events = (eventsByJob.get(row.research_job_id) ?? []).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return analysisFromRow(row, artifactUrls, events);
  }));
}

export async function reviewDirectorTimedMediaAnalysis(input: Record<string, unknown>, userId: string) {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  const playbackStatus = input.playbackStatus === "verified" || input.playbackStatus === "rejected" ? input.playbackStatus : null;
  const reviewNotes = typeof input.reviewNotes === "string" ? input.reviewNotes.trim().slice(0, 2000) : "";
  if (!id || !playbackStatus) throw new Error("Choose a timed-film analysis and a playback decision.");
  if (reviewNotes.length < 20) throw new Error("Record what direct playback confirmed or contradicted.");
  const supabase = getSupabaseAdminClient();
  const current = await supabase.from("director_timed_media_analyses").select("id,study_id").eq("id", id).maybeSingle();
  if (current.error || !current.data) throw new Error(current.error?.message ?? "Timed-film analysis was not found.");
  const now = new Date().toISOString();
  const updated = await supabase.from("director_timed_media_analyses").update({
    playback_status: playbackStatus, review_notes: reviewNotes, reviewed_by: userId, reviewed_at: now, updated_at: now,
  }).eq("id", id);
  if (updated.error) throw new Error(`Review timed-film analysis: ${updated.error.message}`);
  if (current.data.study_id) {
    const study = await supabase.from("director_scene_studies").update({
      status: playbackStatus === "verified" ? "reviewed" : "rejected",
      review_notes: reviewNotes, reviewed_by: userId, reviewed_at: now, updated_at: now,
    }).eq("id", current.data.study_id).in("status", ["draft", "reviewed"]);
    if (study.error) throw new Error(`Update timed-film study review: ${study.error.message}`);
  }
  return listDirectorTimedMediaAnalyses();
}

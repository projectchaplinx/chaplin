import "server-only";

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  defaultDirectorSprintTwoContract,
  DIRECTOR_SPRINT_TWO_KEY,
  type DirectorSprintTwoBundle,
  type DirectorSprintTwoVariant,
} from "@/lib/director-sprint-two";
import { getPipelineConfig } from "@/lib/server/pipeline-config";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import {
  beginGeneration,
  completeGeneration,
  failGeneration,
  getCharacterProductionState,
  listCharacters,
  saveMediaAsset,
} from "@/lib/server/supabase-admin";
import { calculateGenerationBilling } from "@/lib/server/billing";
import { elevenLabsApiKey } from "@/lib/elevenlabs-config";
import { measureStoredAudioMs } from "@/lib/server/ad-board-media";
import { ffmpegExecutable } from "@/lib/server/ffmpeg-runtime";

const execute = promisify(execFile);

function joined<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function listDirectorSprintTwo(): Promise<DirectorSprintTwoBundle> {
  const supabase = getSupabaseAdminClient();
  const characters = (await listCharacters()).map((character) => ({
    id: character.id, name: character.name, archetype: character.archetype, imageUrl: character.imageUrl ?? null,
  })).sort((left, right) => left.name.localeCompare(right.name));
  const runsResult = await supabase
    .from("director_dense_verifier_runs")
    .select("id,sprint_key,status,model,sample_fps,expected_candidates,calibration_count,calibration_matches,calibrated,cost_usd,failure_summary,created_at,completed_at")
    .order("created_at", { ascending: false });
  if (runsResult.error) {
    if (/does not exist|schema cache/i.test(runsResult.error.message)) {
      return { storageReady: false, characters, runs: [], activeRunId: null, verifications: [], shortlist: [], comparison: null, voice: null, outputs: [], evaluations: [], matrix: { runId: null, status: null, keyframes: 0, videoShots: 0, mixes: 0, evaluations: 0, humanPicks: 0 } };
    }
    throw new Error(`Load dense verifier runs: ${runsResult.error.message}`);
  }
  const runRows = runsResult.data ?? [];
  const active = runRows.find((row) => row.status === "succeeded") ?? runRows[0] ?? null;
  if (!active) {
    return { storageReady: true, characters, runs: [], activeRunId: null, verifications: [], shortlist: [], comparison: null, voice: null, outputs: [], evaluations: [], matrix: { runId: null, status: null, keyframes: 0, videoShots: 0, mixes: 0, evaluations: 0, humanPicks: 0 } };
  }
  const [verificationResult, shortlistResult, sprintResult] = await Promise.all([
    supabase.from("director_dense_verifications")
      .select("id,verifier_run_id,assessment_id,verdict,frame_count,evidence_summary,refutation,confidence,human_verdict,calibration_match,response_id,created_at,director_principle_assessments(principle_text,character_axis,director_scene_studies(work_title))")
      .eq("verifier_run_id", active.id).order("created_at"),
    supabase.from("director_dense_shortlist_entries")
      .select("id,assessment_id,shortlist_rank,character_axis,duplicate_key,rank_score,ranking_rationale,director_principle_assessments(principle_text,director_scene_studies(work_title))")
      .eq("verifier_run_id", active.id).order("shortlist_rank"),
    supabase.from("director_sprint_two_runs")
      .select("id,status,character_id,fixed_brief,locked_line,lighting_plan,audio_plan,camera_plan,variants,characters(name)")
      .eq("verifier_run_id", active.id).maybeSingle(),
  ]);
  if (verificationResult.error) throw new Error(`Load dense verifications: ${verificationResult.error.message}`);
  if (shortlistResult.error) throw new Error(`Load dense shortlist: ${shortlistResult.error.message}`);
  if (sprintResult.error) throw new Error(`Load Sprint 2 matrix: ${sprintResult.error.message}`);
  const sprint = sprintResult.data;
  let outputRows: Array<Record<string, unknown>> = [];
  let voice: DirectorSprintTwoBundle["voice"] = null;
  let evaluationCount = 0;
  let evaluationRows: Array<Record<string, unknown>> = [];
  let pickCount = 0;
  if (sprint) {
    const [outputs, evaluations, picks] = await Promise.all([
      supabase.from("director_sprint_two_outputs")
        .select("id,variant_id,output_kind,duration_seconds,shot_index,status,provider,model,voice_path,what_changed,continuity_handoff,error_message,media_assets(url)")
        .eq("run_id", sprint.id).order("created_at"),
      supabase.from("director_sprint_two_evaluations")
        .select("id,output_id,identity_continuity,performance,shot_readability,lighting_continuity,audio_completeness,lip_sync,composite_score,identity_gate,audio_gate,lip_sync_gate,null_result,evidence,director_sprint_two_outputs(variant_id,duration_seconds)", { count: "exact" })
        .eq("run_id", sprint.id),
      supabase.from("director_sprint_two_human_picks").select("id", { count: "exact", head: true }).eq("run_id", sprint.id),
    ]);
    if (outputs.error) throw new Error(`Load Sprint 2 outputs: ${outputs.error.message}`);
    if (evaluations.error) throw new Error(`Load Sprint 2 evaluations: ${evaluations.error.message}`);
    if (picks.error) throw new Error(`Load Sprint 2 picks: ${picks.error.message}`);
    outputRows = outputs.data ?? [];
    evaluationCount = evaluations.count ?? 0;
    evaluationRows = evaluations.data ?? [];
    pickCount = picks.count ?? 0;
    const voiceResult = await supabase.from("director_sprint_two_voice_renders")
      .select("id,status,asset_id,error_message,media_assets(url)").eq("run_id", sprint.id).maybeSingle();
    if (voiceResult.error) throw new Error(`Load Sprint 2 voice: ${voiceResult.error.message}`);
    if (voiceResult.data) {
      const asset = joined(voiceResult.data.media_assets);
      voice = {
        id: voiceResult.data.id,
        status: voiceResult.data.status,
        assetId: voiceResult.data.asset_id,
        url: asset?.url ?? null,
        error: voiceResult.data.error_message,
      };
    }
  }
  return {
    storageReady: true,
    characters,
    runs: runRows.map((row) => ({
      id: row.id, sprintKey: row.sprint_key, status: row.status, model: row.model,
      sampleFps: Number(row.sample_fps), expectedCandidates: row.expected_candidates,
      calibrationCount: row.calibration_count, calibrationMatches: row.calibration_matches,
      calibrated: row.calibrated, costUsd: Number(row.cost_usd), failureSummary: row.failure_summary,
      createdAt: row.created_at, completedAt: row.completed_at,
    })),
    activeRunId: active.id,
    verifications: (verificationResult.data ?? []).map((row) => {
      const assessment = joined(row.director_principle_assessments);
      const study = joined(assessment?.director_scene_studies);
      return {
        id: row.id, runId: row.verifier_run_id, assessmentId: row.assessment_id,
        principle: assessment?.principle_text ?? "Preserved principle", axis: assessment?.character_axis ?? "other",
        workTitle: study?.work_title ?? "Rights-cleared source", verdict: row.verdict,
        frameCount: row.frame_count, evidenceSummary: row.evidence_summary, refutation: row.refutation,
        confidence: Number(row.confidence), humanVerdict: row.human_verdict,
        calibrationMatch: row.calibration_match, responseId: row.response_id, createdAt: row.created_at,
      };
    }),
    shortlist: (shortlistResult.data ?? []).map((row) => {
      const assessment = joined(row.director_principle_assessments);
      const study = joined(assessment?.director_scene_studies);
      return {
        id: row.id, assessmentId: row.assessment_id, rank: row.shortlist_rank,
        axis: row.character_axis, duplicateKey: row.duplicate_key, score: Number(row.rank_score),
        rationale: row.ranking_rationale, principle: assessment?.principle_text ?? "Preserved principle",
        workTitle: study?.work_title ?? "Rights-cleared source",
      };
    }),
    comparison: sprint ? {
      characterId: sprint.character_id,
      characterName: joined(sprint.characters)?.name ?? "Locked actor",
      brief: sprint.fixed_brief,
      lockedLine: sprint.locked_line,
      lightingPlan: sprint.lighting_plan as Record<string, string>,
      audioPlan: sprint.audio_plan as Record<string, string>,
      cameraPlan: sprint.camera_plan as Record<string, string>,
      variants: sprint.variants as DirectorSprintTwoVariant[],
    } : null,
    voice,
    outputs: outputRows.map((row) => ({
      id: String(row.id),
      variantId: String(row.variant_id),
      kind: row.output_kind as "keyframe" | "video-shot" | "final-mix",
      durationSeconds: Number(row.duration_seconds) as 5 | 15,
      shotIndex: Number(row.shot_index),
      status: row.status as "succeeded" | "failed",
      url: joined(row.media_assets as { url: string } | Array<{ url: string }> | null)?.url ?? null,
      provider: String(row.provider),
      model: String(row.model),
      voicePath: row.voice_path as "A-native-reference" | "B-post-mix" | "failed" | null,
      whatChanged: String(row.what_changed),
      handoff: row.continuity_handoff as Record<string, string>,
      error: String(row.error_message),
    })),
    evaluations: evaluationRows.map((row) => {
      const output = joined(row.director_sprint_two_outputs as { variant_id: string; duration_seconds: number } | Array<{ variant_id: string; duration_seconds: number }> | null);
      return {
        id: String(row.id), outputId: String(row.output_id), variantId: output?.variant_id ?? "unknown",
        durationSeconds: Number(output?.duration_seconds ?? 5) as 5 | 15,
        identity: Number(row.identity_continuity), performance: Number(row.performance),
        readability: Number(row.shot_readability), lighting: Number(row.lighting_continuity),
        audio: Number(row.audio_completeness), lipSync: row.lip_sync == null ? null : Number(row.lip_sync),
        composite: Number(row.composite_score), identityGate: row.identity_gate as "pass" | "fail",
        audioGate: row.audio_gate as "pass" | "fail", lipSyncGate: row.lip_sync_gate as "pass" | "fail" | "not-applicable",
        nullResult: Boolean(row.null_result), evidence: row.evidence as Record<string, unknown>,
      };
    }),
    matrix: {
      runId: sprint?.id ?? null, status: sprint?.status ?? null,
      keyframes: outputRows.filter((row) => row.output_kind === "keyframe" && row.status === "succeeded").length,
      videoShots: outputRows.filter((row) => row.output_kind === "video-shot" && row.status === "succeeded").length,
      mixes: outputRows.filter((row) => row.output_kind === "final-mix" && row.status === "succeeded").length,
      evaluations: evaluationCount, humanPicks: pickCount,
    },
  };
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildVariants(input: {
  brief: string;
  lockedLine: string;
  lightingPlan: Record<string, string>;
  audioPlan: Record<string, string>;
  cameraPlan: Record<string, string>;
  shortlist: DirectorSprintTwoBundle["shortlist"];
}) {
  const invariant = [
    `FIXED BRIEF: ${input.brief}`,
    `LOCKED LINE: "${input.lockedLine}". These exact words are authored before rendering and may not be changed or supplemented.`,
    `LIGHTING: ${input.lightingPlan.key}; ${input.lightingPlan.fill}. Continuity: ${input.lightingPlan.continuity}.`,
    `AUDIO: ${input.audioPlan.ambience}; ${input.audioPlan.sfx}; no music. Dialogue uses only the supplied locked recording.`,
    `CAMERA LAW: ${input.cameraPlan.movementRule}.`,
    "Keep canonical face, body, hair, wardrobe, folded ticket, screen direction, platform geography, and wet reflections unchanged. No extra person, subtitle, logo, signage text, invented speech, or visible bad lip-sync.",
  ].join("\n");
  const makeVariant = (id: DirectorSprintTwoVariant["id"], entry: DirectorSprintTwoBundle["shortlist"][number] | null): DirectorSprintTwoVariant => {
    const injection = entry ? `EXPERIMENTAL PRINCIPLE — this is the only variable: ${entry.principle}` : "CONTROL: no experimental principle is injected.";
    const whatChanged = entry
      ? `Injected the ${entry.axis} principle from ${entry.workTitle}: ${entry.principle}`
      : "Control uses the current production instruction with no new research principle.";
    const shared = `${invariant}\n${injection}`;
    return {
      id,
      name: entry ? `V${entry.rank} · ${entry.axis}` : "V0 · Control",
      assessmentId: entry?.assessmentId ?? null,
      axis: entry?.axis ?? "control",
      sourceWork: entry?.workTitle ?? null,
      principle: entry?.principle ?? null,
      verificationVerdict: "held",
      whatChanged,
      keyframePrompt: `${shared}\nCreate one exact 16:9 identity-locked starting frame at the metro platform. The frame must support both the one-shot and three-shot arms.`,
      fiveSecondPrompt: `${shared}\n5-SECOND ONE-SHOT: ${input.cameraPlan.fiveSeconds}. Begin on still refusal, motivate the change with the train brake, deliver the locked line once, compress the ticket, take one step away, and land cleanly by 5.0 seconds.`,
      fifteenSecondShots: [
        { shotIndex: 1, prompt: `${shared}\n15-SECOND ARM · SHOT 1 OF 3 · 5 seconds: ${input.cameraPlan.fifteenSeconds}. Establish the empty platform, fixed light sources, approaching light direction, actor position, wardrobe, and ticket. The brake motivates the cut.`, handoff: { characterPosition: "actor on platform center-right", wardrobe: "canonical unchanged", propState: "folded ticket in right hand", screenDirection: "train light approaches camera-left to camera-right", audio: "rain and brake continue across cut" } },
        { shotIndex: 2, prompt: `${shared}\n15-SECOND ARM · SHOT 2 OF 3 · 5 seconds: hold profile/hand reaction. Deliver the supplied locked line once, show the ticket compress and the choice not to turn. The completed hand action motivates the cut.`, handoff: { characterPosition: "same mark, profile toward camera-left", wardrobe: "canonical unchanged", propState: "ticket newly compressed in right hand", screenDirection: "eyeline stays away from arriving light", audio: "same locked line and brake tail; rain continuous" } },
        { shotIndex: 3, prompt: `${shared}\n15-SECOND ARM · SHOT 3 OF 3 · 5 seconds: rear three-quarter. Preserve every carried state, then take one deliberate step away from the arriving light and land in resolved stillness.`, handoff: { characterPosition: "one step away from prior mark", wardrobe: "canonical unchanged", propState: "compressed ticket remains in right hand", screenDirection: "movement continues away from train light", audio: "one footstep; rain bed continuous; no further words" } },
      ],
    };
  };
  return [makeVariant("control", null), ...input.shortlist.map((entry, index) => makeVariant(`challenger-${index + 1}` as DirectorSprintTwoVariant["id"], entry))];
}

export async function initializeDirectorSprintTwo(input: { characterId: string; createdBy: string }) {
  const current = await listDirectorSprintTwo();
  if (!current.storageReady || !current.activeRunId || current.shortlist.length !== 5) {
    throw new Error("Complete the calibrated dense verifier and lock its five-item shortlist first.");
  }
  if (current.matrix.runId) return current;
  const character = current.characters.find((item) => item.id === input.characterId);
  if (!character) throw new Error("Choose one real marketplace actor.");
  const production = await getCharacterProductionState(character.id);
  if (!production.visualReference?.url) throw new Error("The selected actor needs a locked canonical visual reference.");
  if (!production.voiceId) throw new Error("The selected actor needs an active locked ElevenLabs voice.");
  const fixed = defaultDirectorSprintTwoContract(character.name);
  const variants = buildVariants({ ...fixed, shortlist: current.shortlist });
  const pipeline = await getPipelineConfig();
  const invariantHash = stableHash({
    characterId: character.id, visualReference: production.visualReference.url,
    voiceId: production.voiceId, fixed, variants, pipelineRevision: pipeline.revision,
  });
  const insert = await getSupabaseAdminClient().from("director_sprint_two_runs").insert({
    sprint_key: DIRECTOR_SPRINT_TWO_KEY,
    verifier_run_id: current.activeRunId,
    character_id: character.id,
    fixed_brief: fixed.brief,
    locked_line: fixed.lockedLine,
    lighting_plan: fixed.lightingPlan,
    audio_plan: fixed.audioPlan,
    camera_plan: fixed.cameraPlan,
    invariant_hash: invariantHash,
    baseline_revision: pipeline.revision,
    variants,
    created_by: input.createdBy,
  });
  if (insert.error) throw new Error(`Initialize Sprint 2 output matrix: ${insert.error.message}`);
  return listDirectorSprintTwo();
}

function stableVoiceSeed(characterId: string) {
  let hash = 2166136261;
  for (const character of characterId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export async function renderDirectorSprintTwoVoice(runId: string) {
  const supabase = getSupabaseAdminClient();
  const runResult = await supabase.from("director_sprint_two_runs")
    .select("id,character_id,locked_line,status").eq("id", runId).maybeSingle();
  if (runResult.error || !runResult.data) throw new Error(runResult.error?.message ?? "Sprint 2 run was not found.");
  const existing = await supabase.from("director_sprint_two_voice_renders").select("id,status,asset_id").eq("run_id", runId).maybeSingle();
  if (existing.error) throw new Error(`Check Sprint 2 voice ceiling: ${existing.error.message}`);
  if (existing.data) return listDirectorSprintTwo();
  const run = runResult.data;
  const production = await getCharacterProductionState(run.character_id);
  const voiceId = production.voiceId;
  if (!voiceId) throw new Error("VOICE_STAGE_FAILED: the selected actor no longer has an active locked voice.");
  const credential = elevenLabsApiKey();
  if (!credential) throw new Error("VOICE_STAGE_FAILED: ELEVEN_LABS_API_KEY is not configured.");
  const pipeline = await getPipelineConfig();
  const voiceConfig = pipeline.stages.voice;
  const model = typeof voiceConfig.settings.dialogueModel === "string" ? voiceConfig.settings.dialogueModel : "eleven_multilingual_v2";
  const seed = stableVoiceSeed(run.character_id);
  const settings = {
    stability: Number(voiceConfig.settings.stability ?? 0.68),
    similarity_boost: Number(voiceConfig.settings.similarityBoost ?? 0.86),
    style: Number(voiceConfig.settings.style ?? 0.18),
    use_speaker_boost: Boolean(voiceConfig.settings.speakerBoost ?? true),
  };
  const lineHash = stableHash({ line: run.locked_line, voiceId, model, seed, settings });
  const jobId = await beginGeneration({
    characterId: run.character_id, kind: "dialogue", provider: "elevenlabs", model,
    prompt: run.locked_line,
    metadata: { directorSprintTwoRunId: runId, lockedOnce: true, reusedAcrossVersions: 12, voiceId, lineHash },
  });
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": credential },
      body: JSON.stringify({ text: run.locked_line, model_id: model, voice_settings: settings, seed }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`VOICE_STAGE_FAILED: ElevenLabs returned ${response.status}: ${detail.slice(0, 400)}`);
    }
    const bytes = await response.arrayBuffer();
    const asset = await saveMediaAsset({
      characterId: run.character_id, kind: "dialogue", provider: "elevenlabs", bytes,
      contentType: response.headers.get("content-type") ?? "audio/mpeg", prompt: run.locked_line,
      metadata: { directorSprintTwoRunId: runId, voiceId, model, seed, voiceSettings: settings, lineHash, lockedOnce: true, reusedAcrossVersions: 12 },
    });
    const measuredDurationMs = await measureStoredAudioMs(asset.url).catch(() => null);
    const providerCredits = Number(response.headers.get("character-cost") ?? 0) || undefined;
    const billing = await calculateGenerationBilling({
      kind: "dialogue", usage: { inputCharacters: run.locked_line.length, providerCredits },
    });
    await completeGeneration(jobId, asset.id, { directorSprintTwoRunId: runId, voiceId, lineHash, measuredDurationMs }, billing, response.headers.get("request-id"));
    const voiceInsert = await supabase.from("director_sprint_two_voice_renders").insert({
      run_id: runId, status: "succeeded", provider: "elevenlabs", voice_id: voiceId,
      asset_id: asset.id, line_hash: lineHash, provider_request_id: response.headers.get("request-id"),
      usage: { inputCharacters: run.locked_line.length, providerCredits, measuredDurationMs },
      cost_usd: billing.costUsd ?? 0,
    });
    if (voiceInsert.error) throw new Error(`Record locked Sprint 2 voice: ${voiceInsert.error.message}`);
    await supabase.from("director_sprint_two_runs").update({ status: "generating", updated_at: new Date().toISOString() }).eq("id", runId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "VOICE_STAGE_FAILED: ElevenLabs could not render the locked line.";
    await failGeneration(jobId, message);
    await supabase.from("director_sprint_two_voice_renders").insert({
      run_id: runId, status: "failed", provider: "elevenlabs", voice_id: voiceId,
      asset_id: null, line_hash: lineHash, error_message: message,
      usage: { inputCharacters: run.locked_line.length }, cost_usd: 0,
    });
    await supabase.from("director_sprint_two_runs").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", runId);
    throw error;
  }
  return listDirectorSprintTwo();
}

function readVariants(value: unknown): DirectorSprintTwoVariant[] {
  if (!Array.isArray(value) || value.length !== 6) throw new Error("The locked six-variant comparison is invalid.");
  return value as DirectorSprintTwoVariant[];
}

export async function authorizeDirectorSprintTwoOutput(input: {
  runId: string;
  variantId: string;
  kind: "keyframe" | "video-shot";
  durationSeconds: 5 | 15;
  shotIndex: number;
}) {
  const supabase = getSupabaseAdminClient();
  const runResult = await supabase.from("director_sprint_two_runs")
    .select("id,status,character_id,variants,audio_plan,locked_line")
    .eq("id", input.runId).maybeSingle();
  if (runResult.error || !runResult.data) throw new Error(runResult.error?.message ?? "Sprint 2 run was not found.");
  if (!["initialized", "generating"].includes(runResult.data.status)) throw new Error("This comparison is no longer open for generation.");
  const variant = readVariants(runResult.data.variants).find((item) => item.id === input.variantId);
  if (!variant) throw new Error("The requested comparison variant is not locked in this run.");
  const existing = await supabase.from("director_sprint_two_outputs").select("id")
    .eq("run_id", input.runId).eq("variant_id", input.variantId).eq("output_kind", input.kind)
    .eq("duration_seconds", input.durationSeconds).eq("shot_index", input.shotIndex).maybeSingle();
  if (existing.error) throw new Error(`Check output slot: ${existing.error.message}`);
  if (existing.data) {
    const statusResult = await supabase.from("director_sprint_two_outputs").select("status").eq("id", existing.data.id).single();
    if (statusResult.error) throw new Error(`Check output retry state: ${statusResult.error.message}`);
    if (statusResult.data.status === "succeeded") throw new Error("That immutable output slot has already succeeded.");
  }
  const production = await getCharacterProductionState(runResult.data.character_id);
  if (!production.visualReference?.url) throw new Error("The locked actor no longer has a canonical visual reference.");
  const voiceResult = await supabase.from("director_sprint_two_voice_renders")
    .select("id,status,media_assets(url)").eq("run_id", input.runId).maybeSingle();
  if (voiceResult.error || !voiceResult.data || voiceResult.data.status !== "succeeded") {
    throw new Error("VOICE_STAGE_FAILED: render the one locked ElevenLabs line before any video.");
  }
  const voiceAsset = joined(voiceResult.data.media_assets);
  if (!voiceAsset?.url) throw new Error("VOICE_STAGE_FAILED: the locked performance asset is unavailable.");
  let prompt = variant.keyframePrompt;
  let handoff: Record<string, string> = {};
  let referenceImage = production.visualReference.url;
  if (input.kind === "video-shot") {
    const keyframeResult = await supabase.from("director_sprint_two_outputs")
      .select("media_assets(url)").eq("run_id", input.runId).eq("variant_id", input.variantId)
      .eq("output_kind", "keyframe").eq("status", "succeeded").maybeSingle();
    if (keyframeResult.error || !keyframeResult.data) throw new Error("Generate this variant's locked keyframe before its video shots.");
    referenceImage = joined(keyframeResult.data.media_assets)?.url ?? "";
    if (!referenceImage) throw new Error("The locked keyframe asset is unavailable.");
    if (input.durationSeconds === 5) {
      if (input.shotIndex !== 1) throw new Error("The five-second arm has exactly one shot.");
      prompt = variant.fiveSecondPrompt;
    } else {
      const shot = variant.fifteenSecondShots.find((item) => item.shotIndex === input.shotIndex);
      if (!shot) throw new Error("The fifteen-second arm has exactly three locked shots.");
      prompt = shot.prompt;
      handoff = shot.handoff;
    }
  }
  return {
    characterId: runResult.data.character_id,
    variant,
    prompt,
    handoff,
    referenceImage,
    voiceRenderId: voiceResult.data.id,
    voiceUrl: voiceAsset.url,
    lockedLine: runResult.data.locked_line,
    audioPlan: runResult.data.audio_plan as Record<string, string>,
  };
}

export async function recordDirectorSprintTwoOutput(input: {
  runId: string;
  variantId: string;
  kind: "keyframe" | "video-shot" | "final-mix";
  durationSeconds: 5 | 15;
  shotIndex: number;
  status: "succeeded" | "failed";
  assetId?: string | null;
  provider: string;
  model: string;
  voicePath?: "A-native-reference" | "B-post-mix" | "failed" | null;
  voiceRenderId?: string | null;
  prompt: string;
  whatChanged: string;
  handoff?: Record<string, string>;
  metadata?: Record<string, unknown>;
  providerRequestId?: string | null;
  latencyMs?: number;
  error?: string;
}) {
  const supabase = getSupabaseAdminClient();
  const values = {
    run_id: input.runId,
    variant_id: input.variantId,
    output_kind: input.kind,
    duration_seconds: input.durationSeconds,
    shot_index: input.shotIndex,
    status: input.status,
    asset_id: input.assetId ?? null,
    provider: input.provider,
    model: input.model,
    voice_path: input.voicePath ?? null,
    voice_render_id: input.voiceRenderId ?? null,
    prompt_hash: stableHash(input.prompt),
    prompt_snapshot: input.prompt,
    what_changed: input.whatChanged,
    continuity_handoff: input.handoff ?? {},
    metadata: input.metadata ?? {},
    provider_request_id: input.providerRequestId ?? null,
    latency_ms: input.latencyMs ?? null,
    error_message: input.status === "failed" ? (input.error || "Provider generation failed.") : "",
  };
  const existing = await supabase.from("director_sprint_two_outputs").select("id,status")
    .eq("run_id", input.runId).eq("variant_id", input.variantId).eq("output_kind", input.kind)
    .eq("duration_seconds", input.durationSeconds).eq("shot_index", input.shotIndex).maybeSingle();
  if (existing.error) throw new Error(`Check immutable Sprint 2 output: ${existing.error.message}`);
  if (existing.data) {
    if (existing.data.status === "succeeded") throw new Error("A successful immutable output cannot be replaced.");
    const update = await supabase.from("director_sprint_two_outputs").update(values).eq("id", existing.data.id);
    if (update.error) throw new Error(`Advance preserved Sprint 2 failure: ${update.error.message}`);
    return;
  }
  const insert = await supabase.from("director_sprint_two_outputs").insert(values);
  if (insert.error) throw new Error(`Record immutable Sprint 2 output: ${insert.error.message}`);
}

async function fixedSprintTwoAudioBed(input: {
  runId: string;
  characterId: string;
  durationSeconds: 5 | 15;
  audioPlan: Record<string, string>;
}) {
  const supabase = getSupabaseAdminClient();
  const existing = await supabase.from("media_assets").select("id,url")
    .eq("character_id", input.characterId).eq("kind", "sfx")
    .contains("metadata", { directorSprintTwoRunId: input.runId, fixedAudioBedDuration: input.durationSeconds })
    .maybeSingle();
  if (existing.error) throw new Error(`Load fixed Sprint 2 audio bed: ${existing.error.message}`);
  if (existing.data) return existing.data;
  const credential = elevenLabsApiKey();
  if (!credential) throw new Error("AUDIO_STAGE_FAILED: ELEVEN_LABS_API_KEY is not configured.");
  const prompt = [input.audioPlan.ambience, input.audioPlan.sfx, "No speech. No music. Natural cinematic location sound."].join(". ");
  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192", {
    method: "POST",
    headers: { "content-type": "application/json", "xi-api-key": credential },
    body: JSON.stringify({ text: prompt, duration_seconds: input.durationSeconds, prompt_influence: 0.6, loop: false }),
  });
  if (!response.ok) throw new Error(`AUDIO_STAGE_FAILED: ElevenLabs returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return saveMediaAsset({
    characterId: input.characterId, kind: "sfx", provider: "elevenlabs",
    bytes: await response.arrayBuffer(), contentType: "audio/mpeg", prompt,
    durationSeconds: input.durationSeconds,
    metadata: { directorSprintTwoRunId: input.runId, fixedAudioBedDuration: input.durationSeconds, reusedAcrossVariants: 6 },
  });
}

async function downloadFile(url: string, destination: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Download Sprint 2 media: ${response.status}.`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

export async function mixDirectorSprintTwoOutputs(runId: string) {
  const supabase = getSupabaseAdminClient();
  const runResult = await supabase.from("director_sprint_two_runs")
    .select("id,character_id,variants,audio_plan,status").eq("id", runId).single();
  if (runResult.error) throw new Error(runResult.error.message);
  const variants = readVariants(runResult.data.variants);
  const voiceResult = await supabase.from("director_sprint_two_voice_renders")
    .select("id,status,media_assets(url)").eq("run_id", runId).single();
  if (voiceResult.error || voiceResult.data.status !== "succeeded") throw new Error("VOICE_STAGE_FAILED: the locked voice is required for final mixes.");
  const voiceUrl = joined(voiceResult.data.media_assets)?.url;
  if (!voiceUrl) throw new Error("VOICE_STAGE_FAILED: the locked voice asset is unavailable.");
  const outputsResult = await supabase.from("director_sprint_two_outputs")
    .select("variant_id,output_kind,duration_seconds,shot_index,status,media_assets(url)")
    .eq("run_id", runId);
  if (outputsResult.error) throw new Error(outputsResult.error.message);
  const outputs = outputsResult.data ?? [];
  for (const durationSeconds of [5, 15] as const) {
    const bed = await fixedSprintTwoAudioBed({
      runId, characterId: runResult.data.character_id, durationSeconds,
      audioPlan: runResult.data.audio_plan as Record<string, string>,
    });
    for (const variant of variants) {
      const already = outputs.some((item) => item.variant_id === variant.id && item.output_kind === "final-mix" && item.duration_seconds === durationSeconds && item.status === "succeeded");
      if (already) continue;
      const shots = outputs.filter((item) => item.variant_id === variant.id && item.output_kind === "video-shot" && item.duration_seconds === durationSeconds && item.status === "succeeded")
        .sort((left, right) => left.shot_index - right.shot_index);
      const expectedShots = durationSeconds === 5 ? 1 : 3;
      if (shots.length !== expectedShots) throw new Error(`${variant.id} ${durationSeconds}s is missing successful source shots.`);
      const work = await mkdtemp(path.join(tmpdir(), "chaplin-sprint-two-mix-"));
      try {
        const shotPaths: string[] = [];
        for (let index = 0; index < shots.length; index += 1) {
          const url = joined(shots[index].media_assets)?.url;
          if (!url) throw new Error("A source shot asset is unavailable.");
          const destination = path.join(work, `shot-${index}.mp4`);
          await downloadFile(url, destination);
          shotPaths.push(destination);
        }
        const voicePath = path.join(work, "voice.mp3");
        const bedPath = path.join(work, "bed.mp3");
        const outputPath = path.join(work, "final.mp4");
        await Promise.all([downloadFile(voiceUrl, voicePath), downloadFile(bed.url, bedPath)]);
        const concatPath = path.join(work, "concat.txt");
        await writeFile(concatPath, shotPaths.map((item) => `file '${item.replace(/'/g, "'\\''")}'`).join("\n"));
        const delayMs = durationSeconds === 5 ? 700 : 5700;
        await execute(ffmpegExecutable(), [
          "-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-i", bedPath, "-i", voicePath,
          "-filter_complex", `[1:a]atrim=0:${durationSeconds},volume=0.48[bed];[2:a]adelay=${delayMs}|${delayMs},apad,atrim=0:${durationSeconds},volume=1.0[voice];[bed][voice]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout]`,
          "-map", "0:v:0", "-map", "[aout]", "-t", String(durationSeconds),
          "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputPath,
        ], { maxBuffer: 10 * 1024 * 1024, windowsHide: true, timeout: 300_000 });
        const bytes = await readFile(outputPath);
        const asset = await saveMediaAsset({
          characterId: runResult.data.character_id, kind: "video", provider: "ffmpeg",
          bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
          contentType: "video/mp4", durationSeconds, prompt: variant.whatChanged,
          metadata: { directorSprintTwoRunId: runId, variantId: variant.id, exactVoiceAssetId: voiceResult.data.id, fixedAudioBedAssetId: bed.id },
        });
        await recordDirectorSprintTwoOutput({
          runId, variantId: variant.id, kind: "final-mix", durationSeconds, shotIndex: 0,
          status: "succeeded", assetId: asset.id, provider: "ffmpeg", model: "chaplin-final-mix-v1",
          voicePath: "B-post-mix", voiceRenderId: voiceResult.data.id, prompt: variant.whatChanged,
          whatChanged: variant.whatChanged, metadata: { exactVoiceAssetId: voiceResult.data.id, fixedAudioBedAssetId: bed.id },
        });
      } catch (error) {
        await recordDirectorSprintTwoOutput({
          runId, variantId: variant.id, kind: "final-mix", durationSeconds, shotIndex: 0,
          status: "failed", provider: "ffmpeg", model: "chaplin-final-mix-v1",
          voicePath: "failed", voiceRenderId: voiceResult.data.id, prompt: variant.whatChanged,
          whatChanged: variant.whatChanged, error: error instanceof Error ? error.message : "Final mix failed.",
        });
        throw error;
      } finally {
        await rm(work, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }
  return listDirectorSprintTwo();
}

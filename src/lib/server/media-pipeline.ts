import "server-only";
import { syncRenderDecisionStatus } from "@/lib/server/director-decisions";

import { getMediaOutputDefinition } from "@/lib/media-output-definitions";
import type {
  MediaOutputType,
  MediaPipelineRun,
  MediaPipelineStep,
  PipelineScope,
  PipelineStepAction,
  PipelineStepStatus,
} from "@/lib/media-pipeline-types";
import { getSupabaseAdminClient, publishDeliveredCutToFeed } from "@/lib/server/supabase-admin";

type JsonRecord = Record<string, unknown>;

const successfulStepStates: PipelineStepStatus[] = ["approved", "succeeded", "skipped"];
const finishedStepStates: PipelineStepStatus[] = [...successfulStepStates, "cancelled"];

function fail(error: { message: string } | null, label: string) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function mapStep(row: Record<string, unknown>, label: string): MediaPipelineStep {
  return {
    id: String(row.id),
    key: String(row.step_key),
    label,
    position: Number(row.position),
    executor: String(row.executor),
    status: row.status as PipelineStepStatus,
    requiresReview: Boolean(row.requires_review),
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    outputAssetId: typeof row.output_asset_id === "string" ? row.output_asset_id : null,
    output: record(row.output),
    errorMessage: typeof row.error_message === "string" ? row.error_message : null,
  };
}

async function hydrateRun(runRow: Record<string, unknown>): Promise<MediaPipelineRun> {
  const outputType = runRow.output_type as MediaOutputType;
  const definition = getMediaOutputDefinition(outputType);
  const supabase = getSupabaseAdminClient();
  const stepsResult = await supabase
    .from("media_pipeline_steps")
    .select("id,step_key,position,executor,status,requires_review,attempt,max_attempts,output_asset_id,output,error_message")
    .eq("run_id", runRow.id)
    .order("position");
  fail(stepsResult.error, "Load pipeline steps");
  const labels = new Map(definition.steps.map((item) => [item.key, item.label]));

  return {
    id: String(runRow.id),
    scopeType: runRow.scope_type as PipelineScope,
    scopeId: String(runRow.scope_id),
    outputType,
    outputLabel: definition.label,
    status: runRow.status as MediaPipelineRun["status"],
    currentStep: typeof runRow.current_step === "string" ? runRow.current_step : null,
    spec: record(runRow.spec),
    manifest: record(runRow.manifest),
    createdBy: typeof runRow.created_by === "string" ? runRow.created_by : null,
    steps: (stepsResult.data ?? []).map((row) => mapStep(row, labels.get(row.step_key) ?? row.step_key)),
    createdAt: String(runRow.created_at),
    updatedAt: String(runRow.updated_at),
  };
}

export async function getMediaPipelineRun(runId: string) {
  const supabase = getSupabaseAdminClient();
  const result = await supabase
    .from("media_pipeline_runs")
    .select("id,scope_type,scope_id,output_type,status,current_step,spec,manifest,created_by,created_at,updated_at")
    .eq("id", runId)
    .maybeSingle();
  fail(result.error, "Load media pipeline");
  return result.data ? hydrateRun(result.data) : null;
}

export async function listMediaPipelineRuns(scopeType: PipelineScope, scopeId: string) {
  const supabase = getSupabaseAdminClient();
  const result = await supabase
    .from("media_pipeline_runs")
    .select("id,scope_type,scope_id,output_type,status,current_step,spec,manifest,created_by,created_at,updated_at")
    .eq("scope_type", scopeType)
    .eq("scope_id", scopeId)
    .order("created_at", { ascending: false });
  fail(result.error, "Load media pipelines");
  return Promise.all((result.data ?? []).map((row) => hydrateRun(row)));
}

export async function attachMediaPipelineOutput(input: {
  runId: string;
  stepKeys: string[];
  output: JsonRecord;
  outputAssetId: string;
}) {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const update = await supabase
    .from("media_pipeline_steps")
    .update({
      output: input.output,
      output_asset_id: input.outputAssetId,
      updated_at: now,
    })
    .eq("run_id", input.runId)
    .in("step_key", input.stepKeys);
  fail(update.error, "Attach rendered output");

  const runUpdate = await supabase
    .from("media_pipeline_runs")
    .update({
      updated_at: now,
    })
    .eq("id", input.runId);
  fail(runUpdate.error, "Attach output to pipeline");

  const refreshed = await getMediaPipelineRun(input.runId);
  if (!refreshed) throw new Error("The rendered pipeline could not be reloaded.");
  return refreshed;
}

export async function createMediaPipelineRun(input: {
  scopeType: PipelineScope;
  scopeId: string;
  outputType: MediaOutputType;
  spec?: JsonRecord;
  createdBy?: string | null;
  idempotencyKey?: string;
  /** Reporting tags carried with the run and inherited by generation jobs. */
  tags?: { video_type?: string; product_id?: string | null; video_brief_id?: string | null };
}) {
  const definition = getMediaOutputDefinition(input.outputType);
  if (!definition) throw new Error("Unknown media output type.");
  const supportedScopes = Array.isArray(definition.scope) ? definition.scope : [definition.scope];
  if (!supportedScopes.includes(input.scopeType)) {
    throw new Error(`${definition.label} requires ${supportedScopes.join(" or ")} scope.`);
  }

  const supabase = getSupabaseAdminClient();
  const idempotencyKey = input.idempotencyKey?.trim()
    || `${input.scopeType}:${input.scopeId}:${input.outputType}:${crypto.randomUUID()}`;

  const existing = await supabase
    .from("media_pipeline_runs")
    .select("id,scope_type,scope_id,output_type,status,current_step,spec,manifest,created_by,created_at,updated_at")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  fail(existing.error, "Check pipeline idempotency");
  if (existing.data) {
    if (input.createdBy && existing.data.created_by !== input.createdBy) {
      throw new Error("This pipeline idempotency key belongs to another creator.");
    }
    return hydrateRun(existing.data);
  }

  const now = new Date().toISOString();
  const runInsert = await supabase
    .from("media_pipeline_runs")
    .insert({
      scope_type: input.scopeType,
      scope_id: input.scopeId,
      output_type: input.outputType,
      status: "queued",
      current_step: definition.steps[0]?.key ?? null,
      spec: input.spec ?? {},
      manifest: {
        contractVersion: 1,
        outputType: input.outputType,
        providers: {
          image: "seedream",
          video: "seedance",
          audio: "elevenlabs",
          assembly: "ffmpeg",
        },
        tags: input.tags ?? {},
      },
      idempotency_key: idempotencyKey,
      created_by: input.createdBy ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("id,scope_type,scope_id,output_type,status,current_step,spec,manifest,created_by,created_at,updated_at")
    .single();
  fail(runInsert.error, "Create media pipeline");
  if (!runInsert.data) throw new Error("Create media pipeline: no run was returned.");
  const runId = runInsert.data.id;

  try {
    const stepsInsert = await supabase.from("media_pipeline_steps").insert(
      definition.steps.map((item, index) => ({
        run_id: runId,
        step_key: item.key,
        position: index + 1,
        executor: item.executor,
        status: index === 0 ? "ready" : "blocked",
        requires_review: Boolean(item.requiresReview),
        attempt: 1,
        max_attempts: item.maxAttempts ?? 3,
        input: input.tags ?? {},
        output: {},
        created_at: now,
        updated_at: now,
      }))
    );
    fail(stepsInsert.error, "Create media pipeline steps");

    if (input.outputType === "shot") {
      const latestTake = await supabase
        .from("episode_shot_takes")
        .select("take_number")
        .eq("episode_shot_id", input.scopeId)
        .order("take_number", { ascending: false })
        .limit(1);
      fail(latestTake.error, "Load shot takes");
      const takeNumber = Number(latestTake.data?.[0]?.take_number ?? 0) + 1;
      const takeInsert = await supabase.from("episode_shot_takes").insert({
        episode_shot_id: input.scopeId,
        pipeline_run_id: runId,
        take_number: takeNumber,
        status: "draft",
        created_at: now,
        updated_at: now,
      });
      fail(takeInsert.error, "Create shot take");
    }
  } catch (error) {
    await supabase.from("media_pipeline_runs").delete().eq("id", runId);
    throw error;
  }

  const created = await getMediaPipelineRun(runId);
  if (!created) throw new Error("The media pipeline was created but could not be reloaded.");
  return created;
}

function nextStatusForAction(
  action: PipelineStepAction,
  current: PipelineStepStatus,
  requiresReview: boolean,
  attempt: number,
  maxAttempts: number
) {
  if (action === "queue" && current === "ready") return "queued";
  if (action === "start" && current === "queued") return "running";
  if (action === "complete" && current === "running") return requiresReview ? "needs_review" : "succeeded";
  if (action === "approve" && current === "needs_review") return "approved";
  if (action === "reject" && current === "needs_review") return "failed";
  if (action === "fail" && ["queued", "running"].includes(current)) return "failed";
  if (action === "retry" && current === "failed" && attempt < maxAttempts) return "queued";
  if (action === "skip" && ["ready", "queued", "failed"].includes(current)) return "skipped";
  if (action === "cancel" && !finishedStepStates.includes(current)) return "cancelled";
  throw new Error(`Cannot ${action} a ${current} pipeline step.`);
}

export async function transitionMediaPipelineStep(input: {
  runId: string;
  stepKey: string;
  action: PipelineStepAction;
  output?: JsonRecord;
  outputAssetId?: string | null;
  errorMessage?: string | null;
}) {
  const supabase = getSupabaseAdminClient();
  const [currentResult, runContextResult] = await Promise.all([
    supabase
      .from("media_pipeline_steps")
      .select("id,position,status,requires_review,attempt,max_attempts,output_asset_id")
      .eq("run_id", input.runId)
      .eq("step_key", input.stepKey)
      .maybeSingle(),
    supabase
      .from("media_pipeline_runs")
      .select("scope_type,scope_id,output_type")
      .eq("id", input.runId)
      .maybeSingle(),
  ]);
  fail(currentResult.error, "Load pipeline step");
  fail(runContextResult.error, "Load pipeline context");
  if (!currentResult.data) throw new Error("Pipeline step not found.");
  if (!runContextResult.data) throw new Error("Media pipeline not found.");

  const current = currentResult.data;
  const runContext = runContextResult.data;
  if (
    runContext.output_type === "shot"
    && input.stepKey === "creative-review"
    && input.action === "approve"
  ) {
    const takeCheck = await supabase
      .from("episode_shot_takes")
      .select("final_asset_id")
      .eq("pipeline_run_id", input.runId)
      .maybeSingle();
    fail(takeCheck.error, "Validate final shot take");
    if (!takeCheck.data?.final_asset_id) {
      throw new Error("A shot cannot be approved until its final muxed asset exists.");
    }
  }
  const nextStatus = nextStatusForAction(
    input.action,
    current.status,
    current.requires_review,
    current.attempt,
    current.max_attempts
  );
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: nextStatus,
    updated_at: now,
  };
  if (input.action === "start") patch.started_at = now;
  if (input.action === "complete" || input.action === "approve" || input.action === "skip") patch.completed_at = now;
  if (input.action === "retry") {
    patch.attempt = current.attempt + 1;
    patch.error_message = null;
    patch.started_at = null;
    patch.completed_at = null;
  }
  if (input.action === "reject") patch.error_message = input.errorMessage || "Creative review rejected this attempt.";
  if (input.action === "fail") patch.error_message = input.errorMessage || "The provider could not complete this step.";
  if (input.output) patch.output = input.output;
  if (input.outputAssetId !== undefined) patch.output_asset_id = input.outputAssetId;
  if (input.errorMessage && input.action !== "retry") patch.error_message = input.errorMessage;

  const update = await supabase.from("media_pipeline_steps").update(patch).eq("id", current.id);
  fail(update.error, "Update pipeline step");

  /*
    Approving the final review is the moment a production becomes something to
    show. The assembled master is written straight to storage rather than
    through the generation-job path, so nothing published it - a creator could
    accept a finished cut and never see it reach the feed. Failures here are
    swallowed: a feed post must never undo an approval that already succeeded.
  */
  if (input.stepKey === "creative-review" && input.action === "approve") {
    const deliveredAssetId = input.outputAssetId ?? current.output_asset_id;
    if (deliveredAssetId && runContext.scope_id) {
      await publishDeliveredCutToFeed({
        assetId: deliveredAssetId,
        characterId: runContext.scope_id,
      }).catch(() => undefined);
    }
  }

  if (runContext.output_type === "shot") {
    const takePatch: Record<string, unknown> = { updated_at: now };
    const assetColumnByStep: Record<string, string> = {
      "reference-frame": "reference_asset_id",
      "motion-plate": "video_asset_id",
      dialogue: "dialogue_asset_id",
      sfx: "sfx_asset_id",
      "room-tone": "room_tone_asset_id",
      "shot-mix": "final_asset_id",
    };
    const assetColumn = assetColumnByStep[input.stepKey];
    if (assetColumn && input.outputAssetId) takePatch[assetColumn] = input.outputAssetId;
    if (input.stepKey === "reference-frame" && typeof input.output?.imagePrompt === "string") {
      takePatch.image_prompt = input.output.imagePrompt;
    }
    if (input.stepKey === "motion-plate" && typeof input.output?.videoPrompt === "string") {
      takePatch.video_prompt = input.output.videoPrompt;
    }
    if (input.stepKey === "shot-mix" && typeof input.output?.mixedAudioAssetId === "string") {
      takePatch.mixed_audio_asset_id = input.output.mixedAudioAssetId;
    }
    if (input.stepKey === "technical-qc" && input.output) takePatch.qc_report = input.output;
    if (input.stepKey === "creative-review" && input.errorMessage) takePatch.review_notes = input.errorMessage;
    if (Object.keys(takePatch).length > 1) {
      const takeUpdate = await supabase
        .from("episode_shot_takes")
        .update(takePatch)
        .eq("pipeline_run_id", input.runId);
      fail(takeUpdate.error, "Attach output to shot take");
    }
  }

  if (successfulStepStates.includes(nextStatus)) {
    const unblock = await supabase
      .from("media_pipeline_steps")
      .update({ status: "ready", updated_at: now })
      .eq("run_id", input.runId)
      .eq("position", current.position + 1)
      .eq("status", "blocked");
    fail(unblock.error, "Advance media pipeline");
  }

  const stepsResult = await supabase
    .from("media_pipeline_steps")
    .select("step_key,position,status")
    .eq("run_id", input.runId)
    .order("position");
  fail(stepsResult.error, "Refresh pipeline state");
  const steps = stepsResult.data ?? [];
  const active = steps.find((item) => !finishedStepStates.includes(item.status));
  let runStatus: MediaPipelineRun["status"] = "queued";
  if (steps.some((item) => item.status === "failed")) runStatus = "failed";
  else if (steps.some((item) => item.status === "needs_review")) runStatus = "needs_review";
  else if (steps.every((item) => successfulStepStates.includes(item.status))) runStatus = "succeeded";
  else if (steps.some((item) => item.status === "running")) runStatus = "running";
  else if (steps.some((item) => item.status === "approved")) runStatus = "approved";

  const runPatch: Record<string, unknown> = {
    status: runStatus,
    current_step: active?.step_key ?? null,
    updated_at: now,
  };
  if (runStatus === "running") runPatch.started_at = now;
  if (runStatus === "succeeded") runPatch.completed_at = now;
  const runUpdate = await supabase.from("media_pipeline_runs").update(runPatch).eq("id", input.runId);
  fail(runUpdate.error, "Update media pipeline");
  await syncRenderDecisionStatus(input.runId, runStatus).catch((error) => {
    console.error("Sync Director Brain render decision:", error);
  });

  if (runContext.output_type === "shot") {
    const takeStatus = runStatus === "succeeded"
      ? "approved"
      : runStatus === "failed"
        ? "failed"
        : runStatus === "needs_review"
          ? "in_review"
          : runStatus === "running"
            ? "generating"
            : "draft";
    const takeUpdate = await supabase
      .from("episode_shot_takes")
      .update({ status: takeStatus, updated_at: now })
      .eq("pipeline_run_id", input.runId);
    fail(takeUpdate.error, "Update shot take");

    if (runStatus === "succeeded") {
      const takeResult = await supabase
        .from("episode_shot_takes")
        .select("take_number,reference_asset_id,video_asset_id,dialogue_asset_id,sfx_asset_id,room_tone_asset_id,mixed_audio_asset_id,final_asset_id")
        .eq("pipeline_run_id", input.runId)
        .single();
      fail(takeResult.error, "Load approved shot take");
      const take = takeResult.data;
      if (!take?.final_asset_id) throw new Error("An approved shot take must have a final muxed asset.");
      const shotUpdate = await supabase
        .from("episode_shots")
        .update({
          reference_asset_id: take.reference_asset_id,
          video_asset_id: take.video_asset_id,
          dialogue_asset_id: take.dialogue_asset_id,
          sfx_asset_id: take.sfx_asset_id,
          room_tone_asset_id: take.room_tone_asset_id,
          mixed_audio_asset_id: take.mixed_audio_asset_id,
          final_asset_id: take.final_asset_id,
          selected_take_number: take.take_number,
          approval_status: "approved",
          status: "ready",
          last_error: null,
          updated_at: now,
        })
        .eq("id", runContext.scope_id);
      fail(shotUpdate.error, "Promote approved shot take");
    }
  }

  const refreshed = await getMediaPipelineRun(input.runId);
  if (!refreshed) throw new Error("The media pipeline disappeared after the step update.");
  return refreshed;
}

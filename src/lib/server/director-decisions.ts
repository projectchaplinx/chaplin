import "server-only";

import type { DirectorBrainTrace } from "@/lib/director-brain";
import type {
  DirectorDecisionRunKind,
  DirectorDecisionStatus,
  DirectorDecisionTraceRecord,
} from "@/lib/director-decisions";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

type DecisionRow = {
  id: string;
  run_kind: DirectorDecisionRunKind;
  status: DirectorDecisionStatus;
  user_id: string | null;
  character_id: string | null;
  story_id: string | null;
  generation_job_id: string | null;
  pipeline_run_id: string | null;
  brain_version: string;
  format: string;
  duration_seconds: number | string | null;
  scene_count: number;
  brief_excerpt: string;
  trace: unknown;
  provider: string;
  model: string;
  outcome: unknown;
  error_message: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

function missingDecisionTable(message: string) {
  return /director_decision_traces|schema cache|does not exist/i.test(message);
}

function rowToDecision(row: DecisionRow): DirectorDecisionTraceRecord {
  return {
    id: row.id,
    runKind: row.run_kind,
    status: row.status,
    userId: row.user_id,
    characterId: row.character_id,
    storyId: row.story_id,
    generationJobId: row.generation_job_id,
    pipelineRunId: row.pipeline_run_id,
    brainVersion: row.brain_version,
    format: row.format,
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    sceneCount: row.scene_count,
    briefExcerpt: row.brief_excerpt,
    trace: row.trace as DirectorBrainTrace,
    provider: row.provider,
    model: row.model,
    outcome: row.outcome && typeof row.outcome === "object" && !Array.isArray(row.outcome)
      ? row.outcome as Record<string, unknown>
      : {},
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export async function listDirectorDecisionTraces(limit = 100) {
  const result = await getSupabaseAdminClient()
    .from("director_decision_traces")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(500, limit)));
  if (result.error) {
    if (missingDecisionTable(result.error.message)) return { storageReady: false, decisions: [] };
    throw new Error(`Load Director Brain decisions: ${result.error.message}`);
  }
  return {
    storageReady: true,
    decisions: (result.data as DecisionRow[]).map(rowToDecision),
  };
}

export async function createDirectorDecisionTrace(input: {
  runKind: DirectorDecisionRunKind;
  status?: DirectorDecisionStatus;
  userId?: string | null;
  characterId?: string | null;
  storyId?: string | null;
  generationJobId?: string | null;
  pipelineRunId?: string | null;
  trace: DirectorBrainTrace;
  briefExcerpt?: string;
  provider?: string;
  model?: string;
  outcome?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();
  if (input.generationJobId || input.pipelineRunId) {
    let existing = supabase.from("director_decision_traces").select("id");
    existing = input.generationJobId
      ? existing.eq("generation_job_id", input.generationJobId)
      : existing.eq("pipeline_run_id", input.pipelineRunId!);
    const found = await existing.maybeSingle();
    if (found.error) {
      if (missingDecisionTable(found.error.message)) return null;
      throw new Error(`Check Director Brain decision: ${found.error.message}`);
    }
    if (found.data?.id) return String(found.data.id);
  }
  const now = new Date().toISOString();
  const result = await supabase.from("director_decision_traces").insert({
    run_kind: input.runKind,
    status: input.status ?? "selected",
    user_id: input.userId ?? null,
    character_id: input.characterId ?? null,
    story_id: input.storyId ?? null,
    generation_job_id: input.generationJobId ?? null,
    pipeline_run_id: input.pipelineRunId ?? null,
    brain_version: input.trace.version,
    format: input.trace.query.format,
    duration_seconds: input.trace.query.durationSeconds,
    scene_count: input.trace.query.sceneCount,
    brief_excerpt: (input.briefExcerpt ?? input.trace.query.brief).replace(/\s+/g, " ").trim().slice(0, 1000),
    trace: input.trace,
    provider: input.provider ?? "",
    model: input.model ?? "",
    outcome: input.outcome ?? {},
    started_at: input.status === "running" ? now : null,
    completed_at: input.status === "succeeded" || input.status === "failed" ? now : null,
    created_at: now,
    updated_at: now,
  }).select("id").single();
  if (result.error) {
    if (missingDecisionTable(result.error.message)) return null;
    throw new Error(`Create Director Brain decision: ${result.error.message}`);
  }
  return String(result.data.id);
}

export async function updateDirectorDecisionTrace(
  id: string | null,
  input: {
    status?: DirectorDecisionStatus;
    generationJobId?: string | null;
    pipelineRunId?: string | null;
    provider?: string;
    model?: string;
    outcome?: Record<string, unknown>;
    errorMessage?: string;
  },
) {
  if (!id) return;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (input.status) patch.status = input.status;
  if (input.generationJobId !== undefined) patch.generation_job_id = input.generationJobId;
  if (input.pipelineRunId !== undefined) patch.pipeline_run_id = input.pipelineRunId;
  if (input.provider !== undefined) patch.provider = input.provider;
  if (input.model !== undefined) patch.model = input.model;
  if (input.outcome !== undefined) patch.outcome = input.outcome;
  if (input.errorMessage !== undefined) patch.error_message = input.errorMessage.slice(0, 2000);
  if (input.status === "running") patch.started_at = now;
  if (input.status === "succeeded" || input.status === "failed" || input.status === "cancelled") {
    patch.completed_at = now;
  }
  const result = await getSupabaseAdminClient().from("director_decision_traces").update(patch).eq("id", id);
  if (result.error && !missingDecisionTable(result.error.message)) {
    throw new Error(`Update Director Brain decision: ${result.error.message}`);
  }
}

export async function syncRenderDecisionStatus(
  pipelineRunId: string,
  status: "queued" | "running" | "needs_review" | "approved" | "succeeded" | "failed",
) {
  const mapped: DirectorDecisionStatus =
    status === "succeeded" ? "succeeded"
      : status === "failed" ? "failed"
        : status === "running" ? "running"
          : "selected";
  const result = await getSupabaseAdminClient()
    .from("director_decision_traces")
    .update({
      status: mapped,
      ...(mapped === "running" ? { started_at: new Date().toISOString() } : {}),
      ...(mapped === "succeeded" || mapped === "failed" ? { completed_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("pipeline_run_id", pipelineRunId);
  if (result.error && !missingDecisionTable(result.error.message)) {
    throw new Error(`Sync Director Brain render decision: ${result.error.message}`);
  }
}

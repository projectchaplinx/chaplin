import "server-only";

import {
  DIRECTOR_EVALUATION_DIMENSIONS,
  DIRECTOR_EVALUATION_VERSION,
  normalizeDirectorScores,
  summarizeDirectorEvaluation,
  type DirectorEvaluationAxis,
  type DirectorEvaluationDimensionId,
  type DirectorEvaluationRecord,
} from "@/lib/director-evaluation";
import { PIPELINE_STAGE_IDS, type PipelineStageId } from "@/lib/pipeline-config";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

type EvaluationRow = {
  id: string;
  decision_trace_id: string | null;
  experiment_result_id: string | null;
  generation_job_id: string | null;
  pipeline_run_id: string | null;
  output_asset_id: string | null;
  stage: PipelineStageId;
  rubric_version: string;
  evaluator_kind: "human" | "automatic";
  status: "draft" | "reviewed" | "rejected";
  scores: unknown;
  evidence: unknown;
  composite_score: number | string | null;
  axis_scores: unknown;
  gate_status: "pass" | "fail" | "incomplete";
  gate_failures: string[];
  reviewer_id: string | null;
  reviewer_notes: string;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
};

function missingTable(message: string) {
  return /director_evaluations|schema cache|does not exist/i.test(message);
}

function normalizeEvidence(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set(DIRECTOR_EVALUATION_DIMENSIONS.map((dimension) => dimension.id));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([id, note]) => allowed.has(id as DirectorEvaluationDimensionId) && typeof note === "string")
      .map(([id, note]) => [id, String(note).trim().slice(0, 1000)]),
  );
}

function normalizeAxisScores(value: unknown): Record<DirectorEvaluationAxis, number | null> {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    instruction: typeof input.instruction === "number" ? input.instruction : null,
    continuity: typeof input.continuity === "number" ? input.continuity : null,
    aesthetic: typeof input.aesthetic === "number" ? input.aesthetic : null,
  };
}

function mapEvaluation(row: EvaluationRow): DirectorEvaluationRecord {
  return {
    id: row.id,
    decisionTraceId: row.decision_trace_id,
    experimentResultId: row.experiment_result_id,
    generationJobId: row.generation_job_id,
    pipelineRunId: row.pipeline_run_id,
    outputAssetId: row.output_asset_id,
    stage: row.stage,
    rubricVersion: row.rubric_version,
    evaluatorKind: row.evaluator_kind,
    status: row.status,
    scores: normalizeDirectorScores(row.scores),
    evidence: normalizeEvidence(row.evidence),
    compositeScore: row.composite_score == null ? null : Number(row.composite_score),
    axisScores: normalizeAxisScores(row.axis_scores),
    gateStatus: row.gate_status,
    gateFailures: (row.gate_failures ?? []).filter((id): id is DirectorEvaluationDimensionId =>
      DIRECTOR_EVALUATION_DIMENSIONS.some((dimension) => dimension.id === id)),
    reviewerId: row.reviewer_id,
    reviewerNotes: row.reviewer_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
  };
}

export async function listDirectorEvaluations(limit = 250) {
  const result = await getSupabaseAdminClient()
    .from("director_evaluations")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, Math.min(1000, limit)));
  if (result.error) {
    if (missingTable(result.error.message)) return { storageReady: false, evaluations: [] };
    throw new Error(`Load Director evaluations: ${result.error.message}`);
  }
  return {
    storageReady: true,
    evaluations: (result.data as EvaluationRow[]).map(mapEvaluation),
  };
}

export async function reviewExperimentResult(input: {
  resultId?: unknown;
  scores?: unknown;
  evidence?: unknown;
  reviewerNotes?: unknown;
  status?: unknown;
}, reviewerId: string) {
  if (typeof input.resultId !== "string" || !input.resultId) throw new Error("Experiment result ID is required.");
  const supabase = getSupabaseAdminClient();
  const resultLookup = await supabase
    .from("pipeline_experiment_results")
    .select("id,generation_job_id,output_asset_id,experiment_id")
    .eq("id", input.resultId)
    .single();
  if (resultLookup.error || !resultLookup.data) {
    throw new Error(`Load experiment result: ${resultLookup.error?.message ?? "not found"}`);
  }
  const experimentLookup = await supabase
    .from("pipeline_experiments")
    .select("stage")
    .eq("id", resultLookup.data.experiment_id)
    .single();
  if (experimentLookup.error || !experimentLookup.data || !PIPELINE_STAGE_IDS.includes(experimentLookup.data.stage as PipelineStageId)) {
    throw new Error(`Load experiment stage: ${experimentLookup.error?.message ?? "not found"}`);
  }
  const stage = experimentLookup.data.stage as PipelineStageId;
  const scores = normalizeDirectorScores(input.scores);
  const evidence = normalizeEvidence(input.evidence);
  const summary = summarizeDirectorEvaluation(stage, scores);
  const requestedStatus = input.status === "reviewed" || input.status === "rejected" ? input.status : "draft";
  if (requestedStatus === "reviewed" && summary.scoredDimensions !== summary.applicableDimensions) {
    throw new Error(`Score all ${summary.applicableDimensions} ${stage} dimensions before completing review.`);
  }
  const traceLookup = resultLookup.data.generation_job_id
    ? await supabase
      .from("director_decision_traces")
      .select("id")
      .eq("generation_job_id", resultLookup.data.generation_job_id)
      .maybeSingle()
    : { data: null, error: null };
  if (traceLookup.error && !missingTable(traceLookup.error.message)) {
    throw new Error(`Load Director decision trace: ${traceLookup.error.message}`);
  }
  const now = new Date().toISOString();
  const saved = await supabase.from("director_evaluations").upsert({
    decision_trace_id: traceLookup.data?.id ?? null,
    experiment_result_id: input.resultId,
    generation_job_id: resultLookup.data.generation_job_id,
    output_asset_id: resultLookup.data.output_asset_id,
    stage,
    rubric_version: DIRECTOR_EVALUATION_VERSION,
    evaluator_kind: "human",
    status: requestedStatus,
    scores,
    evidence,
    composite_score: summary.score,
    axis_scores: summary.axisScores,
    gate_status: summary.gateStatus,
    gate_failures: summary.gateFailures,
    reviewer_id: reviewerId,
    reviewer_notes: typeof input.reviewerNotes === "string" ? input.reviewerNotes.trim().slice(0, 4000) : "",
    updated_at: now,
    reviewed_at: requestedStatus === "reviewed" ? now : null,
  }, { onConflict: "experiment_result_id,evaluator_kind" }).select("*").single();
  if (saved.error || !saved.data) throw new Error(`Save Director evaluation: ${saved.error?.message ?? "No record returned."}`);
  return mapEvaluation(saved.data as EvaluationRow);
}

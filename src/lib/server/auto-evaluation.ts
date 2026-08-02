import "server-only";

import { canonicalAutoEvaluation, type AutoEvaluationInput } from "@/lib/auto-evaluation";
import { DIRECTOR_EVALUATION_VERSION } from "@/lib/director-evaluation";
import type { PipelineStageId } from "@/lib/pipeline-config";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * Persists an automatic Director evaluation through the canonical scale.
 *
 * Automatic scorers never present themselves as human review: evaluator_kind
 * is always "automatic", and status is "reviewed" only when every applicable
 * dimension for the stage was actually measured — a partial measurement stays
 * a draft rather than pretending to be a completed scorecard.
 */
export async function writeAutomaticDirectorEvaluation(input: {
  stage: PipelineStageId;
  /** Per-dimension measurements on a 0-100 scale; converted canonically. */
  percentScores: AutoEvaluationInput;
  generationJobId?: string | null;
  pipelineRunId?: string | null;
  outputAssetId?: string | null;
  experimentResultId?: string | null;
  evidence?: Record<string, unknown>;
  reviewerNotes?: string;
  rubricVersion?: string;
}) {
  const supabase = getSupabaseAdminClient();
  const { scores, summary } = canonicalAutoEvaluation(input.stage, input.percentScores);
  const traceLookup = input.generationJobId
    ? await supabase
      .from("director_decision_traces")
      .select("id")
      .eq("generation_job_id", input.generationJobId)
      .maybeSingle()
    : { data: null, error: null };
  const now = new Date().toISOString();
  const complete = summary.scoredDimensions === summary.applicableDimensions;
  const row = {
    decision_trace_id: traceLookup.data?.id ?? null,
    experiment_result_id: input.experimentResultId ?? null,
    generation_job_id: input.generationJobId ?? null,
    pipeline_run_id: input.pipelineRunId ?? null,
    output_asset_id: input.outputAssetId ?? null,
    stage: input.stage,
    rubric_version: input.rubricVersion ?? DIRECTOR_EVALUATION_VERSION,
    evaluator_kind: "automatic" as const,
    status: complete ? ("reviewed" as const) : ("draft" as const),
    scores,
    evidence: input.evidence ?? {},
    composite_score: summary.score,
    axis_scores: summary.axisScores,
    gate_status: summary.gateStatus,
    gate_failures: summary.gateFailures,
    reviewer_id: null,
    reviewer_notes: (input.reviewerNotes ?? "Automatic measurement; human review retains promotion authority.").slice(0, 4000),
    updated_at: now,
    reviewed_at: complete ? now : null,
  };
  const saved = input.experimentResultId
    ? await supabase.from("director_evaluations")
      .upsert(row, { onConflict: "experiment_result_id,evaluator_kind" })
      .select("id,gate_status,composite_score")
      .single()
    : await supabase.from("director_evaluations")
      .insert(row)
      .select("id,gate_status,composite_score")
      .single();
  if (saved.error || !saved.data) {
    throw new Error(`Save automatic Director evaluation: ${saved.error?.message ?? "No record returned."}`);
  }
  return {
    id: saved.data.id as string,
    gateStatus: saved.data.gate_status as "pass" | "fail" | "incomplete",
    compositeScore: saved.data.composite_score == null ? null : Number(saved.data.composite_score),
    summary,
    scores,
  };
}

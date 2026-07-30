import "server-only";

import {
  DEFAULT_PIPELINE_CONFIG,
  normalizePipelineConfig,
  PIPELINE_STAGE_IDS,
  type PipelineConfig,
  type PipelineStageId,
} from "@/lib/pipeline-config";
import {
  createExperimentVariants,
  type PipelineExperiment,
  type PipelineExperimentResult,
  type PipelineExperimentVariant,
} from "@/lib/pipeline-experiments";
import {
  compareDirectorEvaluations,
  defaultTargetDimensions,
  DIRECTOR_EVALUATION_DIMENSIONS,
  type DirectorComparison,
  type DirectorEvaluationDimensionId,
  type DirectorEvaluationRecord,
} from "@/lib/director-evaluation";
import { getPipelineConfig, savePipelineConfig } from "@/lib/server/pipeline-config";
import { listDirectorEvaluations } from "@/lib/server/director-evaluations";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

type ExperimentRow = {
  id: string;
  name: string;
  stage: PipelineStageId;
  status: PipelineExperiment["status"];
  input_prompt: string;
  character_id: string | null;
  reference_image_url: string | null;
  baseline_revision: number;
  variants: unknown;
  winner_variant_id: string | null;
  target_dimensions: string[];
  minimum_improvement: number | string;
  max_gate_regression: number | string;
  promotion_snapshot: unknown;
  promoted_revision: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  promoted_at: string | null;
};

type ResultRow = {
  id: string;
  experiment_id: string;
  variant_id: string;
  generation_job_id: string | null;
  output_asset_id: string | null;
  output_text: string | null;
  status: PipelineExperimentResult["status"];
  provider: string;
  model: string;
  cost_usd: number | null;
  latency_ms: number | null;
  error_message: string | null;
  score: number | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
};

function validateStage(value: unknown): PipelineStageId {
  if (typeof value !== "string" || !PIPELINE_STAGE_IDS.includes(value as PipelineStageId)) {
    throw new Error("Choose a valid pipeline stage.");
  }
  return value as PipelineStageId;
}

function normalizeVariant(stage: PipelineStageId, value: unknown, index: number): PipelineExperimentVariant {
  const candidate = value && typeof value === "object" ? value as Partial<PipelineExperimentVariant> : {};
  const config = normalizePipelineConfig({
    stages: {
      ...DEFAULT_PIPELINE_CONFIG.stages,
      [stage]: candidate.config,
    },
  }).stages[stage];
  return {
    id: typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)
      : `variant-${index + 1}`,
    name: typeof candidate.name === "string" && candidate.name.trim()
      ? candidate.name.trim().slice(0, 80)
      : `Variant ${index + 1}`,
    hypothesis: typeof candidate.hypothesis === "string"
      ? candidate.hypothesis.trim().slice(0, 500)
      : "",
    config,
  };
}

function normalizeVariants(stage: PipelineStageId, value: unknown): PipelineExperimentVariant[] {
  if (!Array.isArray(value)) throw new Error("An experiment needs variants.");
  const variants = value.slice(0, 4).map((item, index) => normalizeVariant(stage, item, index));
  if (variants.length < 2) throw new Error("An experiment needs at least two variants.");
  if (new Set(variants.map((variant) => variant.id)).size !== variants.length) {
    throw new Error("Variant IDs must be unique.");
  }
  return variants;
}

function mapResult(
  row: ResultRow,
  outputUrl: string | null,
  evaluation: DirectorEvaluationRecord | null,
): PipelineExperimentResult {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    variantId: row.variant_id,
    generationJobId: row.generation_job_id,
    outputAssetId: row.output_asset_id,
    outputUrl,
    outputText: row.output_text,
    status: row.status,
    provider: row.provider,
    model: row.model,
    costUsd: row.cost_usd == null ? null : Number(row.cost_usd),
    latencyMs: row.latency_ms,
    errorMessage: row.error_message,
    score: row.score,
    notes: row.notes,
    evaluation,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function normalizeTargetDimensions(stage: PipelineStageId, value: unknown): DirectorEvaluationDimensionId[] {
  const valid = new Set(
    DIRECTOR_EVALUATION_DIMENSIONS
      .filter((dimension) => dimension.stages.includes(stage))
      .map((dimension) => dimension.id),
  );
  const targets = Array.isArray(value)
    ? value.filter((id): id is DirectorEvaluationDimensionId => typeof id === "string" && valid.has(id as DirectorEvaluationDimensionId))
    : [];
  return targets.length ? [...new Set(targets)] : defaultTargetDimensions(stage);
}

function experimentComparison(input: {
  stage: PipelineStageId;
  variants: PipelineExperimentVariant[];
  results: PipelineExperimentResult[];
  winnerVariantId: string | null;
  targetDimensions: DirectorEvaluationDimensionId[];
  minimumImprovement: number;
  maxGateRegression: number;
}): DirectorComparison | null {
  if (!input.winnerVariantId) return null;
  const controlId = input.variants.find((variant) => variant.id === "control")?.id ?? input.variants[0]?.id;
  if (!controlId || controlId === input.winnerVariantId) return null;
  const control = input.results.find((result) =>
    result.variantId === controlId && result.status === "succeeded" && result.evaluation?.status === "reviewed");
  const candidate = input.results.find((result) =>
    result.variantId === input.winnerVariantId && result.status === "succeeded" && result.evaluation?.status === "reviewed");
  if (!control?.evaluation || !candidate?.evaluation) return null;
  return compareDirectorEvaluations({
    stage: input.stage,
    baseline: control.evaluation.scores,
    candidate: candidate.evaluation.scores,
    targetDimensions: input.targetDimensions,
    minimumImprovement: input.minimumImprovement,
    maxGateRegression: input.maxGateRegression,
    humanWinnerIsCandidate: true,
  });
}

export async function listPipelineExperiments(): Promise<PipelineExperiment[]> {
  const supabase = getSupabaseAdminClient();
  const [experimentsResult, evaluationBundle] = await Promise.all([supabase
    .from("pipeline_experiments")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(40), listDirectorEvaluations(500)]);
  if (experimentsResult.error) {
    if (/pipeline_experiments|schema cache|does not exist/i.test(experimentsResult.error.message)) return [];
    throw new Error(`Load pipeline experiments: ${experimentsResult.error.message}`);
  }
  const rows = (experimentsResult.data ?? []) as ExperimentRow[];
  const ids = rows.map((row) => row.id);
  const resultsResult = ids.length
    ? await supabase.from("pipeline_experiment_results").select("*").in("experiment_id", ids).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (resultsResult.error) throw new Error(`Load experiment results: ${resultsResult.error.message}`);
  const resultRows = (resultsResult.data ?? []) as ResultRow[];
  const assetIds = resultRows.map((row) => row.output_asset_id).filter((id): id is string => Boolean(id));
  const assetsResult = assetIds.length
    ? await supabase.from("media_assets").select("id,url").in("id", assetIds)
    : { data: [], error: null };
  if (assetsResult.error) throw new Error(`Load experiment media: ${assetsResult.error.message}`);
  const assetUrls = new Map((assetsResult.data ?? []).map((asset) => [String(asset.id), String(asset.url)]));

  const evaluationByResult = new Map(
    evaluationBundle.evaluations
      .filter((evaluation) => evaluation.experimentResultId)
      .map((evaluation) => [evaluation.experimentResultId!, evaluation]),
  );
  return rows.map((row) => {
    const variants = normalizeVariants(row.stage, row.variants);
    const targetDimensions = normalizeTargetDimensions(row.stage, row.target_dimensions);
    const minimumImprovement = Number(row.minimum_improvement ?? 5);
    const maxGateRegression = Number(row.max_gate_regression ?? 0);
    const results = resultRows
      .filter((result) => result.experiment_id === row.id)
      .map((result) => mapResult(
        result,
        result.output_asset_id ? assetUrls.get(result.output_asset_id) ?? null : null,
        evaluationByResult.get(result.id) ?? null,
      ));
    return {
      id: row.id,
      name: row.name,
      stage: row.stage,
      status: row.status,
      inputPrompt: row.input_prompt,
      characterId: row.character_id,
      referenceImageUrl: row.reference_image_url,
      baselineRevision: row.baseline_revision,
      variants,
      winnerVariantId: row.winner_variant_id,
      targetDimensions,
      minimumImprovement,
      maxGateRegression,
      promotionSnapshot: row.promotion_snapshot && typeof row.promotion_snapshot === "object" && !Array.isArray(row.promotion_snapshot)
        ? row.promotion_snapshot as Record<string, unknown>
        : {},
      comparison: experimentComparison({
        stage: row.stage,
        variants,
        results,
        winnerVariantId: row.winner_variant_id,
        targetDimensions,
        minimumImprovement,
        maxGateRegression,
      }),
      promotedRevision: row.promoted_revision,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      promotedAt: row.promoted_at,
      results,
    };
  });
}

export async function getPipelineExperiment(id: string) {
  const experiments = await listPipelineExperiments();
  const experiment = experiments.find((item) => item.id === id);
  if (!experiment) throw new Error("Pipeline experiment was not found.");
  return experiment;
}

export async function createPipelineExperiment(input: {
  name?: unknown;
  stage?: unknown;
  characterId?: unknown;
  referenceImageUrl?: unknown;
}, userId: string) {
  const stage = validateStage(input.stage);
  const active = await getPipelineConfig();
  const name = typeof input.name === "string" && input.name.trim()
    ? input.name.trim().slice(0, 120)
    : `${stage[0].toUpperCase()}${stage.slice(1)} test`;
  const variants = createExperimentVariants(active.stages[stage]);
  const result = await getSupabaseAdminClient()
    .from("pipeline_experiments")
    .insert({
      name,
      stage,
      status: "draft",
      character_id: typeof input.characterId === "string" && input.characterId ? input.characterId : null,
      reference_image_url: typeof input.referenceImageUrl === "string" && input.referenceImageUrl ? input.referenceImageUrl : null,
      baseline_revision: active.revision,
      variants,
      target_dimensions: defaultTargetDimensions(stage),
      minimum_improvement: 5,
      max_gate_regression: 0,
      created_by: userId,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (result.error || !result.data) throw new Error(`Create pipeline experiment: ${result.error?.message ?? "No record returned."}`);
  return String(result.data.id);
}

export async function updatePipelineExperiment(input: {
  id?: unknown;
  name?: unknown;
  inputPrompt?: unknown;
  characterId?: unknown;
  referenceImageUrl?: unknown;
  variants?: unknown;
  winnerVariantId?: unknown;
  targetDimensions?: unknown;
  minimumImprovement?: unknown;
  maxGateRegression?: unknown;
  status?: unknown;
}) {
  if (typeof input.id !== "string" || !input.id) throw new Error("Experiment ID is required.");
  const currentResult = await getSupabaseAdminClient().from("pipeline_experiments").select("*").eq("id", input.id).single();
  if (currentResult.error || !currentResult.data) throw new Error(`Load experiment: ${currentResult.error?.message ?? "Not found."}`);
  const current = currentResult.data as ExperimentRow;
  const variants = input.variants == null ? normalizeVariants(current.stage, current.variants) : normalizeVariants(current.stage, input.variants);
  const statuses: PipelineExperiment["status"][] = ["draft", "testing", "review", "promoted", "archived"];
  const status = statuses.includes(input.status as PipelineExperiment["status"]) ? input.status : current.status;
  const winnerVariantId = typeof input.winnerVariantId === "string" && variants.some((variant) => variant.id === input.winnerVariantId)
    ? input.winnerVariantId
    : null;
  const targetDimensions = input.targetDimensions === undefined
    ? normalizeTargetDimensions(current.stage, current.target_dimensions)
    : normalizeTargetDimensions(current.stage, input.targetDimensions);
  const minimumImprovement = input.minimumImprovement === undefined
    ? Number(current.minimum_improvement ?? 5)
    : Math.max(0, Math.min(100, Number(input.minimumImprovement)));
  const maxGateRegression = input.maxGateRegression === undefined
    ? Number(current.max_gate_regression ?? 0)
    : Math.max(0, Math.min(4, Number(input.maxGateRegression)));
  const update = await getSupabaseAdminClient().from("pipeline_experiments").update({
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 120) : current.name,
    input_prompt: typeof input.inputPrompt === "string" ? input.inputPrompt.slice(0, 6000) : current.input_prompt,
    character_id: typeof input.characterId === "string" && input.characterId ? input.characterId : null,
    reference_image_url: typeof input.referenceImageUrl === "string" && input.referenceImageUrl ? input.referenceImageUrl : null,
    variants,
    winner_variant_id: winnerVariantId,
    target_dimensions: targetDimensions,
    minimum_improvement: Number.isFinite(minimumImprovement) ? minimumImprovement : 5,
    max_gate_regression: Number.isFinite(maxGateRegression) ? maxGateRegression : 0,
    status,
    updated_at: new Date().toISOString(),
  }).eq("id", input.id);
  if (update.error) throw new Error(`Save experiment: ${update.error.message}`);
}

export async function scorePipelineExperimentResult(input: {
  resultId?: unknown;
  score?: unknown;
  notes?: unknown;
}) {
  if (typeof input.resultId !== "string" || !input.resultId) throw new Error("Result ID is required.");
  const score = Math.round(Number(input.score));
  if (!Number.isFinite(score) || score < 1 || score > 5) throw new Error("Score must be between 1 and 5.");
  const update = await getSupabaseAdminClient().from("pipeline_experiment_results").update({
    score,
    notes: typeof input.notes === "string" ? input.notes.trim().slice(0, 1000) : null,
  }).eq("id", input.resultId);
  if (update.error) throw new Error(`Score experiment result: ${update.error.message}`);
}

export async function promotePipelineExperiment(id: string, userId: string): Promise<PipelineConfig> {
  const supabase = getSupabaseAdminClient();
  const currentResult = await supabase.from("pipeline_experiments").select("*").eq("id", id).single();
  if (currentResult.error || !currentResult.data) throw new Error(`Load experiment: ${currentResult.error?.message ?? "Not found."}`);
  const experiment = currentResult.data as ExperimentRow;
  if (!experiment.winner_variant_id) throw new Error("Choose a winning variant before promotion.");
  const variants = normalizeVariants(experiment.stage, experiment.variants);
  const winner = variants.find((variant) => variant.id === experiment.winner_variant_id);
  if (!winner) throw new Error("The winning variant no longer exists.");
  const hydrated = await getPipelineExperiment(id);
  if (!hydrated.comparison) {
    throw new Error("Review the latest successful control and winning outputs with the Director scorecard before promotion.");
  }
  if (!hydrated.comparison.promotable) {
    throw new Error(`Director promotion gate: ${hydrated.comparison.blockers.join(" ")}`);
  }
  const active = await getPipelineConfig();
  const promoted = await savePipelineConfig({
    ...active,
    stages: { ...active.stages, [experiment.stage]: winner.config },
  }, userId);
  const update = await supabase.from("pipeline_experiments").update({
    status: "promoted",
    promoted_revision: promoted.revision,
    promotion_snapshot: {
      rubricVersion: hydrated.results.find((result) => result.variantId === winner.id)?.evaluation?.rubricVersion,
      comparison: hydrated.comparison,
      targetDimensions: hydrated.targetDimensions,
      winnerVariantId: winner.id,
      reviewedAt: new Date().toISOString(),
    },
    promoted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (update.error) throw new Error(`Mark experiment promoted: ${update.error.message}`);
  return promoted;
}

export async function deletePipelineExperiment(id: string) {
  const supabase = getSupabaseAdminClient();
  const current = await supabase.from("pipeline_experiments").select("status").eq("id", id).single();
  if (current.error || !current.data) throw new Error(`Load experiment: ${current.error?.message ?? "Not found."}`);
  if (current.data.status === "promoted") throw new Error("Promoted experiments are permanent audit records.");
  const deleted = await supabase.from("pipeline_experiments").delete().eq("id", id);
  if (deleted.error) throw new Error(`Delete experiment: ${deleted.error.message}`);
}

import "server-only";

import { createHash } from "node:crypto";
import { retrieveDirectorKnowledge, type DirectorBrainTrace } from "@/lib/director-brain";
import type { ApprovedDirectorStudyContext, DirectorSourceKind } from "@/lib/director-research";
import { DIRECTOR_SPRINT_ONE_KEY } from "@/lib/director-sprint-one";
import {
  buildDirectorSprintTestVariants,
  cloneSprintPipelineVariants,
  DIRECTOR_SPRINT_TEST_VARIANT_IDS,
  type DirectorSprintShotScore,
  type DirectorSprintShotTest,
  type DirectorSprintStageGrant,
  type DirectorSprintTestBundle,
  type DirectorSprintTestResult,
  type DirectorSprintTestVariant,
  type DirectorSprintTestVariantId,
} from "@/lib/director-sprint-test";
import { DEFAULT_PIPELINE_CONFIG, normalizePipelineConfig, type PipelineStageConfig } from "@/lib/pipeline-config";
import { createDirectorDecisionTrace, updateDirectorDecisionTrace } from "@/lib/server/director-decisions";
import { listDirectorSprintOne } from "@/lib/server/director-sprint-one";
import { getPipelineConfig } from "@/lib/server/pipeline-config";
import {
  getCharacterProductionState,
  getSupabaseAdminClient,
  listCharacters,
} from "@/lib/server/supabase-admin";

type ShotTestRow = {
  id: string;
  sprint_run_id: string;
  sprint_key: string;
  character_id: string;
  brief: string;
  invariant_hash: string;
  baseline_revision: number;
  image_experiment_id: string;
  video_experiment_id: string;
  variants: unknown;
  status: DirectorSprintShotTest["status"];
  human_preference_variant_id: string | null;
  winner_variant_id: string | null;
  outcome: DirectorSprintShotTest["outcome"];
  shipped_asset_id: string | null;
  shipped_evaluation_id: string | null;
  outcome_summary: string;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  shipped_at: string | null;
  characters?: { name?: string; image_url?: string | null } | Array<{ name?: string; image_url?: string | null }>;
};

type ResultRow = {
  id: string;
  experiment_id: string;
  variant_id: string;
  generation_job_id: string | null;
  output_asset_id: string | null;
  status: DirectorSprintTestResult["status"];
  provider: string;
  model: string;
  cost_usd: number | string | null;
  latency_ms: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

type ScoreRow = {
  id: string;
  variant_id: string;
  video_result_id: string;
  evaluation_id: string;
  identity_continuity: number;
  performance: number;
  shot_readability: number;
  composite_score: number | string;
  identity_gate: "pass" | "fail";
  review_notes: string;
  reviewed_by: string;
  reviewed_at: string;
};

type ExperimentRow = {
  id: string;
  stage: "image" | "video";
  character_id: string | null;
  reference_image_url: string | null;
  variants: unknown;
};

function missingSprintTestTable(message: string) {
  return /director_sprint_shot_(?:tests|scores)|schema cache|does not exist/i.test(message);
}

function joinedCharacter(row: ShotTestRow) {
  return Array.isArray(row.characters) ? row.characters[0] : row.characters;
}

function isVariantId(value: unknown): value is DirectorSprintTestVariantId {
  return typeof value === "string" && DIRECTOR_SPRINT_TEST_VARIANT_IDS.includes(value as DirectorSprintTestVariantId);
}

function normalizeVariants(value: unknown): DirectorSprintTestVariant[] {
  if (!Array.isArray(value)) return [];
  return value.filter((variant): variant is DirectorSprintTestVariant => {
    if (!variant || typeof variant !== "object") return false;
    const candidate = variant as Partial<DirectorSprintTestVariant>;
    return isVariantId(candidate.id)
      && typeof candidate.name === "string"
      && typeof candidate.imagePrompt === "string"
      && typeof candidate.videoPrompt === "string";
  });
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function characterOptions() {
  const characters = await listCharacters();
  return characters
    .map((character) => ({
      id: character.id,
      name: character.name,
      archetype: character.archetype,
      imageUrl: character.imageUrl ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function listDirectorSprintTest(): Promise<DirectorSprintTestBundle> {
  const [sprint, characters] = await Promise.all([listDirectorSprintOne(), characterOptions()]);
  const supabase = getSupabaseAdminClient();
  const testResult = await supabase
    .from("director_sprint_shot_tests")
    .select("*,characters(name,image_url)")
    .eq("sprint_key", DIRECTOR_SPRINT_ONE_KEY)
    .maybeSingle();
  if (testResult.error) {
    if (missingSprintTestTable(testResult.error.message)) {
      return {
        storageReady: false,
        playbackVerified: sprint.progress.playbackVerified,
        playbackRejected: sprint.progress.playbackRejected,
        playbackPending: sprint.progress.playbackPending,
        characters,
        test: null,
      };
    }
    throw new Error(`Load Sprint 1 shot test: ${testResult.error.message}`);
  }
  if (!testResult.data) {
    return {
      storageReady: true,
      playbackVerified: sprint.progress.playbackVerified,
      playbackRejected: sprint.progress.playbackRejected,
      playbackPending: sprint.progress.playbackPending,
      characters,
      test: null,
    };
  }
  const row = testResult.data as ShotTestRow;
  const resultBundle = await supabase
    .from("pipeline_experiment_results")
    .select("id,experiment_id,variant_id,generation_job_id,output_asset_id,status,provider,model,cost_usd,latency_ms,error_message,created_at,completed_at")
    .in("experiment_id", [row.image_experiment_id, row.video_experiment_id])
    .order("created_at", { ascending: true });
  if (resultBundle.error) throw new Error(`Load Sprint 1 generated evidence: ${resultBundle.error.message}`);
  const resultRows = (resultBundle.data ?? []) as ResultRow[];
  const assetIds = [...new Set([
    ...resultRows.map((result) => result.output_asset_id),
    row.shipped_asset_id,
  ].filter((id): id is string => Boolean(id)))];
  const [assets, scores] = await Promise.all([
    assetIds.length
      ? supabase.from("media_assets").select("id,url").in("id", assetIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("director_sprint_shot_scores").select("*").eq("test_id", row.id).order("reviewed_at", { ascending: true }),
  ]);
  const error = assets.error ?? scores.error;
  if (error) throw new Error(`Load Sprint 1 scorecard: ${error.message}`);
  const urls = new Map((assets.data ?? []).map((asset) => [String(asset.id), String(asset.url)]));
  const results: DirectorSprintTestResult[] = resultRows.flatMap((result) => {
    if (!isVariantId(result.variant_id)) return [];
    return [{
      id: result.id,
      variantId: result.variant_id,
      stage: result.experiment_id === row.image_experiment_id ? "image" : "video",
      status: result.status,
      generationJobId: result.generation_job_id,
      assetId: result.output_asset_id,
      url: result.output_asset_id ? urls.get(result.output_asset_id) ?? null : null,
      provider: result.provider,
      model: result.model,
      costUsd: result.cost_usd == null ? null : Number(result.cost_usd),
      latencyMs: result.latency_ms,
      errorMessage: result.error_message,
      createdAt: result.created_at,
      completedAt: result.completed_at,
    }];
  });
  const scoreRecords: DirectorSprintShotScore[] = ((scores.data ?? []) as ScoreRow[]).flatMap((score) => {
    if (!isVariantId(score.variant_id)) return [];
    return [{
      id: score.id,
      variantId: score.variant_id,
      videoResultId: score.video_result_id,
      evaluationId: score.evaluation_id,
      identityContinuity: score.identity_continuity,
      performance: score.performance,
      shotReadability: score.shot_readability,
      compositeScore: Number(score.composite_score),
      identityGate: score.identity_gate,
      reviewNotes: score.review_notes,
      reviewedBy: score.reviewed_by,
      reviewedAt: score.reviewed_at,
    }];
  });
  const character = joinedCharacter(row);
  return {
    storageReady: true,
    playbackVerified: sprint.progress.playbackVerified,
    playbackRejected: sprint.progress.playbackRejected,
    playbackPending: sprint.progress.playbackPending,
    characters,
    test: {
      id: row.id,
      sprintRunId: row.sprint_run_id,
      sprintKey: row.sprint_key,
      characterId: row.character_id,
      characterName: character?.name ?? "Marketplace actor",
      characterImageUrl: character?.image_url ?? null,
      brief: row.brief,
      invariantHash: row.invariant_hash,
      baselineRevision: row.baseline_revision,
      imageExperimentId: row.image_experiment_id,
      videoExperimentId: row.video_experiment_id,
      variants: normalizeVariants(row.variants),
      results,
      scores: scoreRecords,
      status: row.status,
      humanPreferenceVariantId: isVariantId(row.human_preference_variant_id) ? row.human_preference_variant_id : null,
      winnerVariantId: isVariantId(row.winner_variant_id) ? row.winner_variant_id : null,
      outcome: row.outcome,
      outcomeSummary: row.outcome_summary,
      shippedAssetId: row.shipped_asset_id,
      shippedEvaluationId: row.shipped_evaluation_id,
      shippedUrl: row.shipped_asset_id ? urls.get(row.shipped_asset_id) ?? null : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      decidedAt: row.decided_at,
      shippedAt: row.shipped_at,
    },
  };
}

export async function initializeDirectorSprintTest(input: Record<string, unknown>, userId: string) {
  const existing = await listDirectorSprintTest();
  if (!existing.storageReady) throw new Error("Apply the Sprint 1 shot-test migration before initialization.");
  if (existing.test) return existing;
  if (existing.playbackVerified !== 5 || existing.playbackRejected > 0 || existing.playbackPending > 0) {
    throw new Error("Generation remains dormant until all five shortlisted passages are playback-verified.");
  }
  const characterId = typeof input.characterId === "string" ? input.characterId.trim() : "";
  const brief = typeof input.brief === "string" ? input.brief.replace(/\s+/g, " ").trim().slice(0, 2000) : "";
  if (!characterId) throw new Error("Choose one real marketplace character.");
  if (brief.length < 40) throw new Error("Write one fixed, specific 4–5 second character-shot brief.");
  const sprint = await listDirectorSprintOne();
  const shortlist = sprint.assessments
    .filter((assessment) => assessment.shortlistRank != null)
    .sort((left, right) => left.shortlistRank! - right.shortlistRank!);
  if (shortlist.length !== 5 || shortlist.some((assessment) => assessment.playbackReview?.verdict !== "verified")) {
    throw new Error("All five current shortlist readings must be verified before initialization.");
  }
  const production = await getCharacterProductionState(characterId);
  if (!production.visualReference?.url) {
    throw new Error("The selected marketplace character needs a locked canonical visual reference first.");
  }
  const pipeline = await getPipelineConfig();
  const variants = buildDirectorSprintTestVariants(brief, shortlist);
  const invariantHash = stableHash({
    sprintKey: DIRECTOR_SPRINT_ONE_KEY,
    characterId,
    brief,
    baselineRevision: pipeline.revision,
    imageConfig: pipeline.stages.image,
    videoConfig: pipeline.stages.video,
    variants: variants.map(({ id, assessmentId, principle }) => ({ id, assessmentId, principle })),
  });
  const result = await getSupabaseAdminClient().rpc("initialize_director_sprint_shot_test", {
    p_sprint_run_id: shortlist[0].sprintRunId,
    p_sprint_key: DIRECTOR_SPRINT_ONE_KEY,
    p_character_id: characterId,
    p_brief: brief,
    p_invariant_hash: invariantHash,
    p_baseline_revision: pipeline.revision,
    p_reference_image_url: production.visualReference.url,
    p_variants: variants,
    p_image_variants: cloneSprintPipelineVariants(variants, pipeline.stages.image),
    p_video_variants: cloneSprintPipelineVariants(variants, pipeline.stages.video),
    p_created_by: userId,
  });
  if (result.error) throw new Error(`Initialize controlled Sprint 1 test: ${result.error.message}`);
  return listDirectorSprintTest();
}

function numericScore(value: unknown, label: string) {
  const score = Number(value);
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error(`${label} must be scored from 1 to 5.`);
  return score;
}

export async function scoreDirectorSprintTest(input: Record<string, unknown>, reviewerId: string) {
  const testId = typeof input.testId === "string" ? input.testId : "";
  const variantId = isVariantId(input.variantId) ? input.variantId : null;
  const notes = typeof input.reviewNotes === "string" ? input.reviewNotes.trim().slice(0, 4000) : "";
  if (!testId || !variantId) throw new Error("Choose a Sprint 1 video result.");
  if (notes.length < 20) throw new Error("Record concrete playback evidence for the score.");
  const result = await getSupabaseAdminClient().rpc("record_director_sprint_shot_score", {
    p_test_id: testId,
    p_variant_id: variantId,
    p_identity_continuity: numericScore(input.identityContinuity, "Identity and continuity"),
    p_performance: numericScore(input.performance, "Performance"),
    p_shot_readability: numericScore(input.shotReadability, "Shot readability"),
    p_review_notes: notes,
    p_reviewer_id: reviewerId,
  });
  if (result.error) throw new Error(`Save Sprint 1 scorecard: ${result.error.message}`);
  return listDirectorSprintTest();
}

export async function decideDirectorSprintTest(input: Record<string, unknown>, reviewerId: string) {
  const testId = typeof input.testId === "string" ? input.testId : "";
  const preference = isVariantId(input.humanPreferenceVariantId) ? input.humanPreferenceVariantId : null;
  if (!testId || !preference) throw new Error("Choose the human-preferred shot after scoring all six.");
  const result = await getSupabaseAdminClient().rpc("decide_director_sprint_shot_test", {
    p_test_id: testId,
    p_human_preference_variant_id: preference,
    p_actor: reviewerId,
  });
  if (result.error) throw new Error(`Record Sprint 1 result: ${result.error.message}`);
  return listDirectorSprintTest();
}

export async function shipDirectorSprintTest(input: Record<string, unknown>, reviewerId: string) {
  const testId = typeof input.testId === "string" ? input.testId : "";
  if (!testId) throw new Error("Sprint 1 test ID is required.");
  const result = await getSupabaseAdminClient().rpc("ship_director_sprint_shot_test", {
    p_test_id: testId,
    p_actor: reviewerId,
  });
  if (result.error) throw new Error(`Ship Sprint 1 winner: ${result.error.message}`);
  return listDirectorSprintTest();
}

function validSourceKind(value: unknown): DirectorSourceKind {
  return ["institutional", "public-domain", "licensed", "filmmaker-interview", "provider-research", "chaplin-test"].includes(String(value))
    ? value as DirectorSourceKind
    : "public-domain";
}

export async function authorizeDirectorSprintGeneration(input: {
  testId: string;
  variantId: string;
  stage: "image" | "video";
  characterId: string;
}): Promise<DirectorSprintStageGrant & { trace: DirectorBrainTrace }> {
  if (!isVariantId(input.variantId)) throw new Error("Unknown Sprint 1 test variant.");
  const supabase = getSupabaseAdminClient();
  const testResult = await supabase.from("director_sprint_shot_tests").select("*")
    .eq("id", input.testId).eq("sprint_key", DIRECTOR_SPRINT_ONE_KEY).maybeSingle();
  if (testResult.error || !testResult.data) throw new Error(testResult.error?.message ?? "Sprint 1 shot test was not found.");
  const test = testResult.data as ShotTestRow;
  if (test.status !== "initialized") throw new Error("Sprint 1 generation is closed for this test.");
  if (test.character_id !== input.characterId) throw new Error("Sprint 1 character does not match the generation request.");
  const variants = normalizeVariants(test.variants);
  const traceVariant = variants.find((variant) => variant.id === input.variantId);
  if (!traceVariant) throw new Error("Sprint 1 variant snapshot is incomplete.");
  const playback = await supabase.from("director_principle_assessments")
    .select("id,director_principle_playback_reviews(verdict)")
    .eq("sprint_run_id", test.sprint_run_id).not("shortlist_rank", "is", null);
  const verified = (playback.data ?? []).filter((assessment) => {
    const joined = Array.isArray(assessment.director_principle_playback_reviews)
      ? assessment.director_principle_playback_reviews[0]
      : assessment.director_principle_playback_reviews;
    return joined?.verdict === "verified";
  }).length;
  if (playback.error || verified !== 5) throw new Error("Generation remains dormant until all five playback gates are verified.");

  const experimentId = input.stage === "image" ? test.image_experiment_id : test.video_experiment_id;
  const experimentResult = await supabase.from("pipeline_experiments")
    .select("id,stage,character_id,reference_image_url,variants").eq("id", experimentId).single();
  if (experimentResult.error || !experimentResult.data) throw new Error(experimentResult.error?.message ?? "Sprint experiment was not found.");
  const experiment = experimentResult.data as ExperimentRow;
  if (experiment.stage !== input.stage || experiment.character_id !== input.characterId) throw new Error("Sprint experiment invariant failed.");
  const rawVariants = Array.isArray(experiment.variants) ? experiment.variants : [];
  const rawVariant = rawVariants.find((variant) => variant && typeof variant === "object" && (variant as { id?: unknown }).id === input.variantId) as { config?: unknown } | undefined;
  if (!rawVariant?.config || typeof rawVariant.config !== "object") throw new Error("Sprint pipeline snapshot is missing.");
  const stageConfig = normalizePipelineConfig({
    stages: { ...DEFAULT_PIPELINE_CONFIG.stages, [input.stage]: rawVariant.config },
  }).stages[input.stage] as PipelineStageConfig;
  const existingResult = await supabase.from("pipeline_experiment_results").select("id,status")
    .eq("experiment_id", experimentId).eq("variant_id", input.variantId).maybeSingle();
  if (existingResult.error) throw new Error(`Check Sprint generation ceiling: ${existingResult.error.message}`);
  if (existingResult.data) throw new Error(`The ${input.stage} cycle for ${input.variantId} has already been consumed.`);

  let referenceImageUrl = experiment.reference_image_url;
  if (input.stage === "video") {
    const imageResult = await supabase.from("pipeline_experiment_results")
      .select("output_asset_id,media_assets(url)")
      .eq("experiment_id", test.image_experiment_id)
      .eq("variant_id", input.variantId)
      .eq("status", "succeeded")
      .maybeSingle();
    if (imageResult.error || !imageResult.data?.output_asset_id) throw new Error(imageResult.error?.message ?? "Generate the matching keyframe first.");
    const joined = Array.isArray(imageResult.data.media_assets) ? imageResult.data.media_assets[0] : imageResult.data.media_assets;
    referenceImageUrl = joined?.url ?? null;
    if (!referenceImageUrl) throw new Error("The matching keyframe URL is missing.");
  }

  let approvedStudies: ApprovedDirectorStudyContext[] = [];
  if (traceVariant.assessmentId) {
    const assessment = await supabase.from("director_principle_assessments")
      .select("id,principle_text,rank_score,director_scene_studies(study_title,work_title,period_label,region,limitations,director_research_sources(title,source_url,source_kind,rights_basis))")
      .eq("id", traceVariant.assessmentId).single();
    if (assessment.error || !assessment.data) throw new Error(assessment.error?.message ?? "Sprint principle evidence is missing.");
    const study = Array.isArray(assessment.data.director_scene_studies) ? assessment.data.director_scene_studies[0] : assessment.data.director_scene_studies;
    const source = Array.isArray(study?.director_research_sources) ? study?.director_research_sources[0] : study?.director_research_sources;
    approvedStudies = [{
      id: assessment.data.id,
      studyTitle: study?.study_title ?? "Sprint 1 source study",
      workTitle: study?.work_title ?? "",
      sourceTitle: source?.title ?? "Preserved research source",
      sourceUrl: source?.source_url ?? null,
      sourceKind: validSourceKind(source?.source_kind),
      rightsBasis: source?.rights_basis ?? "Preserved source record",
      periodLabel: study?.period_label ?? undefined,
      region: study?.region ?? undefined,
      limitations: study?.limitations ?? undefined,
      principles: [assessment.data.principle_text],
      score: Number(assessment.data.rank_score),
    }];
  }
  const trace = retrieveDirectorKnowledge({ brief: test.brief, format: "spark", durationSeconds: 5, sceneCount: 1 });
  trace.signals = [...new Set([...trace.signals, "sprint-1-controlled-test", input.stage])];
  trace.approvedStudies = approvedStudies;
  trace.selectionReasons = [
    ...trace.selectionReasons,
    `Sprint 1 invariant ${test.invariant_hash}: same actor, brief, baseline revision, and stage configuration across all six variants.`,
    traceVariant.principle
      ? `Only challenger variable: ${traceVariant.principle}`
      : "Control variable: no Sprint 1 research principle added.",
  ];
  return {
    testId: test.id,
    variantId: input.variantId,
    stage: input.stage,
    characterId: test.character_id,
    brief: test.brief,
    prompt: input.stage === "image" ? traceVariant.imagePrompt : traceVariant.videoPrompt,
    experimentId,
    stageConfig,
    referenceImageUrl,
    traceVariant,
    trace,
  };
}

export async function startDirectorSprintDecisionTrace(input: {
  grant: DirectorSprintStageGrant & { trace: DirectorBrainTrace };
  generationJobId: string;
  userId: string;
  provider: string;
  model: string;
}) {
  return createDirectorDecisionTrace({
    runKind: "render",
    status: "running",
    userId: input.userId,
    characterId: input.grant.characterId,
    generationJobId: input.generationJobId,
    trace: input.grant.trace,
    briefExcerpt: input.grant.brief,
    provider: input.provider,
    model: input.model,
  });
}

export async function finishDirectorSprintDecisionTrace(input: {
  traceId: string | null;
  grant: DirectorSprintStageGrant;
  status: "succeeded" | "failed";
  assetId?: string | null;
  errorMessage?: string;
}) {
  await updateDirectorDecisionTrace(input.traceId, {
    status: input.status,
    outcome: input.status === "succeeded" ? {
      sprintTestId: input.grant.testId,
      variantId: input.grant.variantId,
      stage: input.grant.stage,
      principle: input.grant.traceVariant.principle,
      outputAssetId: input.assetId ?? null,
    } : undefined,
    errorMessage: input.errorMessage,
  });
}

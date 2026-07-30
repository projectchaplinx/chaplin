import type { PipelineStageId } from "@/lib/pipeline-config";

export const DIRECTOR_EVALUATION_VERSION = "film-grade-2026.07.30-a";

export type DirectorEvaluationAxis =
  | "instruction"
  | "continuity"
  | "aesthetic";

export type DirectorEvaluationDimensionId =
  | "story_change"
  | "objective_tactic"
  | "cinematic_language"
  | "prompt_adherence"
  | "period_accuracy"
  | "audio_source"
  | "spatial_geography"
  | "temporal_progression"
  | "identity_wardrobe"
  | "prop_state"
  | "screen_direction"
  | "audio_continuity"
  | "image_quality"
  | "editing_fluency"
  | "camera_appeal"
  | "performance_believability"
  | "sound_quality";

export type DirectorEvaluationScore = 1 | 2 | 3 | 4 | 5;
export type DirectorEvaluationScores = Partial<Record<DirectorEvaluationDimensionId, DirectorEvaluationScore>>;

export type DirectorEvaluationDimension = {
  id: DirectorEvaluationDimensionId;
  axis: DirectorEvaluationAxis;
  label: string;
  question: string;
  hardGate: boolean;
  stages: PipelineStageId[];
};

const ALL_STAGES: PipelineStageId[] = ["writing", "voice", "sfx", "theme", "image", "video"];

export const DIRECTOR_EVALUATION_DIMENSIONS: DirectorEvaluationDimension[] = [
  { id: "story_change", axis: "instruction", label: "Story change", question: "Does the output create a visible change, choice, consequence, or new pressure?", hardGate: false, stages: ["writing", "video"] },
  { id: "objective_tactic", axis: "instruction", label: "Objective & tactic", question: "Are the objective and changed tactic legible without explanation?", hardGate: false, stages: ["writing", "video"] },
  { id: "cinematic_language", axis: "instruction", label: "Cinematic language", question: "Does shot scale, angle, movement, composition, focus, light, and color serve the intended beat?", hardGate: false, stages: ["writing", "image", "video"] },
  { id: "prompt_adherence", axis: "instruction", label: "Prompt adherence", question: "Are the requested subjects, actions, relationships, quantities, and constraints actually present?", hardGate: true, stages: ALL_STAGES },
  { id: "period_accuracy", axis: "instruction", label: "Period accuracy", question: "Do place, date, role, materials, clothing, objects, transport, and technology avoid unsupported invention?", hardGate: true, stages: ["writing", "image", "video"] },
  { id: "audio_source", axis: "instruction", label: "Audio source", question: "Can every important diegetic sound be assigned to a visible or established off-screen source?", hardGate: true, stages: ["writing", "voice", "sfx", "theme", "video"] },
  { id: "spatial_geography", axis: "continuity", label: "Spatial geography", question: "Can the viewer track subjects, obstacles, exits, eyelines, and changing positions?", hardGate: true, stages: ["writing", "image", "video"] },
  { id: "temporal_progression", axis: "continuity", label: "Temporal progression", question: "Do actions, states, light, weather, damage, and scene time progress coherently?", hardGate: true, stages: ["writing", "video"] },
  { id: "identity_wardrobe", axis: "continuity", label: "Identity & wardrobe", question: "Are face, body, age, hair, wardrobe, and distinguishing marks stable when they should be?", hardGate: true, stages: ["image", "video"] },
  { id: "prop_state", axis: "continuity", label: "Prop state", question: "Do object count, ownership, hand, orientation, condition, and location remain causally consistent?", hardGate: true, stages: ["writing", "image", "video"] },
  { id: "screen_direction", axis: "continuity", label: "Screen direction", question: "Are travel direction, axis changes, entrances, exits, and eyelines intentional and readable?", hardGate: true, stages: ["writing", "video"] },
  { id: "audio_continuity", axis: "continuity", label: "Audio continuity", question: "Are voice, ambience, perspective, room tone, bridges, and silence coherent across the cut?", hardGate: true, stages: ["voice", "sfx", "theme", "video"] },
  { id: "image_quality", axis: "aesthetic", label: "Image quality", question: "Are anatomy, detail, exposure, texture, motion rendering, and artifact control production-usable?", hardGate: false, stages: ["image", "video"] },
  { id: "editing_fluency", axis: "aesthetic", label: "Editing fluency", question: "Do cuts answer or redirect force, movement, eyeline, sound, or story information?", hardGate: false, stages: ["writing", "video"] },
  { id: "camera_appeal", axis: "aesthetic", label: "Camera-work appeal", question: "Does camera behavior feel motivated, precise, dynamic when needed, and restrained when not?", hardGate: false, stages: ["writing", "image", "video"] },
  { id: "performance_believability", axis: "aesthetic", label: "Performance", question: "Do emotion, physical effort, reaction, timing, voice, and action feel intentional and believable?", hardGate: false, stages: ["writing", "voice", "video"] },
  { id: "sound_quality", axis: "aesthetic", label: "Sound quality", question: "Is audio intelligible, clean, spatially credible, dynamically shaped, and free from distracting artifacts?", hardGate: false, stages: ["voice", "sfx", "theme", "video"] },
];

export type DirectorEvaluationSummary = {
  score: number | null;
  scoredDimensions: number;
  applicableDimensions: number;
  axisScores: Record<DirectorEvaluationAxis, number | null>;
  gateStatus: "pass" | "fail" | "incomplete";
  gateFailures: DirectorEvaluationDimensionId[];
  missingRequired: DirectorEvaluationDimensionId[];
};

export type DirectorComparison = {
  ready: boolean;
  promotable: boolean;
  baselineScore: number | null;
  candidateScore: number | null;
  delta: number | null;
  targetDeltas: Array<{ id: DirectorEvaluationDimensionId; baseline: number; candidate: number; delta: number }>;
  blockers: string[];
};

export type DirectorEvaluationRecord = {
  id: string;
  decisionTraceId: string | null;
  experimentResultId: string | null;
  generationJobId: string | null;
  pipelineRunId: string | null;
  outputAssetId: string | null;
  stage: PipelineStageId;
  rubricVersion: string;
  evaluatorKind: "human" | "automatic";
  status: "draft" | "reviewed" | "rejected";
  scores: DirectorEvaluationScores;
  evidence: Partial<Record<DirectorEvaluationDimensionId, string>>;
  compositeScore: number | null;
  axisScores: Record<DirectorEvaluationAxis, number | null>;
  gateStatus: "pass" | "fail" | "incomplete";
  gateFailures: DirectorEvaluationDimensionId[];
  reviewerId: string | null;
  reviewerNotes: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

export type DirectorEvaluationDiagnostics = {
  total: number;
  reviewed: number;
  passing: number;
  failing: number;
  averageScore: number | null;
  dimensionAverages: Array<{ id: DirectorEvaluationDimensionId; label: string; score: number; samples: number }>;
};

export function dimensionsForStage(stage: PipelineStageId) {
  return DIRECTOR_EVALUATION_DIMENSIONS.filter((dimension) => dimension.stages.includes(stage));
}

export function defaultTargetDimensions(stage: PipelineStageId): DirectorEvaluationDimensionId[] {
  const preferred: Record<PipelineStageId, DirectorEvaluationDimensionId[]> = {
    writing: ["story_change", "objective_tactic", "cinematic_language", "prompt_adherence", "spatial_geography", "temporal_progression"],
    voice: ["prompt_adherence", "audio_continuity", "performance_believability", "sound_quality"],
    sfx: ["prompt_adherence", "audio_source", "audio_continuity", "sound_quality"],
    theme: ["prompt_adherence", "audio_continuity", "sound_quality"],
    image: ["cinematic_language", "prompt_adherence", "period_accuracy", "identity_wardrobe", "image_quality", "camera_appeal"],
    video: ["story_change", "cinematic_language", "prompt_adherence", "spatial_geography", "temporal_progression", "identity_wardrobe", "editing_fluency", "performance_believability"],
  };
  return preferred[stage];
}

export function normalizeDirectorScores(value: unknown): DirectorEvaluationScores {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set(DIRECTOR_EVALUATION_DIMENSIONS.map((dimension) => dimension.id));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([id, score]) => allowed.has(id as DirectorEvaluationDimensionId) && Number.isInteger(score) && Number(score) >= 1 && Number(score) <= 5)
      .map(([id, score]) => [id, Number(score) as DirectorEvaluationScore]),
  );
}

function percent(scores: number[]) {
  return scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length / 5) * 1000) / 10 : null;
}

export function summarizeDirectorEvaluation(
  stage: PipelineStageId,
  scores: DirectorEvaluationScores,
): DirectorEvaluationSummary {
  const dimensions = dimensionsForStage(stage);
  const scored = dimensions.filter((dimension) => scores[dimension.id] != null);
  const gates = dimensions.filter((dimension) => dimension.hardGate);
  const missingRequired = gates.filter((dimension) => scores[dimension.id] == null).map((dimension) => dimension.id);
  const gateFailures = gates.filter((dimension) => (scores[dimension.id] ?? 5) < 3).map((dimension) => dimension.id);
  const axisScores = Object.fromEntries(
    (["instruction", "continuity", "aesthetic"] as const).map((axis) => [
      axis,
      percent(scored.filter((dimension) => dimension.axis === axis).map((dimension) => scores[dimension.id]!)),
    ]),
  ) as Record<DirectorEvaluationAxis, number | null>;
  return {
    score: percent(scored.map((dimension) => scores[dimension.id]!)),
    scoredDimensions: scored.length,
    applicableDimensions: dimensions.length,
    axisScores,
    gateStatus: missingRequired.length ? "incomplete" : gateFailures.length ? "fail" : "pass",
    gateFailures,
    missingRequired,
  };
}

export function compareDirectorEvaluations(input: {
  stage: PipelineStageId;
  baseline: DirectorEvaluationScores;
  candidate: DirectorEvaluationScores;
  targetDimensions: DirectorEvaluationDimensionId[];
  minimumImprovement?: number;
  maxGateRegression?: number;
  humanWinnerIsCandidate?: boolean;
}): DirectorComparison {
  const baselineSummary = summarizeDirectorEvaluation(input.stage, input.baseline);
  const candidateSummary = summarizeDirectorEvaluation(input.stage, input.candidate);
  const applicable = new Set(dimensionsForStage(input.stage).map((dimension) => dimension.id));
  const targets = input.targetDimensions.filter((id) => applicable.has(id));
  const targetDeltas = targets.flatMap((id) => {
    const baseline = input.baseline[id];
    const candidate = input.candidate[id];
    return baseline && candidate ? [{ id, baseline, candidate, delta: candidate - baseline }] : [];
  });
  const blockers: string[] = [];
  if (baselineSummary.gateStatus !== "pass") blockers.push("The control needs a complete passing hard-gate evaluation.");
  if (candidateSummary.gateStatus !== "pass") blockers.push("The candidate needs a complete passing hard-gate evaluation.");
  if (targetDeltas.length !== targets.length) blockers.push("Score every declared target dimension for both variants.");
  if (targetDeltas.length && !targetDeltas.some((target) => target.delta > 0)) {
    blockers.push("The candidate must improve at least one declared target dimension.");
  }
  if (targetDeltas.some((target) => target.delta < 0)) {
    blockers.push("A declared target dimension regressed.");
  }
  const delta = baselineSummary.score != null && candidateSummary.score != null
    ? Math.round((candidateSummary.score - baselineSummary.score) * 10) / 10
    : null;
  if (delta == null || delta < (input.minimumImprovement ?? 5)) {
    blockers.push(`The candidate must improve the composite score by at least ${input.minimumImprovement ?? 5} points.`);
  }
  const dimensions = dimensionsForStage(input.stage);
  const gateRegression = dimensions.some((dimension) => {
    if (!dimension.hardGate) return false;
    const before = input.baseline[dimension.id];
    const after = input.candidate[dimension.id];
    return before != null && after != null && before - after > (input.maxGateRegression ?? 0);
  });
  if (gateRegression) blockers.push("A hard-gate dimension regressed beyond the allowed tolerance.");
  if (!input.humanWinnerIsCandidate) blockers.push("A human reviewer must explicitly prefer this candidate.");
  return {
    ready: baselineSummary.scoredDimensions > 0 && candidateSummary.scoredDimensions > 0,
    promotable: blockers.length === 0,
    baselineScore: baselineSummary.score,
    candidateScore: candidateSummary.score,
    delta,
    targetDeltas,
    blockers,
  };
}

export function buildDirectorEvaluationDiagnostics(
  evaluations: DirectorEvaluationRecord[],
): DirectorEvaluationDiagnostics {
  const reviewed = evaluations.filter((evaluation) => evaluation.status === "reviewed");
  const aggregate = new Map<DirectorEvaluationDimensionId, number[]>();
  for (const evaluation of reviewed) {
    for (const [id, score] of Object.entries(evaluation.scores)) {
      const key = id as DirectorEvaluationDimensionId;
      aggregate.set(key, [...(aggregate.get(key) ?? []), Number(score)]);
    }
  }
  const composites = reviewed
    .map((evaluation) => evaluation.compositeScore)
    .filter((score): score is number => score != null);
  return {
    total: evaluations.length,
    reviewed: reviewed.length,
    passing: reviewed.filter((evaluation) => evaluation.gateStatus === "pass").length,
    failing: reviewed.filter((evaluation) => evaluation.gateStatus === "fail").length,
    averageScore: composites.length
      ? Math.round((composites.reduce((sum, score) => sum + score, 0) / composites.length) * 10) / 10
      : null,
    dimensionAverages: DIRECTOR_EVALUATION_DIMENSIONS.flatMap((dimension) => {
      const values = aggregate.get(dimension.id) ?? [];
      return values.length ? [{
        id: dimension.id,
        label: dimension.label,
        score: Math.round((values.reduce((sum, score) => sum + score, 0) / values.length) * 100) / 100,
        samples: values.length,
      }] : [];
    }).sort((left, right) => left.score - right.score || right.samples - left.samples),
  };
}

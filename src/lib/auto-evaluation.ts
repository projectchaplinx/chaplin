import {
  normalizeDirectorScores,
  summarizeDirectorEvaluation,
  type DirectorEvaluationDimensionId,
  type DirectorEvaluationScore,
  type DirectorEvaluationScores,
  type DirectorEvaluationSummary,
} from "@/lib/director-evaluation";
import type { PipelineStageId } from "@/lib/pipeline-config";

/**
 * The one lawful way to turn a machine measurement into a Director evaluation.
 *
 * Three writers used three scales — 1-5 integers, 0-100 floats, and 0-1
 * fractions — in the same table. The read path normalizes to the canonical
 * 1-5 integer contract, so every non-canonical row silently read back as an
 * empty scorecard with a bare "fail" and no listed failures. Every automatic
 * scorer now converts through this module before anything is persisted.
 */

/** Maps a 0-100 measurement onto the canonical 1-5 integer scale. */
export function scoreFromPercent(value: number): DirectorEvaluationScore {
  if (!Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(1, Math.round(value / 20))) as DirectorEvaluationScore;
}

export type AutoEvaluationInput = Partial<Record<DirectorEvaluationDimensionId, number>>;

export type AutoEvaluation = {
  scores: DirectorEvaluationScores;
  summary: DirectorEvaluationSummary;
};

/**
 * Converts per-dimension 0-100 measurements into canonical scores plus the
 * derived composite, axis scores, and hard-gate verdicts. The result is safe
 * to persist and will round-trip through `normalizeDirectorScores` unchanged.
 */
export function canonicalAutoEvaluation(
  stage: PipelineStageId,
  percentScores: AutoEvaluationInput,
): AutoEvaluation {
  const scores = normalizeDirectorScores(
    Object.fromEntries(
      Object.entries(percentScores)
        .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
        .map(([id, value]) => [id, scoreFromPercent(value as number)]),
    ),
  );
  return { scores, summary: summarizeDirectorEvaluation(stage, scores) };
}

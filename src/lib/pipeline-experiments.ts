import type { PipelineStageConfig, PipelineStageId } from "@/lib/pipeline-config";
import type {
  DirectorComparison,
  DirectorEvaluationDimensionId,
  DirectorEvaluationRecord,
} from "@/lib/director-evaluation";

export type PipelineExperimentVariant = {
  id: string;
  name: string;
  hypothesis: string;
  config: PipelineStageConfig;
};

export type PipelineExperimentResult = {
  id: string;
  experimentId: string;
  variantId: string;
  generationJobId: string | null;
  outputAssetId: string | null;
  outputUrl: string | null;
  outputText: string | null;
  status: "running" | "succeeded" | "failed";
  provider: string;
  model: string;
  costUsd: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  score: number | null;
  notes: string | null;
  evaluation: DirectorEvaluationRecord | null;
  createdAt: string;
  completedAt: string | null;
};

export type PipelineExperiment = {
  id: string;
  name: string;
  stage: PipelineStageId;
  status: "draft" | "testing" | "review" | "promoted" | "archived";
  inputPrompt: string;
  characterId: string | null;
  referenceImageUrl: string | null;
  baselineRevision: number;
  variants: PipelineExperimentVariant[];
  winnerVariantId: string | null;
  targetDimensions: DirectorEvaluationDimensionId[];
  minimumImprovement: number;
  maxGateRegression: number;
  promotionSnapshot: Record<string, unknown>;
  comparison: DirectorComparison | null;
  promotedRevision: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  promotedAt: string | null;
  results: PipelineExperimentResult[];
};

export function createExperimentVariants(stage: PipelineStageConfig): PipelineExperimentVariant[] {
  return [
    {
      id: "control",
      name: "Control",
      hypothesis: "The current production configuration is the benchmark.",
      config: structuredClone(stage),
    },
    {
      id: "challenger",
      name: "Challenger",
      hypothesis: "A focused prompt or provider-setting change will improve the result.",
      config: structuredClone(stage),
    },
  ];
}

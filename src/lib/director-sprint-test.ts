import type { DirectorCharacterAxis, DirectorPrincipleAssessment } from "@/lib/director-sprint-one";
import type { PipelineStageConfig } from "@/lib/pipeline-config";

export const DIRECTOR_SPRINT_TEST_RUBRIC = "sprint-1-character-shot-2026.08.01";
export const DIRECTOR_SPRINT_TEST_VARIANT_IDS = [
  "control",
  "challenger-1",
  "challenger-2",
  "challenger-3",
  "challenger-4",
  "challenger-5",
] as const;

export type DirectorSprintTestVariantId = typeof DIRECTOR_SPRINT_TEST_VARIANT_IDS[number];

export type DirectorSprintTestVariant = {
  id: DirectorSprintTestVariantId;
  name: string;
  assessmentId: string | null;
  shortlistRank: number | null;
  characterAxis: DirectorCharacterAxis | "control";
  principle: string | null;
  imagePrompt: string;
  videoPrompt: string;
};

export type DirectorSprintTestResult = {
  id: string;
  variantId: DirectorSprintTestVariantId;
  stage: "image" | "video";
  status: "running" | "succeeded" | "failed";
  generationJobId: string | null;
  assetId: string | null;
  url: string | null;
  provider: string;
  model: string;
  costUsd: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type DirectorSprintShotScore = {
  id: string;
  variantId: DirectorSprintTestVariantId;
  videoResultId: string;
  evaluationId: string;
  identityContinuity: number;
  performance: number;
  shotReadability: number;
  compositeScore: number;
  identityGate: "pass" | "fail";
  reviewNotes: string;
  reviewedBy: string;
  reviewedAt: string;
};

export type DirectorSprintShotTest = {
  id: string;
  sprintRunId: string;
  sprintKey: string;
  characterId: string;
  characterName: string;
  characterImageUrl: string | null;
  brief: string;
  invariantHash: string;
  baselineRevision: number;
  imageExperimentId: string;
  videoExperimentId: string;
  variants: DirectorSprintTestVariant[];
  results: DirectorSprintTestResult[];
  scores: DirectorSprintShotScore[];
  status: "initialized" | "decided" | "shipped" | "failed";
  humanPreferenceVariantId: DirectorSprintTestVariantId | null;
  winnerVariantId: DirectorSprintTestVariantId | null;
  outcome: "challenger-won" | "control-held" | null;
  outcomeSummary: string;
  shippedAssetId: string | null;
  shippedEvaluationId: string | null;
  shippedUrl: string | null;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
  shippedAt: string | null;
};

export type DirectorSprintCharacterOption = {
  id: string;
  name: string;
  archetype: string;
  imageUrl: string | null;
};

export type DirectorSprintTestBundle = {
  storageReady: boolean;
  playbackVerified: number;
  playbackRejected: number;
  playbackPending: number;
  characters: DirectorSprintCharacterOption[];
  test: DirectorSprintShotTest | null;
};

export type DirectorSprintStageGrant = {
  testId: string;
  variantId: DirectorSprintTestVariantId;
  stage: "image" | "video";
  characterId: string;
  brief: string;
  prompt: string;
  experimentId: string;
  stageConfig: PipelineStageConfig;
  referenceImageUrl: string | null;
  traceVariant: DirectorSprintTestVariant;
};

function normalizedBrief(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function defaultDirectorSprintBrief(characterName: string) {
  return `${characterName} waits alone on a quiet station platform. A distant sound makes them stop mid-step, choose not to turn, and tighten one hand around a folded ticket. One continuous five-second medium shot with a clear beginning, reaction, and landing.`;
}

export function buildDirectorSprintTestVariants(
  brief: string,
  shortlist: Array<Pick<DirectorPrincipleAssessment, "id" | "shortlistRank" | "characterAxis" | "principleText">>,
): DirectorSprintTestVariant[] {
  const cleanBrief = normalizedBrief(brief);
  const ranked = [...shortlist].sort((left, right) => (left.shortlistRank ?? 99) - (right.shortlistRank ?? 99));
  if (ranked.length !== 5 || ranked.some((item, index) => item.shortlistRank !== index + 1)) {
    throw new Error("Sprint 1 needs the exact ranked top five before a controlled test can be built.");
  }
  const imageBase = [
    "Create the exact first frame for this original five-second character shot.",
    `FIXED BRIEF: ${cleanBrief}`,
    "Keep the marketplace actor's canonical face, age, body, hair, wardrobe, and distinguishing marks unchanged. Show only the start state of the action. No text, logos, split screen, or montage.",
  ].join("\n");
  const videoBase = [
    "Animate one continuous five-second character shot from the supplied exact first frame.",
    `FIXED BRIEF: ${cleanBrief}`,
    "Keep the same face, age, body, hair, wardrobe, props, and environment from first frame to last. Perform one readable action and land cleanly. No cut, montage, subtitle, logo, or music.",
  ].join("\n");
  const control: DirectorSprintTestVariant = {
    id: "control",
    name: "Control · current config",
    assessmentId: null,
    shortlistRank: null,
    characterAxis: "control",
    principle: null,
    imagePrompt: `${imageBase}\nTEST VARIABLE: none. Use the current production configuration without an added research principle.`,
    videoPrompt: `${videoBase}\nTEST VARIABLE: none. Use the current production configuration without an added research principle.`,
  };
  return [control, ...ranked.map((item, index): DirectorSprintTestVariant => {
    const id = `challenger-${index + 1}` as DirectorSprintTestVariantId;
    const variable = `TEST VARIABLE — apply only this candidate principle: ${item.principleText}`;
    return {
      id,
      name: `Challenger ${index + 1} · ${item.characterAxis}`,
      assessmentId: item.id,
      shortlistRank: item.shortlistRank,
      characterAxis: item.characterAxis,
      principle: item.principleText,
      imagePrompt: `${imageBase}\n${variable}`,
      videoPrompt: `${videoBase}\n${variable}`,
    };
  })];
}

export function cloneSprintPipelineVariants(
  variants: DirectorSprintTestVariant[],
  config: PipelineStageConfig,
) {
  return variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    hypothesis: variant.principle ?? "Current production configuration is the control.",
    config: structuredClone(config),
  }));
}

export function directorSprintTestProgress(test: DirectorSprintShotTest | null) {
  if (!test) return { images: 0, videos: 0, scores: 0, running: 0, failed: 0 };
  return {
    images: test.results.filter((result) => result.stage === "image" && result.status === "succeeded").length,
    videos: test.results.filter((result) => result.stage === "video" && result.status === "succeeded").length,
    scores: test.scores.length,
    running: test.results.filter((result) => result.status === "running").length,
    failed: test.results.filter((result) => result.status === "failed").length,
  };
}

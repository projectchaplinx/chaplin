import type { DirectorBrainTrace } from "@/lib/director-brain";

export type DirectorDecisionRunKind = "writing" | "render";
export type DirectorDecisionStatus = "selected" | "running" | "succeeded" | "failed" | "cancelled";

export type DirectorDecisionTraceRecord = {
  id: string;
  runKind: DirectorDecisionRunKind;
  status: DirectorDecisionStatus;
  userId: string | null;
  characterId: string | null;
  storyId: string | null;
  generationJobId: string | null;
  pipelineRunId: string | null;
  brainVersion: string;
  format: string;
  durationSeconds: number | null;
  sceneCount: number;
  briefExcerpt: string;
  trace: DirectorBrainTrace;
  provider: string;
  model: string;
  outcome: Record<string, unknown>;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type DirectorDecisionDiagnostics = {
  total: number;
  writingRuns: number;
  renderRuns: number;
  succeeded: number;
  failed: number;
  active: number;
  periodResolved: number;
  withApprovedResearch: number;
  patternUsage: Array<{ id: string; count: number }>;
};

export function buildDirectorDecisionDiagnostics(
  decisions: DirectorDecisionTraceRecord[],
): DirectorDecisionDiagnostics {
  const usage = new Map<string, number>();
  for (const decision of decisions) {
    for (const id of decision.trace.patternIds) usage.set(id, (usage.get(id) ?? 0) + 1);
  }
  return {
    total: decisions.length,
    writingRuns: decisions.filter((item) => item.runKind === "writing").length,
    renderRuns: decisions.filter((item) => item.runKind === "render").length,
    succeeded: decisions.filter((item) => item.status === "succeeded").length,
    failed: decisions.filter((item) => item.status === "failed").length,
    active: decisions.filter((item) => item.status === "selected" || item.status === "running").length,
    periodResolved: decisions.filter((item) => Boolean(item.trace.periodProfileId)).length,
    withApprovedResearch: decisions.filter((item) => item.trace.approvedStudies.length > 0).length,
    patternUsage: [...usage.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id))
      .slice(0, 12),
  };
}

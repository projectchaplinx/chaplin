import type { DirectorSceneStudy } from "@/lib/director-research";
import type { DirectorTimedMediaAnalysis } from "@/lib/director-timed-media";
import type { DirectorEvidenceManifest } from "@/lib/director-evidence-manifest";

export type DirectorReviewQueueItem = {
  id: string;
  kind: "playback" | "evidence" | "study";
  priorityScore: number;
  reason: string;
  coverageGaps: string[];
  study: DirectorSceneStudy | null;
  analysis: DirectorTimedMediaAnalysis | null;
  manifest: DirectorEvidenceManifest | null;
  relatedApproved: DirectorSceneStudy[];
};

function normalized(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function itemTags(study: DirectorSceneStudy | null, analysis: DirectorTimedMediaAnalysis | null) {
  return normalized([
    ...(study?.tags ?? []),
    study?.periodLabel ?? "",
    study?.region ?? "",
    analysis?.workTitle ?? "",
    ...(analysis?.observations.flatMap((observation) => [observation.craft, observation.narrativeJob, observation.soundFunction]) ?? []),
  ].flatMap((value) => value.split(/[^a-z0-9-]+/i)));
}

export function buildDirectorReviewQueue(
  studies: DirectorSceneStudy[],
  analyses: DirectorTimedMediaAnalysis[],
  manifests: DirectorEvidenceManifest[] = [],
): DirectorReviewQueueItem[] {
  const approved = studies.filter((study) => study.status === "approved");
  const approvedCoverage = new Map<string, number>();
  for (const study of approved) {
    for (const tag of normalized(study.tags)) approvedCoverage.set(tag, (approvedCoverage.get(tag) ?? 0) + 1);
  }
  const analysisByStudy = new Map(analyses.filter((item) => item.studyId).map((item) => [item.studyId as string, item]));

  function details(study: DirectorSceneStudy | null, analysis: DirectorTimedMediaAnalysis | null) {
    const tags = itemTags(study, analysis);
    const coverageGaps = tags.filter((tag) => !approvedCoverage.has(tag)).slice(0, 6);
    const relatedApproved = approved
      .map((candidate) => ({
        candidate,
        overlap: normalized(candidate.tags).filter((tag) => tags.includes(tag)).length,
      }))
      .filter((entry) => entry.overlap > 0)
      .sort((left, right) => right.overlap - left.overlap || left.candidate.studyTitle.localeCompare(right.candidate.studyTitle))
      .slice(0, 3)
      .map((entry) => entry.candidate);
    return { coverageGaps, relatedApproved };
  }

  const playbackItems = analyses
    .filter((analysis) => analysis.playbackStatus === "required")
    .map((analysis) => {
      const study = analysis.studyId ? studies.find((candidate) => candidate.id === analysis.studyId) ?? null : null;
      const { coverageGaps, relatedApproved } = details(study, analysis);
      return {
        id: `playback:${analysis.id}`,
        kind: "playback" as const,
        priorityScore: 10_000 + (coverageGaps.length * 100) + analysis.observationCount,
        reason: "Direct playback is required before this evidence can advance.",
        coverageGaps,
        study,
        analysis,
        manifest: null,
        relatedApproved,
      };
    });

  const evidenceItems = manifests
    .filter((manifest) => manifest.status === "discovered" || manifest.status === "needs-review")
    .map((manifest) => {
      const tags = normalized([...manifest.tags, manifest.dateLabel, manifest.region].flatMap((value) => value.split(/[^a-z0-9-]+/i)));
      const coverageGaps = tags.filter((tag) => !approvedCoverage.has(tag)).slice(0, 6);
      const relatedApproved = approved
        .map((candidate) => ({ candidate, overlap: normalized(candidate.tags).filter((tag) => tags.includes(tag)).length }))
        .filter((entry) => entry.overlap > 0)
        .sort((left, right) => right.overlap - left.overlap || left.candidate.studyTitle.localeCompare(right.candidate.studyTitle))
        .slice(0, 3)
        .map((entry) => entry.candidate);
      const eligible = manifest.reuseStatus === "reusable" && !manifest.culturallySensitive;
      return {
        id: `evidence:${manifest.id}`,
        kind: "evidence" as const,
        priorityScore: 8_000 + (coverageGaps.length * 100) + (eligible ? 50 : 0),
        reason: eligible
          ? "Rights and context need human confirmation before this source record can support a study."
          : "This record needs an explicit rejection or contextual review; it cannot be promoted as reusable evidence.",
        coverageGaps,
        study: null,
        analysis: null,
        manifest,
        relatedApproved,
      };
    });

  const studyItems = studies
    .filter((study) => study.status === "draft" || study.status === "reviewed")
    .filter((study) => {
      const linked = analysisByStudy.get(study.id);
      return !linked || linked.playbackStatus === "verified";
    })
    .map((study) => {
      const analysis = analysisByStudy.get(study.id) ?? null;
      const { coverageGaps, relatedApproved } = details(study, analysis);
      const evidenceStrength = Math.min(study.observations.length, 8) * 5 + Math.min(study.candidatePrinciples.length, 8) * 3;
      return {
        id: `study:${study.id}`,
        kind: "study" as const,
        priorityScore: 1_000 + (coverageGaps.length * 100) + evidenceStrength + (study.status === "reviewed" ? 25 : 0),
        reason: coverageGaps.length
          ? `Review can close ${coverageGaps.length} approved-knowledge gap${coverageGaps.length === 1 ? "" : "s"}.`
          : "Review this against existing approved knowledge for redundancy or contradiction.",
        coverageGaps,
        study,
        analysis,
        manifest: null,
        relatedApproved,
      };
    });

  return [...playbackItems, ...evidenceItems, ...studyItems].sort((left, right) =>
    right.priorityScore - left.priorityScore || left.id.localeCompare(right.id));
}

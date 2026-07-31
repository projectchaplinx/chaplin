import type { DirectorSceneStudy } from "@/lib/director-research";
import type { DirectorTimedMediaAnalysis } from "@/lib/director-timed-media";
import type { DirectorEvidenceManifest } from "@/lib/director-evidence-manifest";

export type DirectorReviewQueueItem = {
  id: string;
  kind: "playback" | "evidence" | "study";
  lane: "playback" | "approvable-now" | "evidence" | "study";
  priorityScore: number;
  reason: string;
  coverageGaps: string[];
  quarantineReasons: string[];
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

function principlePolarity(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  const negative = /\b(?:never|not|avoid|without|forbid|reject)\b/.test(normalized);
  const positive = /\b(?:always|must|require|use|keep|show)\b/.test(normalized);
  const subject = normalized.replace(/\b(?:never|not|avoid|without|forbid|reject|always|must|require|use|keep|show)\b/g, " ").replace(/\s+/g, " ").trim();
  return { negative, positive, subject };
}

function explicitContradictions(candidatePrinciples: string[], approved: DirectorSceneStudy[]) {
  const approvedPrinciples = approved.flatMap((study) => study.candidatePrinciples.map((principle) => ({ study, ...principlePolarity(principle) })));
  return candidatePrinciples.flatMap((principle) => {
    const candidate = principlePolarity(principle);
    if (!candidate.subject || (!candidate.negative && !candidate.positive)) return [];
    const match = approvedPrinciples.find((known) => known.subject === candidate.subject
      && ((candidate.negative && known.positive) || (candidate.positive && known.negative)));
    return match ? [`Explicit principle conflict with approved study “${match.study.studyTitle}”.`] : [];
  });
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
  const manifestHashCounts = new Map<string, number>();
  for (const manifest of manifests) {
    if (manifest.contentHash) manifestHashCounts.set(manifest.contentHash, (manifestHashCounts.get(manifest.contentHash) ?? 0) + 1);
  }

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
        lane: "playback" as const,
        priorityScore: (coverageGaps.length * 10_000) + 3_000 + analysis.observationCount,
        reason: "Direct playback is required before this evidence can advance.",
        coverageGaps,
        quarantineReasons: [],
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
      const quarantineReasons = [
        ...(manifest.reuseStatus === "restricted" ? ["Restricted rights basis."] : []),
        ...(manifest.reuseStatus === "metadata-only" ? ["Metadata-only record; no reusable source asset."] : []),
        ...(manifest.culturallySensitive ? ["Culturally sensitive material requires contextual human review."] : []),
        ...(manifest.contentHash && (manifestHashCounts.get(manifest.contentHash) ?? 0) > 1 ? ["Duplicate content hash is already present in the evidence corpus."] : []),
      ];
      return {
        id: `evidence:${manifest.id}`,
        kind: "evidence" as const,
        lane: "evidence" as const,
        priorityScore: (coverageGaps.length * 10_000) + 2_000 + (eligible ? 50 : 0),
        reason: quarantineReasons.length
          ? "Quarantined for explicit human resolution; it remains preserved and cannot be promoted."
          : eligible
          ? "Rights and context need human confirmation before this source record can support a study."
          : "This record needs an explicit rejection or contextual review; it cannot be promoted as reusable evidence.",
        coverageGaps,
        quarantineReasons,
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
      const quarantineReasons = explicitContradictions(study.candidatePrinciples, approved);
      const evidenceStrength = Math.min(study.observations.length, 8) * 5 + Math.min(study.candidatePrinciples.length, 8) * 3;
      return {
        id: `study:${study.id}`,
        kind: "study" as const,
        lane: analysis ? "study" as const : "approvable-now" as const,
        priorityScore: (coverageGaps.length * 10_000) + (analysis ? 1_000 : 2_500) + evidenceStrength + (study.status === "reviewed" ? 25 : 0),
        reason: quarantineReasons.length
          ? "Quarantined because a candidate principle explicitly conflicts with approved knowledge."
          : coverageGaps.length
          ? `Review can close ${coverageGaps.length} approved-knowledge gap${coverageGaps.length === 1 ? "" : "s"}.`
          : "Review this against existing approved knowledge for redundancy or contradiction.",
        coverageGaps,
        quarantineReasons,
        study,
        analysis,
        manifest: null,
        relatedApproved,
      };
    });

  return [...playbackItems, ...evidenceItems, ...studyItems].sort((left, right) =>
    right.priorityScore - left.priorityScore || left.id.localeCompare(right.id));
}

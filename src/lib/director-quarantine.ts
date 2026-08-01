import type { DirectorEvidenceManifest } from "@/lib/director-evidence-manifest";
import type { DirectorSceneStudy } from "@/lib/director-research";

export type DirectorQuarantineAssessment = {
  id: string;
  entityKind: "evidence" | "study" | "timed-media";
  entityId: string;
  ruleKey: string;
  reason: string;
  evidence: Record<string, unknown>;
  createdAt: string;
};

function principlePolarity(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  const negative = /\b(?:never|not|avoid|without|forbid|reject)\b/.test(normalized);
  const positive = /\b(?:always|must|require|use|keep|show)\b/.test(normalized);
  const subject = normalized.replace(/\b(?:never|not|avoid|without|forbid|reject|always|must|require|use|keep|show)\b/g, " ").replace(/\s+/g, " ").trim();
  return { negative, positive, subject };
}

export function explicitPrincipleContradictions(
  candidatePrinciples: string[],
  approved: Array<Pick<DirectorSceneStudy, "id" | "studyTitle" | "candidatePrinciples">>,
) {
  const approvedPrinciples = approved.flatMap((study) => study.candidatePrinciples.map((principle) => ({ study, ...principlePolarity(principle) })));
  return candidatePrinciples.flatMap((principle) => {
    const candidate = principlePolarity(principle);
    if (!candidate.subject || (!candidate.negative && !candidate.positive)) return [];
    const match = approvedPrinciples.find((known) => known.subject === candidate.subject
      && ((candidate.negative && known.positive) || (candidate.positive && known.negative)));
    return match ? [{
      ruleKey: `approved-conflict:${match.study.id}`,
      reason: `Explicit principle conflict with approved study “${match.study.studyTitle}”.`,
      evidence: { candidate: principle, approvedStudyId: match.study.id },
    }] : [];
  });
}

export function evidenceQuarantineReasons(manifest: Pick<DirectorEvidenceManifest, "reuseStatus" | "culturallySensitive" | "contentHash">, duplicateCount = 1) {
  return [
    ...(manifest.reuseStatus === "restricted" ? [{ ruleKey: "restricted-rights", reason: "Restricted rights basis." }] : []),
    ...(manifest.reuseStatus === "metadata-only" ? [{ ruleKey: "metadata-only", reason: "Metadata-only record; no reusable source asset." }] : []),
    ...(manifest.culturallySensitive ? [{ ruleKey: "culturally-sensitive", reason: "Culturally sensitive material requires contextual human review." }] : []),
    ...(manifest.contentHash && duplicateCount > 1 ? [{ ruleKey: "duplicate-content-hash", reason: "Duplicate content hash is already present in the evidence corpus." }] : []),
  ];
}

export function timedMediaReviewPackageReasons(input: {
  playbackUrl: string;
  studyId: string | null;
  observationCount: number;
  principleCount: number;
  limitations: string;
  artifactPaths: Record<string, unknown>;
  audioAvailable: boolean;
}) {
  const missing = [
    ...(!/^https:\/\/tile[.]loc[.]gov\//i.test(input.playbackUrl) ? ["trusted playback URL"] : []),
    ...(!input.studyId ? ["linked study"] : []),
    ...(input.observationCount < 3 ? ["analytical observations"] : []),
    ...(input.principleCount < 2 ? ["candidate principles"] : []),
    ...(!input.limitations.trim() ? ["limitations"] : []),
    ...(typeof input.artifactPaths.contactSheet !== "string" || !input.artifactPaths.contactSheet ? ["contact sheet"] : []),
    ...(typeof input.artifactPaths.evidencePackage !== "string" || !input.artifactPaths.evidencePackage ? ["evidence package"] : []),
    ...(input.audioAvailable && (typeof input.artifactPaths.waveform !== "string" || !input.artifactPaths.waveform) ? ["waveform"] : []),
  ];
  return missing.length ? [{
    ruleKey: "incomplete-review-package",
    reason: `Human review package is incomplete: missing ${missing.join(", ")}.`,
    evidence: { missing },
  }] : [];
}

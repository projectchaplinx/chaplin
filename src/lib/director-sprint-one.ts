export const DIRECTOR_SPRINT_ONE_TRIAGE_KEY = "character-principles-2026-08-01";
export const DIRECTOR_SPRINT_ONE_REJECTED_RANK_KEY = "character-principles-2026-08-01-ranked";
export const DIRECTOR_SPRINT_ONE_AMENDMENT_WEIGHT_KEY = "character-principles-2026-08-01-amendment-1";
export const DIRECTOR_SPRINT_ONE_KEY = "character-principles-2026-08-01-amendment-1-final";
export const DIRECTOR_SPRINT_ONE_CANDIDATE_LIMIT = 40;
export const DIRECTOR_SPRINT_ONE_SHORTLIST_LIMIT = 5;

export const DIRECTOR_PRINCIPLE_LANES = ["discard", "park", "candidate"] as const;
export type DirectorPrincipleLane = typeof DIRECTOR_PRINCIPLE_LANES[number];

export const DIRECTOR_CHARACTER_AXES = ["identity", "performance", "framing", "blocking", "other"] as const;
export type DirectorCharacterAxis = typeof DIRECTOR_CHARACTER_AXES[number];

export type DirectorSourceStrength = "motion-verified" | "contact-sheet-only" | "document";
export type DirectorPrincipleConfidence = "low" | "medium" | "high";

export type DirectorCoverageFinding = {
  id: string;
  axis: DirectorCharacterAxis;
  title: string;
  finding: string;
  cause: string;
  nextMethod: string;
  evidence: Record<string, unknown>;
  createdAt: string;
};

export type DirectorPrincipleAssessment = {
  id: string;
  sprintRunId: string;
  sprintKey: string;
  studyId: string;
  timedMediaAnalysisId: string | null;
  playbackUrl: string | null;
  playbackStatus: "required" | "verified" | "rejected" | null;
  playbackStartSecond: number | null;
  playbackDurationSeconds: number | null;
  studyTitle: string;
  workTitle: string;
  sourceTitle: string;
  sourceUrl: string | null;
  principleIndex: number;
  principleText: string;
  principleHash: string;
  lane: DirectorPrincipleLane;
  characterAxis: DirectorCharacterAxis;
  agreementKey: string;
  confidence: DirectorPrincipleConfidence;
  rationale: string;
  rejectionReason: string;
  sourceStrength: DirectorSourceStrength;
  characterAxisScore: number;
  crossStudyAgreement: number;
  productionReach: number;
  rankScore: number;
  candidateRank: number | null;
  shortlistRank: number | null;
  model: string;
  responseId: string | null;
  createdAt: string;
  playbackReview: {
    verdict: "verified" | "rejected";
    reviewNotes: string;
    reviewedBy: string;
    reviewedAt: string;
  } | null;
};

export type ProposedDirectorPrincipleAssessment = Omit<DirectorPrincipleAssessment,
  "id" | "sprintRunId" | "sprintKey" | "playbackUrl" | "playbackReview" | "rankScore" | "candidateRank" | "shortlistRank" | "createdAt"
>;

export function scoreDirectorPrinciple(input: Pick<ProposedDirectorPrincipleAssessment,
  "characterAxisScore" | "crossStudyAgreement" | "productionReach"
>) {
  return input.characterAxisScore * 10
    + Math.min(3, input.crossStudyAgreement) * 5
    + input.productionReach * 6;
}

export function finalizeDirectorSprintTriage(proposed: ProposedDirectorPrincipleAssessment[]) {
  const ranked = proposed.map((item) => ({ ...item, rankScore: scoreDirectorPrinciple(item) }));
  const candidates = ranked
    .filter((item) => item.lane === "candidate")
    .sort((left, right) => right.rankScore - left.rankScore || left.principleText.localeCompare(right.principleText));
  const retained = new Set(candidates.slice(0, DIRECTOR_SPRINT_ONE_CANDIDATE_LIMIT).map((item) => item.principleHash));
  const retainedRanked = candidates.filter((item) => retained.has(item.principleHash));
  const candidateRanks = new Map(retainedRanked.map((item, index) => [item.principleHash, index + 1]));
  const eligible = retainedRanked.filter((item) => item.timedMediaAnalysisId);
  const byAxis = new Map<DirectorCharacterAxis, typeof eligible>();
  for (const item of eligible) byAxis.set(item.characterAxis, [...(byAxis.get(item.characterAxis) ?? []), item]);
  const axisLeaders = [...byAxis.entries()]
    .filter(([axis]) => axis !== "other")
    .map(([, items]) => items[0]!)
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, 3);
  const shortlist = [...axisLeaders];
  const axisCounts = new Map<DirectorCharacterAxis, number>();
  const hypothesisKeys = new Set<string>();
  for (const item of shortlist) {
    axisCounts.set(item.characterAxis, (axisCounts.get(item.characterAxis) ?? 0) + 1);
    hypothesisKeys.add(`${item.characterAxis}:${item.agreementKey}`);
  }
  for (const item of eligible) {
    if (shortlist.length >= DIRECTOR_SPRINT_ONE_SHORTLIST_LIMIT) break;
    if (shortlist.some((selected) => selected.principleHash === item.principleHash)) continue;
    if ((axisCounts.get(item.characterAxis) ?? 0) >= 2) continue;
    const hypothesisKey = `${item.characterAxis}:${item.agreementKey}`;
    if (hypothesisKeys.has(hypothesisKey)) continue;
    shortlist.push(item);
    axisCounts.set(item.characterAxis, (axisCounts.get(item.characterAxis) ?? 0) + 1);
    hypothesisKeys.add(hypothesisKey);
  }
  shortlist.sort((left, right) => right.rankScore - left.rankScore);
  const shortlistRanks = new Map(shortlist.map((item, index) => [item.principleHash, index + 1]));
  return ranked.map((item) => {
    const lane = item.lane === "candidate" && !retained.has(item.principleHash) ? "park" as const : item.lane;
    const thisCandidateRank = lane === "candidate" ? candidateRanks.get(item.principleHash) ?? null : null;
    const thisShortlistRank = lane === "candidate" ? shortlistRanks.get(item.principleHash) ?? null : null;
    return {
      ...item,
      lane,
      rationale: item.lane === "candidate" && lane === "park"
        ? `${item.rationale} Parked because Sprint 1 keeps only the strongest ${DIRECTOR_SPRINT_ONE_CANDIDATE_LIMIT} character-serving principles.`
        : item.rationale,
      candidateRank: thisCandidateRank,
      shortlistRank: thisShortlistRank,
    };
  }).sort((left, right) => {
    if (left.candidateRank != null && right.candidateRank != null) return left.candidateRank - right.candidateRank;
    if (left.candidateRank != null) return -1;
    if (right.candidateRank != null) return 1;
    return right.rankScore - left.rankScore || left.principleText.localeCompare(right.principleText);
  });
}

export function directorSprintOneProgress(assessments: DirectorPrincipleAssessment[]) {
  const shortlist = assessments.filter((item) => item.shortlistRank != null);
  return {
    total: assessments.length,
    discard: assessments.filter((item) => item.lane === "discard").length,
    park: assessments.filter((item) => item.lane === "park").length,
    candidate: assessments.filter((item) => item.lane === "candidate").length,
    shortlist: shortlist.length,
    playbackVerified: shortlist.filter((item) => item.playbackReview?.verdict === "verified").length,
    playbackRejected: shortlist.filter((item) => item.playbackReview?.verdict === "rejected").length,
    playbackPending: shortlist.filter((item) => !item.playbackReview).length,
  };
}

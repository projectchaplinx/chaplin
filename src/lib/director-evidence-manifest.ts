export const DIRECTOR_EVIDENCE_KINDS = ["collection-item", "provenance-record"] as const;
export const DIRECTOR_EVIDENCE_STATUSES = ["discovered", "needs-review", "eligible", "rejected", "archived"] as const;
export const DIRECTOR_EVIDENCE_REUSE = ["unknown", "metadata-only", "reusable", "restricted"] as const;

export type DirectorEvidenceKind = typeof DIRECTOR_EVIDENCE_KINDS[number];
export type DirectorEvidenceStatus = typeof DIRECTOR_EVIDENCE_STATUSES[number];
export type DirectorEvidenceReuse = typeof DIRECTOR_EVIDENCE_REUSE[number];

export type DirectorEvidenceManifest = {
  id: string;
  sourceId: string;
  researchJobId: string | null;
  kind: DirectorEvidenceKind;
  provider: string;
  externalId: string;
  canonicalUrl: string;
  recordLocator: string;
  title: string;
  institution: string;
  dateLabel: string;
  region: string;
  tags: string[];
  facets: Record<string, unknown>;
  rightsUri: string | null;
  rightsLabel: string;
  reuseStatus: DirectorEvidenceReuse;
  culturallySensitive: boolean;
  status: DirectorEvidenceStatus;
  reviewNotes: string;
  updatedAt: string;
};

export type NormalizedEvidenceInput = Omit<DirectorEvidenceManifest, "id" | "sourceId" | "researchJobId" | "status" | "reviewNotes" | "updatedAt"> & {
  provenance?: Record<string, unknown>;
  rightsNotes?: string;
  periodStart?: number | null;
  periodEnd?: number | null;
  sourceUpdatedAt?: string | null;
};

export function evidenceNeedsReview(input: Pick<NormalizedEvidenceInput, "reuseStatus" | "culturallySensitive">): DirectorEvidenceStatus {
  return input.reuseStatus === "restricted" || input.culturallySensitive ? "needs-review" : "discovered";
}

export function canMarkEvidenceEligible(reuse: DirectorEvidenceReuse, culturallySensitive: boolean) {
  return reuse === "reusable" && !culturallySensitive;
}

export function compactEvidenceTags(values: unknown[]) {
  return [...new Set(values.flatMap((value) => typeof value === "string" ? value.split(/[,;|]/) : []).map((value) => value.trim().toLowerCase()).filter(Boolean))].slice(0, 30);
}

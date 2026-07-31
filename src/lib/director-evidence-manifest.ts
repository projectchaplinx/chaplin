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
  contentHash: string;
  linkedStudyIds: string[];
  updatedAt: string;
};

export type NormalizedEvidenceInput = Omit<DirectorEvidenceManifest, "id" | "sourceId" | "researchJobId" | "status" | "reviewNotes" | "contentHash" | "linkedStudyIds" | "updatedAt"> & {
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

export function dedupeEvidenceInputs(inputs: NormalizedEvidenceInput[]) {
  const unique = new Map<string, NormalizedEvidenceInput>();
  for (const input of inputs) {
    const key = `${input.kind}:${input.provider.trim()}:${input.externalId.trim()}`;
    if (!unique.has(key)) unique.set(key, input);
  }
  return [...unique.values()];
}

export function validateEvidenceSynthesisGroup(records: Array<Pick<DirectorEvidenceManifest, "sourceId" | "status" | "reuseStatus" | "culturallySensitive">>) {
  if (!records.length) throw new Error("Choose at least one eligible evidence record.");
  if (records.some((record) => record.status !== "eligible" || record.reuseStatus !== "reusable" || record.culturallySensitive)) {
    throw new Error("Only human-reviewed, reusable, non-sensitive evidence can enter study synthesis.");
  }
  if (new Set(records.map((record) => record.sourceId)).size !== 1) {
    throw new Error("Synthesize one authoritative source group at a time.");
  }
}

export function stableEvidenceContent(input: NormalizedEvidenceInput) {
  return {
    kind: input.kind,
    provider: input.provider.trim(),
    externalId: input.externalId.trim(),
    canonicalUrl: input.canonicalUrl,
    recordLocator: input.recordLocator.trim(),
    title: input.title.trim(),
    institution: input.institution.trim(),
    dateLabel: input.dateLabel.trim(),
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    region: input.region.trim(),
    tags: input.tags,
    facets: input.facets,
    provenance: input.provenance ?? {},
    rightsUri: input.rightsUri ?? null,
    rightsLabel: input.rightsLabel.trim(),
    reuseStatus: input.reuseStatus,
    rightsNotes: (input.rightsNotes ?? "").trim(),
    culturallySensitive: input.culturallySensitive,
    sourceUpdatedAt: input.sourceUpdatedAt ?? null,
  };
}

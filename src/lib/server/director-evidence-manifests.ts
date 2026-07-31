import "server-only";

import { createHash } from "node:crypto";
import {
  canMarkEvidenceEligible,
  evidenceNeedsReview,
  stableEvidenceContent,
  type DirectorEvidenceManifest,
  type DirectorEvidenceStatus,
  type NormalizedEvidenceInput,
} from "@/lib/director-evidence-manifest";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

type ManifestRow = {
  id: string; source_id: string; research_job_id: string | null; kind: DirectorEvidenceManifest["kind"];
  provider: string; external_id: string; canonical_url: string; record_locator: string; title: string;
  institution: string; date_label: string; region: string; tags: string[]; facets: Record<string, unknown>;
  rights_uri: string | null; rights_label: string; reuse_status: DirectorEvidenceManifest["reuseStatus"];
  culturally_sensitive: boolean; status: DirectorEvidenceStatus; review_notes: string; reviewed_by?: string | null;
  reviewed_at?: string | null; created_at?: string; updated_at: string;
};

function fromRow(row: ManifestRow): DirectorEvidenceManifest {
  return {
    id: row.id, sourceId: row.source_id, researchJobId: row.research_job_id, kind: row.kind,
    provider: row.provider, externalId: row.external_id, canonicalUrl: row.canonical_url,
    recordLocator: row.record_locator, title: row.title, institution: row.institution,
    dateLabel: row.date_label, region: row.region, tags: row.tags ?? [], facets: row.facets ?? {},
    rightsUri: row.rights_uri, rightsLabel: row.rights_label, reuseStatus: row.reuse_status,
    culturallySensitive: row.culturally_sensitive, status: row.status, reviewNotes: row.review_notes,
    updatedAt: row.updated_at,
  };
}

function safeHttps(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("Evidence records must use an HTTPS canonical URL.");
  return parsed.toString();
}

export async function upsertDirectorEvidenceManifests(sourceId: string, jobId: string, inputs: NormalizedEvidenceInput[]) {
  if (!inputs.length) return [];
  if (inputs.length > 100) throw new Error("A research worker may persist at most 100 evidence records at once.");
  const now = new Date().toISOString();
  const existingResult = await getSupabaseAdminClient().from("director_evidence_manifests")
    .select("kind,provider,external_id,status,review_notes,reviewed_by,reviewed_at,created_at")
    .eq("source_id", sourceId)
    .in("external_id", inputs.map((input) => input.externalId.trim()));
  if (existingResult.error) throw new Error(`Load existing evidence manifests: ${existingResult.error.message}`);
  const existingByKey = new Map((existingResult.data ?? []).map((row) => [
    `${row.kind}:${row.provider}:${row.external_id}`,
    row,
  ]));
  const rows = inputs.map((input) => {
    const existing = existingByKey.get(`${input.kind}:${input.provider.trim()}:${input.externalId.trim()}`);
    const preserveReview = existing && ["eligible", "rejected", "archived"].includes(existing.status);
    const normalized = {
      source_id: sourceId, research_job_id: jobId, kind: input.kind, provider: input.provider.trim(),
      external_id: input.externalId.trim(), canonical_url: safeHttps(input.canonicalUrl),
      record_locator: input.recordLocator.trim().slice(0, 500), title: input.title.trim().slice(0, 1000),
      institution: input.institution.trim().slice(0, 500), date_label: input.dateLabel.trim().slice(0, 500),
      period_start: input.periodStart ?? null, period_end: input.periodEnd ?? null,
      region: input.region.trim().slice(0, 500), tags: input.tags.slice(0, 30), facets: input.facets,
      provenance: input.provenance ?? {}, rights_uri: input.rightsUri ? safeHttps(input.rightsUri) : null,
      rights_label: input.rightsLabel.trim().slice(0, 1000), reuse_status: input.reuseStatus,
      rights_notes: (input.rightsNotes ?? "").trim().slice(0, 2000), culturally_sensitive: input.culturallySensitive,
      status: preserveReview ? existing.status : evidenceNeedsReview(input), source_updated_at: input.sourceUpdatedAt ?? null,
      review_notes: preserveReview ? existing.review_notes : "",
      reviewed_by: preserveReview ? existing.reviewed_by : null,
      reviewed_at: preserveReview ? existing.reviewed_at : null,
      ...(existing?.created_at ? { created_at: existing.created_at } : {}),
      accessed_at: now, updated_at: now,
    };
    return { ...normalized, content_hash: createHash("sha256").update(JSON.stringify(stableEvidenceContent(input))).digest("hex") };
  });
  const result = await getSupabaseAdminClient().from("director_evidence_manifests").upsert(rows, {
    onConflict: "source_id,kind,provider,external_id",
  }).select("*");
  if (result.error) throw new Error(`Persist evidence manifests: ${result.error.message}`);
  return ((result.data ?? []) as ManifestRow[]).map(fromRow);
}

export async function listDirectorEvidenceManifests(options: { sourceId?: string; status?: DirectorEvidenceStatus; limit?: number } = {}) {
  let query = getSupabaseAdminClient().from("director_evidence_manifests").select("*").order("updated_at", { ascending: false }).limit(Math.max(1, Math.min(options.limit ?? 100, 300)));
  if (options.sourceId) query = query.eq("source_id", options.sourceId);
  if (options.status) query = query.eq("status", options.status);
  const result = await query;
  if (result.error) {
    if (/director_evidence_manifests|schema cache|does not exist/i.test(result.error.message)) return { storageReady: false, manifests: [] };
    throw new Error(`Load evidence manifests: ${result.error.message}`);
  }
  return { storageReady: true, manifests: ((result.data ?? []) as ManifestRow[]).map(fromRow) };
}

export async function reviewDirectorEvidenceManifest(id: string, status: Extract<DirectorEvidenceStatus, "eligible" | "rejected" | "archived">, notes: string, reviewerId: string) {
  const current = await getSupabaseAdminClient().from("director_evidence_manifests").select("reuse_status,culturally_sensitive").eq("id", id).maybeSingle();
  if (current.error || !current.data) throw new Error(current.error?.message ?? "Evidence manifest not found.");
  if (status === "eligible" && !canMarkEvidenceEligible(current.data.reuse_status, current.data.culturally_sensitive)) {
    throw new Error("Only explicitly reusable, non-sensitive evidence can be marked eligible.");
  }
  const result = await getSupabaseAdminClient().from("director_evidence_manifests").update({
    status, review_notes: notes.slice(0, 2000), reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", id).select("*").single();
  if (result.error) throw new Error(`Review evidence manifest: ${result.error.message}`);
  return fromRow(result.data as ManifestRow);
}

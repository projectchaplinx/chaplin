import "server-only";

import {
  directorResearchSourceMode,
  normalizeDirectorStudyInput,
  rankApprovedDirectorResearch,
  type ApprovedDirectorStudyContext,
  type DirectorResearchBundle,
  type DirectorResearchSourceRecord,
  type DirectorSceneStudy,
  type DirectorSourceKind,
  type DirectorStudyObservation,
  type DirectorStudyStatus,
} from "@/lib/director-research";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

type SourceRow = {
  id: string;
  title: string;
  institution: string;
  source_url: string | null;
  source_kind: DirectorSourceKind;
  rights_basis: string;
  access_notes: string;
  campaign_id?: string | null;
  target_tags?: string[] | null;
  research_questions?: unknown;
  priority?: "now" | "next" | "later" | null;
  queue_status?: "queued" | "in-progress" | "analyzed" | "paused" | null;
  last_verified_at?: string | null;
};

type StudyRow = {
  id: string;
  source_id: string;
  study_title: string;
  work_title: string;
  scene_locator: string;
  duration_seconds: number | string | null;
  period_label: string;
  region: string;
  tags: string[] | null;
  observations: unknown;
  candidate_principles: unknown;
  limitations: string;
  review_notes: string;
  status: DirectorStudyStatus;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  director_research_sources?: SourceRow | SourceRow[] | null;
};

function missingResearchTable(message: string) {
  return /director_(?:research_sources|scene_studies)|schema cache|does not exist/i.test(message);
}

function sourceFromRow(row: SourceRow): DirectorResearchSourceRecord {
  return {
    id: row.id,
    title: row.title,
    institution: row.institution,
    sourceUrl: row.source_url,
    sourceKind: row.source_kind,
    rightsBasis: row.rights_basis,
    accessNotes: row.access_notes,
    campaignId: row.campaign_id ?? "",
    targetTags: Array.isArray(row.target_tags) ? row.target_tags : [],
    researchQuestions: Array.isArray(row.research_questions)
      ? row.research_questions.filter((item): item is string => typeof item === "string")
      : [],
    priority: row.priority === "now" || row.priority === "later" ? row.priority : "next",
    queueStatus:
      row.queue_status === "in-progress" || row.queue_status === "analyzed" || row.queue_status === "paused"
        ? row.queue_status
        : "queued",
    lastVerifiedAt: row.last_verified_at ?? null,
  };
}

function validObservations(value: unknown): DirectorStudyObservation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const row = candidate as Partial<DirectorStudyObservation>;
    const hasTime = Number.isFinite(row.startSecond) && Number.isFinite(row.endSecond);
    const locator = row.locator && typeof row.locator === "object"
      && typeof row.locator.kind === "string" && typeof row.locator.value === "string"
      ? row.locator
      : hasTime
        ? { kind: "time" as const, value: `${Number(row.startSecond)}-${Number(row.endSecond)}` }
        : null;
    if (!locator || typeof row.evidence !== "string") return [];
    return [{
      locator,
      ...(hasTime ? { startSecond: Number(row.startSecond), endSecond: Number(row.endSecond) } : {}),
      evidence: row.evidence,
      craft: typeof row.craft === "string" ? row.craft : "",
      transition: typeof row.transition === "string" ? row.transition : "",
      narrativeJob: typeof row.narrativeJob === "string" ? row.narrativeJob : "",
      inference: typeof row.inference === "string" ? row.inference : "",
      confidence: row.confidence === "low" || row.confidence === "medium" ? row.confidence : "high",
      audioEvidence: typeof row.audioEvidence === "string" ? row.audioEvidence : "",
      soundFunction: typeof row.soundFunction === "string" ? row.soundFunction : "",
    }];
  });
}

function studyFromRow(row: StudyRow): DirectorSceneStudy | null {
  const joined = Array.isArray(row.director_research_sources)
    ? row.director_research_sources[0]
    : row.director_research_sources;
  if (!joined) return null;
  return {
    id: row.id,
    studyTitle: row.study_title,
    workTitle: row.work_title,
    sceneLocator: row.scene_locator,
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    periodLabel: row.period_label,
    region: row.region,
    tags: Array.isArray(row.tags) ? row.tags : [],
    observations: validObservations(row.observations),
    candidatePrinciples: Array.isArray(row.candidate_principles)
      ? row.candidate_principles.filter((item): item is string => typeof item === "string")
      : [],
    limitations: row.limitations,
    reviewNotes: row.review_notes,
    status: row.status,
    source: sourceFromRow(joined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
  };
}

export async function listDirectorResearch(limit = 100): Promise<DirectorResearchBundle> {
  const supabase = getSupabaseAdminClient();
  const boundedLimit = Math.max(1, Math.min(500, limit));
  const [sourcesResult, studiesResult] = await Promise.all([
    supabase
      .from("director_research_sources")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(boundedLimit),
    supabase
      .from("director_scene_studies")
      .select("*,director_research_sources(*)")
      .order("updated_at", { ascending: false })
      .limit(boundedLimit),
  ]);
  const error = sourcesResult.error ?? studiesResult.error;
  if (error) {
    if (missingResearchTable(error.message)) return { storageReady: false, sources: [], studies: [] };
    throw new Error(`Load Director Brain research: ${error.message}`);
  }
  return {
    storageReady: true,
    sources: ((sourcesResult.data ?? []) as SourceRow[]).map(sourceFromRow),
    studies: ((studiesResult.data ?? []) as StudyRow[])
      .map(studyFromRow)
      .filter((study): study is DirectorSceneStudy => Boolean(study)),
  };
}

async function findOrCreateSource(
  source: ReturnType<typeof normalizeDirectorStudyInput>["source"],
  userId: string,
) {
  const supabase = getSupabaseAdminClient();
  if (source.sourceUrl) {
    const existing = await supabase
      .from("director_research_sources")
      .select("*")
      .eq("source_url", source.sourceUrl)
      .maybeSingle();
    if (existing.error) throw new Error(`Check Director Brain source: ${existing.error.message}`);
    if (existing.data) return existing.data as SourceRow;
  }
  const inserted = await supabase
    .from("director_research_sources")
    .insert({
      title: source.title,
      institution: source.institution,
      source_url: source.sourceUrl,
      source_kind: source.sourceKind,
      rights_basis: source.rightsBasis,
      access_notes: source.accessNotes,
      created_by: userId,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) {
    if (source.sourceUrl && /duplicate key|unique constraint/i.test(inserted.error?.message ?? "")) {
      const raced = await supabase
        .from("director_research_sources")
        .select("*")
        .eq("source_url", source.sourceUrl)
        .single();
      if (!raced.error && raced.data) return raced.data as SourceRow;
    }
    throw new Error(`Create Director Brain source: ${inserted.error?.message ?? "No record returned."}`);
  }
  return inserted.data as SourceRow;
}

export async function createDirectorStudy(input: Record<string, unknown>, userId: string) {
  const normalized = normalizeDirectorStudyInput(input);
  const source = await findOrCreateSource(normalized.source, userId);
  const result = await getSupabaseAdminClient()
    .from("director_scene_studies")
    .insert({
      source_id: source.id,
      study_title: normalized.study.studyTitle,
      work_title: normalized.study.workTitle,
      scene_locator: normalized.study.sceneLocator,
      duration_seconds: normalized.study.durationSeconds,
      period_label: normalized.study.periodLabel,
      region: normalized.study.region,
      tags: normalized.study.tags,
      observations: normalized.study.observations,
      candidate_principles: normalized.study.candidatePrinciples,
      limitations: normalized.study.limitations,
      created_by: userId,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (result.error || !result.data) {
    if (missingResearchTable(result.error?.message ?? "")) {
      throw new Error("Apply the Director Brain research migration before adding studies.");
    }
    throw new Error(`Create Director Brain study: ${result.error?.message ?? "No record returned."}`);
  }
  return String(result.data.id);
}

export async function reviewDirectorStudy(input: Record<string, unknown>, userId: string) {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) throw new Error("Choose a scene study.");
  const statuses: DirectorStudyStatus[] = ["reviewed", "approved", "rejected"];
  const status = statuses.includes(input.status as DirectorStudyStatus)
    ? input.status as DirectorStudyStatus
    : null;
  if (!status) throw new Error("Choose reviewed, approved, or rejected.");
  const reviewNotes = typeof input.reviewNotes === "string"
    ? input.reviewNotes.trim().slice(0, 2000)
    : "";
  if ((status === "approved" || status === "rejected") && reviewNotes.length < 20) {
    throw new Error("Record a substantive reason for approval or rejection.");
  }
  const supabase = getSupabaseAdminClient();
  const current = await supabase.from("director_scene_studies")
    .select("id,status,source_id,director_research_sources(*)")
    .eq("id", id).maybeSingle();
  if (current.error || !current.data) throw new Error(current.error?.message ?? "Director Brain study was not found.");
  if (status === "approved") {
    if (current.data.status !== "reviewed") throw new Error("Move the study to reviewed before approving it.");
    const joined = Array.isArray(current.data.director_research_sources)
      ? current.data.director_research_sources[0]
      : current.data.director_research_sources;
    const source = joined ? sourceFromRow(joined as SourceRow) : null;
    if (source && ["collection-discovery", "provenance"].includes(directorResearchSourceMode(source))) {
      const links = await supabase.from("director_study_evidence_manifests").select("manifest_id").eq("study_id", id);
      if (links.error) throw new Error(`Check study evidence links: ${links.error.message}`);
      const manifestIds = (links.data ?? []).map((row) => String(row.manifest_id));
      if (!manifestIds.length) throw new Error("Collection studies need at least one reviewed evidence manifest before approval.");
      const manifests = await supabase.from("director_evidence_manifests")
        .select("id,status,reuse_status,culturally_sensitive").in("id", manifestIds);
      if (manifests.error) throw new Error(`Check linked evidence: ${manifests.error.message}`);
      if ((manifests.data ?? []).length !== manifestIds.length || (manifests.data ?? []).some((manifest) => manifest.status !== "eligible" || manifest.reuse_status !== "reusable" || manifest.culturally_sensitive)) {
        throw new Error("Every linked collection manifest must be eligible, reusable, and non-sensitive before approval.");
      }
    }
  }
  const result = await supabase
    .from("director_scene_studies")
    .update({
      status,
      review_notes: reviewNotes,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (result.error) throw new Error(`Review Director Brain study: ${result.error.message}`);
}

export async function updateDirectorResearchSource(input: Record<string, unknown>, userId: string) {
  const sourceId = typeof input.sourceId === "string" ? input.sourceId.trim() : "";
  if (!sourceId) throw new Error("Choose a research source.");
  const allowed = ["queued", "in-progress", "analyzed", "paused"] as const;
  const queueStatus = allowed.find((status) => status === input.queueStatus);
  if (!queueStatus) throw new Error("Choose queued, in progress, analyzed, or paused.");
  const supabase = getSupabaseAdminClient();
  if (queueStatus === "analyzed") {
    const studyCount = await supabase
      .from("director_scene_studies")
      .select("id", { count: "exact", head: true })
      .eq("source_id", sourceId);
    if (studyCount.error) throw new Error(`Check Director Brain studies: ${studyCount.error.message}`);
    if (!studyCount.count) {
      throw new Error("Record at least one evidence study before marking this source analyzed.");
    }
  }
  const result = await supabase
    .from("director_research_sources")
    .update({
      queue_status: queueStatus,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId)
    .select("id")
    .maybeSingle();
  if (result.error) throw new Error(`Update Director Brain source: ${result.error.message}`);
  if (!result.data) throw new Error("Research source was not found.");
}

export async function retrieveApprovedDirectorResearch(brief: string, limit = 4): Promise<ApprovedDirectorStudyContext[]> {
  const supabase = getSupabaseAdminClient();
  const result = await supabase.from("director_scene_studies")
    .select("*,director_research_sources(*)")
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (result.error) {
    if (missingResearchTable(result.error.message)) return [];
    throw new Error(`Load approved Director Brain research: ${result.error.message}`);
  }
  const studies = ((result.data ?? []) as StudyRow[]).map(studyFromRow).filter((study): study is DirectorSceneStudy => Boolean(study));
  const collectionIds = studies.filter((study) => ["collection-discovery", "provenance"].includes(directorResearchSourceMode(study.source))).map((study) => study.id);
  if (!collectionIds.length) return rankApprovedDirectorResearch(studies, brief, limit);
  const links = await supabase.from("director_study_evidence_manifests")
    .select("study_id,manifest_id,director_evidence_manifests(status,reuse_status,culturally_sensitive)")
    .in("study_id", collectionIds);
  if (links.error) throw new Error(`Verify approved research provenance: ${links.error.message}`);
  const eligibleStudyIds = new Set<string>();
  for (const link of links.data ?? []) {
    const manifest = Array.isArray(link.director_evidence_manifests)
      ? link.director_evidence_manifests[0]
      : link.director_evidence_manifests;
    if (manifest?.status === "eligible" && manifest.reuse_status === "reusable" && !manifest.culturally_sensitive) eligibleStudyIds.add(String(link.study_id));
  }
  return rankApprovedDirectorResearch(studies.filter((study) => !collectionIds.includes(study.id) || eligibleStudyIds.has(study.id)), brief, limit);
}

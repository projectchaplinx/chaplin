import "server-only";

import {
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
    if (!Number.isFinite(row.startSecond) || !Number.isFinite(row.endSecond) || typeof row.evidence !== "string") return [];
    return [{
      startSecond: Number(row.startSecond),
      endSecond: Number(row.endSecond),
      evidence: row.evidence,
      craft: typeof row.craft === "string" ? row.craft : "",
      transition: typeof row.transition === "string" ? row.transition : "",
      narrativeJob: typeof row.narrativeJob === "string" ? row.narrativeJob : "",
      inference: typeof row.inference === "string" ? row.inference : "",
      confidence: row.confidence === "low" || row.confidence === "medium" ? row.confidence : "high",
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
  if ((status === "approved" || status === "rejected") && reviewNotes.length < 5) {
    throw new Error("Record the reason for approval or rejection.");
  }
  const result = await getSupabaseAdminClient()
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
  const result = await getSupabaseAdminClient()
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
  const bundle = await listDirectorResearch(300);
  if (!bundle.storageReady) return [];
  return rankApprovedDirectorResearch(bundle.studies, brief, limit);
}

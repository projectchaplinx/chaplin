import "server-only";

import {
  DIRECTOR_SPRINT_ONE_KEY,
  directorSprintOneProgress,
  type DirectorCharacterAxis,
  type DirectorPrincipleAssessment,
  type DirectorPrincipleConfidence,
  type DirectorPrincipleLane,
  type DirectorCoverageFinding,
  type DirectorSourceStrength,
} from "@/lib/director-sprint-one";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

type AssessmentRow = {
  id: string;
  sprint_run_id: string;
  sprint_key: string;
  study_id: string;
  timed_media_analysis_id: string | null;
  principle_index: number;
  principle_text: string;
  principle_hash: string;
  lane: DirectorPrincipleLane;
  character_axis: DirectorCharacterAxis;
  agreement_key: string;
  confidence: DirectorPrincipleConfidence;
  rationale: string;
  rejection_reason: string;
  source_strength: DirectorSourceStrength;
  character_axis_score: number;
  cross_study_agreement: number;
  production_reach: number;
  rank_score: number | string;
  candidate_rank: number | null;
  shortlist_rank: number | null;
  model: string;
  response_id: string | null;
  created_at: string;
  director_scene_studies?: {
    study_title?: string;
    work_title?: string;
    director_research_sources?: { title?: string; source_url?: string | null } | Array<{ title?: string; source_url?: string | null }>;
  } | Array<{
    study_title?: string;
    work_title?: string;
    director_research_sources?: { title?: string; source_url?: string | null } | Array<{ title?: string; source_url?: string | null }>;
  }>;
};

type PlaybackRow = { id: string; playback_url: string; playback_status: "required" | "verified" | "rejected"; start_second: number | string; duration_seconds: number | string };
type ReviewRow = { assessment_id: string; verdict: "verified" | "rejected"; review_notes: string; reviewed_by: string; reviewed_at: string };
type FindingRow = { id: string; axis: DirectorCharacterAxis; title: string; finding: string; cause: string; next_method: string; evidence: unknown; created_at: string };

function missingSprintTable(message: string) {
  return /director_(?:sprint_runs|principle_assessments|principle_playback_reviews)|schema cache|does not exist/i.test(message);
}

function joinedStudy(row: AssessmentRow) {
  return Array.isArray(row.director_scene_studies) ? row.director_scene_studies[0] : row.director_scene_studies;
}

function joinedSource(study: ReturnType<typeof joinedStudy>) {
  return Array.isArray(study?.director_research_sources)
    ? study.director_research_sources[0]
    : study?.director_research_sources;
}

export async function listDirectorSprintOne() {
  const supabase = getSupabaseAdminClient();
  const assessmentResult = await supabase
    .from("director_principle_assessments")
    .select("*,director_scene_studies(study_title,work_title,director_research_sources(title,source_url))")
    .eq("sprint_key", DIRECTOR_SPRINT_ONE_KEY)
    .order("candidate_rank", { ascending: true, nullsFirst: false })
    .order("rank_score", { ascending: false });
  if (assessmentResult.error) {
    if (missingSprintTable(assessmentResult.error.message)) {
      return { storageReady: false, assessments: [] as DirectorPrincipleAssessment[], findings: [] as DirectorCoverageFinding[], progress: directorSprintOneProgress([]) };
    }
    throw new Error(`Load Director Sprint 1: ${assessmentResult.error.message}`);
  }
  const rows = (assessmentResult.data ?? []) as AssessmentRow[];
  const timedIds = rows.map((row) => row.timed_media_analysis_id).filter((id): id is string => Boolean(id));
  const assessmentIds = rows.map((row) => row.id);
  const [playbackResult, reviewResult, findingResult] = await Promise.all([
    timedIds.length
      ? supabase.from("director_timed_media_analyses").select("id,playback_url,playback_status,start_second,duration_seconds").in("id", timedIds)
      : Promise.resolve({ data: [], error: null }),
    assessmentIds.length
      ? supabase.from("director_principle_playback_reviews").select("assessment_id,verdict,review_notes,reviewed_by,reviewed_at").in("assessment_id", assessmentIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("director_coverage_findings").select("id,axis,title,finding,cause,next_method,evidence,created_at").order("created_at", { ascending: false }),
  ]);
  const error = playbackResult.error ?? reviewResult.error ?? findingResult.error;
  if (error) throw new Error(`Load Director Sprint 1 playback: ${error.message}`);
  const playbackById = new Map(((playbackResult.data ?? []) as PlaybackRow[]).map((row) => [row.id, row]));
  const reviewByAssessment = new Map(((reviewResult.data ?? []) as ReviewRow[]).map((row) => [row.assessment_id, row]));
  const assessments: DirectorPrincipleAssessment[] = rows.map((row) => {
    const study = joinedStudy(row);
    const source = joinedSource(study);
    const playback = row.timed_media_analysis_id ? playbackById.get(row.timed_media_analysis_id) : null;
    const review = reviewByAssessment.get(row.id);
    return {
      id: row.id,
      sprintRunId: row.sprint_run_id,
      sprintKey: row.sprint_key,
      studyId: row.study_id,
      timedMediaAnalysisId: row.timed_media_analysis_id,
      playbackUrl: playback?.playback_url || null,
      playbackStatus: playback?.playback_status ?? null,
      playbackStartSecond: playback ? Number(playback.start_second) : null,
      playbackDurationSeconds: playback ? Number(playback.duration_seconds) : null,
      studyTitle: study?.study_title ?? "Untitled study",
      workTitle: study?.work_title ?? "",
      sourceTitle: source?.title ?? "Unknown source",
      sourceUrl: source?.source_url ?? null,
      principleIndex: row.principle_index,
      principleText: row.principle_text,
      principleHash: row.principle_hash,
      lane: row.lane,
      characterAxis: row.character_axis,
      agreementKey: row.agreement_key,
      confidence: row.confidence,
      rationale: row.rationale,
      rejectionReason: row.rejection_reason,
      sourceStrength: row.source_strength,
      characterAxisScore: row.character_axis_score,
      crossStudyAgreement: row.cross_study_agreement,
      productionReach: row.production_reach,
      rankScore: Number(row.rank_score),
      candidateRank: row.candidate_rank,
      shortlistRank: row.shortlist_rank,
      model: row.model,
      responseId: row.response_id,
      createdAt: row.created_at,
      playbackReview: review ? {
        verdict: review.verdict,
        reviewNotes: review.review_notes,
        reviewedBy: review.reviewed_by,
        reviewedAt: review.reviewed_at,
      } : null,
    };
  });
  const findings: DirectorCoverageFinding[] = ((findingResult.data ?? []) as FindingRow[]).map((row) => ({
    id: row.id,
    axis: row.axis,
    title: row.title,
    finding: row.finding,
    cause: row.cause,
    nextMethod: row.next_method,
    evidence: row.evidence && typeof row.evidence === "object" && !Array.isArray(row.evidence) ? row.evidence as Record<string, unknown> : {},
    createdAt: row.created_at,
  }));
  return { storageReady: true, assessments, findings, progress: directorSprintOneProgress(assessments) };
}

export async function reviewDirectorSprintOnePlayback(input: Record<string, unknown>, reviewerId: string) {
  const assessmentId = typeof input.assessmentId === "string" ? input.assessmentId.trim() : "";
  const verdict = input.verdict === "verified" || input.verdict === "rejected" ? input.verdict : null;
  const reviewNotes = typeof input.reviewNotes === "string" ? input.reviewNotes.trim().slice(0, 2000) : "";
  if (!assessmentId || !verdict) throw new Error("Choose a shortlisted principle and playback verdict.");
  if (reviewNotes.length < 20) throw new Error("Record what direct playback confirmed or contradicted.");
  const supabase = getSupabaseAdminClient();
  const assessment = await supabase.from("director_principle_assessments")
    .select("id,shortlist_rank,timed_media_analysis_id")
    .eq("id", assessmentId)
    .eq("sprint_key", DIRECTOR_SPRINT_ONE_KEY)
    .maybeSingle();
  if (assessment.error || !assessment.data) throw new Error(assessment.error?.message ?? "Sprint principle was not found.");
  if (!assessment.data.shortlist_rank || assessment.data.shortlist_rank > 5) {
    throw new Error("Sprint 1 permits direct playback decisions only for the named top five.");
  }
  if (!assessment.data.timed_media_analysis_id) throw new Error("This shortlisted principle has no attributable timed passage.");
  const saved = await supabase.from("director_principle_playback_reviews").insert({
    assessment_id: assessmentId,
    verdict,
    review_notes: reviewNotes,
    reviewed_by: reviewerId,
  });
  if (saved.error) {
    if (/duplicate key|unique constraint/i.test(saved.error.message)) throw new Error("This shortlist playback already has an immutable human verdict.");
    throw new Error(`Save shortlist playback verdict: ${saved.error.message}`);
  }
}

import "server-only";

import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * Chaplin's own renders as research evidence — the `chaplin-test` lane.
 *
 * The archive corpus taught composition; it structurally could not teach
 * identity persistence, which is the marketplace's moat. The replacement
 * method is instrumentation: every real render contributes a measured
 * observation here, and the accumulated month's evidence stands as a draft
 * study that a person still has to review and approve before any of it
 * becomes retrievable. The two human gates are unchanged.
 */

const SOURCE_TITLE = "Chaplin production render evidence";

export async function ensureProductionEvidenceSource(): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const existing = await supabase
    .from("director_research_sources")
    .select("id")
    .eq("source_kind", "chaplin-test")
    .eq("title", SOURCE_TITLE)
    .maybeSingle();
  if (existing.error && !/does not exist|schema cache/i.test(existing.error.message)) {
    throw new Error(`Load production evidence source: ${existing.error.message}`);
  }
  if (existing.data?.id) return String(existing.data.id);
  const created = await supabase
    .from("director_research_sources")
    .insert({
      title: SOURCE_TITLE,
      institution: "Chaplin",
      source_url: null,
      source_kind: "chaplin-test",
      rights_basis: "Original Chaplin generations produced under Chaplin's own provider contracts; no third-party expressive material.",
      access_notes: "Evidence is written by render instrumentation, not fetched. This source never enqueues a research job.",
      created_by: "render-instrumentation",
    })
    .select("id")
    .single();
  if (created.error || !created.data) {
    throw new Error(`Create production evidence source: ${created.error?.message ?? "no row"}`);
  }
  return String(created.data.id);
}

export type ProductionObservation = {
  observedAt: string;
  generationJobId?: string | null;
  pipelineRunId?: string | null;
  characterId?: string | null;
  kind: "identity-measurement" | "voice-path" | "assembly" | "verdict";
  detail: Record<string, unknown>;
};

/**
 * Appends one measured observation to the current month's draft study.
 * The study stays a draft — visible in the archive and the intelligence
 * node's "awaiting decision" lane — until a human reviews and approves it.
 */
export async function appendProductionEvidence(observation: ProductionObservation) {
  const supabase = getSupabaseAdminClient();
  const sourceId = await ensureProductionEvidenceSource();
  const month = observation.observedAt.slice(0, 7);
  const studyTitle = `Production render evidence — ${month}`;
  const existing = await supabase
    .from("director_scene_studies")
    .select("id,status,observations")
    .eq("source_id", sourceId)
    .eq("study_title", studyTitle)
    .maybeSingle();
  if (existing.error && !/does not exist|schema cache/i.test(existing.error.message)) {
    throw new Error(`Load production evidence study: ${existing.error.message}`);
  }
  if (existing.data && existing.data.status !== "draft") {
    // A reviewed month is immutable; the next observation opens a new draft
    // with a sequence suffix rather than touching decided evidence.
    const rolled = `${studyTitle} (continued)`;
    const continued = await supabase
      .from("director_scene_studies")
      .select("id,status,observations")
      .eq("source_id", sourceId)
      .eq("study_title", rolled)
      .maybeSingle();
    if (continued.data?.status === "draft") {
      return appendToStudy(String(continued.data.id), continued.data.observations, observation);
    }
    if (!continued.data) {
      return createStudy(sourceId, rolled, observation);
    }
    return { studyId: null, skipped: "both month studies already reviewed" };
  }
  if (existing.data) {
    return appendToStudy(String(existing.data.id), existing.data.observations, observation);
  }
  return createStudy(sourceId, studyTitle, observation);
}

async function createStudy(sourceId: string, studyTitle: string, observation: ProductionObservation) {
  const supabase = getSupabaseAdminClient();
  const created = await supabase
    .from("director_scene_studies")
    .insert({
      source_id: sourceId,
      study_title: studyTitle,
      work_title: "Chaplin production renders",
      scene_locator: "render-instrumentation",
      period_label: "",
      region: "",
      tags: ["chaplin-test", "production-evidence", "identity", "ai"],
      observations: [observation],
      candidate_principles: [],
      limitations: "Automatic measurements from Chaplin's own renders. Scores are machine-produced and carry no approval authority; principles must be distilled and approved by a person before retrieval.",
      status: "draft",
      created_by: "render-instrumentation",
    })
    .select("id")
    .single();
  if (created.error || !created.data) {
    throw new Error(`Create production evidence study: ${created.error?.message ?? "no row"}`);
  }
  return { studyId: String(created.data.id), skipped: null };
}

async function appendToStudy(studyId: string, observations: unknown, observation: ProductionObservation) {
  const supabase = getSupabaseAdminClient();
  const current = Array.isArray(observations) ? observations : [];
  // Bounded so a hot month cannot grow one row without limit; the newest
  // evidence wins because it reflects the current pipeline configuration.
  const next = [...current.slice(-499), observation];
  const updated = await supabase
    .from("director_scene_studies")
    .update({ observations: next, updated_at: new Date().toISOString() })
    .eq("id", studyId)
    .eq("status", "draft");
  if (updated.error) throw new Error(`Append production evidence: ${updated.error.message}`);
  return { studyId, skipped: null };
}

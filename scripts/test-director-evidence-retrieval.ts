import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { rankApprovedDirectorResearch, type DirectorSceneStudy } from "../src/lib/director-research";

async function main() {
  loadEnvConfig(process.cwd());
  if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is missing.");
  const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, ssl: "require" });
  try {
  const rows = await sql`
    select st.*, s.title as source_title, s.institution, s.source_url, s.source_kind,
           s.rights_basis, s.access_notes, s.campaign_id, s.target_tags, s.research_questions,
           s.priority, s.queue_status, s.last_verified_at
    from director_scene_studies st
    join director_research_sources s on s.id = st.source_id
    where st.status = 'approved'
  `;
  const studies = rows.map((row): DirectorSceneStudy => ({
    id: row.id, studyTitle: row.study_title, workTitle: row.work_title, sceneLocator: row.scene_locator,
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds), periodLabel: row.period_label,
    region: row.region, tags: row.tags ?? [], observations: row.observations ?? [],
    candidatePrinciples: row.candidate_principles ?? [], limitations: row.limitations,
    reviewNotes: row.review_notes, status: row.status, createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    source: { id: row.source_id, title: row.source_title, institution: row.institution, sourceUrl: row.source_url,
      sourceKind: row.source_kind, rightsBasis: row.rights_basis, accessNotes: row.access_notes,
      campaignId: row.campaign_id ?? "", targetTags: row.target_tags ?? [], researchQuestions: row.research_questions ?? [],
      priority: row.priority ?? "next", queueStatus: row.queue_status ?? "queued", lastVerifiedAt: row.last_verified_at ? String(row.last_verified_at) : null },
  }));
  const brief = "Edo Japan 1750, a working woman stores an unlined summer kimono before changing clothes; preserve textile, layering, season, role, and room continuity.";
  const ranked = rankApprovedDirectorResearch(studies, brief, 6);
  const promoted = ranked.find((study) => study.studyTitle === "Edo garment and kimono material evidence");
  assert.ok(promoted, "The approved item-level Edo study must be retrieved for an Edo kimono production brief.");
  assert.ok(promoted.principles.some((principle) => /season|role|class/i.test(principle)), "Retrieved principles must retain the social-context gate.");
  console.log(JSON.stringify({ brief, retrieved: ranked.map((study) => ({ studyTitle: study.studyTitle, sourceTitle: study.sourceTitle, score: study.score })), promoted: promoted.studyTitle }, null, 2));
  } finally { await sql.end(); }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

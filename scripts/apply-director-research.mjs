import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

if (!process.env.SUPABASE_DB_URL) {
  throw new Error("SUPABASE_DB_URL is missing.");
}

const sql = postgres(process.env.SUPABASE_DB_URL, {
  max: 1,
  ssl: "require",
});

try {
  await sql`set client_min_messages = warning`;
  const [existing] = await sql`
    select to_regclass('public.director_research_jobs') is not null
      and to_regclass('public.director_scene_studies') is not null
      and to_regclass('public.director_evidence_manifests') is not null as ready
  `;
  if (!existing?.ready) {
    await sql.file("supabase/migrations/202607290002_director_research.sql");
    await sql.file("supabase/migrations/202607300001_director_research_campaign.sql");
    await sql.file("supabase/migrations/202607300002_director_decision_traces.sql");
    await sql.file("supabase/migrations/202607300003_director_evaluations.sql");
    await sql.file("supabase/migrations/202607310001_director_research_jobs.sql");
    await sql.file("supabase/migrations/202607310002_director_evidence_manifests.sql");
    await sql.file("supabase/migrations/202607310003_director_study_evidence_links.sql");
    await sql.file("supabase/migrations/202607310004_director_research_query_jobs.sql");
    await sql.file("supabase/migrations/202607310005_director_research_worker_safety.sql");
    await sql.file("supabase/migrations/202607310006_director_evidence_review_repair.sql");
    await sql.file("supabase/migrations/202607310007_director_timed_media_analyses.sql");
    await sql.file("supabase/migrations/202608010001_director_research_events.sql");
  }
  await sql.file("supabase/migrations/202608010002_director_preservation_contract.sql");
  await sql.file("supabase/migrations/202608010003_director_quarantine_ledger.sql");
  await sql.file("supabase/migrations/202608010004_director_sprint_one.sql");
  await sql.file("supabase/migrations/202608010005_director_sprint_one_shot_test.sql");
  const [tables] = await sql`
    select
      to_regclass('public.director_research_sources')::text as sources,
      to_regclass('public.director_scene_studies')::text as studies,
      to_regclass('public.director_decision_traces')::text as decisions,
      to_regclass('public.director_evaluations')::text as evaluations,
      to_regclass('public.director_sprint_shot_tests')::text as sprint_shot_tests,
      to_regclass('public.director_sprint_shot_scores')::text as sprint_shot_scores
      ,to_regclass('public.director_research_jobs')::text as research_jobs,
      to_regclass('public.director_evidence_manifests')::text as evidence_manifests,
      to_regclass('public.director_study_evidence_manifests')::text as evidence_links,
      to_regclass('public.director_timed_media_analyses')::text as timed_media_analyses,
      to_regclass('public.director_research_events')::text as research_events,
      to_regclass('public.director_entity_revisions')::text as entity_revisions,
      to_regclass('public.director_research_cost_entries')::text as research_costs
      ,to_regclass('public.director_quarantine_assessments')::text as quarantine_assessments
      ,to_regclass('public.director_principle_assessments')::text as principle_assessments
      ,to_regclass('public.director_principle_playback_reviews')::text as principle_playback_reviews
      ,to_regclass('public.director_coverage_findings')::text as coverage_findings
  `;
  if (!tables?.sources || !tables?.studies || !tables?.decisions || !tables?.evaluations || !tables?.research_jobs || !tables?.evidence_manifests || !tables?.evidence_links || !tables?.timed_media_analyses || !tables?.research_events || !tables?.entity_revisions || !tables?.research_costs || !tables?.quarantine_assessments || !tables?.principle_assessments || !tables?.principle_playback_reviews || !tables?.coverage_findings) {
    throw new Error("Director Brain research tables were not created.");
  }
  const [campaignColumn] = await sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'director_research_sources'
        and column_name = 'campaign_id'
    ) as ready
  `;
  if (!campaignColumn?.ready) {
    throw new Error("Director Brain campaign fields were not created.");
  }
  console.log("Director Brain research storage is active.");
} finally {
  await sql.end();
}

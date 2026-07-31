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
  const [tables] = await sql`
    select
      to_regclass('public.director_research_sources')::text as sources,
      to_regclass('public.director_scene_studies')::text as studies,
      to_regclass('public.director_decision_traces')::text as decisions,
      to_regclass('public.director_evaluations')::text as evaluations
      ,to_regclass('public.director_research_jobs')::text as research_jobs,
      to_regclass('public.director_evidence_manifests')::text as evidence_manifests,
      to_regclass('public.director_study_evidence_manifests')::text as evidence_links
  `;
  if (!tables?.sources || !tables?.studies || !tables?.decisions || !tables?.evaluations || !tables?.research_jobs || !tables?.evidence_manifests || !tables?.evidence_links) {
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

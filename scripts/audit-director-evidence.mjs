import nextEnv from "@next/env";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is missing.");
const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, ssl: "require" });
try {
  const rows = await sql`
    select m.id, m.provider, m.kind, m.title, m.date_label, m.region,
           m.rights_label, m.reuse_status, m.status, m.culturally_sensitive,
           m.canonical_url, m.facets, s.title as source_title,
           coalesce(j.input->>'queryLabel', 'Full source') as query_label,
           coalesce(j.contract_version, '') as contract_version
    from director_evidence_manifests m
    join director_research_sources s on s.id = m.source_id
    left join director_research_jobs j on j.id = m.research_job_id
    order by m.provider, m.title
  `;
  const constraints = await sql`
    select conname, pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.director_research_jobs'::regclass
    order by conname
  `;
  const linkedStudies = await sql`
    select st.id, st.study_title, st.status, count(link.manifest_id)::integer as manifest_count,
           coalesce(array_agg(m.title order by m.title) filter (where m.id is not null), '{}') as evidence_titles
    from director_scene_studies st
    left join director_study_evidence_manifests link on link.study_id = st.id
    left join director_evidence_manifests m on m.id = link.manifest_id
    group by st.id, st.study_title, st.status
    having count(link.manifest_id) > 0
    order by st.updated_at desc
  `;
  const [corpus] = await sql`
    select
      (select count(*)::integer from director_research_sources) as sources,
      (select count(*)::integer from director_scene_studies) as studies,
      (select count(*)::integer from director_scene_studies where status = 'approved') as approved_studies,
      (select count(*)::integer from director_research_jobs) as jobs,
      (select count(*)::integer from director_research_jobs where status in ('queued', 'running')) as active_jobs,
      (select count(*)::integer from director_evidence_manifests) as manifests,
      (select count(*)::integer from director_evidence_manifests where status = 'eligible') as eligible_manifests
  `;
  const queryFilter = process.argv.find((value) => value.startsWith("--query="))?.slice(8).toLowerCase();
  const providerFilter = process.argv.find((value) => value.startsWith("--provider="))?.slice(11).toLowerCase();
  const contractFilter = process.argv.find((value) => value.startsWith("--contract="))?.slice(11).toLowerCase();
  const filtered = rows.filter((row) => (!queryFilter || String(row.query_label).toLowerCase().includes(queryFilter))
    && (!providerFilter || String(row.provider).toLowerCase() === providerFilter)
    && (!contractFilter || String(row.contract_version).toLowerCase() === contractFilter));
  const summary = {
    byProvider: Object.entries(Object.groupBy(filtered, (row) => row.provider)).map(([provider, items]) => ({ provider, count: items?.length ?? 0 })),
    byStatus: Object.entries(Object.groupBy(filtered, (row) => row.status)).map(([status, items]) => ({ status, count: items?.length ?? 0 })),
    reusableNonSensitive: filtered.filter((row) => row.reuse_status === "reusable" && !row.culturally_sensitive).length,
  };
  console.log(JSON.stringify({ corpus, count: filtered.length, summary, records: filtered, linkedStudies, jobConstraints: constraints }, null, 2));
} finally {
  await sql.end();
}

import nextEnv from "@next/env";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is missing.");
const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, ssl: "require" });
try {
  const rows = await sql`
    select m.id, m.provider, m.kind, m.title, m.date_label, m.region,
           m.rights_label, m.reuse_status, m.status, m.culturally_sensitive,
           m.canonical_url, s.title as source_title
    from director_evidence_manifests m
    join director_research_sources s on s.id = m.source_id
    order by m.provider, m.title
  `;
  console.log(JSON.stringify({ count: rows.length, records: rows }, null, 2));
} finally {
  await sql.end();
}

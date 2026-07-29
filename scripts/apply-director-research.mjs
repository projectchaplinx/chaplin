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
  const [tables] = await sql`
    select
      to_regclass('public.director_research_sources')::text as sources,
      to_regclass('public.director_scene_studies')::text as studies
  `;
  if (!tables?.sources || !tables?.studies) {
    throw new Error("Director Brain research tables were not created.");
  }
  console.log("Director Brain research storage is active.");
} finally {
  await sql.end();
}

import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

async function sourceFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:[cm]?[jt]sx?)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

const files = [...await sourceFiles("src"), ...await sourceFiles("scripts")];
const destructive = [];
for (const file of files) {
  if (path.basename(file) === "verify-director-preservation.mjs") continue;
  const body = await fs.readFile(file, "utf8");
  const directDelete = /from\s*\(\s*["']director_[a-z_]+["']\s*\)\s*\.delete\s*\(/gi;
  const sqlDelete = /delete\s+from\s+(?:public\.)?director_[a-z_]+/gi;
  if (directDelete.test(body) || sqlDelete.test(body)) destructive.push(file);
}
if (destructive.length) throw new Error(`Director row deletion paths remain: ${destructive.join(", ")}`);

if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is required for the preservation proof.");
const db = postgres(process.env.SUPABASE_DB_URL, { ssl: "require", max: 1 });
try {
  const [state] = await db`
    select
      (select count(*)::integer from director_research_jobs) as jobs,
      (select count(*)::integer from director_research_jobs where cost_usd is null) as jobs_without_cost,
      (select count(*)::integer from director_research_cost_entries) as cost_entries,
      (select count(*)::integer from director_entity_revisions) as revisions,
      (select count(*)::integer from director_quarantine_assessments) as quarantine_assessments,
      (select count(*)::integer from information_schema.triggers
        where trigger_schema = 'public' and trigger_name = 'director_prevent_delete') as delete_guards,
      (select count(*)::integer from information_schema.triggers
        where trigger_schema = 'public' and trigger_name = 'director_projection_preservation') as projection_guards,
      (to_regclass('public.director_sprint_shot_tests') is not null
        and to_regclass('public.director_sprint_shot_scores') is not null) as sprint_test_storage_ready,
      (select count(*)::integer from information_schema.triggers
        where trigger_schema = 'public' and trigger_name in (
          'director_sprint_generation_ceiling', 'director_sprint_result_delete_guard',
          'director_sprint_test_update_guard'
        )) as sprint_test_guards
  `;
  if (state.jobs_without_cost !== 0) throw new Error(`${state.jobs_without_cost} research jobs still have no cost classification.`);
  if (state.cost_entries < state.jobs) throw new Error("The append-only cost ledger does not cover every research job.");
  if (state.delete_guards < 11 || state.projection_guards < 8) throw new Error("Director database preservation triggers are incomplete.");
  if (!state.sprint_test_storage_ready || state.sprint_test_guards !== 3) {
    throw new Error("Sprint 1 generation ceilings and preservation guards are incomplete.");
  }

  let deletionBlocked = false;
  try {
    await db.begin(async (tx) => {
      const [job] = await tx`select id from director_research_jobs order by created_at limit 1`;
      await tx`delete from director_research_jobs where id = ${job.id}`;
    });
  } catch (error) {
    deletionBlocked = /GPLC preservation contract/i.test(error instanceof Error ? error.message : String(error));
  }
  if (!deletionBlocked) throw new Error("A Director research row could be deleted.");
  console.log(JSON.stringify({ ...state, deletionBlocked, destructiveCodePaths: destructive.length }));
} finally {
  await db.end();
}

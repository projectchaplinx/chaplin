import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import {
  DIRECTOR_RESEARCH_CAMPAIGN,
  DIRECTOR_RESEARCH_CAMPAIGN_VERSION,
} from "@/lib/director-research-campaign";

loadEnvConfig(process.cwd());

if (!process.env.SUPABASE_DB_URL) {
  throw new Error("SUPABASE_DB_URL is missing.");
}

const sql = postgres(process.env.SUPABASE_DB_URL, {
  max: 1,
  ssl: "require",
});

async function main() {
try {
  for (const item of DIRECTOR_RESEARCH_CAMPAIGN) {
    const [existing] = await sql<{ id: string }[]>`
      select id
      from public.director_research_sources
      where source_url = ${item.sourceUrl}
         or (title = ${item.title} and institution = ${item.institution})
      limit 1
    `;
    if (existing) {
      await sql`
        update public.director_research_sources
        set
          title = ${item.title},
          institution = ${item.institution},
          source_url = ${item.sourceUrl},
          source_kind = ${item.sourceKind},
          rights_basis = ${item.rightsBasis},
          access_notes = ${item.accessNotes},
          campaign_id = ${DIRECTOR_RESEARCH_CAMPAIGN_VERSION},
          target_tags = ${item.targetTags},
          research_questions = ${sql.json(item.researchQuestions)},
          priority = ${item.priority},
          updated_by = 'system:director-research-campaign',
          last_verified_at = now(),
          updated_at = now()
        where id = ${existing.id}
      `;
      continue;
    }
    await sql`
      insert into public.director_research_sources (
        title,
        institution,
        source_url,
        source_kind,
        rights_basis,
        access_notes,
        campaign_id,
        target_tags,
        research_questions,
        priority,
        queue_status,
        updated_by,
        last_verified_at,
        created_by,
        updated_at
      ) values (
        ${item.title},
        ${item.institution},
        ${item.sourceUrl},
        ${item.sourceKind},
        ${item.rightsBasis},
        ${item.accessNotes},
        ${DIRECTOR_RESEARCH_CAMPAIGN_VERSION},
        ${item.targetTags},
        ${sql.json(item.researchQuestions)},
        ${item.priority},
        'queued',
        'system:director-research-campaign',
        now(),
        'system:director-research-campaign',
        now()
      )
    `;
  }

  const [summary] = await sql<{ source_count: number }[]>`
    select count(*)::int as source_count
    from public.director_research_sources
    where source_url in ${sql(DIRECTOR_RESEARCH_CAMPAIGN.map((item) => item.sourceUrl))}
  `;
  if (summary?.source_count !== DIRECTOR_RESEARCH_CAMPAIGN.length) {
    throw new Error(`Expected ${DIRECTOR_RESEARCH_CAMPAIGN.length} campaign sources, found ${summary?.source_count ?? 0}.`);
  }
  console.log(`Director Brain campaign ${DIRECTOR_RESEARCH_CAMPAIGN_VERSION} has ${summary.source_count} registered sources.`);
} finally {
  await sql.end();
}
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

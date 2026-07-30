import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { DIRECTOR_RESEARCH_STUDY_SEEDS } from "@/lib/director-research-seeds";

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
    for (const seed of DIRECTOR_RESEARCH_STUDY_SEEDS) {
      const [source] = await sql<{ id: string }[]>`
        select id
        from public.director_research_sources
        where source_url = ${seed.sourceUrl}
        limit 1
      `;
      if (!source) {
        throw new Error(`Research source is not seeded: ${seed.sourceUrl}`);
      }

      const [existing] = await sql<{ id: string; status: string }[]>`
        select id, status
        from public.director_scene_studies
        where source_id = ${source.id}
          and study_title = ${seed.studyTitle}
          and scene_locator = ${seed.sceneLocator}
        limit 1
      `;

      if (existing && (existing.status === "approved" || existing.status === "rejected")) {
        continue;
      }

      if (existing) {
        await sql`
          update public.director_scene_studies
          set
            work_title = ${seed.workTitle},
            duration_seconds = ${seed.durationSeconds},
            period_label = ${seed.periodLabel},
            region = ${seed.region},
            tags = ${seed.tags},
            observations = ${sql.json(seed.observations)},
            candidate_principles = ${sql.json(seed.candidatePrinciples)},
            limitations = ${seed.limitations},
            updated_at = now()
          where id = ${existing.id}
        `;
      } else {
        await sql`
          insert into public.director_scene_studies (
            source_id,
            study_title,
            work_title,
            scene_locator,
            duration_seconds,
            period_label,
            region,
            tags,
            observations,
            candidate_principles,
            limitations,
            status,
            created_by,
            updated_at
          ) values (
            ${source.id},
            ${seed.studyTitle},
            ${seed.workTitle},
            ${seed.sceneLocator},
            ${seed.durationSeconds},
            ${seed.periodLabel},
            ${seed.region},
            ${seed.tags},
            ${sql.json(seed.observations)},
            ${sql.json(seed.candidatePrinciples)},
            ${seed.limitations},
            'draft',
            'system:director-research-study-seed',
            now()
          )
        `;
      }

      await sql`
        update public.director_research_sources
        set
          queue_status = 'analyzed',
          updated_by = 'system:director-research-study-seed',
          updated_at = now()
        where id = ${source.id}
      `;
    }

    const seeded = await sql<{ study_title: string; scene_locator: string }[]>`
      select study_title, scene_locator
      from public.director_scene_studies
      where created_by = 'system:director-research-study-seed'
    `;
    const seedKeys = new Set(DIRECTOR_RESEARCH_STUDY_SEEDS.map((seed) => `${seed.studyTitle}\n${seed.sceneLocator}`));
    const found = seeded.filter((study) => seedKeys.has(`${study.study_title}\n${study.scene_locator}`));
    if (found.length !== DIRECTOR_RESEARCH_STUDY_SEEDS.length) {
      throw new Error(`Expected ${DIRECTOR_RESEARCH_STUDY_SEEDS.length} seeded studies, found ${found.length}.`);
    }
    console.log(`Director Brain has ${found.length} evidence-based draft scene ${found.length === 1 ? "study" : "studies"}.`);
  } finally {
    await sql.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

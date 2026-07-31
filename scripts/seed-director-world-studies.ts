import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

loadEnvConfig(process.cwd());
if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is missing.");

const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, ssl: "require" });

const studies = [
  {
    source: "Art of the Edo Period (1615–1868)",
    title: "Edo-period city, class, trade, and material context",
    locator: "Essay sections on social hierarchy, urban culture, and restricted trade",
    period: "Edo Japan, 1615–1868",
    region: "Edo, Kyoto, and Nagasaki, Japan",
    tags: ["period", "period-world", "production-design", "costume", "objects", "materials", "social-context", "edo", "japan"],
    observations: [
      ["section", "Social hierarchy and patronage", "The essay associates major creative patronage with artisans and merchants within a tightly controlled feudal hierarchy.", "Resolve class and occupation before assigning material wealth or cultural objects."],
      ["section", "Tea ceremony across classes", "Tea practice is described as a cross-class setting where older literary and artistic traditions were absorbed and transformed.", "Treat tea objects and spaces as occasion-specific, not universal background decoration."],
      ["section", "Kyoto, Edo, and Nagasaki distinctions", "The essay distinguishes Kyoto court and townsman culture, Edo urban culture after the 1657 fire, and restricted Chinese and Dutch trade through Nagasaki.", "Choose the city and decade before combining styles, imports, theater culture, or luxury goods."],
      ["object", "Dated objects in the essay slider", "The records span screens, lacquer, porcelain, instruments, costume, blades, prints, and wedding objects with specific dates and materials.", "Use item records only after checking date, function, class, and reuse rights."],
    ],
    principles: [
      "Resolve year, city, class, occupation, and occasion before selecting an Edo-period environment or costume.",
      "Keep Kyoto court and townsman culture, Edo urban theater and print culture, and Nagasaki trade influence distinct unless evidence supports their combination.",
      "Treat tea, performance, wedding, and martial objects as occasion- and role-specific rather than generic period decoration.",
      "Attach dated item records and material descriptions to production choices; do not generalize one museum object into everyday life.",
    ],
    limitations: "This Met essay is an art-historical overview centered on artistic production and selected museum objects. It does not comprehensively document ordinary housing, street infrastructure, weather, sound, food, labor, regional communities, or every social class. Item-level dating, function, and rights must be checked before visual reuse.",
  },
  {
    source: "Roman Housing",
    title: "Roman domestic space by class, labor, region, and public function",
    locator: "Essay sections on housing types, room functions, decoration, and furniture",
    period: "Roman Mediterranean, first century BCE to second century CE",
    region: "Italy and the wider Roman Mediterranean",
    tags: ["period", "period-world", "production-design", "architecture", "objects", "materials", "work", "domestic-life", "rome"],
    observations: [
      ["section", "Housing types and social scale", "The essay distinguishes hazardous urban insulae, rural farms and villages, seasonal worker rooms in industrial complexes, elite townhouses, and rural villas.", "Choose class, occupation, and settlement type before designing a Roman interior."],
      ["section", "Atrium, tablinum, and peristyle", "The text assigns public, reception, garden, and circulation functions to named spaces and notes regional variation between western garden courts and eastern paved courts.", "Block visitors, clients, household labor, and owners according to the function of the chosen space."],
      ["section", "Elite house as business and display", "Elite houses are described as residences and places of business where decoration communicated wealth, education, military achievement, and authority.", "Use display choices to communicate the owner’s public persona, not as free-floating ornament."],
      ["section", "Materials and movable furnishings", "The essay documents painted plaster, marble revetment, mosaics, stucco, couches, chests, tables, candelabra, tableware, and sculpture with room-specific uses.", "Select materials and furnishings by room function, wealth, region, and date."],
    ],
    principles: [
      "Do not use an elite Pompeian domus as a default Roman home; resolve class, occupation, settlement, and region first.",
      "Let the social function of atrium, reception room, courtyard, kitchen, dining room, or worker lodging determine blocking and access.",
      "For elite interiors, connect decoration and visible collections to public persona, patronage, education, or authority.",
      "Build one coherent, class-appropriate material scheme; do not combine every documented luxury in one room.",
    ],
    limitations: "The essay focuses strongly on archaeological evidence and elite domestic display, with shorter treatment of lower-income and worker housing. Its examples range across several centuries and regions, so no object, room plan, or decorative scheme should be transferred to a first-century scene without date, location, class, and function checks.",
  },
  {
    source: "The Mughal Court and the Art of Observation",
    title: "Mughal court patronage, observation, materials, and regional exchange",
    locator: "Unit 5, Chapter 4, pages 46–56",
    period: "Mughal India, 1605–1658",
    region: "Agra, Delhi, Lahore, and the Mughal court",
    tags: ["period", "period-world", "production-design", "costume", "objects", "materials", "court", "mughal", "india", "1600s"],
    observations: [
      ["page", "46–47", "The chapter centers Jahangir and Shah Jahan and links their distinct patronage to court art, architecture, gifts, and study of the natural world.", "Specify ruler, decade, rank, and court purpose before selecting a visual language."],
      ["page", "47", "European botanical albums entered through merchants and influenced court painting alongside Persian and Indian traditions.", "Represent exchange as attributed and court-specific, not as a generic fusion aesthetic."],
      ["page", "47", "Shah Jahan’s patronage is associated with paintings, jewel-encrusted objects, textiles, palace and mausoleum architecture, and naturalistic botanical carving.", "Use precious materials and botanical imagery only for a rank and setting that justify them."],
      ["page", "49–53", "The featured album, gemstone, animal, and botanical works are tied to private imperial study, court activity, royal hunts, workshops, and close observation.", "Choose an object’s function and audience before placing it in a scene."],
    ],
    principles: [
      "Resolve ruler, year, court, rank, and occasion before choosing Mughal architecture, textiles, jewelry, vessels, albums, or botanical motifs.",
      "Treat Persian, European, and Indian influences as documented exchanges within specific court practices, not a generic blended preset.",
      "Reserve jewel-encrusted objects, precious textiles, imperial albums, and monumental botanical programs for contexts whose patronage and rank support them.",
      "Give albums, natural-history studies, gifts, hunting objects, and court portraits a specific function and audience in the scene.",
    ],
    limitations: "This educational chapter focuses on elite imperial patronage under Jahangir and Shah Jahan and selected Met objects. It does not represent all Mughal subjects, regions, occupations, faith communities, domestic spaces, or everyday clothing. Production use must separately verify location, rank, gender, occasion, workshop provenance, and date; object images are not ingested or redistributed.",
  },
] as const;

function observations(rows: typeof studies[number]["observations"]) {
  return rows.map(([kind, value, evidence, inference]) => ({
    locator: { kind, value },
    evidence,
    craft: "historical production evidence",
    transition: "time, place, role, and function constrain the choice",
    narrativeJob: "prevent generic period shorthand",
    inference,
    confidence: "high",
    audioEvidence: "",
    soundFunction: "",
  }));
}

async function main() {
try {
  for (const study of studies) {
    const [source] = await sql<{ id: string }[]>`select id from director_research_sources where title = ${study.source} limit 1`;
    if (!source) throw new Error(`Missing research source: ${study.source}`);
    const [saved] = await sql<{ id: string }[]>`
      insert into director_scene_studies (
        source_id, study_title, work_title, scene_locator, period_label, region,
        tags, observations, candidate_principles, limitations, status,
        review_notes, created_by, reviewed_by, reviewed_at, updated_at
      ) values (
        ${source.id}, ${study.title}, ${study.source}, ${study.locator}, ${study.period}, ${study.region},
        ${study.tags}, ${sql.json(observations(study.observations))}, ${sql.json(study.principles)}, ${study.limitations}, 'approved',
        'Approved after direct review of the authoritative Met source. Evidence locators, class and regional boundaries, and limitations are explicit.',
        'codex-primary-source-review', 'codex-primary-source-review', now(), now()
      )
      on conflict (source_id, study_title, scene_locator) do update set
        period_label = excluded.period_label,
        region = excluded.region,
        tags = excluded.tags,
        observations = excluded.observations,
        candidate_principles = excluded.candidate_principles,
        limitations = excluded.limitations,
        status = 'approved',
        review_notes = excluded.review_notes,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = now(),
        updated_at = now()
      returning id
    `;
    await sql`update director_research_sources set queue_status = 'analyzed', updated_by = 'codex-primary-source-review', last_verified_at = now(), updated_at = now() where id = ${source.id}`;
    await sql`update director_research_jobs set status = 'succeeded', phase = 'manual-primary-source-review', progress = 100, message = 'Primary source reviewed and approved', output = jsonb_build_object('studyId', ${saved.id}::text), error_message = null, completed_at = now(), updated_at = now() where source_id = ${source.id} and status = 'failed'`;
  }
  console.log(`Approved ${studies.length} primary-source world studies.`);
} finally {
  await sql.end();
}
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

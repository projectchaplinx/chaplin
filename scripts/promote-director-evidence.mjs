import nextEnv from "@next/env";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is missing.");
const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, ssl: "require" });
const reviewer = "codex-item-evidence-review-2026-07-31";
const selectedTitles = [
  "Contemporary Kimono Patterns (Tōsei hiinagata) 当世ひいな形",
  "Kimono (Shijira)",
  "Kimono Rack (Ikō) with Scrolling Foliage and Tokugawa Family Crest",
  "Sashiko Kimono",
  "Unlined Summer Kimono (Hito-e) with Landscape and Poem",
];

try {
  await sql.begin(async (tx) => {
    const manifests = await tx`
      select m.*, s.id as source_id
      from director_evidence_manifests m
      join director_research_sources s on s.id = m.source_id
      where m.provider = 'met'
        and m.title = any(${selectedTitles})
        and m.reuse_status = 'reusable'
        and m.culturally_sensitive = false
      order by m.title
    `;
    if (manifests.length < 4) throw new Error(`Expected at least four reviewable Edo garment records; found ${manifests.length}.`);
    await tx`
      update director_evidence_manifests
      set status = 'eligible', review_notes = 'Item metadata, Open Access status, period relevance, and non-sensitive context reviewed. Eligible as evidence, with study limitations retained.',
          reviewed_by = ${reviewer}, reviewed_at = now(), updated_at = now()
      where id = any(${manifests.map((item) => item.id)}::uuid[])
    `;
    const observations = manifests.map((item) => ({
      locator: { kind: "object", value: item.record_locator },
      evidence: `${item.title}; ${item.date_label || "date unresolved"}; ${String(item.facets?.objectType || "object type unresolved")}; ${String(item.facets?.medium || "medium unresolved")}.`,
      craft: "Costume and production-design reference with item-level date and material metadata.",
      transition: "Not a shot transition; this evidence constrains design selection before image generation.",
      narrativeJob: "Ground a resolved Edo-period role and occasion in attributable garment or storage evidence.",
      inference: "Use the documented date, object type, and medium as a constraint; do not copy the object or generalize it to every class, region, gender, or occasion.",
      confidence: "medium",
      audioEvidence: "",
      soundFunction: "",
    }));
    const locator = `Met objects ${manifests.map((item) => item.external_id).join(", ")}`;
    const [study] = await tx`
      insert into director_scene_studies (
        source_id, study_title, work_title, scene_locator, period_label, region, tags,
        observations, candidate_principles, limitations, review_notes, status,
        created_by, reviewed_by, reviewed_at, updated_at
      ) values (
        ${manifests[0].source_id},
        'Edo garment and kimono material evidence',
        'Met Collection item-level Edo garment records',
        ${locator},
        'Japan, 1677 to mid-19th century',
        'Japan',
        ${['period','costume','production-design','edo','japan','kimono','materials']},
        ${tx.json(observations)},
        ${tx.json([
          'Resolve year range, season, role, class, gender presentation, region, and occasion before selecting a kimono silhouette, textile, or pattern.',
          'Treat a pattern book, print, garment, and garment rack as different kinds of evidence; none alone proves universal everyday dress.',
          'Carry garment construction, layering, wear, and storage consistently across adjacent shots instead of using a generic Japan preset.',
        ])},
        'The selected Met records are Open Access item evidence, but the set is small and institutionally collected. It does not represent all Edo regions, classes, genders, occupations, seasons, or daily contexts. Pattern books and prints show designed or depicted possibilities, not population frequency. Verify the exact production brief against additional local and social-history evidence.',
        'Approved after item-level rights and context review. Principles are deliberately bounded and do not authorize copying item imagery.',
        'approved', ${reviewer}, ${reviewer}, now(), now()
      )
      on conflict (source_id, study_title, scene_locator)
      do update set observations = excluded.observations, candidate_principles = excluded.candidate_principles,
        limitations = excluded.limitations, review_notes = excluded.review_notes, status = 'approved',
        reviewed_by = excluded.reviewed_by, reviewed_at = now(), updated_at = now()
      returning id
    `;
    for (const manifest of manifests) await tx`
      insert into director_study_evidence_manifests (study_id, manifest_id)
      values (${study.id}, ${manifest.id}) on conflict do nothing
    `;
    console.log(JSON.stringify({ studyId: study.id, approvedEvidence: manifests.map((item) => ({ id: item.id, title: item.title, url: item.canonical_url })) }, null, 2));
  });
} finally { await sql.end(); }

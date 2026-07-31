import nextEnv from "@next/env";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is missing.");
const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, ssl: "require" });
const reviewer = "codex-item-evidence-review-2026-07-31";

const groups = [{
  key: "early-modern-india-textiles",
  manifestIds: [
    "111845b5-11db-44f1-976e-5d96fa8725d4",
    "589335c8-49e6-436d-b0b1-b003ccedb153",
    "3e5bf3f5-0eee-43e1-9e7a-d194ec48f675",
    "3f522003-6017-41ee-8aae-4cc7b01eeb99",
    "6a1645ec-12fa-4a9e-8c34-b8654eeab704",
    "12864ad1-df82-4f9f-a164-2dcb06cbd88c",
    "382ace94-4dfc-45f0-bd3d-d3408f4a6d1c",
  ],
  studyTitle: "Early-modern Indian textile material evidence",
  workTitle: "Met Collection item-level Indian textile records",
  periodLabel: "India, 17th to 18th century",
  region: "India",
  tags: ["period", "costume", "production-design", "india", "textile", "materials", "early-modern"],
  principles: [
    "Resolve place, date range, role, class, occupation, season, and occasion before turning textile evidence into a garment decision.",
    "Carry documented fiber, weave, dye, and metallic-thread choices consistently across wardrobe, props, and adjacent shots.",
    "Treat fragments as material evidence only; they do not prove a complete silhouette, social frequency, or everyday use.",
  ],
  limitations: "These seven Open Access Met records are textile fragments attributed to India from the seventeenth and eighteenth centuries. They support bounded material, weave, dye, and fiber choices, but do not establish complete garments, exact regional origin, class, occupation, gender presentation, occasion, or population frequency. Additional social-history and local evidence is required for a resolved scene.",
}];

try {
  const output = [];
  await sql.begin(async (tx) => {
    for (const group of groups) {
      const manifests = await tx`
        select m.*, s.id as source_id, j.contract_version
        from director_evidence_manifests m
        join director_research_sources s on s.id = m.source_id
        join director_research_jobs j on j.id = m.research_job_id
        where m.id = any(${group.manifestIds}::uuid[])
          and m.reuse_status = 'reusable'
          and m.culturally_sensitive = false
          and j.contract_version = '2026-07-31.gap-5'
        order by m.date_label, m.id
      `;
      if (manifests.length !== group.manifestIds.length) throw new Error(`${group.key}: expected ${group.manifestIds.length} reviewed manifests; found ${manifests.length}.`);
      if (new Set(manifests.map((item) => item.source_id)).size !== 1) throw new Error(`${group.key}: evidence must share one authoritative source.`);

      await tx`
        update director_evidence_manifests
        set status = 'eligible',
            review_notes = 'Rights, date, geography, object type, material metadata, and cultural-sensitivity flags reviewed. Eligible only within the linked study limitations.',
            reviewed_by = ${reviewer}, reviewed_at = now(), updated_at = now()
        where id = any(${group.manifestIds}::uuid[])
      `;
      const observations = manifests.map((item) => ({
        locator: { kind: "object", value: item.record_locator },
        evidence: `${item.title}; ${item.date_label}; ${String(item.facets?.objectType || "textile fragment")}; ${String(item.facets?.medium || "medium unresolved")}.`,
        craft: "Item-level material and production-design evidence.",
        transition: "Not a shot transition; this constrains design selection before image generation.",
        narrativeJob: "Ground a resolved early-modern Indian material world in attributable textile evidence.",
        inference: "Use only the documented date, geography, object type, and medium; do not infer a complete garment or universal social practice.",
        confidence: "medium",
        audioEvidence: "",
        soundFunction: "",
      }));
      const locator = `Met objects ${manifests.map((item) => item.external_id).join(", ")}`.slice(0, 240);
      const [study] = await tx`
        insert into director_scene_studies (
          source_id, study_title, work_title, scene_locator, period_label, region, tags,
          observations, candidate_principles, limitations, review_notes, status,
          created_by, reviewed_by, reviewed_at, updated_at
        ) values (
          ${manifests[0].source_id}, ${group.studyTitle}, ${group.workTitle}, ${locator},
          ${group.periodLabel}, ${group.region}, ${group.tags}, ${tx.json(observations)},
          ${tx.json(group.principles)}, ${group.limitations},
          'Evidence group reviewed; awaiting a separate approval transition before retrieval.',
          'reviewed', ${reviewer}, ${reviewer}, now(), now()
        )
        on conflict (source_id, study_title, scene_locator)
        do update set observations = excluded.observations, candidate_principles = excluded.candidate_principles,
          limitations = excluded.limitations, review_notes = excluded.review_notes,
          status = case when director_scene_studies.status in ('approved', 'rejected') then director_scene_studies.status else 'reviewed' end,
          reviewed_by = excluded.reviewed_by, reviewed_at = now(), updated_at = now()
        returning id, status
      `;
      for (const manifest of manifests) await tx`
        insert into director_study_evidence_manifests (study_id, manifest_id)
        values (${study.id}, ${manifest.id}) on conflict do nothing
      `;
      output.push({ key: group.key, studyId: study.id, status: study.status, evidenceCount: manifests.length });
    }
  });
  console.log(JSON.stringify(output, null, 2));
} finally {
  await sql.end();
}

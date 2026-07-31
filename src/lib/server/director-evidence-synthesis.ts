import "server-only";

import { assertResearchTextIsAnalytical } from "@/lib/director-research";
import { validateEvidenceSynthesisGroup } from "@/lib/director-evidence-manifest";
import { createOpenAIResponse, openAIWritingModel } from "@/lib/server/openai-responses";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

const SYNTHESIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["studyTitle", "workTitle", "periodLabel", "region", "tags", "observations", "candidatePrinciples", "limitations"],
  properties: {
    studyTitle: { type: "string" }, workTitle: { type: "string" }, periodLabel: { type: "string" }, region: { type: "string" },
    tags: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 20 },
    observations: { type: "array", minItems: 1, maxItems: 24, items: { type: "object", additionalProperties: false,
      required: ["manifestId", "evidence", "craft", "narrativeJob", "inference", "confidence"],
      properties: { manifestId: { type: "string" }, evidence: { type: "string" }, craft: { type: "string" }, narrativeJob: { type: "string" }, inference: { type: "string" }, confidence: { type: "string", enum: ["low", "medium", "high"] } },
    } },
    candidatePrinciples: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
    limitations: { type: "string" },
  },
} as const;

type SynthesisOutput = {
  studyTitle: string; workTitle: string; periodLabel: string; region: string; tags: string[];
  observations: Array<{ manifestId: string; evidence: string; craft: string; narrativeJob: string; inference: string; confidence: "low" | "medium" | "high" }>;
  candidatePrinciples: string[]; limitations: string;
};

export async function synthesizeDirectorEvidenceStudy(manifestIds: string[], userId: string) {
  const ids = [...new Set(manifestIds.map((id) => id.trim()).filter(Boolean))].slice(0, 12);
  if (!ids.length) throw new Error("Choose at least one eligible evidence record.");
  const supabase = getSupabaseAdminClient();
  const manifests = await supabase.from("director_evidence_manifests").select("*").in("id", ids);
  if (manifests.error) throw new Error(`Load evidence for synthesis: ${manifests.error.message}`);
  if ((manifests.data ?? []).length !== ids.length) throw new Error("Every selected evidence record must still exist.");
  const rows = manifests.data ?? [];
  validateEvidenceSynthesisGroup(rows.map((row) => ({ sourceId: String(row.source_id), status: row.status, reuseStatus: row.reuse_status, culturallySensitive: Boolean(row.culturally_sensitive) })));
  const existingLinks = await supabase.from("director_study_evidence_manifests").select("manifest_id").in("manifest_id", ids);
  if (existingLinks.error) throw new Error(`Check existing evidence links: ${existingLinks.error.message}`);
  if (existingLinks.data?.length) throw new Error("At least one selected record already supports a Director Brain study.");
  const sourceResult = await supabase.from("director_research_sources").select("*").eq("id", rows[0].source_id).single();
  if (sourceResult.error || !sourceResult.data) throw new Error(sourceResult.error?.message ?? "Research source not found.");
  const source = sourceResult.data;
  const evidence = rows.map((row) => ({
    manifestId: row.id, locator: row.record_locator, title: row.title, date: row.date_label, region: row.region,
    tags: row.tags, facets: row.facets, rights: row.rights_label, reviewNotes: row.review_notes,
  }));
  const model = openAIWritingModel(process.env.OPENAI_RESEARCH_MODEL);
  const result = await createOpenAIResponse({
    model,
    instructions: [
      "You synthesize a draft Director Brain evidence study from human-eligible collection records.",
      "Use only supplied fields. Never invent a complete costume, building, social practice, frequency, class, occupation, or scene from an isolated object record.",
      "Every observation must cite exactly one supplied manifestId and paraphrase attributable metadata rather than copy expressive text.",
      "Separate observable evidence from production inference. Make limitations specific and conservative.",
      "Candidate principles are untrusted drafts. They cannot enter production until a separate human review and approval.",
    ].join("\n"),
    messages: [{ role: "user", content: JSON.stringify({ source: { title: source.title, institution: source.institution, rightsBasis: source.rights_basis, targetTags: source.target_tags }, eligibleEvidence: evidence }) }],
    maxOutputTokens: 5000, schema: SYNTHESIS_SCHEMA, schemaName: "director_evidence_study",
  });
  const output = JSON.parse(result.text) as SynthesisOutput;
  const allowedIds = new Set(ids);
  if (!output.observations.length || output.observations.some((observation) => !allowedIds.has(observation.manifestId))) {
    throw new Error("OpenAI synthesis cited evidence outside the selected manifest group.");
  }
  assertResearchTextIsAnalytical(JSON.stringify(output));
  const now = new Date().toISOString();
  const inserted = await supabase.from("director_scene_studies").insert({
    source_id: rows[0].source_id,
    study_title: output.studyTitle.trim().slice(0, 180), work_title: output.workTitle.trim().slice(0, 180),
    scene_locator: rows.map((row) => row.record_locator).join("; ").slice(0, 240), duration_seconds: null,
    period_label: output.periodLabel.trim().slice(0, 120), region: output.region.trim().slice(0, 180),
    tags: [...new Set(output.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 30),
    observations: output.observations.map((observation) => ({
      locator: { kind: "object", value: rows.find((row) => row.id === observation.manifestId)?.record_locator ?? observation.manifestId },
      evidence: observation.evidence, craft: observation.craft, transition: "Not a timed transition; evidence constrains production design before generation.",
      narrativeJob: observation.narrativeJob, inference: observation.inference, confidence: observation.confidence,
      audioEvidence: "", soundFunction: "",
    })),
    candidate_principles: output.candidatePrinciples, limitations: output.limitations,
    review_notes: "Machine-synthesized from human-eligible item records; awaiting separate human study review.",
    status: "draft", created_by: userId, updated_at: now,
  }).select("id").single();
  if (inserted.error || !inserted.data) throw new Error(`Create evidence study draft: ${inserted.error?.message ?? "No study returned."}`);
  const studyId = String(inserted.data.id);
  const linked = await supabase.from("director_study_evidence_manifests").insert(ids.map((manifestId) => ({ study_id: studyId, manifest_id: manifestId })));
  if (linked.error) {
    await supabase.from("director_scene_studies").delete().eq("id", studyId);
    throw new Error(`Link study evidence: ${linked.error.message}`);
  }
  return { studyId, model, providerResponseId: result.data.id ?? null, evidenceCount: ids.length, observationCount: output.observations.length };
}

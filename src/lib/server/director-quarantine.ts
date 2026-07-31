import "server-only";

import {
  evidenceQuarantineReasons,
  explicitPrincipleContradictions,
  type DirectorQuarantineAssessment,
} from "@/lib/director-quarantine";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

type AssessmentRow = {
  id: number | string;
  entity_kind: DirectorQuarantineAssessment["entityKind"];
  entity_id: string;
  rule_key: string;
  reason: string;
  evidence: Record<string, unknown> | null;
  created_at: string;
};

function fromRow(row: AssessmentRow): DirectorQuarantineAssessment {
  return {
    id: String(row.id), entityKind: row.entity_kind, entityId: row.entity_id,
    ruleKey: row.rule_key, reason: row.reason, evidence: row.evidence ?? {}, createdAt: row.created_at,
  };
}

export async function syncDirectorQuarantineAssessments() {
  const supabase = getSupabaseAdminClient();
  const [manifestResult, studyResult] = await Promise.all([
    supabase.from("director_evidence_manifests").select("id,reuse_status,culturally_sensitive,content_hash"),
    supabase.from("director_scene_studies").select("id,study_title,candidate_principles,status"),
  ]);
  const error = manifestResult.error ?? studyResult.error;
  if (error) {
    if (/director_quarantine_assessments|director_evidence_manifests|schema cache|does not exist/i.test(error.message)) return { storageReady: false, inserted: 0 };
    throw new Error(`Assess Director Brain quarantine: ${error.message}`);
  }
  const manifests = manifestResult.data ?? [];
  const hashCounts = new Map<string, number>();
  for (const manifest of manifests) {
    if (manifest.content_hash) hashCounts.set(manifest.content_hash, (hashCounts.get(manifest.content_hash) ?? 0) + 1);
  }
  const studies = studyResult.data ?? [];
  const approved = studies.filter((study) => study.status === "approved").map((study) => ({
    id: String(study.id), studyTitle: String(study.study_title),
    candidatePrinciples: Array.isArray(study.candidate_principles) ? study.candidate_principles.filter((value): value is string => typeof value === "string") : [],
  }));
  const rows = [
    ...manifests.flatMap((manifest) => evidenceQuarantineReasons({
      reuseStatus: manifest.reuse_status,
      culturallySensitive: Boolean(manifest.culturally_sensitive),
      contentHash: manifest.content_hash ?? "",
    }, hashCounts.get(manifest.content_hash ?? "") ?? 1).map((assessment) => ({
      entity_kind: "evidence", entity_id: manifest.id, rule_key: assessment.ruleKey,
      reason: assessment.reason, evidence: { contentHash: manifest.content_hash ?? null },
    }))),
    ...studies.filter((study) => study.status === "draft" || study.status === "reviewed").flatMap((study) => {
      const principles = Array.isArray(study.candidate_principles) ? study.candidate_principles.filter((value): value is string => typeof value === "string") : [];
      return explicitPrincipleContradictions(principles, approved).map((assessment) => ({
        entity_kind: "study", entity_id: study.id, rule_key: assessment.ruleKey,
        reason: assessment.reason, evidence: assessment.evidence,
      }));
    }),
  ];
  if (!rows.length) return { storageReady: true, inserted: 0 };
  const saved = await supabase.from("director_quarantine_assessments").upsert(rows, {
    onConflict: "entity_kind,entity_id,rule_key",
    ignoreDuplicates: true,
  }).select("id");
  if (saved.error) {
    if (/director_quarantine_assessments|schema cache|does not exist/i.test(saved.error.message)) return { storageReady: false, inserted: 0 };
    throw new Error(`Save Director Brain quarantine: ${saved.error.message}`);
  }
  return { storageReady: true, inserted: saved.data?.length ?? 0 };
}

export async function listDirectorQuarantineAssessments() {
  const sync = await syncDirectorQuarantineAssessments();
  if (!sync.storageReady) return { storageReady: false, assessments: [] as DirectorQuarantineAssessment[] };
  const result = await getSupabaseAdminClient().from("director_quarantine_assessments")
    .select("*").order("created_at", { ascending: false }).limit(1000);
  if (result.error) throw new Error(`Load Director Brain quarantine: ${result.error.message}`);
  return { storageReady: true, assessments: ((result.data ?? []) as AssessmentRow[]).map(fromRow) };
}


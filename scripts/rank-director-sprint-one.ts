import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import postgres from "postgres";
import {
  DIRECTOR_SPRINT_ONE_KEY,
  DIRECTOR_SPRINT_ONE_TRIAGE_KEY,
  finalizeDirectorSprintTriage,
  type DirectorCharacterAxis,
  type ProposedDirectorPrincipleAssessment,
} from "../src/lib/director-sprint-one";

loadEnvConfig(process.cwd());
const databaseUrl = process.env.SUPABASE_DB_URL;
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_RESEARCH_MODEL?.trim() || process.env.OPENAI_WRITING_MODEL?.trim() || "gpt-5.6-terra";
if (!databaseUrl) throw new Error("SUPABASE_DB_URL is missing.");
if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");
const sql = postgres(databaseUrl, { ssl: "require", max: 1 });

type Row = {
  study_id: string;
  timed_media_analysis_id: string | null;
  playback_status: "required" | "verified" | "rejected" | null;
  study_title: string;
  work_title: string;
  source_title: string;
  source_url: string | null;
  principle_index: number;
  principle_text: string;
  principle_hash: string;
  lane: "discard" | "park" | "candidate";
  character_axis: DirectorCharacterAxis;
  agreement_key: string;
  confidence: "low" | "medium" | "high";
  rationale: string;
  rejection_reason: string;
  source_strength: "motion-verified" | "contact-sheet-only" | "document";
  character_axis_score: number;
  cross_study_agreement: number;
  production_reach: number;
  model: string;
  response_id: string | null;
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "characterAxis", "characterRelevance", "productionReach", "hypothesisKey", "rankingRationale"],
        properties: {
          ref: { type: "string" },
          characterAxis: { type: "string", enum: ["identity", "performance", "framing", "blocking", "other"] },
          characterRelevance: { type: "integer", minimum: 0, maximum: 100 },
          productionReach: { type: "integer", minimum: 0, maximum: 5 },
          hypothesisKey: { type: "string", minLength: 3, maxLength: 80 },
          rankingRationale: { type: "string" },
        },
      },
    },
  },
} as const;

function outputText(data: { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("");
}

async function main() {
  try {
    const existing = await sql`select id from director_sprint_runs where sprint_key = ${DIRECTOR_SPRINT_ONE_KEY} and status = 'succeeded' limit 1`;
    if (existing.length) {
      console.log(JSON.stringify({ reused: true, runId: existing[0]?.id }));
      return;
    }
    const rows = await sql<Row[]>`
      select assessment.study_id, assessment.timed_media_analysis_id, timed.playback_status,
        study.study_title, study.work_title, source.title as source_title, source.source_url,
        assessment.principle_index, assessment.principle_text, assessment.principle_hash,
        assessment.lane, assessment.character_axis, assessment.agreement_key, assessment.confidence,
        assessment.rationale, assessment.rejection_reason, assessment.source_strength,
        assessment.character_axis_score, assessment.cross_study_agreement,
        assessment.production_reach, assessment.model, assessment.response_id
      from director_principle_assessments assessment
      join director_scene_studies study on study.id = assessment.study_id
      join director_research_sources source on source.id = study.source_id
      left join director_timed_media_analyses timed on timed.id = assessment.timed_media_analysis_id
      where assessment.sprint_key = ${DIRECTOR_SPRINT_ONE_TRIAGE_KEY}
      order by assessment.principle_hash
    `;
    if (rows.length !== 282) throw new Error(`The preserved D1 run has ${rows.length} principles; expected 282.`);
    const candidates = rows.filter((row) => row.lane === "candidate");
    const requestItems = candidates.map((row) => ({
      ref: row.principle_hash.slice(0, 16),
      principle: row.principle_text,
      proposedAxis: row.character_axis,
      agreementGroup: row.agreement_key,
      independentStudies: row.cross_study_agreement + 1,
      sourceStrength: row.source_strength,
      work: row.work_title,
    }));
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "none" },
        max_output_tokens: 7000,
        instructions: `Re-rank the complete Sprint 1 candidate digest for Chaplin's character marketplace. Return every ref exactly once. This is text-only ranking; do not claim to have watched source footage.

Character relevance is the dominant weight. Score direct usefulness to a 4-5 second marketplace character shot:
- 90-100 identity continuity only when the rule explicitly protects the same face, wardrobe, prop state, or reference identity across generated shots. Tonal contrast, emblems, machinery, or a single garment description are not identity continuity.
- 75-89 performance: objective, tactic change, reaction, readable gaze, or believable micro-action.
- 60-74 face/framing: the face, hands, or relationship reads better because of a specific framing choice.
- 45-59 blocking: spatial position, screen direction, or action path becomes legible.
- 0-44 weak, generic, misclassified, or not character-serving enough for a production test.

Correct characterAxis when the proposed label is wrong. productionReach is 0-5. Do not reward repetition by itself; independent-study agreement is a secondary signal already computed outside this call. hypothesisKey must be a short kebab-case description of the exact testable production hypothesis; assign the same key only to genuine near-duplicates. rankingRationale must explain the concrete character-production value or weakness.`,
        input: [{ role: "user", content: JSON.stringify(requestItems) }],
        text: { format: { type: "json_schema", name: "director_sprint_one_ranking", strict: true, schema } },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const data = await response.json() as {
      id?: string;
      error?: { message?: string };
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    if (!response.ok) throw new Error(data.error?.message ?? `OpenAI returned ${response.status}.`);
    const parsed = JSON.parse(outputText(data)) as { items?: Array<{ ref: string; characterAxis: DirectorCharacterAxis; characterRelevance: number; productionReach: number; hypothesisKey: string; rankingRationale: string }> };
    const rankedItems = parsed.items ?? [];
    const expected = new Set(requestItems.map((item) => item.ref));
    const actual = new Set(rankedItems.map((item) => item.ref));
    if (rankedItems.length !== candidates.length || actual.size !== expected.size || [...expected].some((ref) => !actual.has(ref))) {
      throw new Error("Ranking model did not return every candidate exactly once.");
    }
    const rankedByRef = new Map(rankedItems.map((item) => [item.ref, item]));
    const proposed: ProposedDirectorPrincipleAssessment[] = rows.map((row) => {
      const ranking = rankedByRef.get(row.principle_hash.slice(0, 16));
      return {
        studyId: row.study_id,
        timedMediaAnalysisId: row.timed_media_analysis_id,
        playbackStatus: row.playback_status,
        playbackStartSecond: null,
        playbackDurationSeconds: null,
        studyTitle: row.study_title,
        workTitle: row.work_title,
        sourceTitle: row.source_title,
        sourceUrl: row.source_url,
        principleIndex: row.principle_index,
        principleText: row.principle_text,
        principleHash: row.principle_hash,
        lane: row.lane,
        characterAxis: ranking?.characterAxis ?? row.character_axis,
        agreementKey: ranking?.hypothesisKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || row.agreement_key,
        confidence: row.confidence,
        rationale: ranking ? `${row.rationale} D2 ranking: ${ranking.rankingRationale}`.slice(0, 1200) : row.rationale,
        rejectionReason: row.rejection_reason,
        sourceStrength: row.source_strength,
        characterAxisScore: ranking ? Math.max(0, Math.min(100, Math.round(ranking.characterRelevance))) : row.character_axis_score,
        crossStudyAgreement: row.cross_study_agreement,
        productionReach: ranking ? Math.max(0, Math.min(5, Math.round(ranking.productionReach))) : row.production_reach,
        model: ranking ? model : row.model,
        responseId: ranking ? data.id ?? null : row.response_id,
      };
    });
    const finalized = finalizeDirectorSprintTriage(proposed);
    const shortlist = finalized.filter((item) => item.shortlistRank != null);
    const shortlistAxes = new Set(shortlist.map((item) => item.characterAxis));
    if (shortlist.length !== 5 || shortlistAxes.size < 3) throw new Error("Amendment 1 requires five shortlist items spanning at least three axes.");
    for (const axis of shortlistAxes) {
      if (shortlist.filter((item) => item.characterAxis === axis).length > 2) throw new Error(`Amendment 1 permits at most two ${axis} shortlist items.`);
    }
    if (new Set(shortlist.map((item) => `${item.characterAxis}:${item.agreementKey}`)).size !== shortlist.length) {
      throw new Error("Amendment 1 forbids near-duplicate shortlist hypotheses.");
    }
    const counts = {
      discard: finalized.filter((item) => item.lane === "discard").length,
      park: finalized.filter((item) => item.lane === "park").length,
      candidate: finalized.filter((item) => item.lane === "candidate").length,
    };
    const usage = { inputTokens: Number(data.usage?.input_tokens ?? 0), outputTokens: Number(data.usage?.output_tokens ?? 0), sourceSprint: DIRECTOR_SPRINT_ONE_TRIAGE_KEY };
    const costUsd = ((usage.inputTokens * Number(process.env.OPENAI_TERRA_INPUT_USD_PER_MILLION_TOKENS ?? "2.5")) + (usage.outputTokens * Number(process.env.OPENAI_TERRA_OUTPUT_USD_PER_MILLION_TOKENS ?? "15"))) / 1_000_000;
    const corpusHash = createHash("sha256").update(rows.map((row) => `${row.study_id}:${row.principle_hash}`).join("\n")).digest("hex");
    const runId = await sql.begin(async (tx) => {
      const [run] = await tx`
        insert into director_sprint_runs (
          sprint_key, status, model, corpus_hash, principle_count, discard_count, park_count,
          candidate_count, response_ids, usage, cost_usd, created_by
        ) values (
          ${DIRECTOR_SPRINT_ONE_KEY}, 'succeeded', ${model}, ${corpusHash}, ${rows.length},
          ${counts.discard}, ${counts.park}, ${counts.candidate}, ${data.id ? [data.id] : []},
          ${tx.json(usage)}, ${costUsd}, 'codex-sprint-one-ranking'
        ) returning id
      `;
      for (const item of finalized) {
        await tx`
          insert into director_principle_assessments (
            sprint_run_id, sprint_key, study_id, timed_media_analysis_id, principle_index,
            principle_text, principle_hash, lane, character_axis, agreement_key, confidence,
            rationale, rejection_reason, source_strength, character_axis_score,
            cross_study_agreement, production_reach, rank_score, candidate_rank,
            shortlist_rank, model, response_id
          ) values (
            ${run.id}, ${DIRECTOR_SPRINT_ONE_KEY}, ${item.studyId}, ${item.timedMediaAnalysisId},
            ${item.principleIndex}, ${item.principleText}, ${item.principleHash}, ${item.lane},
            ${item.characterAxis}, ${item.agreementKey}, ${item.confidence}, ${item.rationale},
            ${item.rejectionReason}, ${item.sourceStrength}, ${item.characterAxisScore},
            ${item.crossStudyAgreement}, ${item.productionReach}, ${item.rankScore},
            ${item.candidateRank}, ${item.shortlistRank}, ${item.model}, ${item.responseId}
          )
        `;
      }
      await tx`
        insert into director_coverage_findings (
          sprint_run_id, finding_key, axis, title, finding, cause, next_method, evidence
        ) values (
          ${run.id}, 'sprint-1-identity-method-gap', 'identity',
          'Contact sheets cannot teach identity persistence',
          'The corpus contains only three identity-labeled principles among 282, and stricter review reduces rather than expands that set. The gap is real and must not be padded with mislabeled framing or wardrobe-description rules.',
          'A 12-frame contact sheet can show composition but cannot establish whether a character stays the same across time. Persistence requires direct motion and frame-to-frame comparison, so the method structurally overproduced framing knowledge and underproduced identity continuity.',
          'The next research sprint must use paired-frame comparison across a passage, with explicit face, wardrobe, prop-state, and reference-consistency checks. Do not restart broad collection for this sprint.',
          ${tx.json({
            corpusPrinciples: rows.length,
            identityLabels: rows.filter((row) => row.character_axis === "identity").length,
            identityCandidates: rows.filter((row) => row.lane === "candidate" && row.character_axis === "identity").length,
            framingLabels: rows.filter((row) => row.character_axis === "framing").length,
            framingCandidates: rows.filter((row) => row.lane === "candidate" && row.character_axis === "framing").length,
            rejectedRankingSprint: "character-principles-2026-08-01-ranked",
          })}
        ) on conflict (finding_key) do nothing
      `;
      return String(run.id);
    });
    console.log(JSON.stringify({ runId, counts, shortlist: shortlist.map((item) => ({ rank: item.shortlistRank, axis: item.characterAxis, hypothesis: item.agreementKey, relevance: item.characterAxisScore, work: item.workTitle, principle: item.principleText })), usage, costUsd }));
  } finally {
    await sql.end();
  }
}

void main();

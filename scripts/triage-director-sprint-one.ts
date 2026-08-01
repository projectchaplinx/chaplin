import { loadEnvConfig } from "@next/env";
import { createHash } from "node:crypto";
import postgres from "postgres";
import {
  DIRECTOR_SPRINT_ONE_TRIAGE_KEY,
  finalizeDirectorSprintTriage,
  type DirectorCharacterAxis,
  type DirectorPrincipleConfidence,
  type DirectorPrincipleLane,
  type ProposedDirectorPrincipleAssessment,
} from "../src/lib/director-sprint-one";

loadEnvConfig(process.cwd());

const databaseUrl = process.env.SUPABASE_DB_URL;
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_RESEARCH_MODEL?.trim() || process.env.OPENAI_WRITING_MODEL?.trim() || "gpt-5.6-terra";
if (!databaseUrl) throw new Error("SUPABASE_DB_URL is missing.");
if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");

const sql = postgres(databaseUrl, { ssl: "require", max: 4 });
const BATCH_SIZE = 24;
const MAX_CONCURRENCY = 4;

type StudyRow = {
  id: string;
  study_title: string;
  work_title: string;
  tags: string[];
  limitations: string;
  candidate_principles: unknown;
  source_title: string;
  source_url: string | null;
  timed_media_analysis_id: string | null;
  playback_status: "required" | "verified" | "rejected" | null;
};

type CorpusItem = {
  ref: string;
  studyId: string;
  timedMediaAnalysisId: string | null;
  playbackStatus: StudyRow["playback_status"];
  studyTitle: string;
  workTitle: string;
  sourceTitle: string;
  sourceUrl: string | null;
  tags: string[];
  limitations: string;
  principleIndex: number;
  principleText: string;
  principleHash: string;
};

type ClassifiedItem = {
  ref: string;
  lane: DirectorPrincipleLane;
  characterAxis: DirectorCharacterAxis;
  agreementKey: string;
  confidence: DirectorPrincipleConfidence;
  productionReach: number;
  rationale: string;
  rejectionReason: string;
  responseId: string;
};

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "lane", "characterAxis", "agreementKey", "confidence", "productionReach", "rationale", "rejectionReason"],
        properties: {
          ref: { type: "string" },
          lane: { type: "string", enum: ["discard", "park", "candidate"] },
          characterAxis: { type: "string", enum: ["identity", "performance", "framing", "blocking", "other"] },
          agreementKey: { type: "string", enum: [
            "identity-face-lock", "identity-wardrobe-lock", "identity-prop-lock", "identity-reference-consistency",
            "performance-objective", "performance-tactic-change", "performance-reaction", "performance-eyeline",
            "framing-face-readability", "framing-shot-scale", "framing-eyeline",
            "blocking-screen-direction", "blocking-spatial-geography", "blocking-action-path", "other",
          ] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          productionReach: { type: "integer", minimum: 0, maximum: 5 },
          rationale: { type: "string" },
          rejectionReason: { type: "string" },
        },
      },
    },
  },
} as const;

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function chunks<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const output = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await worker(items[index]!, index);
    }
  }));
  return output;
}

function responseText(data: { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (typeof data.output_text === "string") return data.output_text;
  return (data.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("");
}

async function classifyBatch(batch: CorpusItem[], batchIndex: number) {
  const input = batch.map((item) => ({
    ref: item.ref,
    principle: item.principleText,
    study: item.studyTitle,
    work: item.workTitle,
    tags: item.tags,
    limitations: item.limitations.slice(0, 500),
    hasTimedPassage: Boolean(item.timedMediaAnalysisId),
  }));
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "none" },
      max_output_tokens: 6000,
      instructions: `You are triaging existing Director Brain principle text for Chaplin, a character marketplace. Do not watch or infer unseen video. Classify every supplied ref exactly once.

DISCARD only explicit noise: title/credit grammar, source-unreachable notes, contact-sheet or review caveats phrased as craft, metadata, or non-actionable meta-notes. Give a concrete rejectionReason.
PARK real craft that does not directly serve this sprint's character axes.
CANDIDATE only a strong, reusable production instruction that directly serves identity continuity, performance, face/framing, or blocking. Be strict: only about the strongest 10-15 percent should be candidates. A vague observation, period fact, production-design rule, sound-only rule, or hedged caveat is not a candidate.

Character priority: identity first, performance second, framing third, blocking fourth. characterAxis must be other for discard/park unless the parked principle genuinely concerns a character axis but is too weak. productionReach is 0-5 for how often the rule would help real 4-5 second character briefs. agreementKey is the nearest controlled concept. Rationale must explain the lane from the text alone. Never turn a machine decision into a human approval.`,
      input: [{ role: "user", content: JSON.stringify(input) }],
      text: { format: { type: "json_schema", name: "director_sprint_one_triage", strict: true, schema: responseSchema } },
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
  if (!response.ok) throw new Error(`Batch ${batchIndex + 1}: ${data.error?.message ?? `OpenAI returned ${response.status}`}`);
  const parsed = JSON.parse(responseText(data)) as { items?: Omit<ClassifiedItem, "responseId">[] };
  const items = parsed.items ?? [];
  const expected = new Set(batch.map((item) => item.ref));
  const actual = new Set(items.map((item) => item.ref));
  if (items.length !== batch.length || actual.size !== expected.size || [...expected].some((ref) => !actual.has(ref))) {
    throw new Error(`Batch ${batchIndex + 1}: model did not return every principle exactly once.`);
  }
  return {
    responseId: data.id ?? "",
    usage: { inputTokens: Number(data.usage?.input_tokens ?? 0), outputTokens: Number(data.usage?.output_tokens ?? 0) },
    items: items.map((item) => ({ ...item, responseId: data.id ?? "" })),
  };
}

async function main() {
try {
  const studies = await sql<StudyRow[]>`
    select study.id, study.study_title, study.work_title, study.tags, study.limitations,
      study.candidate_principles, source.title as source_title, source.source_url,
      timed.id as timed_media_analysis_id, timed.playback_status
    from director_scene_studies study
    join director_research_sources source on source.id = study.source_id
    left join lateral (
      select analysis.id, analysis.playback_status
      from director_timed_media_analyses analysis
      where analysis.study_id = study.id
      order by analysis.created_at
      limit 1
    ) timed on true
    where study.status = 'draft'
    order by study.id
  `;
  const corpus: CorpusItem[] = studies.flatMap((study) => {
    const principles = Array.isArray(study.candidate_principles)
      ? study.candidate_principles.filter((value): value is string => typeof value === "string" && value.trim().length >= 3)
      : [];
    return principles.map((principleText, principleIndex) => {
      const principleHash = sha(`${study.id}\n${principleIndex}\n${principleText.trim()}`);
      return {
        ref: principleHash.slice(0, 16),
        studyId: study.id,
        timedMediaAnalysisId: study.timed_media_analysis_id,
        playbackStatus: study.playback_status,
        studyTitle: study.study_title,
        workTitle: study.work_title,
        sourceTitle: study.source_title,
        sourceUrl: study.source_url,
        tags: study.tags ?? [],
        limitations: study.limitations ?? "",
        principleIndex,
        principleText: principleText.trim(),
        principleHash,
      };
    });
  });
  if (corpus.length !== 282) throw new Error(`Sprint 1 requires exactly 282 draft principles; live corpus has ${corpus.length}.`);
  const corpusHash = sha(corpus.map((item) => `${item.studyId}:${item.principleHash}`).join("\n"));
  const existing = await sql`select id from director_sprint_runs where sprint_key = ${DIRECTOR_SPRINT_ONE_TRIAGE_KEY} and corpus_hash = ${corpusHash} and status = 'succeeded'`;
  if (existing.length) {
    console.log(JSON.stringify({ reused: true, runId: existing[0]?.id, principleCount: corpus.length }));
    process.exitCode = 0;
  } else {
    const batches = chunks(corpus, BATCH_SIZE);
    console.log(`Triaging ${corpus.length} principles in ${batches.length} text-only batches (max concurrency ${MAX_CONCURRENCY}).`);
    const responses = await mapPool(batches, MAX_CONCURRENCY, classifyBatch);
    const classified = responses.flatMap((response) => response.items);
    const byRef = new Map(classified.map((item) => [item.ref, item]));
    const agreementStudyCounts = new Map<string, Set<string>>();
    for (const item of corpus) {
      const classification = byRef.get(item.ref)!;
      if (classification.lane !== "candidate") continue;
      const studiesForKey = agreementStudyCounts.get(classification.agreementKey) ?? new Set<string>();
      studiesForKey.add(item.studyId);
      agreementStudyCounts.set(classification.agreementKey, studiesForKey);
    }
    const axisScore: Record<DirectorCharacterAxis, number> = { identity: 100, performance: 90, framing: 80, blocking: 70, other: 0 };
    const proposed: ProposedDirectorPrincipleAssessment[] = corpus.map((item) => {
      const classification = byRef.get(item.ref)!;
      const sourceStrength = item.timedMediaAnalysisId
        ? item.playbackStatus === "verified" ? "motion-verified" as const : "contact-sheet-only" as const
        : "document" as const;
      return {
        studyId: item.studyId,
        timedMediaAnalysisId: item.timedMediaAnalysisId,
        playbackStatus: item.playbackStatus,
        playbackStartSecond: null,
        playbackDurationSeconds: null,
        studyTitle: item.studyTitle,
        workTitle: item.workTitle,
        sourceTitle: item.sourceTitle,
        sourceUrl: item.sourceUrl,
        principleIndex: item.principleIndex,
        principleText: item.principleText,
        principleHash: item.principleHash,
        lane: classification.lane,
        characterAxis: classification.characterAxis,
        agreementKey: classification.agreementKey,
        confidence: classification.confidence,
        rationale: classification.rationale.trim().slice(0, 1200),
        rejectionReason: classification.lane === "discard" ? classification.rejectionReason.trim().slice(0, 1200) : "",
        sourceStrength,
        characterAxisScore: axisScore[classification.characterAxis],
        crossStudyAgreement: Math.max(0, (agreementStudyCounts.get(classification.agreementKey)?.size ?? 1) - 1),
        productionReach: Math.max(0, Math.min(5, Math.round(classification.productionReach))),
        model,
        responseId: classification.responseId,
      };
    });
    const finalized = finalizeDirectorSprintTriage(proposed);
    const counts = {
      discard: finalized.filter((item) => item.lane === "discard").length,
      park: finalized.filter((item) => item.lane === "park").length,
      candidate: finalized.filter((item) => item.lane === "candidate").length,
    };
    const usage = responses.reduce((total, response) => ({
      inputTokens: total.inputTokens + response.usage.inputTokens,
      outputTokens: total.outputTokens + response.usage.outputTokens,
    }), { inputTokens: 0, outputTokens: 0 });
    const inputRate = Number(process.env.OPENAI_TERRA_INPUT_USD_PER_MILLION_TOKENS ?? "2.5");
    const outputRate = Number(process.env.OPENAI_TERRA_OUTPUT_USD_PER_MILLION_TOKENS ?? "15");
    const costUsd = ((usage.inputTokens * inputRate) + (usage.outputTokens * outputRate)) / 1_000_000;
    const runId = await sql.begin(async (tx) => {
      const [run] = await tx`
        insert into director_sprint_runs (
          sprint_key, status, model, corpus_hash, principle_count, discard_count, park_count,
          candidate_count, response_ids, usage, cost_usd, created_by
        ) values (
          ${DIRECTOR_SPRINT_ONE_TRIAGE_KEY}, 'succeeded', ${model}, ${corpusHash}, ${corpus.length},
          ${counts.discard}, ${counts.park}, ${counts.candidate},
          ${responses.map((response) => response.responseId).filter(Boolean)},
          ${tx.json(usage)}, ${costUsd}, 'codex-sprint-one'
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
            ${run.id}, ${DIRECTOR_SPRINT_ONE_TRIAGE_KEY}, ${item.studyId}, ${item.timedMediaAnalysisId},
            ${item.principleIndex}, ${item.principleText}, ${item.principleHash}, ${item.lane},
            ${item.characterAxis}, ${item.agreementKey}, ${item.confidence}, ${item.rationale},
            ${item.rejectionReason}, ${item.sourceStrength}, ${item.characterAxisScore},
            ${item.crossStudyAgreement}, ${item.productionReach}, ${item.rankScore},
            ${item.candidateRank}, ${item.shortlistRank}, ${item.model}, ${item.responseId}
          )
        `;
      }
      return String(run.id);
    });
    console.log(JSON.stringify({ runId, principleCount: corpus.length, ...counts, shortlist: finalized.filter((item) => item.shortlistRank != null).map((item) => ({ rank: item.shortlistRank, axis: item.characterAxis, work: item.workTitle, principle: item.principleText })), usage, costUsd }));
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
} finally {
  await sql.end();
}
}

void main();

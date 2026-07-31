import "server-only";

import {
  assertResearchTextIsAnalytical,
  directorResearchSourceMode,
  type DirectorResearchJob,
  type DirectorResearchJobStatus,
  type DirectorResearchSourceMode,
  type DirectorResearchSourceRecord,
} from "@/lib/director-research";
import {
  DIRECTOR_RESEARCH_QUERY_PLAN_VERSION,
  plansForResearchSource,
  type DirectorResearchQueryPlan,
} from "@/lib/director-research-query-plan";
import { EvidenceConnectorConfigurationError, discoverDirectorEvidence } from "@/lib/server/director-evidence-connectors";
import { upsertDirectorEvidenceManifests } from "@/lib/server/director-evidence-manifests";
import { createDirectorStudy } from "@/lib/server/director-research";
import {
  createOpenAIResponse,
  openAIWritingModel,
} from "@/lib/server/openai-responses";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export const DIRECTOR_RESEARCH_CONTRACT_VERSION = "2026-07-31.7";
export const DIRECTOR_RESEARCH_CONCURRENCY = 4;

type JobRow = {
  id: string;
  source_id: string;
  campaign_id: string;
  contract_version: string;
  source_mode: DirectorResearchSourceMode;
  query_key: string;
  status: DirectorResearchJobStatus;
  phase: string;
  progress: number;
  message: string;
  attempt: number;
  max_attempts: number;
  model: string | null;
  error_message: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  usage: Record<string, unknown> | null;
  lease_owner: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  director_research_sources?: SourceRow | SourceRow[] | null;
};

type SourceRow = {
  id: string;
  title: string;
  institution: string;
  source_url: string | null;
  source_kind: DirectorResearchSourceRecord["sourceKind"];
  rights_basis: string;
  access_notes: string;
  campaign_id: string | null;
  target_tags: string[] | null;
  research_questions: unknown;
  priority: DirectorResearchSourceRecord["priority"] | null;
  queue_status: DirectorResearchSourceRecord["queueStatus"] | null;
  last_verified_at: string | null;
};

function sourceFromRow(row: SourceRow): DirectorResearchSourceRecord {
  return {
    id: row.id,
    title: row.title,
    institution: row.institution,
    sourceUrl: row.source_url,
    sourceKind: row.source_kind,
    rightsBasis: row.rights_basis,
    accessNotes: row.access_notes,
    campaignId: row.campaign_id ?? "",
    targetTags: row.target_tags ?? [],
    researchQuestions: Array.isArray(row.research_questions)
      ? row.research_questions.filter((value): value is string => typeof value === "string")
      : [],
    priority: row.priority === "now" || row.priority === "later" ? row.priority : "next",
    queueStatus: row.queue_status === "in-progress" || row.queue_status === "analyzed" || row.queue_status === "paused"
      ? row.queue_status
      : "queued",
    lastVerifiedAt: row.last_verified_at,
  };
}

function joinedSource(row: JobRow) {
  const source = Array.isArray(row.director_research_sources)
    ? row.director_research_sources[0]
    : row.director_research_sources;
  if (!source) throw new Error("Research job has no source.");
  return sourceFromRow(source);
}

function jobFromRow(row: JobRow): DirectorResearchJob {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceTitle: joinedSource(row).title,
    sourceMode: row.source_mode,
    queryKey: row.query_key || "root",
    queryLabel: typeof row.input?.queryLabel === "string" ? row.input.queryLabel : "Full source",
    status: row.status,
    phase: row.phase,
    progress: Number(row.progress) || 0,
    message: row.message,
    attempt: Number(row.attempt) || 0,
    maxAttempts: Number(row.max_attempts) || 3,
    model: row.model,
    errorMessage: row.error_message,
    evidenceCount: Number(row.output?.count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function queryPlanFromJob(row: JobRow): DirectorResearchQueryPlan | undefined {
  const value = row.input?.queryPlan;
  if (!value || typeof value !== "object") return undefined;
  const plan = value as Partial<DirectorResearchQueryPlan>;
  if (typeof plan.id !== "string" || typeof plan.label !== "string" || typeof plan.query !== "string"
    || typeof plan.startYear !== "number" || typeof plan.endYear !== "number" || typeof plan.region !== "string"
    || !Array.isArray(plan.layers) || !Array.isArray(plan.preferredProviders)) return undefined;
  return plan as DirectorResearchQueryPlan;
}

export async function listDirectorResearchJobs(campaignId?: string) {
  let query = getSupabaseAdminClient()
    .from("director_research_jobs")
    .select("*,director_research_sources(*)")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const result = await query;
  if (result.error) {
    if (/director_research_jobs|schema cache|does not exist/i.test(result.error.message)) return [];
    throw new Error(`Load research jobs: ${result.error.message}`);
  }
  const latestBySource = new Map<string, DirectorResearchJob>();
  for (const row of (result.data ?? []) as JobRow[]) {
    const key = `${row.source_id}:${row.query_key || "root"}`;
    if (!latestBySource.has(key)) latestBySource.set(key, jobFromRow(row));
  }
  return [...latestBySource.values()];
}

export async function enqueueDirectorResearch(campaignId: string, userId: string, sourceIds?: string[]) {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("director_research_sources").select("*").eq("campaign_id", campaignId);
  if (sourceIds?.length) query = query.in("id", sourceIds.slice(0, 100));
  const sources = await query;
  if (sources.error) throw new Error(`Load research sources for queue: ${sources.error.message}`);
  const sourceRows = (sources.data ?? []) as SourceRow[];
  const terminal = sourceRows.length
    ? await supabase.from("director_research_jobs").select("source_id,status").in("source_id", sourceRows.map((row) => row.id)).eq("campaign_id", campaignId).eq("contract_version", DIRECTOR_RESEARCH_CONTRACT_VERSION).in("status", ["succeeded", "review-required"])
    : { data: [], error: null };
  if (terminal.error) throw new Error(`Check completed research jobs: ${terminal.error.message}`);
  const completedSourceIds = new Set((terminal.data ?? []).map((job) => String(job.source_id)));
  const rows = sourceRows.filter((row) => !completedSourceIds.has(row.id)).map((row) => {
    const source = sourceFromRow(row);
    return {
      source_id: source.id,
      campaign_id: campaignId,
      contract_version: DIRECTOR_RESEARCH_CONTRACT_VERSION,
      source_mode: directorResearchSourceMode(source),
      query_key: "root",
      status: "queued",
      phase: "queued",
      progress: 0,
      message: "Waiting for a bounded research worker",
      attempt: 0,
      max_attempts: 3,
      input: { sourceUrl: source.sourceUrl, researchQuestions: source.researchQuestions },
      output: {},
      usage: {},
      error_message: null,
      lease_owner: null,
      lease_expires_at: null,
      started_at: null,
      completed_at: null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    };
  });
  if (rows.length) {
    const queued = await supabase.from("director_research_jobs").upsert(rows, {
      onConflict: "source_id,campaign_id,contract_version,query_key",
      ignoreDuplicates: true,
    });
    if (queued.error) throw new Error(`Queue Director Brain research: ${queued.error.message}`);
    const sourceProgress = await supabase.from("director_research_sources").update({
      queue_status: "in-progress",
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }).in("id", rows.map((row) => row.source_id)).neq("queue_status", "analyzed");
    if (sourceProgress.error) throw new Error(`Start Director Brain sources: ${sourceProgress.error.message}`);
  }
  return listDirectorResearchJobs(campaignId);
}

export async function enqueueDirectorGapResearch(campaignId: string, userId: string) {
  const supabase = getSupabaseAdminClient();
  const sources = await supabase.from("director_research_sources").select("*").eq("campaign_id", campaignId);
  if (sources.error) throw new Error(`Load research sources for gap queue: ${sources.error.message}`);
  const rows = (sources.data ?? []).flatMap((raw) => {
    const source = sourceFromRow(raw as SourceRow);
    if (directorResearchSourceMode(source) !== "collection-discovery") return [];
    return plansForResearchSource(source.title).map((plan) => ({
      source_id: source.id,
      campaign_id: campaignId,
      contract_version: DIRECTOR_RESEARCH_QUERY_PLAN_VERSION,
      source_mode: "collection-discovery" as const,
      query_key: plan.id,
      status: "queued",
      phase: "queued",
      progress: 0,
      message: `Waiting to research ${plan.label}`,
      attempt: 0,
      max_attempts: 3,
      input: { queryPlan: plan, queryLabel: plan.label, page: 1 },
      output: {}, usage: {}, error_message: null, lease_owner: null, lease_expires_at: null,
      next_attempt_at: null, started_at: null, completed_at: null,
      created_by: userId, updated_at: new Date().toISOString(),
    }));
  });
  if (rows.length) {
    const queued = await supabase.from("director_research_jobs").upsert(rows, {
      onConflict: "source_id,campaign_id,contract_version,query_key",
      ignoreDuplicates: true,
    });
    if (queued.error) throw new Error(`Queue world-gap research: ${queued.error.message}`);
  }
  return listDirectorResearchJobs(campaignId);
}

function publicHttpUrl(value: string | null) {
  if (!value) throw new Error("This source has no authoritative URL.");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Research sources must use HTTPS.");
  if (/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1\]?)/i.test(url.hostname)) {
    throw new Error("Private network research URLs are not allowed.");
  }
  return url;
}

function readableHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160_000);
}

async function fetchAuthoritativeText(source: DirectorResearchSourceRecord) {
  const url = publicHttpUrl(source.sourceUrl);
  const response = await fetch(url, {
    headers: { "user-agent": "ChaplinDirectorResearch/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Authoritative source returned ${response.status}.`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/json")) {
    throw new Error(`Source requires a ${contentType || "non-text"} evidence adapter.`);
  }
  const body = await response.text();
  const text = contentType.includes("text/html") ? readableHtml(body) : body.slice(0, 160_000);
  if (text.length < 500) throw new Error("Authoritative source did not expose enough attributable text.");
  return text;
}

const STUDY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["studyTitle", "workTitle", "sceneLocator", "periodLabel", "region", "tags", "observations", "candidatePrinciples", "limitations"],
  properties: {
    studyTitle: { type: "string" },
    workTitle: { type: "string" },
    sceneLocator: { type: "string" },
    periodLabel: { type: "string" },
    region: { type: "string" },
    tags: { type: "array", items: { type: "string" }, maxItems: 20 },
    observations: {
      type: "array",
      minItems: 3,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["locatorKind", "locatorValue", "evidence", "craft", "transition", "narrativeJob", "inference", "confidence"],
        properties: {
          locatorKind: { type: "string", enum: ["page", "section", "record", "object", "api-field", "benchmark"] },
          locatorValue: { type: "string" },
          evidence: { type: "string" },
          craft: { type: "string" },
          transition: { type: "string" },
          narrativeJob: { type: "string" },
          inference: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
    candidatePrinciples: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
    limitations: { type: "string" },
  },
} as const;

type ExtractedStudy = {
  studyTitle: string;
  workTitle: string;
  sceneLocator: string;
  periodLabel: string;
  region: string;
  tags: string[];
  observations: Array<{
    locatorKind: string;
    locatorValue: string;
    evidence: string;
    craft: string;
    transition: string;
    narrativeJob: string;
    inference: string;
    confidence: string;
  }>;
  candidatePrinciples: string[];
  limitations: string;
};

async function updateJob(id: string, values: Record<string, unknown>, leaseOwner?: string | null) {
  let query = getSupabaseAdminClient().from("director_research_jobs").update({
    ...values,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (leaseOwner) query = query.eq("lease_owner", leaseOwner).eq("status", "running");
  const result = await query.select("id");
  if (result.error) throw new Error(`Update research job: ${result.error.message}`);
  if (leaseOwner && !result.data?.length) throw new Error("Research job lease was lost before the worker update completed.");
}

function updateClaimedJob(row: JobRow, values: Record<string, unknown>) {
  return updateJob(row.id, values, row.lease_owner);
}

async function processTextJob(row: JobRow, source: DirectorResearchSourceRecord) {
  await updateClaimedJob(row, { phase: "fetching", progress: 15, message: "Reading the authoritative source" });
  const sourceText = await fetchAuthoritativeText(source);
  await updateClaimedJob(row, { phase: "extracting", progress: 40, message: "Extracting attributable evidence with OpenAI" });
  const model = openAIWritingModel(process.env.OPENAI_RESEARCH_MODEL);
  const result = await createOpenAIResponse({
    model,
    instructions: [
      "You are Chaplin's evidence extractor, not a creative writer.",
      "Use only the supplied authoritative source text. Never invent missing facts or locators.",
      "Write compact paraphrases, never copied passages, transcripts, dialogue, or expressive prose.",
      "Separate the directly supported observation from the production inference.",
      "Use low confidence for ambiguous, partial, or provider-authored claims.",
      "Candidate principles are drafts for human review, never automatically trusted rules.",
    ].join("\n"),
    messages: [{
      role: "user",
      content: [
        `SOURCE: ${source.title}`,
        `INSTITUTION: ${source.institution}`,
        `RIGHTS BOUNDARY: ${source.rightsBasis}`,
        `RESEARCH QUESTIONS:\n${source.researchQuestions.map((question) => `- ${question}`).join("\n")}`,
        `TARGET TAGS: ${source.targetTags.join(", ")}`,
        `AUTHORITATIVE TEXT:\n${sourceText}`,
      ].join("\n\n"),
    }],
    maxOutputTokens: 5000,
    schema: STUDY_SCHEMA,
    schemaName: "director_research_study",
  });
  const extracted = JSON.parse(result.text) as ExtractedStudy;
  const observationLines = extracted.observations.map((observation) => [
    `${observation.locatorKind}: ${observation.locatorValue}`,
    observation.evidence,
    observation.craft,
    observation.transition,
    observation.narrativeJob,
    observation.inference,
    observation.confidence,
  ].join(" | ")).join("\n");
  assertResearchTextIsAnalytical(`${observationLines}\n${extracted.candidatePrinciples.join("\n")}`);
  await updateClaimedJob(row, { phase: "validating", progress: 75, message: "Validating evidence and rights boundaries", model });
  const studyId = await createDirectorStudy({
    sourceTitle: source.title,
    institution: source.institution,
    sourceUrl: source.sourceUrl,
    sourceKind: source.sourceKind,
    rightsBasis: source.rightsBasis,
    accessNotes: source.accessNotes,
    studyTitle: extracted.studyTitle,
    workTitle: extracted.workTitle || source.title,
    sceneLocator: extracted.sceneLocator,
    periodLabel: extracted.periodLabel,
    region: extracted.region,
    tags: extracted.tags,
    observationLines,
    candidatePrinciples: extracted.candidatePrinciples.join("\n"),
    limitations: extracted.limitations,
  }, row.created_by);
  const sourceComplete = await getSupabaseAdminClient().from("director_research_sources").update({
    queue_status: "analyzed",
    updated_by: row.created_by,
    updated_at: new Date().toISOString(),
  }).eq("id", source.id);
  if (sourceComplete.error) throw new Error(`Complete Director Brain source: ${sourceComplete.error.message}`);
  await updateClaimedJob(row, {
    status: "succeeded",
    phase: "draft-ready",
    progress: 100,
    message: "Draft evidence study is ready for human review",
    model,
    provider_response_id: result.data.id ?? null,
    usage: result.usage.providerUsage,
    output: { studyId, observationCount: extracted.observations.length, principleCount: extracted.candidatePrinciples.length },
    lease_owner: null,
    lease_expires_at: null,
    completed_at: new Date().toISOString(),
  });
}

async function processClaimedJob(row: JobRow) {
  const source = joinedSource(row);
  const approved = await getSupabaseAdminClient()
    .from("director_scene_studies")
    .select("id")
    .eq("source_id", source.id)
    .eq("status", "approved");
  if (approved.error) throw new Error(`Check existing approved research: ${approved.error.message}`);
  if (approved.data?.length && row.source_mode !== "collection-discovery") {
    await updateClaimedJob(row, {
      status: "succeeded",
      phase: "evidence-approved",
      progress: 100,
      message: "Existing evidence study is approved and available to retrieval",
      output: { studyIds: approved.data.map((study) => study.id) },
      lease_owner: null,
      lease_expires_at: null,
      completed_at: new Date().toISOString(),
    });
    return;
  }
  if (row.source_mode === "timed-media") {
    await updateClaimedJob(row, {
      status: "review-required",
      phase: "media-evidence-required",
      progress: 25,
      message: "Timed film study needs contact-sheet, audio, and human playback evidence before extraction",
      output: { requiredAdapters: ["contact-sheet", "audio-analysis", "human-playback"] },
      lease_owner: null,
      lease_expires_at: null,
      completed_at: new Date().toISOString(),
    });
    return;
  }
  if (row.source_mode === "collection-discovery" || row.source_mode === "provenance") {
    await updateClaimedJob(row, { phase: "querying-collection", progress: 15, message: "Querying the authoritative item-level evidence source" });
    let discovered;
    try {
      discovered = await discoverDirectorEvidence(source, queryPlanFromJob(row));
    } catch (error) {
      if (error instanceof EvidenceConnectorConfigurationError) {
        await updateClaimedJob(row, {
          status: "review-required", phase: "configuration-required", progress: 10,
          message: error.message, output: { blocker: "credential-or-connector", sourceUrl: source.sourceUrl },
          error_message: null,
          lease_owner: null, lease_expires_at: null, completed_at: new Date().toISOString(),
        });
        return;
      }
      throw error;
    }
    await updateClaimedJob(row, { phase: "normalizing-evidence", progress: 55, message: `Normalizing ${discovered.length} item-level evidence records` });
    const manifests = await upsertDirectorEvidenceManifests(source.id, row.id, discovered);
    const reusable = manifests.filter((manifest) => manifest.reuseStatus === "reusable" && !manifest.culturallySensitive).length;
    await updateClaimedJob(row, {
      status: "review-required",
      phase: manifests.length ? "manifest-review-required" : "no-evidence-found",
      progress: manifests.length ? 75 : 25,
      message: manifests.length ? `${manifests.length} evidence records are ready for item-level review` : "The connector returned no attributable item records",
      output: { manifestIds: manifests.map((manifest) => manifest.id), count: manifests.length, reusableCandidates: reusable, requiredReview: "item-rights-and-context" },
      error_message: null,
      lease_owner: null,
      lease_expires_at: null,
      completed_at: new Date().toISOString(),
    });
    return;
  }
  await processTextJob(row, source);
}

export async function runDirectorResearchBatch(limit = DIRECTOR_RESEARCH_CONCURRENCY) {
  const worker = `chaplin-${crypto.randomUUID()}`;
  const claimed = await getSupabaseAdminClient().rpc("claim_director_research_jobs", {
    p_worker: worker,
    p_limit: Math.max(1, Math.min(DIRECTOR_RESEARCH_CONCURRENCY, limit)),
    p_lease_seconds: 600,
  });
  if (claimed.error) throw new Error(`Claim research jobs: ${claimed.error.message}`);
  const claimedRows = (claimed.data ?? []) as JobRow[];
  const sourceIds = [...new Set(claimedRows.map((row) => row.source_id))];
  const sources = sourceIds.length
    ? await getSupabaseAdminClient().from("director_research_sources").select("*").in("id", sourceIds)
    : { data: [], error: null };
  if (sources.error) throw new Error(`Load claimed research sources: ${sources.error.message}`);
  const sourceById = new Map(((sources.data ?? []) as SourceRow[]).map((source) => [source.id, source]));
  const rows = claimedRows.map((row) => ({
    ...row,
    director_research_sources: sourceById.get(row.source_id) ?? null,
  }));
  await Promise.allSettled(rows.map(async (row) => {
    try {
      await processClaimedJob(row);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Research extraction failed.";
      await updateClaimedJob(row, {
        status: row.attempt >= row.max_attempts ? "failed" : "queued",
        phase: "failed",
        message: row.attempt >= row.max_attempts ? "Research failed after all attempts" : "Retry scheduled",
        error_message: message.slice(0, 2000),
        next_attempt_at: row.attempt >= row.max_attempts ? null : new Date(Date.now() + [30_000, 120_000, 600_000][Math.min(2, Math.max(0, row.attempt - 1))] + Math.floor(Math.random() * 5_000)).toISOString(),
        lease_owner: null,
        lease_expires_at: null,
        ...(row.attempt >= row.max_attempts ? { completed_at: new Date().toISOString() } : {}),
      });
      throw error;
    }
  }));
  return { claimed: rows.length, jobs: await listDirectorResearchJobs() };
}

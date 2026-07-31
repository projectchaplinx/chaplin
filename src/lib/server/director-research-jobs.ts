import "server-only";

import {
  assertResearchTextIsAnalytical,
  directorResearchSourceMode,
  type DirectorResearchJob,
  type DirectorResearchEvent,
  type DirectorResearchJobStatus,
  type DirectorResearchSourceMode,
  type DirectorResearchSourceRecord,
} from "@/lib/director-research";
import {
  DIRECTOR_RESEARCH_QUERY_PLAN_VERSION,
  plansForResearchSource,
  type DirectorResearchQueryPlan,
} from "@/lib/director-research-query-plan";
import {
  DIRECTOR_TIMED_MEDIA_CONTRACT_VERSION,
  parseLocPublicDomainRegistry,
  parseLocTimedMediaSource,
  planTimedMediaPassages,
  timedMediaQueryKey,
  type DirectorTimedMediaSource,
} from "@/lib/director-timed-media";
import { EvidenceConnectorConfigurationError, discoverDirectorEvidence } from "@/lib/server/director-evidence-connectors";
import { upsertDirectorEvidenceManifests } from "@/lib/server/director-evidence-manifests";
import { createDirectorStudy } from "@/lib/server/director-research";
import { processDirectorTimedMedia } from "@/lib/server/director-timed-media";
import {
  createOpenAIResponse,
  openAIWritingModel,
  type OpenAIInputContent,
} from "@/lib/server/openai-responses";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export const DIRECTOR_RESEARCH_CONTRACT_VERSION = "2026-07-31.7";
export const DIRECTOR_RESEARCH_CONCURRENCY = 4;
export const DIRECTOR_TIMED_MEDIA_REGISTRY_URL = "https://www.loc.gov/free-to-use/public-domain-films-from-the-national-film-registry/?fo=json";

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

function jobFromRow(row: JobRow, events: DirectorResearchEvent[] = []): DirectorResearchJob {
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
    errorMessage: row.status === "failed" || row.phase === "failed" ? row.error_message : null,
    evidenceCount: Number(row.output?.count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    events,
  };
}

function researchEventFromRow(row: Record<string, unknown>): DirectorResearchEvent {
  return {
    id: String(row.id ?? ""),
    kind: String(row.event_kind ?? "update"),
    phase: String(row.phase ?? ""),
    status: String(row.status ?? ""),
    progress: row.progress == null ? null : Number(row.progress),
    message: String(row.message ?? ""),
    details: row.details && typeof row.details === "object" && !Array.isArray(row.details)
      ? row.details as Record<string, unknown>
      : {},
    actor: typeof row.actor === "string" ? row.actor : null,
    createdAt: String(row.created_at ?? ""),
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
  const rows = (result.data ?? []) as JobRow[];
  const jobIds = rows.map((row) => row.id);
  const eventsResult = jobIds.length
    ? await getSupabaseAdminClient().from("director_research_events").select("*").in("job_id", jobIds).order("created_at", { ascending: true }).limit(5000)
    : { data: [], error: null };
  const eventsByJob = new Map<string, DirectorResearchEvent[]>();
  if (!eventsResult.error) {
    for (const eventRow of (eventsResult.data ?? []) as Array<Record<string, unknown>>) {
      const jobId = typeof eventRow.job_id === "string" ? eventRow.job_id : "";
      if (!jobId) continue;
      const events = eventsByJob.get(jobId) ?? [];
      events.push(researchEventFromRow(eventRow));
      eventsByJob.set(jobId, events);
    }
  }
  const latestBySource = new Map<string, DirectorResearchJob>();
  for (const row of rows) {
    const key = `${row.source_id}:${row.query_key || "root"}`;
    if (!latestBySource.has(key)) latestBySource.set(key, jobFromRow(row, eventsByJob.get(row.id) ?? []));
  }
  return [...latestBySource.values()];
}

export async function retryDirectorResearchJobs(jobIds: string[], userId: string) {
  const ids = [...new Set(jobIds.map((id) => id.trim()).filter(Boolean))].slice(0, 100);
  if (!ids.length) throw new Error("Choose at least one research job to retry.");
  const supabase = getSupabaseAdminClient();
  const candidates = await supabase.from("director_research_jobs")
    .select("id,status,phase")
    .in("id", ids)
    .in("status", ["failed", "review-required"]);
  if (candidates.error) throw new Error(`Load retryable research jobs: ${candidates.error.message}`);
  const retryable = (candidates.data ?? [])
    .filter((job) => job.status === "failed" || job.phase === "no-evidence-found")
    .map((job) => String(job.id));
  if (!retryable.length) throw new Error("Only failed or empty-evidence jobs can be retried without changing a human review decision.");
  const result = await supabase.from("director_research_jobs").update({
    status: "queued", phase: "queued", progress: 0,
    message: "Retry requested after a connector or parser correction",
    attempt: 0, error_message: null, next_attempt_at: null,
    lease_owner: null, lease_expires_at: null, completed_at: null,
    updated_at: new Date().toISOString(), created_by: userId,
  }).in("id", retryable).select("id");
  if (result.error) throw new Error(`Retry research jobs: ${result.error.message}`);
  return { retried: (result.data ?? []).map((job) => String(job.id)) };
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

async function fetchLocJson(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "ChaplinDirectorResearch/1.0", accept: "application/json" },
    redirect: "follow", signal: AbortSignal.timeout(30_000), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Library of Congress returned ${response.status} for ${url}.`);
  return response.json() as Promise<unknown>;
}

async function mapConcurrent<T, R>(values: T[], limit: number, mapper: (value: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]);
    }
  }));
  return results;
}

async function upsertTimedMediaSource(campaignId: string, userId: string, source: DirectorTimedMediaSource) {
  const supabase = getSupabaseAdminClient();
  const existing = await supabase.from("director_research_sources").select("id").eq("source_url", source.itemUrl).maybeSingle();
  if (existing.error) throw new Error(`Check film research source: ${existing.error.message}`);
  const values = {
    title: source.title,
    institution: "Library of Congress",
    source_url: source.itemUrl,
    source_kind: "public-domain" as const,
    rights_basis: source.rightsBasis,
    access_notes: `Automated analysis uses ${source.mediaUrl}; ${source.durationSeconds}s; raw clips, frames, audio, dialogue, and transcripts are not retained.`,
    campaign_id: campaignId,
    target_tags: ["public-domain-scene", "camera", "blocking", "editing", "sound", "performance", "period"],
    research_questions: [
      "Which seconds change information, tactic, geography, rhythm, or attention?",
      "How do framing, blocking, edits, sound, silence, and performance jointly complete the scene's narrative work?",
    ],
    priority: "now" as const,
    queue_status: "in-progress" as const,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  if (existing.data?.id) {
    const updated = await supabase.from("director_research_sources").update(values).eq("id", existing.data.id);
    if (updated.error) throw new Error(`Update film research source: ${updated.error.message}`);
    return String(existing.data.id);
  }
  const inserted = await supabase.from("director_research_sources").insert({ ...values, created_by: userId }).select("id").single();
  if (inserted.error || !inserted.data) throw new Error(`Create film research source: ${inserted.error?.message ?? "No record returned."}`);
  return String(inserted.data.id);
}

export async function enqueueDirectorTimedMediaCorpus(campaignId: string, userId: string) {
  const supabase = getSupabaseAdminClient();
  const superseded = await supabase.from("director_research_jobs").update({
    status: "cancelled",
    phase: "superseded-contract",
    progress: 0,
    message: `Superseded by timed-media contract ${DIRECTOR_TIMED_MEDIA_CONTRACT_VERSION}`,
    lease_owner: null,
    lease_expires_at: null,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("campaign_id", campaignId).eq("source_mode", "timed-media")
    .neq("contract_version", DIRECTOR_TIMED_MEDIA_CONTRACT_VERSION)
    .in("status", ["queued", "running", "failed"]);
  if (superseded.error) throw new Error(`Supersede old timed-film jobs: ${superseded.error.message}`);
  const retryCurrent = await supabase.from("director_research_jobs").update({
    status: "queued",
    phase: "queued",
    progress: 0,
    message: "Retrying the current timed-media contract after a recoverable extraction failure",
    attempt: 0,
    error_message: null,
    next_attempt_at: null,
    lease_owner: null,
    lease_expires_at: null,
    completed_at: null,
    updated_at: new Date().toISOString(),
  }).eq("campaign_id", campaignId).eq("source_mode", "timed-media")
    .eq("contract_version", DIRECTOR_TIMED_MEDIA_CONTRACT_VERSION)
    .eq("status", "failed");
  if (retryCurrent.error) throw new Error(`Retry current timed-film jobs: ${retryCurrent.error.message}`);
  const registry = parseLocPublicDomainRegistry(await fetchLocJson(DIRECTOR_TIMED_MEDIA_REGISTRY_URL));
  if (!registry.length) throw new Error("The Library of Congress registry returned no film records.");
  const resolved = await mapConcurrent(registry, 6, async (item) => parseLocTimedMediaSource(item, await fetchLocJson(`${item.itemUrl}?fo=json`)));
  const prepared = await mapConcurrent(resolved, 6, async (source) => ({
    source,
    sourceId: await upsertTimedMediaSource(campaignId, userId, source),
    passages: planTimedMediaPassages(source.durationSeconds),
  }));
  const rows: Array<Record<string, unknown>> = [];
  const passageCount = Math.max(...prepared.map((entry) => entry.passages.length));
  for (let passageIndex = 0; passageIndex < passageCount; passageIndex += 1) {
    for (const { source, sourceId, passages } of prepared) {
      const passage = passages[passageIndex];
      if (!passage) continue;
      rows.push({
        source_id: sourceId,
        campaign_id: campaignId,
        contract_version: DIRECTOR_TIMED_MEDIA_CONTRACT_VERSION,
        source_mode: "timed-media",
        query_key: timedMediaQueryKey(source.itemId, passage),
        status: "queued",
        phase: "queued",
        progress: 0,
        message: `Waiting to analyze ${passage.label.toLowerCase()}`,
        attempt: 0,
        max_attempts: 3,
        input: {
          queryLabel: `${passage.label} · ${passage.startSecond.toFixed(1)}-${(passage.startSecond + passage.durationSeconds).toFixed(1)}s`,
          timedMedia: {
            itemId: source.itemId, itemUrl: source.itemUrl, mediaUrl: source.mediaUrl,
            playbackUrl: source.playbackUrl,
            mediaObjectId: source.mediaObjectId, workTitle: source.title, dateLabel: source.dateLabel,
            region: source.region, passageLabel: passage.label, startSecond: passage.startSecond,
            durationSeconds: passage.durationSeconds,
          },
        },
        output: {}, usage: {}, error_message: null, lease_owner: null, lease_expires_at: null,
        next_attempt_at: null, started_at: null, completed_at: null, created_by: userId,
        updated_at: new Date().toISOString(),
      });
    }
  }
  if (rows.length) {
    const queued = await supabase.from("director_research_jobs").upsert(rows, {
      onConflict: "source_id,campaign_id,contract_version,query_key", ignoreDuplicates: true,
    });
    if (queued.error) throw new Error(`Queue timed-film corpus: ${queued.error.message}`);
  }
  return { catalogItems: registry.length, resolvedItems: resolved.length, queuedPassages: rows.length, jobs: await listDirectorResearchJobs(campaignId) };
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

async function expandMetCollectionSearch(url: URL, payload: unknown) {
  if (url.hostname !== "collectionapi.metmuseum.org" || url.pathname !== "/public/collection/v1/search") return null;
  const objectIds = payload && typeof payload === "object" && Array.isArray((payload as { objectIDs?: unknown }).objectIDs)
    ? (payload as { objectIDs: unknown[] }).objectIDs.filter((value): value is number => Number.isInteger(value)).slice(0, 24)
    : [];
  if (!objectIds.length) return null;
  // The global worker cap already provides parallelism across independent jobs.
  // Keep object expansion serial inside a job so four Met jobs cannot fan out
  // into sixteen simultaneous requests against the same public collection API.
  const records = await mapConcurrent(objectIds, 1, async (objectId) => {
    const response = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`, {
      headers: { "user-agent": "ChaplinDirectorResearch/1.0 (+https://project-chaplin.vercel.app)", accept: "application/json" },
      signal: AbortSignal.timeout(20_000), cache: "no-store",
    });
    if (!response.ok) return null;
    const item = await response.json() as Record<string, unknown>;
    return {
      objectID: item.objectID, objectURL: item.objectURL, title: item.title, objectName: item.objectName,
      department: item.department, culture: item.culture, period: item.period, dynasty: item.dynasty,
      reign: item.reign, objectDate: item.objectDate, objectBeginDate: item.objectBeginDate,
      objectEndDate: item.objectEndDate, medium: item.medium, dimensions: item.dimensions,
      classification: item.classification, country: item.country, region: item.region,
      subregion: item.subregion, locale: item.locale, excavation: item.excavation,
      isPublicDomain: item.isPublicDomain, rightsAndReproduction: item.rightsAndReproduction,
    };
  });
  return JSON.stringify({
    query: url.searchParams.get("q"),
    totalMatches: Number((payload as { total?: unknown }).total ?? objectIds.length),
    sampledObjectRecords: records.filter(Boolean),
    sampleLimit: objectIds.length,
  });
}

async function fetchAuthoritativeText(source: DirectorResearchSourceRecord) {
  const url = publicHttpUrl(source.sourceUrl);
  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(url, {
      headers: {
        "user-agent": attempt === 0
          ? "ChaplinDirectorResearch/1.0 (+https://project-chaplin.vercel.app)"
          : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36 ChaplinResearch/1.0",
        accept: "text/html,application/xhtml+xml,application/pdf,application/json,text/plain;q=0.9,*/*;q=0.5",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (response.ok || ![403, 429].includes(response.status) || attempt === 2) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
  }
  if (!response) throw new Error("Authoritative source returned no response.");
  if (!response.ok) throw new Error(`Authoritative source returned ${response.status}.`);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/pdf")) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new Error("Authoritative PDF is empty or exceeds the 12 MB research limit.");
    return {
      type: "input_file",
      filename: `${source.id}.pdf`,
      file_data: `data:application/pdf;base64,${bytes.toString("base64")}`,
    } satisfies OpenAIInputContent;
  }
  if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/json")) {
    throw new Error(`Source requires a ${contentType || "non-text"} evidence adapter.`);
  }
  const body = await response.text();
  const expandedMet = contentType.includes("application/json")
    ? await expandMetCollectionSearch(url, JSON.parse(body) as unknown)
    : null;
  const text = expandedMet ?? (contentType.includes("text/html") ? readableHtml(body) : body.slice(0, 160_000));
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
  const sourceEvidence = await fetchAuthoritativeText(source);
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
      content: [{
        type: "input_text",
        text: [
        `SOURCE: ${source.title}`,
        `INSTITUTION: ${source.institution}`,
        `RIGHTS BOUNDARY: ${source.rightsBasis}`,
        `RESEARCH QUESTIONS:\n${source.researchQuestions.map((question) => `- ${question}`).join("\n")}`,
        `TARGET TAGS: ${source.targetTags.join(", ")}`,
        typeof sourceEvidence === "string" ? `AUTHORITATIVE TEXT:\n${sourceEvidence}` : "AUTHORITATIVE PDF: Read the attached official source and cite its printed page or section labels.",
      ].join("\n\n"),
      }, ...(typeof sourceEvidence === "string" ? [] : [sourceEvidence])],
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
    error_message: null,
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
  if (approved.data?.length && row.source_mode !== "collection-discovery" && row.query_key === "root") {
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
    const timedResult = await processDirectorTimedMedia(row.input?.timedMedia, {
      jobId: row.id,
      queryKey: row.query_key,
      sourceId: source.id,
      sourceTitle: source.title,
      sourceKind: "public-domain",
      institution: source.institution,
      rightsBasis: source.rightsBasis,
      accessNotes: source.accessNotes,
      createdBy: row.created_by,
      progress: async (phase, progress, message) => updateClaimedJob(row, { phase, progress, message }),
    });
    await updateClaimedJob(row, {
      status: "review-required",
      phase: "playback-review-required",
      progress: 90,
      message: "Picture and sound evidence are ready; direct human playback is required before this study can be reviewed",
      model: timedResult.model,
      provider_response_id: timedResult.providerResponseIds.visualSynthesis,
      usage: timedResult.usage,
      output: {
        analysisId: timedResult.analysisId,
        studyId: timedResult.studyId,
        count: timedResult.observationCount,
        principleCount: timedResult.principleCount,
        requiredReview: "direct-human-playback",
      },
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

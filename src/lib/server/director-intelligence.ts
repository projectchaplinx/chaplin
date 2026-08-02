import "server-only";

import { DIRECTOR_PATTERNS, DIRECTOR_PERIOD_PROFILES, DIRECTOR_SOURCES } from "@/lib/director-brain";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

/**
 * One aggregated answer to "what does the brain actually know right now?"
 *
 * Every other Director Brain surface shows activity — jobs, phases, counters.
 * This module shows knowledge: the principles Magic can retrieve today, where
 * they came from, which craft axes they cover, and which axes are still empty.
 * Data crunched but not yet decided is shown as exactly that — undecided.
 */

export type IntelligencePrinciple = {
  text: string;
  domain: string;
  workTitle: string;
  origin: "built-in" | "approved-study";
};

export type IntelligenceDomainCoverage = {
  domain: string;
  retrievable: number;
  pendingDecision: number;
};

export type DirectorIntelligence = {
  storageReady: boolean;
  /** Rules Magic Write can inject today. */
  retrievable: {
    total: number;
    builtInPatterns: number;
    approvedStudyPrinciples: number;
    periodProfiles: number;
    principles: IntelligencePrinciple[];
  };
  /** Human-confirmed ground truth. */
  verified: {
    playbackVerifiedPassages: number;
    denseVerifierHeld: number;
    denseVerifierRefuted: number;
  };
  /** Collected but undecided — the honest backlog. */
  undecided: {
    draftStudies: number;
    draftPrinciples: number;
    parkedPrinciples: number;
    discardedPrinciples: number;
    manifestsAwaitingReview: number;
  };
  /** Evidence produced by our own renders (the new research direction). */
  productionEvidence: {
    decisionTraces: number;
    evaluations: number;
    humanVerdicts: number;
  };
  coverageByDomain: IntelligenceDomainCoverage[];
  /** Axes the corpus cannot serve yet, with the reason recorded. */
  namedGaps: Array<{ axis: string; reason: string }>;
  sourcesTotal: number;
};

export type RenderLearningPanels = {
  identityReadings: Array<{
    at: string;
    label: string;
    identityContinuity: number | null;
    wardrobeContinuity: number | null;
    gateStatus: string;
    driftNotes: string[];
  }>;
  killByVariable: Array<{ variable: string; kept: number; killed: number }>;
};

/**
 * The two learning panels that only exist because renders are instrumented:
 * measured identity hold per clip, and what people actually kill work over.
 */
export async function getRenderLearningPanels(): Promise<RenderLearningPanels> {
  const supabase = getSupabaseAdminClient();
  const [readingsResult, verdictsResult] = await Promise.all([
    supabase
      .from("director_evaluations")
      .select("created_at,gate_status,evidence")
      .eq("evaluator_kind", "automatic")
      .eq("evidence->>instrument", "identity-v1")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("generation_verdicts").select("verdict,changed_variable"),
  ]);
  const identityReadings = (readingsResult.data ?? []).map((row) => {
    const evidence = (row.evidence && typeof row.evidence === "object" ? row.evidence : {}) as Record<string, unknown>;
    return {
      at: String(row.created_at),
      label: typeof evidence.label === "string" ? evidence.label : "shot",
      identityContinuity: typeof evidence.identityContinuity === "number" ? evidence.identityContinuity : null,
      wardrobeContinuity: typeof evidence.wardrobeContinuity === "number" ? evidence.wardrobeContinuity : null,
      gateStatus: String(row.gate_status ?? "incomplete"),
      driftNotes: Array.isArray(evidence.driftNotes) ? evidence.driftNotes.filter((note): note is string => typeof note === "string").slice(0, 4) : [],
    };
  });
  const byVariable = new Map<string, { kept: number; killed: number }>();
  for (const row of verdictsResult.data ?? []) {
    if (!row.changed_variable || row.verdict === "pending") continue;
    const entry = byVariable.get(row.changed_variable) ?? { kept: 0, killed: 0 };
    if (row.verdict === "kept") entry.kept += 1;
    else entry.killed += 1;
    byVariable.set(row.changed_variable, entry);
  }
  return {
    identityReadings,
    killByVariable: [...byVariable.entries()]
      .map(([variable, counts]) => ({ variable, ...counts }))
      .sort((a, b) => (b.killed + b.kept) - (a.killed + a.kept)),
  };
}

async function count(table: string) {
  const { count: value, error } = await getSupabaseAdminClient().from(table).select("*", { count: "exact", head: true });
  if (error) return null;
  return value ?? 0;
}

export async function getDirectorIntelligence(): Promise<DirectorIntelligence> {
  const supabase = getSupabaseAdminClient();

  const builtIn: IntelligencePrinciple[] = DIRECTOR_PATTERNS.map((pattern) => ({
    text: pattern.principle,
    domain: pattern.domain,
    workTitle: pattern.name,
    origin: "built-in" as const,
  }));

  const [studiesResult, assessmentsResult, timedResult, denseResult, manifestsResult, tracesCount, evaluationsCount, verdictsCount] = await Promise.all([
    supabase.from("director_scene_studies").select("study_title,work_title,status,tags,candidate_principles"),
    supabase.from("director_principle_assessments").select("lane,character_axis,sprint_run_id,created_at").order("created_at", { ascending: false }),
    supabase.from("director_timed_media_analyses").select("playback_status"),
    supabase.from("director_dense_verifications").select("verdict"),
    supabase.from("director_evidence_manifests").select("status"),
    count("director_decision_traces"),
    count("director_evaluations"),
    count("generation_verdicts"),
  ]);

  const storageReady = !studiesResult.error;
  const studies = studiesResult.data ?? [];
  const approvedPrinciples: IntelligencePrinciple[] = studies
    .filter((study) => study.status === "approved")
    .flatMap((study) => (Array.isArray(study.candidate_principles) ? study.candidate_principles : [])
      .filter((principle): principle is string => typeof principle === "string")
      .map((principle) => ({
        text: principle,
        domain: (Array.isArray(study.tags) && study.tags[0]) || "craft",
        workTitle: study.work_title || study.study_title,
        origin: "approved-study" as const,
      })));

  const draftStudies = studies.filter((study) => study.status === "draft");
  const draftPrinciples = draftStudies.reduce((sum, study) => sum + (Array.isArray(study.candidate_principles) ? study.candidate_principles.length : 0), 0);

  // The latest triage run is the current truth for lane decisions.
  const assessments = assessmentsResult.data ?? [];
  const latestRunId = assessments[0]?.sprint_run_id ?? null;
  const latestAssessments = assessments.filter((assessment) => assessment.sprint_run_id === latestRunId);
  const lane = (name: string) => latestAssessments.filter((assessment) => assessment.lane === name).length;

  const timed = timedResult.data ?? [];
  const dense = denseResult.data ?? [];
  const manifests = manifestsResult.data ?? [];

  const retrievablePrinciples = [...builtIn, ...approvedPrinciples];
  const domains = new Map<string, IntelligenceDomainCoverage>();
  for (const principle of retrievablePrinciples) {
    const entry = domains.get(principle.domain) ?? { domain: principle.domain, retrievable: 0, pendingDecision: 0 };
    entry.retrievable += 1;
    domains.set(principle.domain, entry);
  }
  for (const study of draftStudies) {
    const domain = (Array.isArray(study.tags) && study.tags[0]) || "craft";
    const entry = domains.get(domain) ?? { domain, retrievable: 0, pendingDecision: 0 };
    entry.pendingDecision += (Array.isArray(study.candidate_principles) ? study.candidate_principles.length : 0);
    domains.set(domain, entry);
  }

  const identityRetrievable = retrievablePrinciples.filter((principle) =>
    /identity|wardrobe|same face|recognis|recognizab|continuity of (?:face|costume)/i.test(principle.text)).length;

  return {
    storageReady,
    retrievable: {
      total: retrievablePrinciples.length,
      builtInPatterns: builtIn.length,
      approvedStudyPrinciples: approvedPrinciples.length,
      periodProfiles: DIRECTOR_PERIOD_PROFILES.length,
      principles: retrievablePrinciples,
    },
    verified: {
      playbackVerifiedPassages: timed.filter((row) => row.playback_status === "verified").length,
      denseVerifierHeld: dense.filter((row) => row.verdict === "held").length,
      denseVerifierRefuted: dense.filter((row) => row.verdict === "refuted").length,
    },
    undecided: {
      draftStudies: draftStudies.length,
      draftPrinciples,
      parkedPrinciples: lane("park"),
      discardedPrinciples: lane("discard"),
      manifestsAwaitingReview: manifests.filter((row) => row.status === "discovered" || row.status === "needs-review").length,
    },
    productionEvidence: {
      decisionTraces: tracesCount ?? 0,
      evaluations: evaluationsCount ?? 0,
      humanVerdicts: verdictsCount ?? 0,
    },
    coverageByDomain: [...domains.values()].sort((a, b) => b.retrievable - a.retrievable),
    namedGaps: [
      ...(identityRetrievable < 3
        ? [{
            axis: "identity-continuity",
            reason: "Contact-sheet sampling cannot observe persistence across time; only " + identityRetrievable + " retrievable principle(s) protect face, wardrobe, or prop continuity. Production-render instrumentation is the replacement method.",
          }]
        : []),
      ...(retrievablePrinciples.filter((principle) => /voice|dialogue|speech/i.test(principle.text)).length === 0
        ? [{ axis: "voice-performance", reason: "No retrievable principle governs spoken performance; locked-voice evidence only exists as pipeline rules, not craft knowledge." }]
        : []),
    ],
    sourcesTotal: DIRECTOR_SOURCES.length,
  };
}

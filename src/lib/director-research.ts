export const DIRECTOR_SOURCE_KINDS = [
  "institutional",
  "public-domain",
  "licensed",
  "filmmaker-interview",
  "provider-research",
  "chaplin-test",
] as const;

export type DirectorSourceKind = typeof DIRECTOR_SOURCE_KINDS[number];
export type DirectorStudyStatus = "draft" | "reviewed" | "approved" | "rejected";

export const DIRECTOR_EVIDENCE_LOCATOR_KINDS = [
  "time",
  "page",
  "section",
  "record",
  "object",
  "api-field",
  "benchmark",
] as const;

export type DirectorEvidenceLocator = {
  kind: typeof DIRECTOR_EVIDENCE_LOCATOR_KINDS[number];
  value: string;
};

export type DirectorStudyObservation = {
  /** Legacy timed studies infer a time locator from start/end. New studies persist this explicitly. */
  locator?: DirectorEvidenceLocator;
  startSecond?: number;
  endSecond?: number;
  evidence: string;
  craft: string;
  transition: string;
  narrativeJob: string;
  inference: string;
  confidence: "low" | "medium" | "high";
  audioEvidence?: string;
  soundFunction?: string;
};

export type DirectorResearchSourceRecord = {
  id: string;
  title: string;
  institution: string;
  sourceUrl: string | null;
  sourceKind: DirectorSourceKind;
  rightsBasis: string;
  accessNotes: string;
  campaignId: string;
  targetTags: string[];
  researchQuestions: string[];
  priority: "now" | "next" | "later";
  queueStatus: "queued" | "in-progress" | "analyzed" | "paused";
  lastVerifiedAt: string | null;
};

export type DirectorSceneStudy = {
  id: string;
  studyTitle: string;
  workTitle: string;
  sceneLocator: string;
  durationSeconds: number | null;
  periodLabel: string;
  region: string;
  tags: string[];
  observations: DirectorStudyObservation[];
  candidatePrinciples: string[];
  limitations: string;
  reviewNotes: string;
  status: DirectorStudyStatus;
  source: DirectorResearchSourceRecord;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

export type DirectorResearchBundle = {
  storageReady: boolean;
  sources: DirectorResearchSourceRecord[];
  studies: DirectorSceneStudy[];
};

export const DIRECTOR_RESEARCH_SOURCE_MODES = [
  "document",
  "collection-discovery",
  "provenance",
  "timed-media",
  "provider-doc",
] as const;

export type DirectorResearchSourceMode = typeof DIRECTOR_RESEARCH_SOURCE_MODES[number];

export type DirectorResearchJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "review-required"
  | "cancelled";

export type DirectorResearchJob = {
  id: string;
  supersedesJobId: string | null;
  attemptSequence: number;
  sourceId: string;
  sourceTitle: string;
  sourceMode: DirectorResearchSourceMode;
  queryKey: string;
  queryLabel: string;
  status: DirectorResearchJobStatus;
  phase: string;
  progress: number;
  message: string;
  attempt: number;
  maxAttempts: number;
  model: string | null;
  errorMessage: string | null;
  evidenceCount: number;
  /** Durable references produced by the worker (manifest IDs, study IDs, or archived asset metadata). */
  output: Record<string, unknown>;
  /** Provider usage is retained for audit and cost review, never used as research evidence. */
  usage: Record<string, unknown>;
  costUsd: number | null;
  costMethod: string;
  pricingNote: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  events: DirectorResearchEvent[];
};

export type DirectorResearchEvent = {
  id: string;
  kind: string;
  phase: string;
  status: string;
  progress: number | null;
  message: string;
  details: Record<string, unknown>;
  actor: string | null;
  createdAt: string;
};

/**
 * A chaplin-test source is Chaplin's own controlled production evidence. Its
 * material comes from render instrumentation, never from fetching a URL, so
 * it must not be enqueued as a research job at all.
 */
export function isChaplinTestSource(source: Pick<DirectorResearchSourceRecord, "sourceKind">) {
  return source.sourceKind === "chaplin-test";
}

export function directorResearchSourceMode(source: Pick<DirectorResearchSourceRecord, "sourceKind" | "sourceUrl" | "targetTags" | "title">): DirectorResearchSourceMode {
  const joined = `${source.title} ${source.sourceUrl ?? ""} ${source.targetTags.join(" ")}`.toLowerCase();
  if (source.targetTags.includes("public-domain-scene") && /viewing file|\.webm|\.mp4|archive\.org/.test(joined)) return "timed-media";
  if (/open access|collections? (?:and|&) api|collection api|metadata api|structured era-evidence discovery|digital public library|dpla|europeana|smithsonian/.test(joined)) return "collection-discovery";
  if (source.sourceKind === "public-domain" && source.targetTags.includes("public-domain-scene")) return "provenance";
  if (source.sourceKind === "provider-research") return "provider-doc";
  return "document";
}

export type ApprovedDirectorStudyContext = {
  id: string;
  studyTitle: string;
  workTitle: string;
  sourceTitle: string;
  sourceUrl: string | null;
  sourceKind: DirectorSourceKind;
  rightsBasis: string;
  periodLabel?: string;
  region?: string;
  limitations?: string;
  principles: string[];
  score: number;
};

export const DIRECTOR_RESEARCH_DOMAINS = [
  "story",
  "camera",
  "blocking",
  "editing",
  "sound",
  "action",
  "dialogue",
  "comedy",
  "suspense",
  "period",
  "ai",
  "performance",
  "production-design",
  "costume",
  "vfx",
  "color",
] as const;

export type DirectorResearchDiagnostics = {
  approvedStudies: number;
  awaitingDecision: number;
  reviewReady: number;
  incompleteDrafts: number;
  totalObservedSeconds: number;
  sourceCount: number;
  rightsDocumented: number;
  soundEvidenceStudies: number;
  soundObservedSeconds: number;
  periodEvidenceStudies: number;
  periodRegions: number;
  confidence: Record<DirectorStudyObservation["confidence"], number>;
  coverage: Array<{ domain: typeof DIRECTOR_RESEARCH_DOMAINS[number]; approvedStudies: number }>;
  comparisonQueue: Array<{
    leftId: string;
    leftTitle: string;
    rightId: string;
    rightTitle: string;
    sharedTags: string[];
  }>;
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function multiline(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().replace(/\r\n/g, "\n").slice(0, max) : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

const SCREENPLAY_HEADING = /(?:^|\n)\s*(?:INT|EXT|INT\/EXT|EXT\/INT)\.\s+/i;
const SPEAKER_BLOCK = /(?:^|\n)\s*[A-Z][A-Z0-9 .'-]{2,30}\s*(?:\([^)]*\))?\s*\n/g;
const TRANSCRIPT_MARKER = /\b(?:full transcript|screenplay|script pages?|verbatim dialogue|subtitle file|srt file)\b/i;
const LONG_QUOTE = /["“][^"”]{120,}["”]/;

export function assertResearchTextIsAnalytical(value: string) {
  const normalized = value.trim();
  if (!normalized) return;
  const speakerBlocks = normalized.match(SPEAKER_BLOCK)?.length ?? 0;
  if (
    SCREENPLAY_HEADING.test(normalized)
    || speakerBlocks >= 2
    || TRANSCRIPT_MARKER.test(normalized)
    || LONG_QUOTE.test(normalized)
  ) {
    throw new Error("Store observable craft analysis, not screenplay pages, transcripts, subtitles, or copied dialogue.");
  }
}

export function parseObservationLines(value: unknown): DirectorStudyObservation[] {
  const raw = multiline(value, 20_000);
  assertResearchTextIsAnalytical(raw);
  if (!raw) return [];
  return raw.split("\n").flatMap((line, index) => {
    if (!line.trim()) return [];
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 2) {
      throw new Error(`Observation line ${index + 1} needs "locator | observable change" at minimum.`);
    }
    const rawLocator = parts[0];
    const range = /^(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?$/.exec(rawLocator);
    const namedLocator = /^(page|section|record|object|api-field|benchmark)\s*:\s*(.+)$/i.exec(rawLocator);
    if (!range && !namedLocator) {
      throw new Error(`Observation line ${index + 1} needs a time range or a named locator such as "page: 12" or "section: Camera movement".`);
    }
    const startSecond = range ? Number(range[1]) : undefined;
    const endSecond = range ? Number(range[2] ?? range[1]) : undefined;
    if (startSecond != null && endSecond != null && (endSecond < startSecond || endSecond - startSecond > 300)) {
      throw new Error(`Observation line ${index + 1} has an invalid time range.`);
    }
    const locator: DirectorEvidenceLocator = range
      ? { kind: "time", value: rawLocator }
      : {
          kind: namedLocator![1].toLowerCase() as DirectorEvidenceLocator["kind"],
          value: text(namedLocator![2], 240),
        };
    const evidence = text(parts[1], 500);
    if (evidence.length < 5) throw new Error(`Observation line ${index + 1} needs an observable change.`);
    const inference = text(parts[5], 500);
    assertResearchTextIsAnalytical(`${evidence}\n${inference}`);
    const confidence: DirectorStudyObservation["confidence"] =
      parts[6] === "low" || parts[6] === "medium" ? parts[6] : "high";
    return [{
      locator,
      ...(startSecond != null ? { startSecond } : {}),
      ...(endSecond != null ? { endSecond } : {}),
      evidence,
      craft: text(parts[2], 400),
      transition: text(parts[3], 400),
      narrativeJob: text(parts[4], 400),
      inference,
      confidence,
      audioEvidence: text(parts[7], 500),
      soundFunction: text(parts[8], 500),
    }];
  }).slice(0, 500);
}

export function parsePrincipleLines(value: unknown) {
  const raw = multiline(value, 12_000);
  assertResearchTextIsAnalytical(raw);
  return unique(raw.split("\n").map((line) => text(line.replace(/^[-*]\s*/, ""), 500))).slice(0, 40);
}

export function normalizeDirectorStudyInput(input: Record<string, unknown>) {
  const sourceKind = DIRECTOR_SOURCE_KINDS.includes(input.sourceKind as DirectorSourceKind)
    ? input.sourceKind as DirectorSourceKind
    : null;
  if (!sourceKind) throw new Error("Choose an allowed research-source type.");
  const sourceTitle = text(input.sourceTitle, 240);
  const studyTitle = text(input.studyTitle, 180);
  const rightsBasis = text(input.rightsBasis, 1000);
  if (sourceTitle.length < 3) throw new Error("Name the research source.");
  if (studyTitle.length < 3) throw new Error("Name the scene study.");
  if (rightsBasis.length < 10) throw new Error("Explain why Chaplin is allowed to analyze this source.");
  const sourceUrl = text(input.sourceUrl, 2000);
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw new Error("Research source URL must start with http:// or https://.");
  const observations = parseObservationLines(input.observationLines);
  if (!observations.length) throw new Error("Add at least one attributable evidence note.");
  const candidatePrinciples = parsePrincipleLines(input.candidatePrinciples);
  if (!candidatePrinciples.length) throw new Error("Add at least one candidate principle to review.");
  const duration = number(input.durationSeconds);
  if (duration != null && (duration <= 0 || duration > 86_400)) throw new Error("Duration must be greater than zero and no more than one day.");
  const analyticalText = [
    input.studyTitle,
    input.workTitle,
    input.sceneLocator,
    input.limitations,
    input.candidatePrinciples,
    input.observationLines,
  ].filter((value): value is string => typeof value === "string").join("\n");
  assertResearchTextIsAnalytical(analyticalText);
  return {
    source: {
      title: sourceTitle,
      institution: text(input.institution, 180),
      sourceUrl: sourceUrl || null,
      sourceKind,
      rightsBasis,
      accessNotes: text(input.accessNotes, 1000),
    },
    study: {
      studyTitle,
      workTitle: text(input.workTitle, 180),
      sceneLocator: text(input.sceneLocator, 240),
      durationSeconds: duration,
      periodLabel: text(input.periodLabel, 120),
      region: text(input.region, 180),
      tags: unique(
        (Array.isArray(input.tags) ? input.tags : String(input.tags ?? "").split(","))
          .map((tag) => text(tag, 50).toLowerCase().replace(/[^a-z0-9 -]/g, "")),
      ).slice(0, 30),
      observations,
      candidatePrinciples,
      limitations: multiline(input.limitations, 2000),
    },
  };
}

export function scoreDirectorStudyForBrief(study: DirectorSceneStudy, brief: string) {
  const geographyGroups = [
    ["india", "mughal", "south asia"],
    ["japan", "edo", "tokyo", "kyoto", "east asia"],
    ["mesopotamia", "uruk", "iraq", "west asia"],
    ["egypt", "north africa"],
    ["rome", "roman", "italy"],
    ["united states", "north america", "los angeles", "california"],
    ["europe", "france", "britain", "germany", "netherlands"],
    ["indonesia", "southeast asia"],
    ["nigeria", "congo", "sub-saharan africa"],
  ];
  const normalizedBrief = brief.toLowerCase();
  const normalizedStudyPlace = `${study.region} ${study.periodLabel} ${study.tags.join(" ")}`.toLowerCase();
  const briefPlaces = geographyGroups.map((aliases, index) => aliases.some((alias) => normalizedBrief.includes(alias)) ? index : -1).filter((index) => index >= 0);
  const studyPlaces = geographyGroups.map((aliases, index) => aliases.some((alias) => normalizedStudyPlace.includes(alias)) ? index : -1).filter((index) => index >= 0);
  if (briefPlaces.length && studyPlaces.length && !briefPlaces.some((place) => studyPlaces.includes(place))) return 0;
  const stopwords = new Set(["and", "the", "for", "with", "from", "into", "that", "this", "then", "than", "when", "where", "which", "while", "through", "scene", "shot", "seconds", "second"]);
  const tokens = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((word) => word.length > 2 && !stopwords.has(word));
  const query = new Set(tokens(brief));
  const searchable = new Set(tokens([
    study.studyTitle,
    study.workTitle,
    study.periodLabel,
    study.region,
    ...study.candidatePrinciples,
  ].join(" ")));
  const textScore = [...searchable].reduce((score, token) => score + (query.has(token) ? 1 : 0), 0);
  const tagScore = study.tags.reduce((score, tag) => score + (query.has(tag.toLowerCase()) ? 3 : 0), 0);
  return textScore + tagScore;
}

export function rankApprovedDirectorResearch(
  studies: DirectorSceneStudy[],
  brief: string,
  limit = 4,
): ApprovedDirectorStudyContext[] {
  return studies
    .filter((study) => study.status === "approved")
    .map((study) => ({ study, score: scoreDirectorStudyForBrief(study, brief) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.study.updatedAt.localeCompare(left.study.updatedAt))
    .slice(0, Math.max(1, Math.min(10, limit)))
    .map(({ study, score }) => ({
      id: study.id,
      studyTitle: study.studyTitle,
      workTitle: study.workTitle,
      sourceTitle: study.source.title,
      sourceUrl: study.source.sourceUrl,
      sourceKind: study.source.sourceKind,
      rightsBasis: study.source.rightsBasis,
      periodLabel: study.periodLabel,
      region: study.region,
      limitations: study.limitations,
      principles: study.candidatePrinciples,
      score,
    }));
}

export function filterPlaybackSafeDirectorResearch(
  studies: DirectorSceneStudy[],
  timedAnalyses: Array<{ studyId: string | null; playbackStatus: "required" | "verified" | "rejected" }>,
) {
  const linkedStudyIds = new Set(timedAnalyses.flatMap((analysis) => analysis.studyId ? [analysis.studyId] : []));
  const verifiedStudyIds = new Set(timedAnalyses.flatMap((analysis) => (
    analysis.studyId && analysis.playbackStatus === "verified" ? [analysis.studyId] : []
  )));
  return studies.filter((study) => !linkedStudyIds.has(study.id) || verifiedStudyIds.has(study.id));
}

export function buildDirectorResearchDiagnostics(studies: DirectorSceneStudy[]): DirectorResearchDiagnostics {
  const approved = studies.filter((study) => study.status === "approved");
  const isReviewReady = (study: DirectorSceneStudy) =>
    study.status === "draft"
    && study.observations.length >= 3
    && study.candidatePrinciples.length >= 1
    && study.limitations.trim().length >= 40
    && study.source.rightsBasis.trim().length >= 10;
  const reviewReady = studies.filter(isReviewReady).length;
  const confidence = studies
    .flatMap((study) => study.observations)
    .reduce<Record<DirectorStudyObservation["confidence"], number>>((counts, observation) => {
      counts[observation.confidence] += 1;
      return counts;
    }, { low: 0, medium: 0, high: 0 });
  const coverage = DIRECTOR_RESEARCH_DOMAINS.map((domain) => ({
    domain,
    approvedStudies: approved.filter((study) => study.tags.includes(domain)).length,
  }));
  const comparisonQueue: DirectorResearchDiagnostics["comparisonQueue"] = [];
  for (let leftIndex = 0; leftIndex < approved.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < approved.length; rightIndex += 1) {
      const left = approved[leftIndex];
      const right = approved[rightIndex];
      const sharedTags = left.tags.filter((tag) => right.tags.includes(tag));
      if (sharedTags.length < 2) continue;
      comparisonQueue.push({
        leftId: left.id,
        leftTitle: left.studyTitle,
        rightId: right.id,
        rightTitle: right.studyTitle,
        sharedTags: sharedTags.slice(0, 5),
      });
    }
  }
  return {
    approvedStudies: approved.length,
    awaitingDecision: studies.filter((study) => study.status === "draft" || study.status === "reviewed").length,
    reviewReady,
    incompleteDrafts: studies.filter((study) => study.status === "draft" && !isReviewReady(study)).length,
    totalObservedSeconds: studies.reduce((total, study) => total + (study.durationSeconds ?? 0), 0),
    sourceCount: new Set(studies.map((study) => study.source.id)).size,
    rightsDocumented: studies.filter((study) => study.source.rightsBasis.trim().length >= 10).length,
    soundEvidenceStudies: studies.filter((study) => study.observations.some((observation) =>
      Boolean(observation.audioEvidence?.trim() || observation.soundFunction?.trim()),
    )).length,
    soundObservedSeconds: studies.reduce((total, study) => total + study.observations.reduce((studyTotal, observation) =>
      observation.audioEvidence?.trim() && observation.startSecond != null && observation.endSecond != null
        ? studyTotal + Math.max(0, observation.endSecond - observation.startSecond)
        : studyTotal,
    0), 0),
    periodEvidenceStudies: studies.filter((study) => Boolean(study.periodLabel.trim() && study.region.trim())).length,
    periodRegions: new Set(studies
      .filter((study) => study.periodLabel.trim() && study.region.trim())
      .map((study) => study.region.trim().toLowerCase())).size,
    confidence,
    coverage,
    comparisonQueue: comparisonQueue.slice(0, 20),
  };
}

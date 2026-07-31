import type { DirectorEvidenceManifest } from "@/lib/director-evidence-manifest";
import type {
  DirectorResearchJob,
  DirectorResearchSourceRecord,
  DirectorSceneStudy,
} from "@/lib/director-research";
import type { DirectorTimedMediaAnalysis } from "@/lib/director-timed-media";

export type DirectorResearchArchiveFolder = {
  source: DirectorResearchSourceRecord;
  jobs: DirectorResearchJob[];
  studies: DirectorSceneStudy[];
  evidence: DirectorEvidenceManifest[];
  media: DirectorTimedMediaAnalysis[];
  assetCount: number;
  updateCount: number;
  latestAt: string;
};

function latest(values: string[]) {
  return values.filter(Boolean).sort((left, right) => right.localeCompare(left))[0] ?? "";
}

/**
 * Builds the visible archive without duplicating persisted data. Every folder is
 * rooted in one authoritative source and links its jobs, evidence, derived film
 * assets, draft knowledge, and saved progress history.
 */
export function buildDirectorResearchArchiveFolders(input: {
  sources: DirectorResearchSourceRecord[];
  jobs: DirectorResearchJob[];
  studies: DirectorSceneStudy[];
  evidence: DirectorEvidenceManifest[];
  media: DirectorTimedMediaAnalysis[];
}) {
  const jobSource = new Map(input.jobs.map((job) => [job.id, job.sourceId]));
  return input.sources.map((source): DirectorResearchArchiveFolder => {
    const jobs = input.jobs.filter((job) => job.sourceId === source.id);
    const studies = input.studies.filter((study) => study.source.id === source.id);
    const evidence = input.evidence.filter((item) => item.sourceId === source.id);
    const media = input.media.filter((item) => jobSource.get(item.jobId) === source.id);
    return {
      source,
      jobs,
      studies,
      evidence,
      media,
      assetCount: evidence.length + media.reduce((count, item) => count + Object.values(item.artifactUrls).filter(Boolean).length, 0),
      updateCount: jobs.reduce((count, job) => count + job.events.length, 0) + media.reduce((count, item) => count + item.events.length, 0),
      latestAt: latest([
        ...jobs.map((job) => job.updatedAt),
        ...studies.map((study) => study.updatedAt),
        ...evidence.map((item) => item.updatedAt),
        ...media.map((item) => item.updatedAt),
      ]),
    };
  }).filter((folder) => folder.jobs.length || folder.studies.length || folder.evidence.length || folder.media.length)
    .sort((left, right) => right.latestAt.localeCompare(left.latestAt));
}

export function researchJobOutputSummary(output: Record<string, unknown>) {
  const manifestIds = Array.isArray(output.manifestIds) ? output.manifestIds.filter((id) => typeof id === "string") : [];
  const studyIds = Array.isArray(output.studyIds) ? output.studyIds.filter((id) => typeof id === "string") : [];
  const studyId = typeof output.studyId === "string" ? output.studyId : "";
  const parts = [];
  if (manifestIds.length) parts.push(`${manifestIds.length} evidence records`);
  if (studyIds.length) parts.push(`${studyIds.length} studies`);
  if (studyId) parts.push("1 draft study");
  return parts.join(" · ") || "No durable output yet";
}

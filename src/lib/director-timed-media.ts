import type { DirectorResearchEvent } from "@/lib/director-research";

export const DIRECTOR_TIMED_MEDIA_CONTRACT_VERSION = "2026-07-31.2";
export const DIRECTOR_TIMED_MEDIA_CLIP_SECONDS = 30;
export const DIRECTOR_TIMED_MEDIA_PASSAGES = 3;

export type DirectorTimedMediaRegistryItem = {
  itemId: string;
  title: string;
  itemUrl: string;
};

export type DirectorTimedMediaSource = DirectorTimedMediaRegistryItem & {
  mediaUrl: string;
  playbackUrl: string;
  durationSeconds: number;
  dateLabel: string;
  region: string;
  rightsBasis: string;
  mediaObjectId: string;
};

export type DirectorTimedMediaPassage = {
  id: string;
  startSecond: number;
  durationSeconds: number;
  label: string;
};

export type DirectorTimedMediaObservation = {
  startSecond: number;
  endSecond: number;
  evidence: string;
  craft: string;
  transition: string;
  narrativeJob: string;
  inference: string;
  confidence: "low" | "medium" | "high";
  audioEvidence: string;
  soundFunction: string;
};

export type DirectorTimedMediaAnalysis = {
  id: string;
  jobId: string;
  studyId: string | null;
  workTitle: string;
  itemUrl: string;
  mediaUrl: string;
  playbackUrl: string;
  startSecond: number;
  durationSeconds: number;
  queryKey: string;
  observations: DirectorTimedMediaObservation[];
  candidatePrinciples: string[];
  limitations: string;
  observationCount: number;
  principleCount: number;
  playbackStatus: "required" | "verified" | "rejected";
  reviewNotes: string;
  models: Record<string, unknown>;
  artifactUrls: { contactSheet?: string; waveform?: string; evidencePackage?: string };
  events: DirectorResearchEvent[];
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function list(value: unknown) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function absoluteLocUrl(value: string) {
  if (/^https:\/\//i.test(value)) return value;
  return `https://www.loc.gov${value.startsWith("/") ? value : `/${value}`}`;
}

export function parseLocPublicDomainRegistry(payload: unknown): DirectorTimedMediaRegistryItem[] {
  const root = object(payload);
  const content = list(root?.content);
  const components = content.flatMap((entry) => list(object(entry)?.components));
  const galleries = components.flatMap((entry) => list(object(entry)?.masonry_gallery));
  const items = galleries.flatMap((entry) => list(object(entry)?.items));
  const unique = new Map<string, DirectorTimedMediaRegistryItem>();
  for (const candidate of items) {
    const row = object(candidate);
    const link = text(row?.link);
    const title = text(row?.title);
    const match = /\/item\/([^/?#]+)\/?/i.exec(link);
    if (!match || !title) continue;
    unique.set(match[1], {
      itemId: match[1],
      title,
      itemUrl: absoluteLocUrl(link),
    });
  }
  return [...unique.values()];
}

function firstString(value: unknown) {
  return array(value).map(text).find(Boolean) ?? "";
}

function findMediaUrl(resource: Record<string, unknown>) {
  const stream = text(resource.video_stream);
  if (stream) return stream.replace("/full/full/0/full/default.m3u8", "/full/,360/0/full/default.m3u8");
  return findDirectMediaUrl(resource);
}

function findDirectMediaUrl(resource: Record<string, unknown>) {
  const direct = text(resource.video);
  if (direct) return direct;
  const files = array(resource.files).flatMap((entry) => Array.isArray(entry) ? entry : [entry]);
  for (const candidate of files) {
    const url = text(object(candidate)?.url) || text(object(candidate)?.download);
    if (/\.mp4(?:\?|$)/i.test(url)) return url;
  }
  return "";
}

export function parseLocTimedMediaSource(
  registryItem: DirectorTimedMediaRegistryItem,
  payload: unknown,
): DirectorTimedMediaSource {
  const root = object(payload);
  const item = object(root?.item) ?? root;
  const nestedItem = object(item?.item);
  const resources = array(item?.resources).length ? array(item?.resources) : array(root?.resources);
  const resource = resources.map(object).find((candidate) => candidate && findMediaUrl(candidate));
  if (!resource) throw new Error(`${registryItem.title} has no playable Library of Congress MP4 resource.`);
  const mediaUrl = findMediaUrl(resource);
  const playbackUrl = findDirectMediaUrl(resource) || mediaUrl;
  const media = new URL(mediaUrl);
  if (media.protocol !== "https:" || media.hostname !== "tile.loc.gov") {
    throw new Error(`${registryItem.title} resolved to an untrusted media host.`);
  }
  const durationSeconds = Number(resource.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`${registryItem.title} has no machine-readable duration.`);
  }
  const dateLabel = text(item?.date) || text(nestedItem?.date) || firstString(item?.date);
  const location = firstString(item?.location) || firstString(nestedItem?.location) || "United States";
  return {
    ...registryItem,
    title: text(item?.title) || text(nestedItem?.title) || registryItem.title,
    mediaUrl,
    playbackUrl,
    durationSeconds: Math.round(durationSeconds * 1000) / 1000,
    dateLabel,
    region: location,
    rightsBasis: "Listed by the Library of Congress in its Public Domain Films from the National Film Registry selection; the item record and its rights notice remain attached to every analysis.",
    mediaObjectId: text(resource.media_object_id),
  };
}

function roundedSecond(value: number) {
  return Math.max(0, Math.round(value * 1000) / 1000);
}

export function planTimedMediaPassages(
  durationSeconds: number,
  clipSeconds = DIRECTOR_TIMED_MEDIA_CLIP_SECONDS,
): DirectorTimedMediaPassage[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Film duration must be positive.");
  const duration = roundedSecond(durationSeconds);
  const boundedClip = Math.min(duration, Math.max(10, Math.min(90, clipSeconds)));
  if (duration <= boundedClip * 1.5) {
    return [{ id: "complete", startSecond: 0, durationSeconds: duration, label: "Complete work" }];
  }
  const lastStart = Math.max(0, duration - boundedClip);
  const starts = [0, Math.max(0, (duration - boundedClip) / 2), lastStart]
    .map(roundedSecond);
  return [...new Set(starts)].map((startSecond, index) => ({
    id: ["opening", "middle", "closing"][index] ?? `passage-${index + 1}`,
    startSecond,
    durationSeconds: roundedSecond(Math.min(boundedClip, duration - startSecond)),
    label: ["Opening passage", "Middle passage", "Closing passage"][index] ?? `Passage ${index + 1}`,
  }));
}

export function timedMediaQueryKey(itemId: string, passage: DirectorTimedMediaPassage) {
  return `film:${itemId}:${passage.id}:${passage.startSecond}-${passage.durationSeconds}`;
}

export function timedMediaLocator(startSecond: number, durationSeconds: number) {
  const endSecond = roundedSecond(startSecond + durationSeconds);
  return `Library of Congress viewing file ${startSecond.toFixed(3)}-${endSecond.toFixed(3)} seconds`;
}

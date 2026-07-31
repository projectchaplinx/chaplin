"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DirectorEvidenceManifest } from "@/lib/director-evidence-manifest";
import type { DirectorResearchBundle, DirectorResearchJob } from "@/lib/director-research";
import type { DirectorTimedMediaAnalysis } from "@/lib/director-timed-media";

type ArchiveTab = "activity" | "knowledge" | "evidence" | "media";

const TABS: Array<{ id: ArchiveTab; label: string }> = [
  { id: "activity", label: "Live activity" },
  { id: "knowledge", label: "Extracted knowledge" },
  { id: "evidence", label: "Source evidence" },
  { id: "media", label: "Film assets" },
];

export default function AdminDirectorResearchArchive({ initialBundle }: { initialBundle: DirectorResearchBundle }) {
  const [tab, setTab] = useState<ArchiveTab>("activity");
  const [jobs, setJobs] = useState<DirectorResearchJob[]>([]);
  const [studies, setStudies] = useState(initialBundle.studies);
  const [evidence, setEvidence] = useState<DirectorEvidenceManifest[]>([]);
  const [media, setMedia] = useState<DirectorTimedMediaAnalysis[]>([]);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [jobsResponse, researchResponse, evidenceResponse, mediaResponse] = await Promise.all([
      fetch("/api/admin/director-brain/research-jobs", { cache: "no-store" }),
      fetch("/api/admin/director-brain", { cache: "no-store" }),
      fetch("/api/admin/director-brain/evidence-manifests?limit=100", { cache: "no-store" }),
      fetch("/api/admin/director-brain/timed-media", { cache: "no-store" }),
    ]);
    const [jobsBody, researchBody, evidenceBody, mediaBody] = await Promise.all([
      jobsResponse.json(), researchResponse.json(), evidenceResponse.json(), mediaResponse.json(),
    ]);
    const failure = [
      [jobsResponse, jobsBody], [researchResponse, researchBody], [evidenceResponse, evidenceBody], [mediaResponse, mediaBody],
    ].find(([response]) => !(response as Response).ok);
    if (failure) throw new Error((failure[1] as { error?: string }).error || "Could not load the Director Brain archive.");
    setJobs(jobsBody.jobs ?? []);
    setStudies(researchBody.studies ?? []);
    setEvidence(evidenceBody.manifests ?? []);
    setMedia(mediaBody.analyses ?? []);
  }, []);

  useEffect(() => {
    const load = () => void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load the research archive."));
    const first = window.setTimeout(load, 0);
    const poll = window.setInterval(() => {
      if (jobs.some((job) => job.status === "running" || job.status === "queued")) load();
    }, 10_000);
    window.addEventListener("director-research-jobs-finished", load);
    window.addEventListener("director-research-changed", load);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
      window.removeEventListener("director-research-jobs-finished", load);
      window.removeEventListener("director-research-changed", load);
    };
  }, [jobs, refresh]);

  const eventCount = useMemo(() => jobs.reduce((count, job) => count + job.events.length, 0), [jobs]);
  const assetCount = useMemo(() => media.reduce((count, item) => count + Object.values(item.artifactUrls).filter(Boolean).length, 0), [media]);
  const running = jobs.filter((job) => job.status === "running");
  const recentJobs = [...jobs].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 12);

  return (
    <section id="research-archive" className="poster-card mb-8 overflow-hidden rounded-xl border-accent-secondary/25" data-director-research-archive>
      <header className="border-b border-line bg-gradient-to-r from-accent-secondary/[0.07] via-transparent to-accent/[0.06] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-accent-secondary">Director Brain · research archive</p>
            <h2 className="reel-title mt-1 text-3xl">Everything the brain is collecting</h2>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-grey">
              Sources, extracted observations, evidence records, derived film assets, progress updates, and review decisions all stay attached here. Draft material remains visible but cannot enter Magic retrieval until its review gate passes.
            </p>
          </div>
          <button type="button" onClick={() => void refresh().catch((cause) => setError(String(cause)))} className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink">Refresh archive</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Sources", initialBundle.sources.length], ["Research jobs", jobs.length], ["Saved updates", eventCount],
            ["Draft studies", studies.length], ["Evidence records", evidence.length], ["Derived assets", assetCount],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-line bg-black/15 p-3">
              <p className="text-xl font-semibold text-ink">{value}</p>
              <p className="text-[8px] uppercase tracking-[0.14em] text-grey">{label}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="border-b border-line px-4 pt-3">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`shrink-0 rounded-t-lg border border-b-0 px-4 py-2 text-[10px] font-semibold ${tab === item.id ? "border-accent-secondary/40 bg-accent-secondary/[0.08] text-ink" : "border-transparent text-grey"}`}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="m-4 rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3 text-xs text-red-100">{error}</p> : null}
      <div className="max-h-[520px] overflow-y-auto p-4 sm:p-5">
        {tab === "activity" ? (
          <div>
            <p className="mb-3 text-[10px] leading-5 text-grey">{running.length ? `${running.length} jobs are working now. Every phase change below is also retained in the append-only history.` : "No job is running at this moment. The completed history remains available."}</p>
            <div className="grid gap-2 lg:grid-cols-2">
              {recentJobs.map((job) => (
                <article key={job.id} className="rounded-lg border border-line bg-black/15 p-3">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-xs font-semibold text-ink">{job.sourceTitle}</h3><p className="truncate text-[9px] text-accent-secondary">{job.queryLabel}</p></div><span className="text-[8px] uppercase text-grey">{job.status}</span></div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-accent to-accent-secondary" style={{ width: `${job.progress}%` }} /></div>
                  <p className="mt-2 text-[10px] text-grey">{job.phase} · {job.message}</p>
                  <p className="mt-1 text-[8px] text-white/35">{job.events.length} saved updates · {new Date(job.updatedAt).toLocaleString()}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "knowledge" ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {studies.map((study) => (
              <article key={study.id} className="rounded-lg border border-line bg-black/15 p-4">
                <div className="flex justify-between gap-3"><div><p className="text-xs font-semibold text-ink">{study.studyTitle}</p><p className="mt-1 text-[9px] text-grey">{study.source.institution} · {study.workTitle}</p></div><span className="shrink-0 text-[8px] uppercase text-accent-secondary">{study.status}</span></div>
                <p className="mt-3 text-[10px] leading-4 text-grey">{study.observations.length} attributable observations · {study.candidatePrinciples.length} candidate principles</p>
                <p className="mt-2 text-[9px] text-amber-100">{study.status === "approved" ? "Available to retrieval" : "Visible here, but not injected"}</p>
              </article>
            ))}
          </div>
        ) : null}

        {tab === "evidence" ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {evidence.map((item) => (
              <a key={item.id} href={item.canonicalUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-black/15 p-4 hover:border-accent-secondary/40">
                <div className="flex justify-between gap-3"><p className="text-xs font-semibold text-ink">{item.title}</p><span className="shrink-0 text-[8px] uppercase text-accent-secondary">{item.status}</span></div>
                <p className="mt-2 text-[9px] text-grey">{item.institution} · {item.dateLabel || "date unresolved"} · {item.reuseStatus}</p>
                <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-grey">{item.rightsLabel || "Rights unresolved"}</p>
              </a>
            ))}
          </div>
        ) : null}

        {tab === "media" ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {media.map((item) => (
              <article key={item.id} className="rounded-lg border border-line bg-black/15 p-3">
                <div className="flex justify-between gap-3"><div><p className="text-xs font-semibold text-ink">{item.workTitle}</p><p className="mt-1 text-[9px] text-grey">{item.startSecond.toFixed(1)}–{(item.startSecond + item.durationSeconds).toFixed(1)}s</p></div><span className="text-[8px] uppercase text-amber-100">{item.playbackStatus}</span></div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {item.artifactUrls.contactSheet ? <img src={item.artifactUrls.contactSheet} alt={`Contact sheet for ${item.workTitle}`} className="aspect-video w-full rounded-md border border-white/10 bg-black object-contain" /> : <div className="grid aspect-video place-items-center rounded-md border border-dashed border-line text-[9px] text-grey">Contact sheet pending</div>}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {item.artifactUrls.waveform ? <img src={item.artifactUrls.waveform} alt={`Signal waveform for ${item.workTitle}`} className="aspect-video w-full rounded-md border border-white/10 bg-black object-contain" /> : <div className="grid aspect-video place-items-center rounded-md border border-dashed border-line text-[9px] text-grey">Waveform pending</div>}
                </div>
                <div className="mt-3 flex gap-3 text-[9px] font-semibold"><a href={item.itemUrl} target="_blank" rel="noreferrer" className="text-accent-secondary">Source record ↗</a>{item.artifactUrls.evidencePackage ? <a href={item.artifactUrls.evidencePackage} target="_blank" rel="noreferrer" className="text-ink">Evidence package ↗</a> : null}</div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

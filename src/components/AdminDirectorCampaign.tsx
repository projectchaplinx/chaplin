"use client";

import { useMemo, useState } from "react";
import {
  campaignTrackLabel,
  DIRECTOR_RESEARCH_CAMPAIGN_VERSION,
  DIRECTOR_RESEARCH_COVERAGE_TARGETS,
} from "@/lib/director-research-campaign";
import type { DirectorResearchBundle, DirectorResearchSourceRecord } from "@/lib/director-research";

type QueueStatus = DirectorResearchSourceRecord["queueStatus"];

function queueStatusLabel(status: QueueStatus) {
  if (status === "in-progress") return "In progress";
  if (status === "analyzed") return "Analyzed";
  if (status === "paused") return "Paused";
  return "Queued";
}

function queueStatusClass(status: QueueStatus) {
  if (status === "analyzed") return "border-emerald-400/35 text-emerald-200";
  if (status === "in-progress") return "border-accent-secondary/40 text-accent-secondary";
  if (status === "paused") return "border-amber-300/35 text-amber-100";
  return "border-white/15 text-grey";
}

export default function AdminDirectorCampaign({ initialBundle }: { initialBundle: DirectorResearchBundle }) {
  const [bundle, setBundle] = useState(initialBundle);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const campaignSources = useMemo(
    () => bundle.sources
      .filter((source) => source.campaignId === DIRECTOR_RESEARCH_CAMPAIGN_VERSION)
      .sort((left, right) => {
        const weight = { now: 0, next: 1, later: 2 };
        return weight[left.priority] - weight[right.priority] || left.title.localeCompare(right.title);
      }),
    [bundle.sources],
  );
  const statusCounts = useMemo(() => ({
    queued: campaignSources.filter((source) => source.queueStatus === "queued").length,
    active: campaignSources.filter((source) => source.queueStatus === "in-progress").length,
    analyzed: campaignSources.filter((source) => source.queueStatus === "analyzed").length,
  }), [campaignSources]);

  async function updateSource(sourceId: string, queueStatus: QueueStatus) {
    setBusyId(sourceId);
    setError("");
    try {
      const response = await fetch("/api/admin/director-brain", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId, queueStatus }),
      });
      const data = await response.json() as DirectorResearchBundle & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not update the research queue.");
      setBundle(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the research queue.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mb-10" data-director-campaign>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Corpus campaign · {DIRECTOR_RESEARCH_CAMPAIGN_VERSION}</p>
          <h2 className="reel-title mt-1 text-3xl">What the brain learns next</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-grey">
            This is the working backlog across film craft, rights-cleared timed scenes, historical worlds, and current AI-production controls. A queued source is not a rule; analysis and human approval are still required.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.12em] text-grey">
          <span className="rounded-full border border-line px-2.5 py-1">{statusCounts.queued} queued</span>
          <span className="rounded-full border border-accent-secondary/30 px-2.5 py-1 text-accent-secondary">{statusCounts.active} active</span>
          <span className="rounded-full border border-emerald-400/30 px-2.5 py-1 text-emerald-200">{statusCounts.analyzed} analyzed</span>
        </div>
      </div>

      {error ? <div className="mb-4 rounded-xl border border-red-400/35 bg-red-400/[0.07] p-4 text-xs text-red-100">{error}</div> : null}

      <div className="poster-card mb-5 rounded-xl p-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">Coverage targets · approved studies, not source count</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {DIRECTOR_RESEARCH_COVERAGE_TARGETS.map((target) => {
            const approved = bundle.studies.filter((study) => study.status === "approved" && study.tags.includes(target.id)).length;
            const queued = campaignSources.filter((source) => source.targetTags.includes(target.id)).length;
            const percentage = Math.min(100, Math.round((approved / target.targetApprovedStudies) * 100));
            return (
              <article key={target.id} className="rounded-lg border border-white/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <span className="block text-xs font-semibold text-ink">{target.label}</span>
                    <span className="mt-1 block text-[9px] text-grey">{campaignTrackLabel(target.track)}</span>
                  </span>
                  <span className="font-mono text-[10px] text-accent-secondary">{approved}/{target.targetApprovedStudies}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-accent-secondary" style={{ width: `${percentage}%` }} />
                </div>
                <p className="mt-2 text-[9px] leading-4 text-grey">{queued} queued sources · {target.reason}</p>
              </article>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {campaignSources.map((source) => (
          <article key={source.id} className="rounded-xl border border-line bg-black/15 p-4" data-research-source={source.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-accent-secondary">
                  {source.targetTags.includes("public-domain-scene")
                    ? "Timed public-domain scenes"
                    : source.sourceKind === "provider-research"
                      ? "AI production"
                      : source.targetTags.includes("period")
                        ? "Historical worlds"
                        : "Film craft"}
                  {" · "}{source.priority}
                </p>
                <h3 className="mt-1 text-base font-semibold text-ink">{source.title}</h3>
                <p className="mt-1 text-[10px] text-grey">{source.institution}</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] ${queueStatusClass(source.queueStatus)}`}>
                {queueStatusLabel(source.queueStatus)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {source.targetTags.map((tag) => <span key={tag} className="rounded-full border border-white/10 px-2 py-1 text-[8px] text-grey">{tag}</span>)}
            </div>
            <ul className="mt-3 space-y-1.5 text-[10px] leading-5 text-grey">
              {source.researchQuestions.map((question) => <li key={question}>→ {question}</li>)}
            </ul>
            <details className="mt-3 rounded-lg border border-white/10 p-3 text-[10px] leading-5 text-grey">
              <summary className="cursor-pointer font-semibold text-ink">Rights and research boundary</summary>
              <p className="mt-2">{source.rightsBasis}</p>
              {source.accessNotes ? <p className="mt-2 text-white/45">{source.accessNotes}</p> : null}
            </details>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-accent-secondary hover:text-ink">Open authoritative source ↗</a> : <span />}
              <div className="flex flex-wrap gap-1.5">
                {source.queueStatus !== "in-progress" ? (
                  <button disabled={busyId === source.id} type="button" onClick={() => void updateSource(source.id, "in-progress")} className="rounded-full border border-accent-secondary/35 px-2.5 py-1.5 text-[9px] font-semibold text-accent-secondary disabled:opacity-40">
                    Start analysis
                  </button>
                ) : null}
                {source.queueStatus !== "analyzed" ? (
                  <button disabled={busyId === source.id} type="button" onClick={() => void updateSource(source.id, "analyzed")} className="rounded-full border border-emerald-400/35 px-2.5 py-1.5 text-[9px] font-semibold text-emerald-200 disabled:opacity-40">
                    Mark analyzed
                  </button>
                ) : null}
                {source.queueStatus !== "paused" ? (
                  <button disabled={busyId === source.id} type="button" onClick={() => void updateSource(source.id, "paused")} className="rounded-full border border-line px-2.5 py-1.5 text-[9px] font-semibold text-grey disabled:opacity-40">
                    Pause
                  </button>
                ) : (
                  <button disabled={busyId === source.id} type="button" onClick={() => void updateSource(source.id, "queued")} className="rounded-full border border-line px-2.5 py-1.5 text-[9px] font-semibold text-grey disabled:opacity-40">
                    Return to queue
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { DirectorResearchJob } from "@/lib/director-research";

function statusTone(status: DirectorResearchJob["status"]) {
  if (status === "succeeded") return "text-emerald-200 border-emerald-400/30";
  if (status === "running") return "text-accent-secondary border-accent-secondary/35";
  if (status === "review-required") return "text-amber-100 border-amber-300/30";
  if (status === "failed") return "text-red-100 border-red-400/30";
  return "text-grey border-white/10";
}

export default function AdminDirectorResearchJobs() {
  const [jobs, setJobs] = useState<DirectorResearchJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const counts = useMemo(() => jobs.reduce<Record<string, number>>((result, job) => {
    result[job.status] = (result[job.status] ?? 0) + 1;
    return result;
  }, {}), [jobs]);
  const evidenceCount = useMemo(() => jobs.reduce((total, job) => total + job.evidenceCount, 0), [jobs]);
  const configurationBlocks = useMemo(() => jobs.filter((job) => job.phase === "configuration-required").length, [jobs]);

  async function refresh() {
    const response = await fetch("/api/admin/director-brain/research-jobs", { cache: "no-store" });
    const data = await response.json() as { jobs?: DirectorResearchJob[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Could not load research jobs.");
    setJobs(data.jobs ?? []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load research jobs."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function runAll() {
    setBusy(true);
    setError("");
    try {
      const queued = await fetch("/api/admin/director-brain/research-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "enqueue-all" }),
      });
      const queuedData = await queued.json() as { jobs?: DirectorResearchJob[]; error?: string };
      if (!queued.ok) throw new Error(queuedData.error || "Could not queue research.");
      setJobs(queuedData.jobs ?? []);
      for (let wave = 0; wave < 20; wave += 1) {
        const response = await fetch("/api/admin/director-brain/research-jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "run" }),
        });
        const data = await response.json() as { claimed?: number; jobs?: DirectorResearchJob[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Research worker stopped.");
        setJobs(data.jobs ?? []);
        if (!data.claimed) break;
      }
      window.dispatchEvent(new Event("director-research-jobs-finished"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Research worker stopped.");
    } finally {
      setBusy(false);
      await refresh().catch(() => undefined);
    }
  }

  async function researchCoverageGaps() {
    setBusy(true);
    setError("");
    try {
      const queued = await fetch("/api/admin/director-brain/research-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "enqueue-gaps" }),
      });
      const queuedData = await queued.json() as { jobs?: DirectorResearchJob[]; error?: string };
      if (!queued.ok) throw new Error(queuedData.error || "Could not queue Atlas gaps.");
      setJobs(queuedData.jobs ?? []);
      const run = await fetch("/api/admin/director-brain/research-jobs", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run" }),
      });
      const runData = await run.json() as { jobs?: DirectorResearchJob[]; error?: string };
      if (!run.ok) throw new Error(runData.error || "Gap research worker stopped.");
      setJobs(runData.jobs ?? []);
      window.dispatchEvent(new Event("director-research-jobs-finished"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gap research stopped.");
    } finally {
      setBusy(false);
      await refresh().catch(() => undefined);
    }
  }

  return (
    <section className="poster-card mb-8 rounded-xl p-5" data-director-research-jobs>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent-secondary">Parallel evidence extraction</p>
          <h2 className="reel-title mt-1 text-2xl">Run the corpus with bounded workers</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-grey">
            The corpus runs through a global four-job ceiling with separate provider lanes. Text sources become draft studies; collection evidence stops at rights and context review. Only a linked, reviewed, explicitly approved study can enter Magic.
          </p>
        </div>
        <button type="button" disabled={busy} onClick={() => void researchCoverageGaps()} className="magic-action rounded-full px-5 py-2.5 text-xs font-semibold disabled:opacity-45">
          {busy ? "Research running…" : "Research Atlas gaps"}
        </button>
        <button type="button" disabled={busy} onClick={() => void runAll()} className="rounded-full border border-line px-5 py-2.5 text-xs font-semibold text-ink disabled:opacity-45">
          {busy ? "Research running…" : "Run complete corpus"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.12em]">
        {[
          ["queued", counts.queued ?? 0],
          ["running", counts.running ?? 0],
          ["draft ready", counts.succeeded ?? 0],
          ["review needed", counts["review-required"] ?? 0],
          ["failed", counts.failed ?? 0],
          ["evidence", evidenceCount],
          ["configuration blocks", configurationBlocks],
        ].map(([label, value]) => <span key={label} className="rounded-full border border-line px-2.5 py-1 text-grey">{value} {label}</span>)}
      </div>
      {error ? <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3 text-xs text-red-100">{error}</p> : null}

      {jobs.length ? (
        <div className="mt-5 grid gap-2 lg:grid-cols-2">
          {jobs.map((job) => (
            <article key={job.id} className="rounded-lg border border-white/10 bg-black/15 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-xs font-semibold text-ink">{job.sourceTitle}</h3>
                  <p className="mt-1 truncate text-[10px] text-accent-secondary">{job.queryLabel}</p>
                  <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-grey">{job.sourceMode} · {job.phase}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-[8px] font-semibold uppercase ${statusTone(job.status)}`}>{job.status.replace("-", " ")}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-secondary transition-[width]" style={{ width: `${job.progress}%` }} />
              </div>
              <p className="mt-2 text-[10px] leading-4 text-grey">{job.errorMessage || job.message}</p>
              <p className="mt-1 text-[9px] text-grey">{job.evidenceCount} evidence records</p>
              <p className="mt-2 font-mono text-[8px] text-white/35">attempt {job.attempt}/{job.maxAttempts}{job.model ? ` · ${job.model}` : ""}</p>
            </article>
          ))}
        </div>
      ) : <p className="mt-5 rounded-lg border border-dashed border-line p-4 text-xs text-grey">No extraction jobs yet. The corpus remains registered as source pointers only.</p>}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildDirectorReviewQueue } from "@/lib/director-review-queue";
import type { DirectorResearchBundle, DirectorStudyStatus } from "@/lib/director-research";
import type { DirectorTimedMediaAnalysis } from "@/lib/director-timed-media";
import type { DirectorEvidenceManifest } from "@/lib/director-evidence-manifest";

export default function AdminDirectorReviewQueue({ initialBundle }: { initialBundle: DirectorResearchBundle }) {
  const [studies, setStudies] = useState(initialBundle.studies);
  const [analyses, setAnalyses] = useState<DirectorTimedMediaAnalysis[]>([]);
  const [manifests, setManifests] = useState<DirectorEvidenceManifest[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const queue = useMemo(() => buildDirectorReviewQueue(studies, analyses, manifests), [studies, analyses, manifests]);
  const visibleQueue = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return queue;
    return queue.filter((item) => [
      item.study?.studyTitle, item.study?.workTitle, item.study?.periodLabel, item.study?.region,
      item.analysis?.workTitle, item.manifest?.title, item.manifest?.dateLabel, item.manifest?.region,
      item.manifest?.provider, ...item.coverageGaps,
    ].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [filter, queue]);
  const selected = visibleQueue.find((item) => item.id === selectedId) ?? visibleQueue[0] ?? null;

  const refresh = useCallback(async () => {
    const [researchResponse, timedResponse, evidenceResponse] = await Promise.all([
      fetch("/api/admin/director-brain", { cache: "no-store" }),
      fetch("/api/admin/director-brain/timed-media", { cache: "no-store" }),
      fetch("/api/admin/director-brain/evidence-manifests?limit=300", { cache: "no-store" }),
    ]);
    const [research, timed, evidence] = await Promise.all([researchResponse.json(), timedResponse.json(), evidenceResponse.json()]);
    if (!researchResponse.ok) throw new Error(research.error || "Could not load research studies.");
    if (!timedResponse.ok) throw new Error(timed.error || "Could not load timed-film evidence.");
    if (!evidenceResponse.ok) throw new Error(evidence.error || "Could not load item-level evidence.");
    setStudies(research.studies ?? []);
    setAnalyses(timed.analyses ?? []);
    setManifests(evidence.manifests ?? []);
  }, []);

  useEffect(() => {
    const load = () => void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load the review queue."));
    const first = window.setTimeout(load, 0);
    window.addEventListener("director-research-changed", load);
    window.addEventListener("director-research-jobs-finished", load);
    window.addEventListener("director-research-bundle-updated", load);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("director-research-changed", load);
      window.removeEventListener("director-research-jobs-finished", load);
      window.removeEventListener("director-research-bundle-updated", load);
    };
  }, [refresh]);

  async function decidePlayback(playbackStatus: "verified" | "rejected") {
    if (!selected?.analysis) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/director-brain/timed-media", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selected.analysis.id, playbackStatus, reviewNotes: notes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Playback decision failed.");
      setAnalyses(data.analyses ?? []);
      setSelectedId(""); setNotes("");
      setMessage(playbackStatus === "verified" ? "Playback verified. The linked study has moved to the separate knowledge decision." : "The machine reading was rejected and remains outside retrieval.");
      window.dispatchEvent(new Event("director-research-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Playback decision failed."); }
    finally { setBusy(false); }
  }

  async function decideStudy(status: Exclude<DirectorStudyStatus, "draft">) {
    if (!selected?.study) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/director-brain", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selected.study.id, status, reviewNotes: notes }),
      });
      const data = await response.json() as DirectorResearchBundle & { error?: string };
      if (!response.ok) throw new Error(data.error || "Study decision failed.");
      setStudies(data.studies ?? []);
      setSelectedId(""); setNotes("");
      setMessage(status === "approved" ? "Approved knowledge is now eligible for matching Magic retrieval." : `Study marked ${status}.`);
      window.dispatchEvent(new CustomEvent("director-research-bundle-updated", { detail: data }));
      window.dispatchEvent(new Event("director-research-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Study decision failed."); }
    finally { setBusy(false); }
  }

  async function decideEvidence(status: "eligible" | "rejected") {
    if (!selected?.manifest) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/director-brain/evidence-manifests", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selected.manifest.id, status, notes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Evidence decision failed.");
      setManifests((current) => current.map((item) => item.id === data.manifest.id ? data.manifest : item));
      setSelectedId(""); setNotes("");
      setMessage(status === "eligible" ? "Evidence is eligible for a source-linked draft study. It is still not retrieval knowledge." : "Evidence rejected and kept outside study synthesis.");
      window.dispatchEvent(new Event("director-research-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Evidence decision failed."); }
    finally { setBusy(false); }
  }

  function select(id: string) {
    const next = queue.find((item) => item.id === id);
    setSelectedId(id);
    setNotes(next?.analysis?.reviewNotes || next?.study?.reviewNotes || "");
    setError(""); setMessage("");
  }

  const observations = selected?.analysis?.observations ?? selected?.study?.observations ?? [];
  const principles = selected?.analysis?.candidatePrinciples ?? selected?.study?.candidatePrinciples ?? [];

  return (
    <section id="director-review-queue" className="poster-card mb-8 overflow-hidden rounded-xl border-accent/25" data-director-review-queue>
      <header className="border-b border-line p-5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-accent">Human review desk</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="reel-title text-3xl">Teach the brain, one decision at a time</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-grey">The queue puts direct film playback first, then the separate knowledge decision. Missing coverage rises to the top. No bulk approval and no automatic injection.</p></div>
          <span className="rounded-full border border-line px-3 py-1.5 text-[10px] font-semibold text-ink">{queue.length} decisions waiting</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <input value={filter} onChange={(event) => { setFilter(event.target.value); setSelectedId(""); }} placeholder="Find an era, place, provider, craft, or title…" className="min-w-[260px] flex-1 rounded-lg border border-line bg-black/20 px-4 py-2.5 text-xs text-ink outline-none focus:border-accent" />
          {["1950s", "1960s", "3000 BCE", "sound", "action"].map((value) => <button key={value} type="button" onClick={() => { setFilter(value); setSelectedId(""); }} className="rounded-full border border-line px-3 py-2 text-[9px] font-semibold text-grey hover:text-ink">{value}</button>)}
          {filter ? <button type="button" onClick={() => { setFilter(""); setSelectedId(""); }} className="rounded-full border border-line px-3 py-2 text-[9px] font-semibold text-ink">Clear</button> : null}
        </div>
      </header>
      {error ? <p className="m-4 rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3 text-xs text-red-100">{error}</p> : null}
      {message ? <p className="m-4 rounded-lg border border-emerald-400/30 bg-emerald-400/[0.06] p-3 text-xs text-emerald-100">{message}</p> : null}
      {selected ? (
        <div className="grid min-h-[520px] xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="max-h-[680px] overflow-y-auto border-r border-line p-3">
            {visibleQueue.map((item, index) => (
              <button key={item.id} type="button" onClick={() => select(item.id)} className={`mb-2 w-full rounded-lg border p-3 text-left ${item.id === selected.id ? "border-accent bg-accent/[0.08]" : "border-white/10"}`}>
                <span className="text-[8px] font-semibold uppercase tracking-[0.13em] text-accent-secondary">{String(index + 1).padStart(2, "0")} · {item.kind === "playback" ? "Playback gate" : item.kind === "evidence" ? "Evidence gate" : "Knowledge gate"}</span>
                <span className="mt-1 block text-xs font-semibold text-ink">{item.analysis?.workTitle || item.manifest?.title || item.study?.studyTitle}</span>
                <span className="mt-1 block text-[9px] leading-4 text-grey">{item.reason}</span>
                {item.coverageGaps.length ? <span className="mt-2 block text-[8px] uppercase text-amber-100">Gaps: {item.coverageGaps.join(" · ")}</span> : null}
              </button>
            ))}
          </aside>
          <div className="min-w-0 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">{selected.kind === "playback" ? "Gate 1 · verify exact passage" : selected.kind === "evidence" ? "Gate 1 · verify rights and context" : "Gate 2 · decide reusable knowledge"}</p><h3 className="mt-1 text-xl font-semibold text-ink">{selected.analysis?.workTitle || selected.manifest?.title || selected.study?.studyTitle}</h3><p className="mt-1 text-[10px] text-grey">{selected.manifest?.institution || selected.study?.source.institution || "Library of Congress"} · {selected.manifest?.dateLabel || selected.study?.periodLabel || "Timed film evidence"}</p></div>
              <span className="rounded-full border border-amber-300/30 px-3 py-1.5 text-[9px] uppercase text-amber-100">Not in retrieval</span>
            </div>

            {selected.kind === "playback" && selected.analysis ? <video key={selected.analysis.id} controls preload="metadata" src={`${selected.analysis.playbackUrl}#t=${selected.analysis.startSecond},${selected.analysis.startSecond + selected.analysis.durationSeconds}`} className="mt-4 aspect-video max-h-[320px] w-full rounded-lg bg-black object-contain" onLoadedMetadata={(event) => { event.currentTarget.currentTime = selected.analysis!.startSecond; }} onTimeUpdate={(event) => { if (event.currentTarget.currentTime >= selected.analysis!.startSecond + selected.analysis!.durationSeconds) event.currentTarget.pause(); }} /> : null}

            {selected.kind === "evidence" && selected.manifest ? <section className="mt-4 rounded-lg border border-line bg-black/15 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[9px] uppercase tracking-[0.14em] text-grey">{selected.manifest.provider} · {selected.manifest.kind} · {selected.manifest.recordLocator}</p><p className="mt-2 text-xs leading-5 text-ink">Rights: {selected.manifest.rightsLabel || "Unresolved"}</p><p className="mt-1 text-[10px] text-grey">Reuse: {selected.manifest.reuseStatus} · culturally sensitive: {selected.manifest.culturallySensitive ? "yes" : "no"}</p></div><a href={selected.manifest.canonicalUrl} target="_blank" rel="noreferrer" className="rounded-full border border-line px-3 py-2 text-[9px] font-semibold text-accent-secondary">Open authoritative record ↗</a></div><details className="mt-3 rounded-lg border border-white/10 p-3"><summary className="cursor-pointer text-[9px] font-semibold uppercase text-grey">Saved metadata asset</summary><pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-[9px] leading-4 text-grey">{JSON.stringify(selected.manifest.facets, null, 2)}</pre></details></section> : null}

            {selected.kind !== "evidence" ? <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <section className="rounded-lg border border-line bg-black/15 p-3"><p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-grey">Evidence to check</p><ol className="mt-2 max-h-52 space-y-2 overflow-y-auto text-[10px] leading-4 text-grey">{observations.slice(0, 10).map((item, index) => <li key={index}><span className="mr-2 font-mono text-accent-secondary">{String(index + 1).padStart(2, "0")}</span>{item.evidence}</li>)}</ol></section>
              <section className="rounded-lg border border-line bg-black/15 p-3"><p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-grey">Candidate principles · still withheld</p><ol className="mt-2 max-h-52 space-y-2 overflow-y-auto text-[10px] leading-4 text-grey">{principles.map((item, index) => <li key={index}>→ {item}</li>)}</ol></section>
            </div> : null}

            <section className="mt-3 rounded-lg border border-line bg-black/15 p-3"><p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-grey">Comparison check</p>{selected.relatedApproved.length ? <ul className="mt-2 space-y-2 text-[10px] text-grey">{selected.relatedApproved.map((study) => <li key={study.id}><span className="font-semibold text-ink">{study.studyTitle}</span> · already approved · compare for reinforcement, scope, or contradiction</li>)}</ul> : <p className="mt-2 text-[10px] text-amber-100">No approved study covers the same tags yet. Treat this as a coverage gap, not as permission to lower the evidence standard.</p>}</section>

            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={selected.kind === "playback" ? "What did direct playback confirm or contradict?" : selected.kind === "evidence" ? "Record the rights, date, geography, object context, and any limitation you verified." : "Why is this reliable, limited, redundant, contradictory, approved, or rejected?"} className="mt-4 min-h-24 w-full rounded-lg border border-line bg-black/20 p-3 text-xs text-ink outline-none focus:border-accent" />
            <div className="mt-3 flex flex-wrap gap-2">
              {selected.kind === "playback" ? <><button type="button" disabled={busy} onClick={() => void decidePlayback("verified")} className="magic-action rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-45">Playback confirms evidence</button><button type="button" disabled={busy} onClick={() => void decidePlayback("rejected")} className="rounded-full border border-red-400/35 px-4 py-2 text-xs font-semibold text-red-200 disabled:opacity-45">Reject machine reading</button></> : selected.kind === "evidence" ? <><button type="button" disabled={busy || selected.manifest?.reuseStatus !== "reusable" || selected.manifest?.culturallySensitive} onClick={() => void decideEvidence("eligible")} className="magic-action rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-35">Mark evidence eligible</button><button type="button" disabled={busy} onClick={() => void decideEvidence("rejected")} className="rounded-full border border-red-400/35 px-4 py-2 text-xs font-semibold text-red-200 disabled:opacity-45">Reject evidence</button></> : <><button type="button" disabled={busy} onClick={() => void decideStudy("reviewed")} className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink disabled:opacity-45">Mark reviewed</button><button type="button" disabled={busy} onClick={() => void decideStudy("approved")} className="magic-action rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-45">Approve for Magic</button><button type="button" disabled={busy} onClick={() => void decideStudy("rejected")} className="rounded-full border border-red-400/35 px-4 py-2 text-xs font-semibold text-red-200 disabled:opacity-45">Reject</button></>}
            </div>
          </div>
        </div>
      ) : <p className="m-5 rounded-lg border border-dashed border-line p-5 text-xs text-grey">{filter ? `No pending review matches “${filter}”. Clear the filter to see the full queue.` : "The human review queue is clear. Approved knowledge remains visible in the archive and retrieval register."}</p>}
    </section>
  );
}

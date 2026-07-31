"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DirectorTimedMediaAnalysis } from "@/lib/director-timed-media";

function statusTone(status: DirectorTimedMediaAnalysis["playbackStatus"]) {
  if (status === "verified") return "border-emerald-400/35 text-emerald-200";
  if (status === "rejected") return "border-red-400/35 text-red-200";
  return "border-amber-300/35 text-amber-100";
}

export default function AdminDirectorTimedMedia() {
  const [analyses, setAnalyses] = useState<DirectorTimedMediaAnalysis[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = analyses.find((analysis) => analysis.id === selectedId) ?? analyses[0] ?? null;
  const counts = useMemo(() => analyses.reduce<Record<string, number>>((result, analysis) => {
    result[analysis.playbackStatus] = (result[analysis.playbackStatus] ?? 0) + 1;
    return result;
  }, {}), [analyses]);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/director-brain/timed-media", { cache: "no-store" });
    const data = await response.json() as { analyses?: DirectorTimedMediaAnalysis[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Could not load timed-film analyses.");
    setAnalyses(data.analyses ?? []);
    if (!selectedId && data.analyses?.[0]) {
      setSelectedId(data.analyses[0].id);
      setReviewNotes(data.analyses[0].reviewNotes);
    }
  }, [selectedId]);

  useEffect(() => {
    const load = () => void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load timed-film analyses."));
    const timer = window.setTimeout(load, 0);
    window.addEventListener("director-research-jobs-finished", load);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("director-research-jobs-finished", load);
    };
  }, [refresh]);

  async function decide(playbackStatus: "verified" | "rejected") {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/director-brain/timed-media", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selected.id, playbackStatus, reviewNotes }),
      });
      const data = await response.json() as { analyses?: DirectorTimedMediaAnalysis[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Playback review failed.");
      setAnalyses(data.analyses ?? []);
      window.dispatchEvent(new Event("director-research-changed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Playback review failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="poster-card mb-8 overflow-hidden rounded-xl" data-director-timed-media>
      <header className="border-b border-line p-5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent-secondary">Timed-film evidence · direct playback gate</p>
        <h2 className="reel-title mt-1 text-2xl">Watch before the brain learns</h2>
        <p className="mt-2 max-w-3xl text-xs leading-5 text-grey">
          OpenAI can extract picture-and-sound hypotheses in parallel. It cannot approve them. Play the exact Library of Congress passage here, record what is confirmed or wrong, then move the resulting study to the separate approval gate.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.12em] text-grey">
          <span className="rounded-full border border-line px-2.5 py-1">{analyses.length} analyzed passages</span>
          <span className="rounded-full border border-line px-2.5 py-1">{counts.required ?? 0} need playback</span>
          <span className="rounded-full border border-line px-2.5 py-1">{counts.verified ?? 0} playback verified</span>
          <span className="rounded-full border border-line px-2.5 py-1">{counts.rejected ?? 0} contradicted</span>
        </div>
      </header>
      {error ? <p className="m-4 rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3 text-xs text-red-100">{error}</p> : null}
      {selected ? (
        <div className="grid min-h-[430px] lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="max-h-[540px] space-y-2 overflow-y-auto border-r border-line p-3">
            {analyses.map((analysis) => (
              <button key={analysis.id} type="button" onClick={() => { setSelectedId(analysis.id); setReviewNotes(analysis.reviewNotes); }} className={`w-full rounded-lg border p-3 text-left ${selected.id === analysis.id ? "border-accent-secondary bg-accent-secondary/[0.08]" : "border-white/10"}`}>
                <span className="block truncate text-xs font-semibold text-ink">{analysis.workTitle}</span>
                <span className="mt-1 block text-[9px] text-grey">{analysis.startSecond.toFixed(1)}–{(analysis.startSecond + analysis.durationSeconds).toFixed(1)}s · {analysis.observationCount} observations</span>
                <span className={`mt-2 inline-block rounded-full border px-2 py-1 text-[8px] uppercase ${statusTone(analysis.playbackStatus)}`}>{analysis.playbackStatus}</span>
              </button>
            ))}
          </aside>
          <div className="min-w-0 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-ink">{selected.workTitle}</h3>
                <p className="mt-1 text-[10px] text-grey">Exact passage {selected.startSecond.toFixed(3)}–{(selected.startSecond + selected.durationSeconds).toFixed(3)} seconds</p>
              </div>
              <a href={selected.itemUrl} target="_blank" rel="noreferrer" className="rounded-full border border-line px-3 py-2 text-[9px] font-semibold text-accent-secondary">Open source record ↗</a>
            </div>
            <video key={selected.id} controls preload="metadata" src={`${selected.playbackUrl}#t=${selected.startSecond},${selected.startSecond + selected.durationSeconds}`} className="mt-4 aspect-video max-h-[300px] w-full rounded-lg bg-black object-contain" onLoadedMetadata={(event) => { event.currentTarget.currentTime = selected.startSecond; }} onTimeUpdate={(event) => { if (event.currentTarget.currentTime >= selected.startSecond + selected.durationSeconds) event.currentTarget.pause(); }} />
            {(selected.artifactUrls.contactSheet || selected.artifactUrls.waveform || selected.artifactUrls.evidencePackage) ? (
              <section className="mt-4 rounded-lg border border-line bg-black/15 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">Saved in Director Brain</p>
                    <p className="mt-1 text-[10px] text-grey">Derived research assets stay attached to this exact source passage and review state.</p>
                  </div>
                  {selected.artifactUrls.evidencePackage ? <a href={selected.artifactUrls.evidencePackage} target="_blank" rel="noreferrer" className="rounded-full border border-line px-3 py-2 text-[9px] font-semibold text-ink">Open evidence package</a> : null}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {selected.artifactUrls.contactSheet ? (
                    <figure className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selected.artifactUrls.contactSheet} alt={`Contact sheet for ${selected.workTitle}`} className="aspect-video w-full object-contain" />
                      <figcaption className="px-3 py-2 text-[9px] text-grey">12-cell visual contact sheet</figcaption>
                    </figure>
                  ) : null}
                  {selected.artifactUrls.waveform ? (
                    <figure className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selected.artifactUrls.waveform} alt={`Waveform for ${selected.workTitle}`} className="aspect-video w-full object-contain" />
                      <figcaption className="px-3 py-2 text-[9px] text-grey">Signal shape only; no soundtrack retained</figcaption>
                    </figure>
                  ) : null}
                </div>
              </section>
            ) : null}
            <p className="mt-3 text-[10px] leading-4 text-grey">
              The machine draft contains {selected.observationCount} observations and {selected.principleCount} candidate principles. The derived contact sheet, signal-only waveform, and evidence package are retained; the source clip, soundtrack, transcript, and dialogue are not.
            </p>
            <textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="What did direct playback confirm? What was wrong, missing, or too uncertain?" className="mt-4 min-h-24 w-full rounded-lg border border-line bg-black/20 p-3 text-xs text-ink outline-none focus:border-accent-secondary" />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => void decide("verified")} className="magic-action rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-45">Playback confirms evidence</button>
              <button type="button" disabled={busy} onClick={() => void decide("rejected")} className="rounded-full border border-red-400/35 px-4 py-2 text-xs font-semibold text-red-200 disabled:opacity-45">Reject machine reading</button>
            </div>
          </div>
        </div>
      ) : (
        <p className="m-5 rounded-lg border border-dashed border-line p-5 text-xs leading-5 text-grey">
          No timed-film evidence package exists yet. “Run complete corpus” resolves all 18 Library of Congress films and queues their independent passages; completed machine readings appear here for direct playback.
        </p>
      )}
    </section>
  );
}

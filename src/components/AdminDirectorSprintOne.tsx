"use client";

import { useMemo, useState } from "react";
import type { DirectorCoverageFinding, DirectorPrincipleAssessment } from "@/lib/director-sprint-one";

type Bundle = {
  storageReady: boolean;
  assessments: DirectorPrincipleAssessment[];
  findings: DirectorCoverageFinding[];
  progress: {
    total: number;
    discard: number;
    park: number;
    candidate: number;
    shortlist: number;
    playbackVerified: number;
    playbackRejected: number;
    playbackPending: number;
  };
};

export default function AdminDirectorSprintOne({ initialBundle }: { initialBundle: Bundle }) {
  const [bundle, setBundle] = useState(initialBundle);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialBundle.assessments.find((item) => item.shortlistRank === 1)?.id ?? null,
  );
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const candidates = useMemo(
    () => bundle.assessments.filter((item) => item.lane === "candidate").sort((left, right) => (left.candidateRank ?? 99) - (right.candidateRank ?? 99)),
    [bundle.assessments],
  );
  const shortlist = useMemo(
    () => candidates.filter((item) => item.shortlistRank != null).sort((left, right) => left.shortlistRank! - right.shortlistRank!),
    [candidates],
  );
  const selected = shortlist.find((item) => item.id === selectedId) ?? shortlist[0] ?? null;

  async function saveVerdict(verdict: "verified" | "rejected") {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/director-brain/sprint-one", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assessmentId: selected.id, verdict, reviewNotes: notes }),
      });
      const data = await response.json() as Bundle & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save playback verdict.");
      setBundle(data);
      setNotes("");
      setMessage(verdict === "verified" ? "Direct playback verified this reading." : "Direct playback rejected this reading; the record remains preserved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save playback verdict.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="poster-card mb-8 overflow-hidden rounded-md" data-director-sprint-one>
      <header className="border-b border-line p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Sprint 1 · Character-serving proof</p>
            <h2 className="reel-title mt-1 text-3xl">From research pile to one tested shot</h2>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-grey">
              Every original principle remains preserved. Text-only triage removes noise from the working set, parks off-sprint craft, and ranks only identity, performance, face-framing, and blocking knowledge.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] ${bundle.progress.total === 282 ? "border-emerald-500/40 text-emerald-200" : "border-amber-500/40 text-amber-200"}`}>
            {bundle.progress.total}/282 triaged
          </span>
        </div>
        {!bundle.storageReady ? (
          <p className="mt-4 rounded-md border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200">Sprint storage is not active. Apply the Director research migrations first.</p>
        ) : bundle.progress.total !== 282 ? (
          <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-100">Failure first: the live corpus is not fully classified yet, so no shortlist may enter generation.</p>
        ) : null}
      </header>

      <div className="grid gap-px bg-line sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Preserved", bundle.progress.total, "All source rows"],
          ["Discard", bundle.progress.discard, "Noise / meta"],
          ["Park", bundle.progress.park, "Off sprint"],
          ["Candidate", bundle.progress.candidate, "Maximum 40"],
          ["Top five", bundle.progress.shortlist, "Playback only"],
          ["Verified", bundle.progress.playbackVerified, `${bundle.progress.playbackPending} pending`],
        ].map(([label, value, detail]) => (
          <div key={label} className="bg-page p-4">
            <p className="text-2xl font-semibold text-ink">{value}</p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-grey">{label}</p>
            <p className="mt-1 text-[9px] text-grey">{detail}</p>
          </div>
        ))}
      </div>

      {bundle.findings.map((finding) => (
        <article key={finding.id} className="border-b border-line bg-amber-950/10 p-5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-amber-200">Coverage finding · {finding.axis}</p>
          <h3 className="mt-1 text-lg font-semibold text-ink">{finding.title}</h3>
          <p className="mt-2 max-w-5xl text-xs leading-5 text-grey">{finding.finding}</p>
          <details className="mt-3 text-xs text-grey">
            <summary className="cursor-pointer font-semibold text-ink">Why the method caused this gap</summary>
            <p className="mt-2 leading-5">{finding.cause}</p>
            <p className="mt-2 leading-5"><b className="text-ink">Next method:</b> {finding.nextMethod}</p>
          </details>
        </article>
      ))}

      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-accent-secondary">D2 · Ranked shortlist</p>
              <h3 className="mt-1 text-xl font-semibold text-ink">Only these five need watching</h3>
            </div>
            <span className="text-[9px] uppercase tracking-[0.12em] text-grey">{bundle.progress.playbackVerified}/5 verified</span>
          </div>
          <div className="mt-3 space-y-2">
            {shortlist.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => { setSelectedId(item.id); setNotes(""); setMessage(""); }}
                className={`w-full rounded-md border p-3 text-left transition-colors ${selected?.id === item.id ? "border-accent bg-accent/10" : "border-line bg-black/10 hover:border-accent/40"}`}
              >
                <div className="flex items-start gap-3">
                  <span className="font-mono text-lg text-accent">{String(item.shortlistRank).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold leading-5 text-ink">{item.principleText}</span>
                    <span className="mt-1 block text-[9px] uppercase tracking-[0.12em] text-grey">{item.characterAxis} · {item.workTitle || item.studyTitle} · score {item.rankScore}</span>
                  </span>
                  <span className={`rounded-full border px-2 py-1 text-[8px] uppercase ${item.playbackReview?.verdict === "verified" ? "border-emerald-500/40 text-emerald-200" : item.playbackReview?.verdict === "rejected" ? "border-red-500/40 text-red-200" : "border-line text-grey"}`}>
                    {item.playbackReview?.verdict ?? "pending"}
                  </span>
                </div>
              </button>
            ))}
            {!shortlist.length && <p className="rounded-md border border-dashed border-line p-4 text-xs text-grey">The shortlist will appear after all principles are triaged and ranked.</p>}
          </div>
        </div>

        <div className="min-w-0 rounded-md border border-line bg-black/10 p-4">
          {selected ? (
            <>
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">Playback gate · #{selected.shortlistRank}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-ink">{selected.principleText}</p>
              <p className="mt-2 text-xs leading-5 text-grey">{selected.rationale}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] uppercase tracking-[0.11em] text-grey sm:grid-cols-4">
                <span>Axis<br /><b className="text-ink">{selected.characterAxis}</b></span>
                <span>Agreement<br /><b className="text-ink">{selected.crossStudyAgreement} studies</b></span>
                <span>Source<br /><b className="text-ink">{selected.sourceStrength}</b></span>
                <span>Reach<br /><b className="text-ink">{selected.productionReach}/5</b></span>
              </div>
              {selected.playbackUrl ? (
                <video
                  key={`${selected.playbackUrl}-${selected.playbackStartSecond}`}
                  controls
                  preload="metadata"
                  className="mt-4 aspect-video w-full rounded-md border border-line bg-black"
                  src={`${selected.playbackUrl}#t=${selected.playbackStartSecond ?? 0},${(selected.playbackStartSecond ?? 0) + (selected.playbackDurationSeconds ?? 30)}`}
                />
              ) : (
                <p className="mt-4 rounded-md border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200">No trusted playback URL is available. This item cannot be verified.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-grey">
                <span>{selected.studyTitle}</span><span>·</span><span>{selected.sourceTitle}</span><span>·</span><span>{selected.playbackStartSecond ?? 0}s–{(selected.playbackStartSecond ?? 0) + (selected.playbackDurationSeconds ?? 30)}s</span>
                {selected.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="text-accent-secondary">Open source ↗</a>}
              </div>
              {selected.playbackReview ? (
                <div className="mt-4 rounded-md border border-line p-3 text-xs leading-5 text-grey">
                  <b className="text-ink">Immutable human verdict: {selected.playbackReview.verdict}</b><br />
                  {selected.playbackReview.reviewNotes}
                </div>
              ) : (
                <>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="After watching the exact passage, record what confirms or contradicts this principle."
                    className="mt-4 min-h-20 w-full rounded-md border border-line bg-page p-3 text-xs text-ink outline-none focus:border-accent"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={busy || notes.trim().length < 20 || !selected.playbackUrl} onClick={() => saveVerdict("verified")} className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">Confirm from playback</button>
                    <button type="button" disabled={busy || notes.trim().length < 20 || !selected.playbackUrl} onClick={() => saveVerdict("rejected")} className="rounded-full border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-200 disabled:opacity-40">Reject from playback</button>
                  </div>
                </>
              )}
              {message && <p className="mt-3 text-xs text-accent-secondary">{message}</p>}
            </>
          ) : <p className="text-xs text-grey">No principle has entered the top-five playback gate.</p>}
        </div>
      </div>

      <details className="border-t border-line p-5">
        <summary className="cursor-pointer text-xs font-semibold text-ink">D1 candidate digest · {candidates.length} lines · readable in under 10 minutes</summary>
        <ol className="mt-4 grid gap-2 lg:grid-cols-2">
          {candidates.map((item) => (
            <li key={item.id} className="rounded-md border border-line bg-black/10 p-3 text-[10px] leading-4 text-grey">
              <span className="font-mono text-accent">{String(item.candidateRank).padStart(2, "0")}</span>{" "}
              <b className="text-ink">{item.characterAxis}</b> · {item.principleText}{" "}
              <span className="text-grey">— {item.workTitle || item.sourceTitle} · {item.confidence}</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

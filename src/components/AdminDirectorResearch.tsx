"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  buildDirectorResearchDiagnostics,
  DIRECTOR_SOURCE_KINDS,
  type DirectorResearchBundle,
  type DirectorResearchSourceRecord,
  type DirectorSceneStudy,
  type DirectorStudyStatus,
} from "@/lib/director-research";

type Props = {
  initialBundle: DirectorResearchBundle;
  initialError?: string;
};

const STATUS_LABELS: Record<DirectorStudyStatus, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  approved: "Approved for Magic",
  rejected: "Rejected",
};

const SOURCE_KIND_LABELS = {
  institutional: "Institutional archive or museum",
  "public-domain": "Public-domain work",
  licensed: "Licensed material",
  "filmmaker-interview": "Filmmaker interview",
  "provider-research": "AI provider research",
  "chaplin-test": "Chaplin production test",
} as const;

function statusClass(status: DirectorStudyStatus) {
  if (status === "approved") return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  if (status === "rejected") return "border-red-400/40 bg-red-400/10 text-red-200";
  if (status === "reviewed") return "border-amber-300/40 bg-amber-300/10 text-amber-100";
  return "border-white/15 bg-white/[0.04] text-grey";
}

function StudyCard({
  study,
  busyId,
  onReview,
}: {
  study: DirectorSceneStudy;
  busyId: string | null;
  onReview: (study: DirectorSceneStudy, status: Exclude<DirectorStudyStatus, "draft">, notes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState(study.reviewNotes);
  const busy = busyId === study.id;

  return (
    <article className="rounded-xl border border-line bg-black/15 p-4" data-director-study={study.id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">
            {study.source.sourceKind.replaceAll("-", " ")} · {study.source.institution || "Independent source"}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-ink">{study.studyTitle}</h3>
          <p className="mt-1 text-xs text-grey">
            {[study.workTitle, study.sceneLocator, study.periodLabel, study.region].filter(Boolean).join(" · ") || "Unlabelled scene study"}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${statusClass(study.status)}`}>
          {STATUS_LABELS[study.status]}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 p-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-grey">Observed evidence · {study.observations.length} beats</p>
          <ol className="mt-2 space-y-2">
            {study.observations.slice(0, 8).map((observation, index) => (
              <li key={`${observation.startSecond}-${observation.endSecond}-${index}`} className="text-[10px] leading-5 text-grey">
                <span className="font-mono text-accent-secondary">
                  {observation.startSecond}–{observation.endSecond}s
                </span>{" "}
                {observation.evidence}
                {observation.audioEvidence ? <span className="block text-cyan-100/70">Audio: {observation.audioEvidence}</span> : null}
                {observation.soundFunction ? <span className="block text-cyan-100/50">Sound function: {observation.soundFunction}</span> : null}
                {observation.narrativeJob ? <span className="block text-white/45">Job: {observation.narrativeJob}</span> : null}
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-lg border border-white/10 p-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-grey">Candidate reusable principles</p>
          <ul className="mt-2 space-y-2 text-[10px] leading-5 text-ink">
            {study.candidatePrinciples.map((principle) => <li key={principle}>→ {principle}</li>)}
          </ul>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-white/10 p-3 text-[10px] leading-5 text-grey">
        <p><span className="font-semibold text-ink">Source:</span> {study.source.title}</p>
        <p><span className="font-semibold text-ink">Rights basis:</span> {study.source.rightsBasis}</p>
        {study.source.sourceUrl ? (
          <a className="text-accent-secondary hover:text-ink" href={study.source.sourceUrl} target="_blank" rel="noreferrer">
            Open source ↗
          </a>
        ) : null}
        {study.limitations ? <p className="mt-2"><span className="font-semibold text-ink">Limitations:</span> {study.limitations}</p> : null}
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="text-[9px] font-semibold uppercase tracking-[0.14em] text-grey">
          Review decision and reasoning
          <textarea
            className="mt-1 min-h-20 w-full rounded-lg border border-line bg-black/25 p-3 text-xs font-normal normal-case tracking-normal text-ink outline-none focus:border-accent"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Why is this principle reliable, limited, approved, or rejected?"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void onReview(study, "reviewed", notes)} className="rounded-full border border-line px-3 py-2 text-[10px] font-semibold text-ink disabled:opacity-40">
            Mark reviewed
          </button>
          <button type="button" disabled={busy} onClick={() => void onReview(study, "approved", notes)} className="rounded-full border border-emerald-400/40 px-3 py-2 text-[10px] font-semibold text-emerald-200 disabled:opacity-40">
            Approve for Magic
          </button>
          <button type="button" disabled={busy} onClick={() => void onReview(study, "rejected", notes)} className="rounded-full border border-red-400/40 px-3 py-2 text-[10px] font-semibold text-red-200 disabled:opacity-40">
            Reject
          </button>
        </div>
      </div>
    </article>
  );
}

export default function AdminDirectorResearch({ initialBundle, initialError = "" }: Props) {
  const [bundle, setBundle] = useState(initialBundle);
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sourceDraft, setSourceDraft] = useState<DirectorResearchSourceRecord | null>(null);
  const intakeRef = useRef<HTMLDetailsElement>(null);
  const counts = useMemo(() => ({
    draft: bundle.studies.filter((study) => study.status === "draft").length,
    reviewed: bundle.studies.filter((study) => study.status === "reviewed").length,
    approved: bundle.studies.filter((study) => study.status === "approved").length,
    rejected: bundle.studies.filter((study) => study.status === "rejected").length,
  }), [bundle.studies]);
  const diagnostics = useMemo(() => buildDirectorResearchDiagnostics(bundle.studies), [bundle.studies]);

  useEffect(() => {
    function selectCampaignSource(event: Event) {
      const source = (event as CustomEvent<DirectorResearchSourceRecord>).detail;
      if (!source?.id) return;
      setSourceDraft(source);
    }
    window.addEventListener("director-research-source-selected", selectCampaignSource);
    async function reloadAfterJobs() {
      const response = await fetch("/api/admin/director-brain", { cache: "no-store" });
      const data = await response.json() as DirectorResearchBundle & { error?: string };
      if (!response.ok) {
        setError(data.error || "Could not refresh extracted studies.");
        return;
      }
      setBundle(data);
      window.dispatchEvent(new CustomEvent("director-research-bundle-updated", { detail: data }));
    }
    function jobsFinished() { void reloadAfterJobs(); }
    window.addEventListener("director-research-jobs-finished", jobsFinished);
    return () => {
      window.removeEventListener("director-research-source-selected", selectCampaignSource);
      window.removeEventListener("director-research-jobs-finished", jobsFinished);
    };
  }, []);

  useEffect(() => {
    if (!sourceDraft || !intakeRef.current) return;
    intakeRef.current.open = true;
    intakeRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sourceDraft]);

  async function submitStudy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch("/api/admin/director-brain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json() as DirectorResearchBundle & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save the scene study.");
      setBundle(data);
      window.dispatchEvent(new CustomEvent("director-research-bundle-updated", { detail: data }));
      setMessage("Study saved as a draft. A second decision is required before any principle can enter Magic.");
      form.reset();
      setSourceDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the scene study.");
    } finally {
      setSaving(false);
    }
  }

  async function reviewStudy(
    study: DirectorSceneStudy,
    status: Exclude<DirectorStudyStatus, "draft">,
    reviewNotes: string,
  ) {
    setBusyId(study.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/director-brain", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: study.id, status, reviewNotes }),
      });
      const data = await response.json() as DirectorResearchBundle & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not review the scene study.");
      setBundle(data);
      window.dispatchEvent(new CustomEvent("director-research-bundle-updated", { detail: data }));
      setMessage(status === "approved"
        ? `"${study.studyTitle}" is approved. Its abstract principles can now be retrieved by Magic when the brief matches.`
        : `"${study.studyTitle}" is now ${status}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not review the scene study.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mb-10" data-director-research-lab>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Research lab</p>
          <h2 className="reel-title mt-1 text-3xl">Observe first. Generalize second.</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-grey">
            Record attributable evidence and provenance with time, page, section, object, record, API-field, or benchmark locators. New studies remain drafts; only explicitly approved abstract principles may enter scene generation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.12em]">
          <span className="rounded-full border border-line px-2.5 py-1 text-grey">{counts.draft} drafts</span>
          <span className="rounded-full border border-amber-300/30 px-2.5 py-1 text-amber-100">{counts.reviewed} reviewed</span>
          <span className="rounded-full border border-emerald-400/30 px-2.5 py-1 text-emerald-200">{counts.approved} approved</span>
          <span className="rounded-full border border-red-400/30 px-2.5 py-1 text-red-200">{counts.rejected} rejected</span>
        </div>
      </div>

      {!bundle.storageReady ? (
        <div className="mb-4 rounded-xl border border-amber-300/35 bg-amber-300/[0.06] p-4 text-xs leading-5 text-amber-100">
          Research storage is not active yet. Apply migration <code>202607290002_director_research.sql</code>, then reload this page.
        </div>
      ) : null}
      {error ? <div className="mb-4 rounded-xl border border-red-400/35 bg-red-400/[0.07] p-4 text-xs text-red-100">{error}</div> : null}
      {message ? <div className="mb-4 rounded-xl border border-emerald-400/35 bg-emerald-400/[0.07] p-4 text-xs text-emerald-100">{message}</div> : null}

      <div className="poster-card mb-5 grid gap-4 rounded-xl p-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">Evidence health</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ["Approved", diagnostics.approvedStudies],
              ["Ready for review", diagnostics.reviewReady],
              ["Incomplete drafts", diagnostics.incompleteDrafts],
              ["Distinct sources", diagnostics.sourceCount],
              ["Rights documented", `${diagnostics.rightsDocumented}/${bundle.studies.length}`],
              ["Sound evidence", `${diagnostics.soundEvidenceStudies} studies / ${diagnostics.soundObservedSeconds}s`],
              ["Period worlds", `${diagnostics.periodEvidenceStudies} studies / ${diagnostics.periodRegions} regions`],
              ["Observed runtime", `${diagnostics.totalObservedSeconds}s`],
              ["Awaiting decision", diagnostics.awaitingDecision],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-white/10 p-3">
                <p className="text-lg font-semibold text-ink">{value}</p>
                <p className="mt-1 text-[8px] uppercase tracking-[0.12em] text-grey">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-grey">
            Observation confidence: {diagnostics.confidence.high} high · {diagnostics.confidence.medium} medium · {diagnostics.confidence.low} low
          </p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">Approved coverage</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {diagnostics.coverage.map((entry) => (
              <span key={entry.domain} className={`rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-[0.1em] ${
                entry.approvedStudies ? "border-emerald-400/30 text-emerald-200" : "border-red-400/25 text-red-200/75"
              }`}>
                {entry.domain} · {entry.approvedStudies}
              </span>
            ))}
          </div>
          <div className="mt-4 rounded-lg border border-white/10 p-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-grey">Human comparison queue</p>
            {diagnostics.comparisonQueue.length ? (
              <ul className="mt-2 space-y-2 text-[10px] leading-5 text-grey">
                {diagnostics.comparisonQueue.slice(0, 5).map((item) => (
                  <li key={`${item.leftId}-${item.rightId}`}>
                    <span className="text-ink">{item.leftTitle}</span> ↔ <span className="text-ink">{item.rightTitle}</span>
                    <span className="block text-white/40">Shared evidence areas: {item.sharedTags.join(", ")}. Compare for context or contradiction.</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-[10px] leading-5 text-grey">No approved studies overlap enough to require a contradiction review.</p>}
          </div>
        </div>
      </div>

      <details
        id="director-research-intake"
        ref={intakeRef}
        className="poster-card mb-5 scroll-mt-20 rounded-xl"
        open={bundle.studies.length === 0 || Boolean(sourceDraft)}
      >
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-ink">
          {sourceDraft ? `Researching: ${sourceDraft.title}` : "+ Add a rights-cleared scene study"}
        </summary>
        <form key={sourceDraft?.id ?? "blank-study"} onSubmit={submitStudy} className="grid gap-4 border-t border-line p-5">
          {sourceDraft ? (
            <div className="rounded-lg border border-accent-secondary/30 bg-accent-secondary/[0.045] p-3 text-[10px] leading-5 text-grey">
              <p className="font-semibold text-accent-secondary">Source details copied from the campaign queue.</p>
              <p>Now add specific, attributable observations and candidate principles. Saving creates a draft only; approval remains a separate human decision.</p>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-grey">Source title<input required name="sourceTitle" defaultValue={sourceDraft?.title} className="mt-1 w-full rounded-lg border border-line bg-black/20 p-3 text-ink" placeholder="Archive collection, interview, paper, or owned test" /></label>
            <label className="text-xs text-grey">Institution or owner<input name="institution" defaultValue={sourceDraft?.institution} className="mt-1 w-full rounded-lg border border-line bg-black/20 p-3 text-ink" placeholder="Library of Congress, ASC, Chaplin..." /></label>
            <label className="text-xs text-grey">Source URL<input name="sourceUrl" type="url" defaultValue={sourceDraft?.sourceUrl ?? undefined} className="mt-1 w-full rounded-lg border border-line bg-black/20 p-3 text-ink" placeholder="https://..." /></label>
            <label className="text-xs text-grey">Source type
              <select required name="sourceKind" defaultValue={sourceDraft?.sourceKind ?? "institutional"} className="mt-1 w-full rounded-lg border border-line bg-surface p-3 text-ink">
                {DIRECTOR_SOURCE_KINDS.map((kind) => <option key={kind} value={kind}>{SOURCE_KIND_LABELS[kind]}</option>)}
              </select>
            </label>
          </div>
          <label className="text-xs text-grey">Rights basis<textarea required name="rightsBasis" defaultValue={sourceDraft?.rightsBasis} className="mt-1 min-h-20 w-full rounded-lg border border-line bg-black/20 p-3 text-ink" placeholder="Why Chaplin may analyze this material; include license, public-domain status, institutional access terms, or ownership." /></label>
          <label className="text-xs text-grey">Access notes<input name="accessNotes" defaultValue={sourceDraft?.accessNotes} className="mt-1 w-full rounded-lg border border-line bg-black/20 p-3 text-ink" placeholder="Date accessed, collection identifier, or license boundary" /></label>

          <div className="my-1 border-t border-line" />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-grey">Study title<input required name="studyTitle" className="mt-1 w-full rounded-lg border border-line bg-black/20 p-3 text-ink" placeholder="Readable geography before pursuit acceleration" /></label>
            <label className="text-xs text-grey">Work or collection<input name="workTitle" defaultValue={sourceDraft?.title} className="mt-1 w-full rounded-lg border border-line bg-black/20 p-3 text-ink" /></label>
            <label className="text-xs text-grey">Scene locator<input name="sceneLocator" className="mt-1 w-full rounded-lg border border-line bg-black/20 p-3 text-ink" placeholder="Reel, chapter, archive image numbers, or test ID" /></label>
            <label className="text-xs text-grey">Duration in seconds<input name="durationSeconds" type="number" min="0.1" max="86400" step="0.1" className="mt-1 w-full rounded-lg border border-line bg-black/20 p-3 text-ink" /></label>
            <label className="text-xs text-grey">Period<input name="periodLabel" className="mt-1 w-full rounded-lg border border-line bg-black/20 p-3 text-ink" placeholder="United States, 1968" /></label>
            <label className="text-xs text-grey">Region and community<input name="region" className="mt-1 w-full rounded-lg border border-line bg-black/20 p-3 text-ink" placeholder="Detroit, Michigan; factory district" /></label>
          </div>
          <label className="text-xs text-grey">Retrieval tags<input name="tags" defaultValue={sourceDraft?.targetTags.join(", ")} className="mt-1 w-full rounded-lg border border-line bg-black/20 p-3 text-ink" placeholder="chase, geography, vehicle, 1960s, detroit" /></label>
          <label className="text-xs text-grey">
            Attributable observations
            <span className="mt-1 block text-[10px] leading-4 text-white/45">
              Start with seconds, or a locator such as page:, section:, record:, object:, api-field:, or benchmark:. Then use | evidence | craft | transition | narrative job | inference | confidence | optional audio evidence | sound function.
            </span>
            <textarea required name="observationLines" className="mt-2 min-h-40 w-full rounded-lg border border-line bg-black/20 p-3 font-mono text-[11px] leading-5 text-ink" placeholder={"section: Camera movement | The source distinguishes a locked frame from a controlled move | camera | comparison | capability boundary | treat movement as a selectable constraint | medium"} />
          </label>
          <label className="text-xs text-grey">
            Candidate reusable principles
            <span className="mt-1 block text-[10px] text-white/45">One original, abstract craft relationship per line. Never paste dialogue, subtitles, screenplay text, or a copied shot list.</span>
            <textarea required name="candidatePrinciples" className="mt-2 min-h-28 w-full rounded-lg border border-line bg-black/20 p-3 text-xs leading-5 text-ink" placeholder="Establish destination, obstacle, and travel axis before acceleration." />
          </label>
          <label className="text-xs text-grey">Limitations and uncertainty<textarea name="limitations" className="mt-1 min-h-20 w-full rounded-lg border border-line bg-black/20 p-3 text-ink" placeholder="What this evidence cannot prove; restoration, cultural, sampling, or model limitations." /></label>
          <button disabled={saving || !bundle.storageReady} className="magic-action justify-self-start rounded-full px-5 py-3 text-xs font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? "Saving study..." : "Save as draft"}
          </button>
        </form>
      </details>

      <div className="grid gap-3">
        {bundle.studies.length ? bundle.studies.map((study) => (
          <StudyCard key={study.id} study={study} busyId={busyId} onReview={reviewStudy} />
        )) : (
          <div className="rounded-xl border border-dashed border-line p-6 text-center text-xs text-grey">
            No scene studies have been recorded yet.
          </div>
        )}
      </div>
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  defaultDirectorSprintBrief,
  directorSprintTestProgress,
  type DirectorSprintShotTest,
  type DirectorSprintTestBundle,
  type DirectorSprintTestResult,
  type DirectorSprintTestVariant,
  type DirectorSprintTestVariantId,
} from "@/lib/director-sprint-test";

type ScoreDraft = {
  identityContinuity: number;
  performance: number;
  shotReadability: number;
  reviewNotes: string;
};

const EMPTY_SCORE: ScoreDraft = {
  identityContinuity: 3,
  performance: 3,
  shotReadability: 3,
  reviewNotes: "",
};

function resultFor(test: DirectorSprintShotTest, variantId: string, stage: "image" | "video") {
  return test.results.find((result) => result.variantId === variantId && result.stage === stage) ?? null;
}

function mediaPanel(result: DirectorSprintTestResult | null, label: string) {
  if (!result) {
    return <div className="grid aspect-video place-items-center rounded-md border border-dashed border-line bg-black/20 text-xs text-grey">{label} not generated</div>;
  }
  if (result.status === "running") {
    return <div className="grid aspect-video place-items-center rounded-md border border-accent/40 bg-accent/5 text-xs text-accent">Rendering now…</div>;
  }
  if (result.status === "failed") {
    return <div className="grid aspect-video place-items-center rounded-md border border-red-500/40 bg-red-950/20 p-4 text-center text-xs text-red-200">Failed: {result.errorMessage || "Provider generation failed."}</div>;
  }
  if (!result.url) {
    return <div className="grid aspect-video place-items-center rounded-md border border-red-500/40 bg-red-950/20 text-xs text-red-200">Persisted asset URL missing</div>;
  }
  return result.stage === "video"
    ? <video src={result.url} controls preload="metadata" className="aspect-video w-full rounded-md border border-line bg-black object-contain" />
    // eslint-disable-next-line @next/next/no-img-element
    : <img src={result.url} alt={label} className="aspect-video w-full rounded-md border border-line bg-black object-contain" />;
}

export default function AdminDirectorSprintTest({ initialBundle }: { initialBundle: DirectorSprintTestBundle }) {
  const [bundle, setBundle] = useState(initialBundle);
  const firstCharacter = initialBundle.characters[0];
  const [characterId, setCharacterId] = useState(firstCharacter?.id ?? "");
  const [brief, setBrief] = useState(firstCharacter ? defaultDirectorSprintBrief(firstCharacter.name) : "");
  const [selectedChallengerId, setSelectedChallengerId] = useState<DirectorSprintTestVariantId>("challenger-1");
  const [reviewingId, setReviewingId] = useState<DirectorSprintTestVariantId>("control");
  const [scoreDrafts, setScoreDrafts] = useState<Partial<Record<DirectorSprintTestVariantId, ScoreDraft>>>({});
  const [humanPreference, setHumanPreference] = useState<DirectorSprintTestVariantId>("control");
  const [busy, setBusy] = useState(false);
  const [runState, setRunState] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const test = bundle.test;
  const progress = directorSprintTestProgress(test);
  const selectedChallenger = test?.variants.find((variant) => variant.id === selectedChallengerId) ?? null;
  const control = test?.variants.find((variant) => variant.id === "control") ?? null;
  const reviewingVariant = test?.variants.find((variant) => variant.id === reviewingId) ?? null;
  const reviewingScore = test?.scores.find((score) => score.variantId === reviewingId) ?? null;
  const currentDraft = scoreDrafts[reviewingId] ?? EMPTY_SCORE;
  const allScored = Boolean(test && test.scores.length === 6);
  const failed = test?.results.filter((result) => result.status === "failed") ?? [];
  const challengers = useMemo(() => test?.variants.filter((variant) => variant.id !== "control") ?? [], [test]);

  async function refresh() {
    const response = await fetch("/api/admin/director-brain/sprint-one/test", { cache: "no-store" });
    const data = await response.json() as DirectorSprintTestBundle & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not refresh the Sprint 1 test.");
    setBundle(data);
    return data;
  }

  async function initialize() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/director-brain/sprint-one/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId, brief }),
      });
      const data = await response.json() as DirectorSprintTestBundle & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not initialize the controlled test.");
      setBundle(data);
      setMessage("The actor, brief, current pipeline revision, and six isolated variants are now locked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not initialize the controlled test.");
    } finally {
      setBusy(false);
    }
  }

  async function generate(test: DirectorSprintShotTest, variant: DirectorSprintTestVariant, stage: "image" | "video") {
    const key = `${stage}:${variant.id}`;
    setRunState((current) => ({ ...current, [key]: stage === "image" ? "Creating keyframe…" : "Animating five seconds…" }));
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: stage,
          characterId: test.characterId,
          directorSprint: { testId: test.id, variantId: variant.id },
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? `${stage} generation failed.`);
      setRunState((current) => ({ ...current, [key]: "Complete" }));
    } catch (error) {
      setRunState((current) => ({ ...current, [key]: error instanceof Error ? error.message : `${stage} generation failed.` }));
    }
  }

  async function runControlledCycle() {
    if (!test) return;
    setBusy(true);
    setMessage("");
    try {
      const pendingImages = test.variants.filter((variant) => !resultFor(test, variant.id, "image"));
      await Promise.allSettled(pendingImages.map((variant) => generate(test, variant, "image")));
      const afterImages = await refresh();
      if (!afterImages.test) throw new Error("Sprint 1 test disappeared after keyframe generation.");
      const pendingVideos = afterImages.test.variants.filter((variant) => (
        resultFor(afterImages.test!, variant.id, "image")?.status === "succeeded"
        && !resultFor(afterImages.test!, variant.id, "video")
      ));
      await Promise.allSettled(pendingVideos.map((variant) => generate(afterImages.test!, variant, "video")));
      const final = await refresh();
      const finalProgress = directorSprintTestProgress(final.test);
      setMessage(finalProgress.failed
        ? `Failure first: ${finalProgress.failed} generation${finalProgress.failed === 1 ? "" : "s"} failed. The consumed one-cycle evidence remains visible and cannot be overwritten.`
        : finalProgress.videos === 6
          ? "The control and all five challengers are ready for direct human scoring."
          : "The controlled cycle stopped before all six videos completed; inspect the visible result states.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The controlled generation cycle stopped.");
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(patch: Partial<ScoreDraft>) {
    setScoreDrafts((current) => ({
      ...current,
      [reviewingId]: { ...(current[reviewingId] ?? EMPTY_SCORE), ...patch },
    }));
  }

  async function saveScore() {
    if (!test || !reviewingVariant) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/director-brain/sprint-one/test", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "score", testId: test.id, variantId: reviewingId, ...currentDraft }),
      });
      const data = await response.json() as DirectorSprintTestBundle & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save the scorecard.");
      setBundle(data);
      const next = data.test?.variants.find((variant) => !data.test?.scores.some((score) => score.variantId === variant.id));
      if (next) setReviewingId(next.id);
      setMessage("Immutable human scorecard saved and linked to its decision trace and video result.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the scorecard.");
    } finally {
      setBusy(false);
    }
  }

  async function decide() {
    if (!test) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/director-brain/sprint-one/test", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "decide", testId: test.id, humanPreferenceVariantId: humanPreference }),
      });
      const data = await response.json() as DirectorSprintTestBundle & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not record the test result.");
      setBundle(data);
      setMessage(data.test?.outcomeSummary ?? "The test result is recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record the test result.");
    } finally {
      setBusy(false);
    }
  }

  async function ship() {
    if (!test) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/director-brain/sprint-one/test", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ship", testId: test.id }),
      });
      const data = await response.json() as DirectorSprintTestBundle & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not ship the winning shot.");
      setBundle(data);
      setMessage("The identity-safe winner is now the marketplace actor's featured video, linked to its immutable evaluation.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not ship the winning shot.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="poster-card mb-8 overflow-hidden rounded-md" data-director-sprint-test>
      <header className="border-b border-line p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">D4–D6 · Controlled character proof</p>
            <h2 className="reel-title mt-1 text-3xl">One actor. One brief. Six honest tests.</h2>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-grey">The control and five single-principle challengers use the same actor, brief, pipeline revision, and stage settings. Identity and continuity is the hard gate. Nothing publishes until a human scores every shot and explicitly ships the winner.</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] ${bundle.playbackVerified === 5 ? "border-emerald-500/40 text-emerald-200" : "border-amber-500/40 text-amber-200"}`}>
            Playback gate {bundle.playbackVerified}/5
          </span>
        </div>
      </header>

      {!bundle.storageReady ? (
        <p className="m-5 rounded-md border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-200">Failure first: the controlled shot-test migration is not active, so generation remains unavailable.</p>
      ) : !test ? (
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)]">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">1 · Lock a real marketplace actor</p>
            <select
              value={characterId}
              onChange={(event) => {
                const id = event.target.value;
                setCharacterId(id);
                const character = bundle.characters.find((candidate) => candidate.id === id);
                if (character) setBrief(defaultDirectorSprintBrief(character.name));
              }}
              className="mt-3 w-full rounded-md border border-line bg-page p-3 text-sm text-ink"
            >
              {bundle.characters.map((character) => <option key={character.id} value={character.id}>{character.name} · {character.archetype}</option>)}
            </select>
            <p className="mt-3 text-xs leading-5 text-grey">Initialization checks that this actor has a locked canonical reference. The choice becomes immutable for this one-cycle test.</p>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">2 · Lock one fixed 4–5 second brief</p>
            <textarea value={brief} onChange={(event) => setBrief(event.target.value)} className="mt-3 min-h-28 w-full rounded-md border border-line bg-page p-3 text-sm leading-6 text-ink" />
            <button type="button" disabled={busy || bundle.playbackVerified !== 5 || bundle.playbackRejected > 0 || bundle.playbackPending > 0 || !characterId || brief.trim().length < 40} onClick={initialize} className="magic-border mt-3 w-full rounded-md px-4 py-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40">Lock control + five challengers →</button>
            {bundle.playbackVerified !== 5 && <p className="mt-2 text-xs text-amber-200">Generation is correctly dormant: verify the five exact source passages above first.</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-px bg-line sm:grid-cols-5">
            {[
              ["Actor", test.characterName],
              ["Keyframes", `${progress.images}/6`],
              ["Videos", `${progress.videos}/6`],
              ["Scorecards", `${progress.scores}/6`],
              ["State", test.status],
            ].map(([label, value]) => <div key={label} className="bg-page p-4"><p className="truncate text-sm font-semibold text-ink">{value}</p><p className="mt-1 text-[9px] uppercase tracking-[0.14em] text-grey">{label}</p></div>)}
          </div>
          <div className="border-b border-line p-5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-grey">Immutable test brief · pipeline revision {test.baselineRevision} · invariant {test.invariantHash.slice(0, 12)}</p>
            <p className="mt-2 max-w-5xl text-sm leading-6 text-ink">{test.brief}</p>
            {test.status === "initialized" && progress.videos < 6 && !failed.length && (
              <button type="button" onClick={runControlledCycle} disabled={busy || progress.running > 0} className="magic-border mt-4 rounded-md px-5 py-3 text-sm font-semibold text-ink disabled:opacity-40">
                {busy ? "Controlled cycle running…" : "Generate 6 keyframes + 6 five-second shots →"}
              </button>
            )}
            {Object.keys(runState).length > 0 && <div className="mt-3 grid gap-1 text-[10px] text-grey sm:grid-cols-2 lg:grid-cols-3">{Object.entries(runState).map(([key, value]) => <span key={key}><b className="text-ink">{key}</b> · {value}</span>)}</div>}
            {failed.length > 0 && <p className="mt-4 rounded-md border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200">Failure first: {failed.length} consumed generation {failed.length === 1 ? "result is" : "results are"} failed. Evidence is preserved; the one-cycle ceiling prevents silently replacing it.</p>}
          </div>

          <div className="border-b border-line p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">D5 · Direct comparison</p><h3 className="mt-1 text-xl font-semibold text-ink">Control beside one challenger</h3></div>
              <div className="flex flex-wrap gap-2">{challengers.map((variant) => <button type="button" key={variant.id} onClick={() => setSelectedChallengerId(variant.id)} className={`rounded-full border px-3 py-1 text-[9px] uppercase ${selectedChallengerId === variant.id ? "border-accent bg-accent/10 text-ink" : "border-line text-grey"}`}>{variant.id.replace("challenger-", "Test ")}</button>)}</div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {[control, selectedChallenger].map((variant) => variant && (
                <article key={variant.id} className="rounded-md border border-line bg-black/10 p-3">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">{variant.name}</p>
                  <p className="mt-2 min-h-10 text-xs leading-5 text-grey">{variant.principle ?? "Current configuration. No research principle added."}</p>
                  <div className="mt-3">{mediaPanel(resultFor(test, variant.id, "video"), `${variant.name} video`)}</div>
                  <div className="mt-2 grid grid-cols-[96px_1fr] gap-2">
                    {mediaPanel(resultFor(test, variant.id, "image"), `${variant.name} keyframe`)}
                    <div className="rounded-md border border-line p-2 text-[10px] text-grey">
                      <p>Image: {resultFor(test, variant.id, "image")?.status ?? "pending"}</p>
                      <p className="mt-1">Video: {resultFor(test, variant.id, "video")?.status ?? "pending"}</p>
                      {test.scores.find((score) => score.variantId === variant.id) && <p className="mt-1 text-emerald-200">Scorecard locked</p>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="border-b border-line p-5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">Human scorecard · three declared axes</p>
            <div className="mt-3 flex flex-wrap gap-2">{test.variants.map((variant) => {
              const score = test.scores.find((item) => item.variantId === variant.id);
              return <button type="button" key={variant.id} onClick={() => setReviewingId(variant.id)} className={`rounded-full border px-3 py-1 text-[9px] uppercase ${reviewingId === variant.id ? "border-accent bg-accent/10 text-ink" : score ? score.identityGate === "pass" ? "border-emerald-500/40 text-emerald-200" : "border-red-500/40 text-red-200" : "border-line text-grey"}`}>{variant.id} {score ? `· ${score.compositeScore}` : ""}</button>;
            })}</div>
            {reviewingVariant && (
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.5fr)_minmax(0,0.5fr)]">
                <div>{mediaPanel(resultFor(test, reviewingVariant.id, "video"), `${reviewingVariant.name} video`)}</div>
                {reviewingScore ? (
                  <div className="rounded-md border border-line p-4 text-xs leading-6 text-grey">
                    <p className="font-semibold text-ink">Immutable score · {reviewingScore.compositeScore}/100</p>
                    <p>Identity & continuity: {reviewingScore.identityContinuity}/5 · <b className={reviewingScore.identityGate === "pass" ? "text-emerald-200" : "text-red-200"}>{reviewingScore.identityGate}</b></p>
                    <p>Performance: {reviewingScore.performance}/5</p><p>Shot readability: {reviewingScore.shotReadability}/5</p><p className="mt-2">{reviewingScore.reviewNotes}</p>
                  </div>
                ) : (
                  <div className="rounded-md border border-line p-4">
                    <div className="grid gap-3 sm:grid-cols-3">{[
                      ["Identity & continuity", "identityContinuity"], ["Performance", "performance"], ["Shot readability", "shotReadability"],
                    ].map(([label, key]) => <label key={key} className="text-[10px] text-grey">{label}<select value={currentDraft[key as keyof ScoreDraft] as number} onChange={(event) => updateDraft({ [key]: Number(event.target.value) })} className="mt-1 block w-full rounded-md border border-line bg-page p-2 text-sm text-ink">{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}</select></label>)}</div>
                    <p className="mt-2 text-[10px] text-grey">Identity below 3 fails the shot regardless of beauty or preference.</p>
                    <textarea value={currentDraft.reviewNotes} onChange={(event) => updateDraft({ reviewNotes: event.target.value })} placeholder="Record visible evidence: face, wardrobe, action, reaction, framing, and any drift." className="mt-3 min-h-20 w-full rounded-md border border-line bg-page p-3 text-xs text-ink" />
                    <button type="button" disabled={busy || resultFor(test, reviewingVariant.id, "video")?.status !== "succeeded" || currentDraft.reviewNotes.trim().length < 20} onClick={saveScore} className="mt-3 rounded-full border border-accent px-4 py-2 text-xs font-semibold text-ink disabled:opacity-40">Lock scorecard</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {allScored && test.status === "initialized" && (
            <div className="border-b border-line p-5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">Human preference</p>
              <div className="mt-3 flex flex-wrap gap-2">{test.variants.map((variant) => <label key={variant.id} className={`cursor-pointer rounded-full border px-3 py-2 text-[10px] ${humanPreference === variant.id ? "border-accent bg-accent/10 text-ink" : "border-line text-grey"}`}><input type="radio" name="sprint-preference" value={variant.id} checked={humanPreference === variant.id} onChange={() => setHumanPreference(variant.id)} className="mr-2" />{variant.name}</label>)}</div>
              <button type="button" disabled={busy} onClick={decide} className="mt-4 rounded-full bg-accent px-5 py-2.5 text-xs font-semibold text-black">Record preference and determine publishable winner</button>
            </div>
          )}

          {(test.status === "decided" || test.status === "shipped") && (
            <div className="p-5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">D6 · Sprint artifact</p>
              <h3 className="mt-1 text-xl font-semibold text-ink">{test.outcome === "control-held" ? "Control held" : "A challenger won"}</h3>
              <p className="mt-2 max-w-4xl text-xs leading-5 text-grey">{test.outcomeSummary}</p>
              {test.winnerVariantId && <div className="mt-4 max-w-2xl">{mediaPanel(resultFor(test, test.winnerVariantId, "video"), "Winning shot")}</div>}
              {test.status === "decided" ? <button type="button" disabled={busy} onClick={ship} className="mt-4 rounded-full bg-accent px-5 py-2.5 text-xs font-semibold text-black">Ship winner to {test.characterName} →</button> : (
                <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-950/10 p-4 text-xs text-emerald-100">Shipped asset <code>{test.shippedAssetId}</code> · linked evaluation <code>{test.shippedEvaluationId}</code>{test.shippedUrl && <a href={test.shippedUrl} target="_blank" rel="noreferrer" className="ml-2 underline">Open artifact ↗</a>}</div>
              )}
            </div>
          )}
        </>
      )}
      {message && <p className={`border-t border-line p-4 text-xs ${/failure|could not|missing|dormant|failed/i.test(message) ? "text-red-200" : "text-emerald-200"}`}>{message}</p>}
    </section>
  );
}

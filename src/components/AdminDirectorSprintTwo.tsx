"use client";

import { useState } from "react";
import type { DirectorSprintTwoBundle } from "@/lib/director-sprint-two";

function statusStyle(status: string) {
  if (status === "succeeded") return "border-emerald-500/40 text-emerald-200";
  if (status.includes("failed")) return "border-red-500/40 text-red-200";
  return "border-amber-500/40 text-amber-200";
}

export default function AdminDirectorSprintTwo({ initialBundle: bundle }: { initialBundle: DirectorSprintTwoBundle }) {
  const [liveBundle, setLiveBundle] = useState(bundle);
  const [characterId, setCharacterId] = useState(
    bundle.characters.find((character) => character.name === "Nova Calloway")?.id ?? bundle.characters[0]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  bundle = liveBundle;
  const active = bundle.runs.find((run) => run.id === bundle.activeRunId) ?? null;
  const held = bundle.verifications.filter((item) => item.verdict === "held");
  const refuted = bundle.verifications.filter((item) => item.verdict === "refuted");

  async function initializeMatrix() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/director-brain/sprint-two", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      const data = await response.json() as DirectorSprintTwoBundle & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not lock the comparison matrix.");
      setLiveBundle(data);
      setMessage("The actor, exact line, world, lighting, sound, camera, pipeline revision, and six variants are now immutable.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not lock the comparison matrix.");
    } finally {
      setBusy(false);
    }
  }
  async function refreshBundle() {
    const response = await fetch("/api/admin/director-brain/sprint-two", { cache: "no-store" });
    const data = await response.json() as DirectorSprintTwoBundle & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not refresh Sprint 2.");
    setLiveBundle(data);
  }

  async function runStage(stage: "voice" | "keyframes" | "videos") {
    if (!bundle.matrix.runId || !bundle.comparison) return;
    setBusy(true);
    setMessage("");
    try {
      const jobs: Array<Record<string, unknown>> = [];
      if (stage === "voice") jobs.push({ action: "render-voice", runId: bundle.matrix.runId });
      if (stage === "keyframes") {
        for (const variant of bundle.comparison.variants) {
          if (!bundle.outputs.some((item) => item.variantId === variant.id && item.kind === "keyframe" && item.status === "succeeded")) {
            jobs.push({ action: "generate-keyframe", runId: bundle.matrix.runId, variantId: variant.id, durationSeconds: 5, shotIndex: 0 });
          }
        }
      }
      if (stage === "videos") {
        for (const variant of bundle.comparison.variants) {
          if (!bundle.outputs.some((item) => item.variantId === variant.id && item.kind === "video-shot" && item.durationSeconds === 5 && item.shotIndex === 1 && item.status === "succeeded")) {
            jobs.push({ action: "generate-video-shot", runId: bundle.matrix.runId, variantId: variant.id, durationSeconds: 5, shotIndex: 1 });
          }
          for (const shotIndex of [1, 2, 3]) {
            if (!bundle.outputs.some((item) => item.variantId === variant.id && item.kind === "video-shot" && item.durationSeconds === 15 && item.shotIndex === shotIndex && item.status === "succeeded")) {
              jobs.push({ action: "generate-video-shot", runId: bundle.matrix.runId, variantId: variant.id, durationSeconds: 15, shotIndex });
            }
          }
        }
      }
      const results = await Promise.allSettled(jobs.map(async (job) => {
        const response = await fetch("/api/admin/director-brain/sprint-two", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(job),
        });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Generation failed.");
      }));
      await refreshBundle();
      const failed = results.filter((result) => result.status === "rejected").length;
      setMessage(failed ? `${jobs.length - failed} slots completed; ${failed} preserved as failures.` : `${jobs.length} immutable output slots completed.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not run this stage.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="director-sprint-two" className="poster-card mb-8 scroll-mt-4 overflow-hidden rounded-md" data-director-sprint-two>
      <header className="border-b border-line p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Sprint 2 · Dense verifier + finished-output contract</p>
            <h2 className="reel-title mt-1 text-3xl">The brain checked the moving evidence</h2>
            <p className="mt-2 max-w-4xl text-xs leading-5 text-grey">
              Every candidate is tested against all 60 sampled frames from its exact 30-second passage. The verifier tries to disprove the rule, learns its threshold from five human-reviewed passages, and records both held and refuted findings. No generation result can be promoted without locked voice, audio, identity, lip-sync, automatic scoring, and a later human pick.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] ${active ? statusStyle(active.status) : "border-line text-grey"}`}>
            {active ? `${active.status} · ${active.calibrationMatches}/${active.calibrationCount} calibrated` : "not started"}
          </span>
        </div>
        {!bundle.storageReady && <p className="mt-4 rounded-md border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-200">Sprint 2 storage is not active.</p>}
      </header>

      <div className="grid gap-px bg-line sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Dense checked", bundle.verifications.length, "/ 37"],
          ["Held", held.length, "motion survived"],
          ["Refuted", refuted.length, "preserved failures"],
          ["Calibration", active ? `${active.calibrationMatches}/${active.calibrationCount}` : "0/5", "human is authority"],
          ["Shortlist", bundle.shortlist.length, "≥3 axes · max 2"],
          ["Verifier cost", active ? `$${active.costUsd.toFixed(4)}` : "$0", active?.model ?? "not run"],
        ].map(([label, value, detail]) => (
          <div key={label} className="bg-page p-4">
            <p className="break-words text-xl font-semibold text-ink">{value}</p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-grey">{label}</p>
            <p className="mt-1 truncate text-[9px] text-grey" title={String(detail)}>{detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 border-b border-line p-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-accent-secondary">Locked diverse shortlist</p>
          <h3 className="mt-1 text-xl font-semibold text-ink">Five different things to learn</h3>
          <div className="mt-3 space-y-2">
            {bundle.shortlist.map((item) => (
              <article key={item.id} className="rounded-md border border-line bg-black/10 p-3">
                <div className="flex items-start gap-3">
                  <span className="font-mono text-lg text-accent">{String(item.rank).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold leading-5 text-ink">{item.principle}</p>
                    <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-grey">{item.axis} · {item.workTitle} · {item.duplicateKey} · {item.score}</p>
                    <p className="mt-2 text-[10px] leading-4 text-grey">{item.rationale}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-md border border-line bg-black/10 p-4">
          <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-accent">Immutable output matrix</p>
          <h3 className="mt-1 text-xl font-semibold text-ink">{bundle.comparison ? bundle.comparison.characterName : "Nothing generated yet"}</h3>
          <p className="mt-2 text-xs leading-5 text-grey">The verifier is complete. The output cycle stays closed until one actor, one exact voice line, one lighting plan, one audio plan, one camera plan, and one brief are locked together.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              ["Keyframes", bundle.matrix.keyframes, 6],
              ["Video shots", bundle.matrix.videoShots, 24],
              ["Final mixes", bundle.matrix.mixes, 12],
              ["Auto scores", bundle.matrix.evaluations, 12],
              ["Human picks", bundle.matrix.humanPicks, 2],
              ["Locked voice", bundle.voice?.status ?? (bundle.matrix.runId ? "pending" : "not locked"), 1],
            ].map(([label, value, ceiling]) => (
              <div key={label} className="rounded-md border border-line p-3">
                <p className="text-lg font-semibold text-ink">{value}<span className="text-xs text-grey"> / {ceiling}</span></p>
                <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-grey">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-md border border-amber-500/30 bg-amber-950/10 p-3 text-[10px] leading-4 text-amber-100">Generation ceiling: 6 keyframes · 6 five-second shots · 18 fifteen-second shots · one reused ElevenLabs performance · 12 final mixes. If the ceiling must shrink, the 15-second arm is cut first; voice, audio, and lighting are never cut.</p>
          {!bundle.matrix.runId && (
            <div className="mt-4 rounded-md border border-line p-3">
              <label className="text-[9px] font-semibold uppercase tracking-[0.13em] text-grey" htmlFor="sprint-two-character">One locked actor</label>
              <select id="sprint-two-character" className="field mt-2 w-full" value={characterId} onChange={(event) => setCharacterId(event.target.value)} disabled={busy}>
                {bundle.characters.map((character) => <option key={character.id} value={character.id}>{character.name} · {character.archetype}</option>)}
              </select>
              <button type="button" className="magic-action mt-3 w-full rounded-md px-4 py-3 text-xs font-semibold disabled:opacity-40" onClick={() => void initializeMatrix()} disabled={busy || !characterId} data-intelligence-action>
                {busy ? "Locking invariants…" : "Lock the finished-output comparison"}
              </button>
              {message && <p className="mt-2 text-[10px] leading-4 text-grey">{message}</p>}
            </div>
          )}
          {bundle.matrix.runId && message && <p className="mt-3 text-[10px] leading-4 text-emerald-200">{message}</p>}
          {bundle.matrix.runId && (
            <div className="mt-4 grid gap-2">
              {!bundle.voice && <button type="button" className="magic-action rounded-md px-4 py-3 text-xs font-semibold disabled:opacity-40" disabled={busy} onClick={() => void runStage("voice")}>Render the one locked voice</button>}
              <button type="button" className="magic-action rounded-md px-4 py-3 text-xs font-semibold disabled:opacity-40" disabled={busy || bundle.voice?.status !== "succeeded" || bundle.matrix.keyframes >= 6} onClick={() => void runStage("keyframes")}>Generate six locked keyframes</button>
              <button type="button" className="magic-action rounded-md px-4 py-3 text-xs font-semibold disabled:opacity-40" disabled={busy || bundle.matrix.keyframes < 6 || bundle.matrix.videoShots >= 24} onClick={() => void runStage("videos")}>Generate 24 controlled video shots</button>
            </div>
          )}
        </div>
      </div>

      {bundle.comparison && (
        <div className="border-b border-line p-5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-accent-secondary">Fixed contract and visible output gallery</p>
          <h3 className="mt-1 text-xl font-semibold text-ink">One brief. One exact line. Only the principle changes.</h3>
          <p className="mt-2 text-xs leading-5 text-grey">{bundle.comparison.brief}</p>
          <p className="mt-2 rounded-md border border-line p-3 text-sm text-ink">Locked performance: “{bundle.comparison.lockedLine}”</p>
          {bundle.voice?.url && <audio className="mt-3 w-full" controls preload="metadata" src={bundle.voice.url} />}
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {bundle.comparison.variants.map((variant) => {
              const outputs = bundle.outputs.filter((item) => item.variantId === variant.id);
              return (
                <article key={variant.id} className="overflow-hidden rounded-md border border-line bg-black/10">
                  <div className="p-4">
                    <p className="text-sm font-semibold text-ink">{variant.name}</p>
                    <p className="mt-1 text-[10px] leading-4 text-grey">{variant.whatChanged}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-line">
                    {outputs.map((output) => (
                      <div key={output.id} className="min-w-0 bg-page p-2">
                        {output.url && output.kind === "keyframe" && <img className="aspect-video w-full rounded object-cover" src={output.url} alt={`${variant.name} keyframe`} />}
                        {output.url && output.kind !== "keyframe" && <video className="aspect-video w-full rounded bg-black object-contain" controls preload="metadata" src={output.url} />}
                        <p className="mt-2 truncate text-[9px] font-semibold uppercase text-ink">{output.kind} · {output.durationSeconds}s · shot {output.shotIndex}</p>
                        <p className="mt-1 truncate text-[8px] uppercase text-grey">{output.status} · {output.voicePath ?? "visual"} · {output.provider}</p>
                        {(() => {
                          const evaluation = bundle.evaluations.find((item) => item.outputId === output.id);
                          if (!evaluation) return null;
                          return (
                            <div className={`mt-2 rounded border p-2 text-[8px] uppercase leading-4 ${evaluation.identityGate === "pass" && evaluation.audioGate === "pass" && evaluation.lipSyncGate !== "fail" ? "border-emerald-500/30 text-emerald-200" : "border-red-500/30 text-red-200"}`}>
                              score {evaluation.composite.toFixed(1)} · identity {evaluation.identity.toFixed(0)} {evaluation.identityGate} · audio {evaluation.audioGate} · lip-sync {evaluation.lipSyncGate}{evaluation.nullResult ? " · null result" : ""}
                            </div>
                          );
                        })()}
                        {output.error && <p className="mt-1 text-[9px] leading-4 text-red-200">{output.error}</p>}
                      </div>
                    ))}
                    {!outputs.length && <p className="col-span-2 bg-page p-4 text-[10px] text-grey">Awaiting this variant’s locked keyframe and clips.</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <details className="border-b border-line p-5" open>
        <summary className="cursor-pointer text-sm font-semibold text-ink">All 37 adversarial verdicts</summary>
        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {bundle.verifications.map((item) => (
            <article key={item.id} className={`rounded-md border p-3 ${item.verdict === "held" ? "border-emerald-500/20 bg-emerald-950/10" : "border-red-500/25 bg-red-950/10"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="max-w-xl text-xs font-semibold leading-5 text-ink">{item.principle}</p>
                <span className={`rounded-full border px-2 py-1 text-[8px] uppercase ${item.verdict === "held" ? "border-emerald-500/40 text-emerald-200" : "border-red-500/40 text-red-200"}`}>{item.verdict}</span>
              </div>
              <p className="mt-1 text-[9px] uppercase tracking-[0.11em] text-grey">{item.axis} · {item.workTitle} · {item.frameCount} frames · confidence {item.confidence}</p>
              <p className="mt-2 text-[10px] leading-4 text-grey">{item.evidenceSummary}</p>
              {item.refutation && <p className="mt-2 text-[10px] leading-4 text-red-200"><b>Why it failed:</b> {item.refutation}</p>}
              {item.humanVerdict && <p className="mt-2 text-[9px] uppercase tracking-[0.11em] text-accent-secondary">Calibration · human {item.humanVerdict} · {item.calibrationMatch ? "matched" : "disagreed"}</p>}
            </article>
          ))}
        </div>
      </details>

      <div className="p-5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.17em] text-grey">Verifier history · failures stay visible</p>
        <div className="mt-3 space-y-2">
          {bundle.runs.map((run) => (
            <article key={run.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line bg-black/10 p-3">
              <div>
                <p className="text-xs font-semibold text-ink">{run.sprintKey}</p>
                <p className="mt-1 text-[9px] uppercase tracking-[0.11em] text-grey">{run.model} · {run.sampleFps} fps · {run.calibrationMatches}/{run.calibrationCount} calibration · ${run.costUsd.toFixed(4)}</p>
                {run.failureSummary && <p className="mt-2 max-w-4xl text-[10px] leading-4 text-red-200">{run.failureSummary}</p>}
              </div>
              <span className={`rounded-full border px-2 py-1 text-[8px] uppercase ${statusStyle(run.status)}`}>{run.status}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

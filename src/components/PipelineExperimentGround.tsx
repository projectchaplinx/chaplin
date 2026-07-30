"use client";

import { useMemo, useState } from "react";
import DirectorEvaluationScorecard from "@/components/DirectorEvaluationScorecard";
import { DIRECTOR_EVALUATION_DIMENSIONS } from "@/lib/director-evaluation";
import type { PipelineExperiment, PipelineExperimentVariant } from "@/lib/pipeline-experiments";
import { PIPELINE_STAGE_IDS, PIPELINE_STAGE_META, type PipelineStageId } from "@/lib/pipeline-config";

type LabCharacter = {
  id: string;
  name: string;
  imageUrl: string | null;
};

function money(value: number | null) {
  return value == null ? "Cost pending" : `$${value.toFixed(4)}`;
}

function duration(value: number | null) {
  if (value == null) return "Timing pending";
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

function cloneExperiment(experiment: PipelineExperiment): PipelineExperiment {
  return structuredClone(experiment);
}

export default function PipelineExperimentGround({
  initialExperiments,
  characters,
}: {
  initialExperiments: PipelineExperiment[];
  characters: LabCharacter[];
}) {
  const [experiments, setExperiments] = useState(initialExperiments);
  const [activeId, setActiveId] = useState(initialExperiments[0]?.id ?? "");
  const [draft, setDraft] = useState<PipelineExperiment | null>(
    initialExperiments[0] ? cloneExperiment(initialExperiments[0]) : null,
  );
  const [newStage, setNewStage] = useState<PipelineStageId>("image");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [compiledVariantId, setCompiledVariantId] = useState("");
  const [ephemeralAudio, setEphemeralAudio] = useState<Record<string, string>>({});

  const active = useMemo(
    () => experiments.find((experiment) => experiment.id === activeId) ?? null,
    [activeId, experiments],
  );

  function applyExperiments(next: PipelineExperiment[], preferredId?: string) {
    setExperiments(next);
    const nextId = preferredId ?? activeId ?? next[0]?.id ?? "";
    setActiveId(nextId);
    const selected = next.find((item) => item.id === nextId) ?? next[0] ?? null;
    setDraft(selected ? cloneExperiment(selected) : null);
  }

  async function request(url: string, options?: RequestInit) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    });
    const data = await response.json() as { experiments?: PipelineExperiment[]; id?: string; error?: string; config?: { revision?: number } };
    if (!response.ok) throw new Error(data.error || "Pipeline Lab request failed.");
    return data;
  }

  async function createExperiment() {
    setBusy("create");
    setMessage("");
    try {
      const data = await request("/api/admin/pipeline/experiments", {
        method: "POST",
        body: JSON.stringify({
          stage: newStage,
          name: `${PIPELINE_STAGE_META[newStage].label} comparison`,
          characterId: characters[0]?.id ?? null,
          referenceImageUrl: characters[0]?.imageUrl ?? null,
        }),
      });
      if (data.experiments) applyExperiments(data.experiments, data.id);
      setMessage("A clean control/challenger experiment is ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Experiment could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function saveDraft(nextDraft = draft) {
    if (!nextDraft) return null;
    setBusy("save");
    setMessage("");
    try {
      const data = await request("/api/admin/pipeline/experiments", {
        method: "PATCH",
        body: JSON.stringify(nextDraft),
      });
      if (data.experiments) applyExperiments(data.experiments, nextDraft.id);
      setMessage("Experiment saved. Production remains unchanged.");
      return data.experiments?.find((item) => item.id === nextDraft.id) ?? nextDraft;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Experiment could not be saved.");
      return null;
    } finally {
      setBusy("");
    }
  }

  function replaceVariant(variantId: string, updater: (variant: PipelineExperimentVariant) => PipelineExperimentVariant) {
    setDraft((current) => current ? {
      ...current,
      variants: current.variants.map((variant) => variant.id === variantId ? updater(variant) : variant),
    } : current);
  }

  async function refresh(preferredId = activeId) {
    const data = await request("/api/admin/pipeline/experiments");
    if (data.experiments) applyExperiments(data.experiments, preferredId);
  }

  async function runVariant(variantId: string) {
    if (!draft) return;
    setBusy(`run-${variantId}`);
    setMessage("");
    try {
      const saved = await saveDraft(draft);
      if (!saved) return;
      const variant = saved.variants.find((item) => item.id === variantId);
      if (!variant) throw new Error("Variant was not found.");
      if (!saved.inputPrompt.trim()) throw new Error("Add one shared test input first.");
      if (!saved.characterId) throw new Error("Choose a test character.");
      if (saved.stage === "writing") {
        await request("/api/admin/pipeline/experiments/run", {
          method: "POST",
          body: JSON.stringify({ experimentId: saved.id, variantId }),
        });
      } else {
        const action = saved.stage === "voice" ? "voice-design" : saved.stage;
        const body: Record<string, unknown> = {
          action,
          characterId: saved.characterId,
          pipelineExperiment: {
            id: saved.id,
            variantId,
            stage: saved.stage,
            config: variant.config,
          },
        };
        if (saved.stage === "voice") {
          body.description = saved.inputPrompt;
          body.previewText = `${saved.inputPrompt} This audition line is deliberately long enough to reveal pace, tone, emotional control, pronunciation, and repeatability across the complete character performance.`;
        } else {
          body.prompt = saved.inputPrompt;
        }
        if (saved.stage === "sfx") body.durationSeconds = Number(variant.config.settings.durationSeconds ?? 1.5);
        if (saved.stage === "image") {
          body.imagePurpose = "identity";
          body.referenceImage = saved.referenceImageUrl;
        }
        if (saved.stage === "video") body.referenceImage = saved.referenceImageUrl;
        const response = await fetch("/api/generate", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(error.error || `${PIPELINE_STAGE_META[saved.stage].label} test failed.`);
        }
        if (saved.stage === "voice") {
          const data = await response.json() as { previews?: Array<{ audio_base_64?: string }> };
          const audio = data.previews?.[0]?.audio_base_64;
          if (audio) setEphemeralAudio((current) => ({ ...current, [variantId]: `data:audio/mpeg;base64,${audio}` }));
        }
      }
      await refresh(saved.id);
      setMessage(`${variant.name} finished. Score the output before selecting a winner.`);
    } catch (error) {
      await refresh(draft.id).catch(() => undefined);
      setMessage(error instanceof Error ? error.message : "Variant test failed.");
    } finally {
      setBusy("");
    }
  }

  async function chooseWinner(variantId: string) {
    if (!draft) return;
    const next = { ...draft, winnerVariantId: variantId, status: "review" as const };
    setDraft(next);
    await saveDraft(next);
  }

  async function promote() {
    if (!draft?.winnerVariantId) return;
    if (!window.confirm("Promote the winning variant to live production? The current revision will remain archived.")) return;
    setBusy("promote");
    setMessage("");
    try {
      const data = await request("/api/admin/pipeline/experiments", {
        method: "PATCH",
        body: JSON.stringify({ action: "promote", id: draft.id }),
      });
      if (data.experiments) applyExperiments(data.experiments, draft.id);
      setMessage(`Winner promoted as production revision ${data.config?.revision ?? "next"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Winner could not be promoted.");
    } finally {
      setBusy("");
    }
  }

  const selectedCharacter = characters.find((character) => character.id === draft?.characterId);

  return (
    <div className="grid gap-5 xl:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="space-y-4 self-start xl:sticky xl:top-24">
        <section className="poster-card rounded-xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">New isolated test</p>
          <select className="field mt-3 w-full" value={newStage} onChange={(event) => setNewStage(event.target.value as PipelineStageId)}>
            {PIPELINE_STAGE_IDS.map((stage) => <option key={stage} value={stage}>{PIPELINE_STAGE_META[stage].label}</option>)}
          </select>
          <button type="button" onClick={createExperiment} disabled={busy === "create"} className="accent-btn mt-3 w-full rounded-full px-4 py-2.5 text-xs font-semibold disabled:opacity-50">
            {busy === "create" ? "Creating..." : "Create A/B experiment"}
          </button>
        </section>

        <section className="poster-card rounded-xl p-2">
          <p className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-grey">Experiment shelf</p>
          <div className="branded-scroll max-h-[58vh] space-y-1 overflow-auto">
            {experiments.map((experiment) => (
              <button
                key={experiment.id}
                type="button"
                onClick={() => {
                  setActiveId(experiment.id);
                  setDraft(cloneExperiment(experiment));
                  setMessage("");
                }}
                className={`w-full rounded-lg border px-3 py-3 text-left ${experiment.id === activeId ? "border-accent bg-accent/10" : "border-transparent hover:border-line"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold">{experiment.name}</span>
                  <span className="text-[8px] uppercase tracking-wider text-grey">{experiment.status}</span>
                </span>
                <span className="mt-1 block text-[9px] uppercase tracking-wider text-grey">
                  {PIPELINE_STAGE_META[experiment.stage].owner} · r{experiment.baselineRevision}
                </span>
              </button>
            ))}
            {!experiments.length && <p className="px-3 py-8 text-center text-xs text-grey">No experiments yet.</p>}
          </div>
        </section>
      </aside>

      <main className="min-w-0 space-y-5">
        {!draft ? (
          <section className="poster-card rounded-xl p-10 text-center">
            <p className="font-serif text-3xl">Build without risking production.</p>
            <p className="mx-auto mt-3 max-w-xl text-sm text-grey">Choose a stage and create the first control/challenger test.</p>
          </section>
        ) : (
          <>
            <section className="poster-card overflow-hidden rounded-xl">
              <div className="border-b border-line p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
                      {PIPELINE_STAGE_META[draft.stage].owner} · parallel ground
                    </p>
                    <input
                      className="mt-2 w-full bg-transparent font-serif text-2xl outline-none sm:text-4xl"
                      value={draft.name}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    />
                    <p className="mt-2 text-xs text-grey">
                      Forked from production revision {draft.baselineRevision}. Nothing here is live until a tested winner is promoted.
                    </p>
                  </div>
                  <span className="self-start rounded-full border border-[#07d2be]/35 bg-[#07d2be]/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#36e0cd]">
                    Isolated · {draft.status}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-[1fr_260px]">
                <label>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-grey">One shared test input</span>
                  <textarea
                    className="field mt-2 min-h-28 w-full resize-y"
                    value={draft.inputPrompt}
                    onChange={(event) => setDraft({ ...draft, inputPrompt: event.target.value })}
                    placeholder="The exact same creative brief, line, sound, image direction, or motion instruction for every variant."
                  />
                </label>
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-grey">Test character</span>
                    <select
                      className="field mt-2 w-full"
                      value={draft.characterId ?? ""}
                      onChange={(event) => {
                        const character = characters.find((item) => item.id === event.target.value);
                        setDraft({ ...draft, characterId: event.target.value || null, referenceImageUrl: character?.imageUrl ?? null });
                      }}
                    >
                      <option value="">Choose an actor</option>
                      {characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
                    </select>
                  </label>
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-[9px] uppercase tracking-wider text-grey">Reference lock</p>
                    <p className="mt-1 truncate text-xs font-semibold">{selectedCharacter?.name ?? "No actor selected"}</p>
                    <p className="mt-1 text-[9px] text-grey">{draft.referenceImageUrl ? "Canonical image attached" : "No image reference"}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              {draft.variants.map((variant) => {
                const latestResult = active?.results.find((result) => result.variantId === variant.id);
                const compiled = [variant.config.promptPrelude.trim(), draft.inputPrompt.trim()].filter(Boolean).join("\n\n");
                return (
                  <article key={variant.id} className={`poster-card overflow-hidden rounded-xl border ${draft.winnerVariantId === variant.id ? "border-[#07d2be]" : "border-line"}`}>
                    <div className="border-b border-line p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <input
                            value={variant.name}
                            onChange={(event) => replaceVariant(variant.id, (current) => ({ ...current, name: event.target.value }))}
                            className="w-full bg-transparent text-lg font-semibold outline-none"
                          />
                          <input
                            value={variant.hypothesis}
                            onChange={(event) => replaceVariant(variant.id, (current) => ({ ...current, hypothesis: event.target.value }))}
                            className="mt-1 w-full bg-transparent text-[10px] text-grey outline-none"
                            placeholder="What should improve, and why?"
                          />
                        </div>
                        {draft.winnerVariantId === variant.id && <span className="rounded-full bg-[#07d2be]/15 px-2 py-1 text-[8px] font-bold uppercase text-[#36e0cd]">Winner</span>}
                      </div>
                    </div>
                    <div className="space-y-4 p-5">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="text-[9px] uppercase tracking-wider text-grey">
                          Provider
                          <input className="field mt-1 w-full text-xs normal-case" value={variant.config.provider} onChange={(event) => replaceVariant(variant.id, (current) => ({ ...current, config: { ...current.config, provider: event.target.value } }))} />
                        </label>
                        <label className="text-[9px] uppercase tracking-wider text-grey">
                          Model
                          <input className="field mt-1 w-full text-xs normal-case" value={variant.config.model} onChange={(event) => replaceVariant(variant.id, (current) => ({ ...current, config: { ...current.config, model: event.target.value } }))} />
                        </label>
                      </div>
                      <label className="block text-[9px] uppercase tracking-wider text-grey">
                        System prompt / global instruction
                        <textarea className="field mt-1 min-h-32 w-full resize-y text-xs normal-case leading-5" value={variant.config.promptPrelude} onChange={(event) => replaceVariant(variant.id, (current) => ({ ...current, config: { ...current.config, promptPrelude: event.target.value } }))} />
                      </label>
                      <label className="block text-[9px] uppercase tracking-wider text-grey">
                        Provider settings (JSON)
                        <textarea
                          className="field branded-scroll mt-1 min-h-28 w-full resize-y font-mono text-[10px] normal-case"
                          defaultValue={JSON.stringify(variant.config.settings, null, 2)}
                          onBlur={(event) => {
                            try {
                              const settings = JSON.parse(event.target.value) as Record<string, string | number | boolean>;
                              replaceVariant(variant.id, (current) => ({ ...current, config: { ...current.config, settings } }));
                              setMessage("");
                            } catch {
                              setMessage("Provider settings JSON is not valid yet.");
                            }
                          }}
                        />
                      </label>
                      <button type="button" onClick={() => setCompiledVariantId(compiledVariantId === variant.id ? "" : variant.id)} className="text-[10px] font-semibold text-accent">
                        {compiledVariantId === variant.id ? "Hide effective request" : "Inspect effective request"}
                      </button>
                      {compiledVariantId === variant.id && (
                        <pre className="branded-scroll max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-black/25 p-3 text-[10px] leading-4 text-grey">{compiled}</pre>
                      )}
                      <button type="button" onClick={() => runVariant(variant.id)} disabled={Boolean(busy)} className="magic-action w-full rounded-full px-4 py-2.5 text-xs font-semibold disabled:opacity-50" data-intelligence-action aria-busy={busy === `run-${variant.id}`}>
                        {busy === `run-${variant.id}` ? "Running real test..." : "Run isolated test"}
                      </button>

                      {ephemeralAudio[variant.id] && <audio controls className="w-full" src={ephemeralAudio[variant.id]} />}
                      {latestResult && (
                        <div className="rounded-xl border border-line bg-black/15 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[9px] font-bold uppercase ${latestResult.status === "succeeded" ? "text-emerald-500" : latestResult.status === "failed" ? "text-red-400" : "text-amber-400"}`}>{latestResult.status}</span>
                            <span className="text-[9px] text-grey">{money(latestResult.costUsd)} · {duration(latestResult.latencyMs)}</span>
                          </div>
                          {latestResult.outputUrl && (
                            latestResult.outputUrl.match(/\.(mp3|wav|m4a)(\?|$)/i)
                              ? <audio controls className="mt-3 w-full" src={latestResult.outputUrl} />
                              : latestResult.outputUrl.match(/\.(mp4|webm|mov)(\?|$)/i)
                                ? <video controls className="mt-3 aspect-video w-full rounded-lg bg-black object-cover" src={latestResult.outputUrl} />
                                // eslint-disable-next-line @next/next/no-img-element
                                : <img className="mt-3 aspect-video w-full rounded-lg object-cover" src={latestResult.outputUrl} alt={`${variant.name} output`} />
                          )}
                          {latestResult.outputText && <p className="branded-scroll mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-[10px] leading-4 text-grey">{latestResult.outputText}</p>}
                          {latestResult.errorMessage && <p className="mt-2 text-[10px] text-red-400">{latestResult.errorMessage}</p>}
                          {latestResult.status === "succeeded" && (
                            <DirectorEvaluationScorecard
                              key={latestResult.id}
                              stage={draft.stage}
                              resultId={latestResult.id}
                              initialEvaluation={latestResult.evaluation}
                              onSaved={() => refresh(draft.id)}
                            />
                          )}
                        </div>
                      )}
                      <button type="button" onClick={() => chooseWinner(variant.id)} disabled={latestResult?.status !== "succeeded" || latestResult.evaluation?.status !== "reviewed"} className="w-full rounded-full border border-[#07d2be]/45 px-4 py-2 text-[10px] font-semibold text-[#36e0cd] disabled:cursor-not-allowed disabled:opacity-30">
                        Prefer this reviewed result
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>

            <section className="poster-card rounded-xl p-5 sm:p-6">
              <div className="mb-5 border-b border-line pb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-secondary">Measured targets</p>
                    <p className="mt-1 text-xs text-grey">
                      Candidate must gain at least {draft.minimumImprovement} composite points with zero hard-gate regression.
                    </p>
                  </div>
                  {draft.comparison ? (
                    <span className={`rounded-full border px-3 py-1.5 text-[9px] font-semibold uppercase ${
                      draft.comparison.promotable ? "border-emerald-400/40 text-emerald-300" : "border-red-400/40 text-red-300"
                    }`}>
                      {draft.comparison.promotable ? `Eligible · +${draft.comparison.delta}` : "Blocked"}
                    </span>
                  ) : (
                    <span className="rounded-full border border-line px-3 py-1.5 text-[9px] text-grey">Awaiting two reviews</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {draft.targetDimensions.map((id) => (
                    <span key={id} className="rounded-full border border-white/10 px-2 py-1 text-[8px] text-grey">
                      {DIRECTOR_EVALUATION_DIMENSIONS.find((dimension) => dimension.id === id)?.label ?? id}
                    </span>
                  ))}
                </div>
                {draft.comparison?.blockers.length ? (
                  <ul className="mt-3 space-y-1 text-[9px] leading-4 text-red-300">
                    {draft.comparison.blockers.map((blocker) => <li key={blocker}>→ {blocker}</li>)}
                  </ul>
                ) : null}
              </div>
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Promotion gate</p>
                  <p className="mt-1 text-sm font-semibold">{draft.winnerVariantId ? `${draft.variants.find((item) => item.id === draft.winnerVariantId)?.name} selected` : "No winner selected"}</p>
                  <p className="mt-1 text-[10px] text-grey">Promotion archives the current production revision. It never overwrites history.</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => saveDraft()} disabled={Boolean(busy)} className="rounded-full border border-line px-5 py-2.5 text-xs font-semibold disabled:opacity-50">Save experiment</button>
                  <button type="button" onClick={promote} disabled={!draft.winnerVariantId || !draft.comparison?.promotable || busy === "promote"} className="accent-btn rounded-full px-5 py-2.5 text-xs font-semibold disabled:opacity-35">
                    {busy === "promote" ? "Promoting..." : "Promote tested winner"}
                  </button>
                </div>
              </div>
              {message && <p aria-live="polite" className={`mt-4 text-xs ${/could not|failed|required|not valid|error/i.test(message) ? "text-red-400" : "text-emerald-500"}`}>{message}</p>}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

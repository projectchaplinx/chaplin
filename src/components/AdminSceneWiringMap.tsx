"use client";

import { useMemo, useState } from "react";
import Avatar from "@/components/Avatar";
import { buildPromptHandoff, type HandoffPromptCard } from "@/lib/prompt-handoff";
import { composeCharacterInteractionPrompt, composeCharacterSheetPrompt } from "@/lib/character-system";
import {
  buildProductionBible,
  buildScenePackage,
  composeIdentityImagePrompt,
  composeSfxPrompt,
  composeThemePrompt,
  composeVideoPrompt,
  composeVoiceDesignPrompt,
} from "@/lib/production-prompting";
import { PIPELINE_STAGE_META, pipelineModelLabel, type PipelineConfig, type PipelineStageId } from "@/lib/pipeline-config";
import type { PromptLintIssue } from "@/lib/prompt-lint";
import type { Character } from "@/lib/types";
import { adBoardSchema, createAdBoard } from "@/lib/ad-board";
import { resolveBoardAudioPlans, type LayerOwner } from "@/lib/audio-plan";
import { seedanceAudioCapability } from "@/lib/seedance-audio";

type PromptCard = Omit<HandoffPromptCard, "consumer">;

function stageLabel(config: PipelineConfig, stage: PipelineStageId) {
  const current = config.stages[stage];
  return `${PIPELINE_STAGE_META[stage].label} · ${current.provider} · ${pipelineModelLabel(current.model)}`;
}

function PromptCardView({ card, config, issues = [] }: { card: PromptCard; config: PipelineConfig; issues?: PromptLintIssue[] }) {
  const [copied, setCopied] = useState(false);
  const stage = card.stage ? config.stages[card.stage] : null;

  async function copyPrompt() {
    await navigator.clipboard.writeText(card.prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <article className="poster-card rounded-md p-4" data-prompt-stage={card.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">{card.step}</p>
          <h3 className="reel-title mt-1 text-xl">{card.title}</h3>
        </div>
        <span className="rounded-full border border-line px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-grey">{card.destination}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-grey">{card.note}</p>
      {issues.length > 0 && (
        <div className="mt-3 space-y-1 rounded-sm border border-[#ff5b67]/45 bg-[#ff5b67]/10 p-3">
          {issues.map((issue) => (
            <p key={`${issue.rule}-${issue.message}`} className="text-[11px] leading-5 text-[#ff8d95]">
              <strong>{issue.rule}</strong> · {issue.message}
            </p>
          ))}
        </div>
      )}
      {stage && (
        <p className="mt-3 text-[10px] uppercase tracking-[0.12em] text-[#36e0cd]">
          Active route · {stageLabel(config, card.stage!)}
        </p>
      )}
      <details open className="mt-3 rounded-sm border border-line bg-black/10">
        <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-grey">Prompt emitted by Chaplin</summary>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-line p-3 font-sans text-[11px] leading-5 text-ink">{card.prompt}</pre>
        <div className="flex justify-end border-t border-line p-2">
          <button type="button" onClick={() => void copyPrompt()} className="rounded-full border border-accent/50 px-3 py-1.5 text-[10px] font-semibold text-accent hover:bg-accent/10">
            {copied ? "Copied ✓" : "Copy prompt"}
          </button>
        </div>
      </details>
      {stage?.promptPrelude && (
        <details className="mt-2 rounded-sm border border-line bg-black/5">
          <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-grey">Pipeline prelude appended at request time</summary>
          <p className="border-t border-line p-3 text-[11px] leading-5 text-grey">{stage.promptPrelude}</p>
        </details>
      )}
    </article>
  );
}

export default function AdminSceneWiringMap({ characters, config }: { characters: Character[]; config: PipelineConfig }) {
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [presentationConfirmed, setPresentationConfirmed] = useState(() => (
    typeof window !== "undefined"
      && window.localStorage.getItem(`chaplin:prompt-lint:presentation:${characters[0]?.id ?? ""}`) === "confirmed"
  ));
  const [audioSlotId, setAudioSlotId] = useState("slot-1");
  const [audioOverrides, setAudioOverrides] = useState<Record<string, {
    owner: LayerOwner;
    reason: string;
    at: string;
  }>>({});
  const character = characters.find((item) => item.id === characterId) ?? characters[0];
  const bible = useMemo(() => character ? buildProductionBible(character) : null, [character]);
  const scene = useMemo(
    () => character ? buildScenePackage({ ...character, brollLine: undefined }, 0) : null,
    [character],
  );
  const handoff = useMemo(
    () => character ? buildPromptHandoff(character, { presentationConfirmed }) : null,
    [character, presentationConfirmed],
  );
  const audioBoard = useMemo(() => {
    if (!character || !bible || !scene) return null;
    const created = createAdBoard({
      arcTemplate: "problem_solution",
      mode: "emotional_counterpoint",
      canonicalReferenceAsset: character.imageUrl || character.bannerUrl || "scene-map-preview",
      identityBlock: bible.visual.faceAnchors.join("; "),
      wardrobeState: bible.visual.wardrobe,
      ageState: bible.visual.perceivedAge,
    });
    const withSceneAudio = adBoardSchema.parse({
      ...created,
      slots: created.slots.map((slot, index) => {
        const dialogue = index === 0 ? scene.dialogue : null;
        const overrideEntries = (["dialogue", "ambience", "sfx"] as const).flatMap((layer) => {
          const value = audioOverrides[`${slot.id}:${layer}`];
          return value?.reason.trim().length >= 3
            ? [[layer, { ...value, by: "super-admin-preview" }]]
            : [];
        });
        return {
          ...slot,
          vo_line: dialogue,
          vo_kind: dialogue ? "dialogue" : "narration",
          location: "the selected scene location",
          set: scene.blueprint.setting,
          weather: "none",
          audio: { music: "", sfx: index === 1 ? scene.blueprint.soundTexture : "" },
          audio_plan: {
            ...slot.audio_plan,
            sfx: {
              ...slot.audio_plan.sfx,
              events: index === 1 ? [{ desc: scene.blueprint.soundTexture }] : [],
            },
            overrides: Object.fromEntries(overrideEntries),
          },
        };
      }),
    });
    const card = character.cardV2;
    const voice = card ? (card.voice_slots.primary ?? Object.values(card.voice_slots)[0]) : undefined;
    return adBoardSchema.parse(resolveBoardAudioPlans(
      withSceneAudio,
      seedanceAudioCapability(config.stages.video.model),
      {
        delivery_at_rest: voice?.pacing,
        delivery_under_pressure: voice?.pressure_delivery,
        signature_sfx: card?.signature_sfx_events?.flatMap((event) => [event.label, event.prompt]) ?? [],
      },
    ));
  }, [audioOverrides, bible, character, config.stages.video.model, scene]);

  if (!character || !bible || !scene || !handoff) {
    return <div className="poster-card rounded-md p-6 text-sm text-grey">No saved actor is available to map yet.</div>;
  }

  const promptCards: PromptCard[] = [
    {
      id: "master",
      step: "00 · Runtime identity",
      title: "Master character prompt",
      destination: "Character conversation agent",
      note: "The complete runtime identity, behavior, safety boundaries, memory contract, and voice continuity. Only authenticated Super Admin accounts can inspect or copy this prompt.",
      prompt: composeCharacterInteractionPrompt(character, bible),
    },
    {
      id: "sheet",
      step: "01 · Identity reference",
      title: "Character sheet frame",
      destination: "Image provider",
      note: "The canonical reference image travels beside this prompt. The prompt only changes the chosen view and age state while the recognition locks remain fixed.",
      prompt: composeCharacterSheetPrompt(character, bible, { viewId: "front", ageStateId: "canonical" }),
      stage: "image",
    },
    {
      id: "voice",
      step: "02 · Voice identity",
      title: "Voice design",
      destination: "ElevenLabs Voice Design",
      note: "This creates candidate voices. It is not dialogue and never includes visual or scene direction.",
      prompt: composeVoiceDesignPrompt(character),
      stage: "voice",
    },
    {
      id: "dialogue",
      step: "03 · Spoken performance",
      title: "Dialogue line",
      destination: "ElevenLabs TTS",
      note: "These are the exact words the actor says aloud. The locked voice ID, stable seed, and voice settings are attached by the server; no new voice identity is created here.",
      prompt: scene.dialogue,
      stage: "voice",
    },
    {
      id: "sfx",
      step: "04 · Sound stem",
      title: "Signature SFX",
      destination: "ElevenLabs Sound",
      note: "A physical, repeatable sound mark. Character biography and spoken dialogue are intentionally excluded.",
      prompt: composeSfxPrompt(character, scene.blueprint.soundTexture),
      stage: "sfx",
    },
    {
      id: "theme",
      step: "05 · Music stem",
      title: "Theme ident",
      destination: "ElevenLabs Music",
      note: "A short instrumental identity cue. It remains independent from dialogue and the silent motion plate.",
      prompt: composeThemePrompt(character, scene.blueprint.musicalArc),
      stage: "theme",
    },
    {
      id: "identity-still",
      step: "06 · Canonical visual",
      title: "Identity still",
      destination: "Image provider",
      note: "This prompt establishes the castable visual source. A creator must explicitly approve it before it becomes the canonical reference.",
      prompt: composeIdentityImagePrompt(character),
      stage: "image",
    },
    {
      id: "scene-still",
      step: "07 · Directed first frame",
      title: "Scene still",
      destination: "Image provider",
      note: "This prompt changes only the playable moment, composition, and light. The approved canonical reference is submitted separately as identity truth.",
      prompt: scene.image,
      stage: "image",
    },
    {
      id: "motion",
      step: "08 · Silent motion plate",
      title: "Image-to-video direction",
      destination: "Seedance",
      note: "The approved still is the exact first frame. This prompt controls only motion and camera; it deliberately contains no dialogue, sound, or identity redesign.",
      prompt: composeVideoPrompt(character, scene.blueprint),
      stage: "video",
    },
  ];

  return (
    <div className="space-y-8" data-admin-scene-wiring-map>
      <section className="poster-card overflow-hidden rounded-md">
        <div className="grid gap-5 p-5 lg:grid-cols-[220px_1fr] lg:p-6">
          <div className="relative min-h-56 overflow-hidden rounded-sm border border-line bg-black/20">
            {character.imageUrl || character.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- saved provider media is dynamic
              <img src={character.imageUrl ?? character.bannerUrl} alt={`${character.name} canonical actor`} className="absolute inset-0 h-full w-full object-cover" />
            ) : <div className="grid h-full place-items-center"><Avatar hue={character.avatarHue} label={character.name} size={88} /></div>}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-3 pt-12">
              <p className="text-sm font-semibold text-white">{character.name}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/70">Canonical actor reference</p>
            </div>
          </div>
          <div>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Selected production bible</p>
                <h2 className="reel-title mt-1 text-3xl">{character.name}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grey">{character.tagline}</p>
              </div>
              <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-grey">
                Map actor
                <select value={character.id} onChange={(event) => {
                  const nextId = event.target.value;
                  setCharacterId(nextId);
                  setPresentationConfirmed(
                    window.localStorage.getItem(`chaplin:prompt-lint:presentation:${nextId}`) === "confirmed",
                  );
                }} className="mt-1 block min-w-48 rounded-sm border border-line bg-paper px-3 py-2 text-xs font-medium normal-case tracking-normal text-ink">
                  {characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Want", bible.dramatic.externalWant],
                ["Contradiction", bible.dramatic.contradiction],
                ["Under pressure", bible.performance.underPressure],
                ["Signature look", bible.visual.wardrobe],
              ].map(([label, value]) => (
                <div key={label} className="rounded-sm border border-line bg-black/10 p-3">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">{label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-grey">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-sm border border-line bg-black/10 p-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-accent">Recognition locks carried into every visual request</p>
              <ol className="mt-2 grid gap-1 text-xs leading-relaxed text-grey sm:grid-cols-2">
                {(bible.visual.recognitionLocks ?? bible.visual.continuityRules).slice(0, 4).map((lock, index) => <li key={lock}>{index + 1}. {lock}</li>)}
              </ol>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Scene handoff map</p>
            <h2 className="reel-title mt-1 text-3xl">One bible, separate production artifacts</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-grey">Every card below shows the actual prompt constructed for the selected actor and exactly where it travels. Audio, image, and motion are intentionally separated so no stage silently rewrites the actor.</p>
          </div>
          <span className="rounded-full border border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-grey">Scene · {scene.sceneName}</span>
        </div>
        <div className={`mt-5 rounded-md border p-4 ${handoff.lint.pass ? "border-[#26d6aa]/40 bg-[#26d6aa]/8" : "border-[#ff5b67]/45 bg-[#ff5b67]/10"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-grey">Pre-generation prompt lint · {handoff.lint.durationMs}ms</p>
              <p className="mt-1 text-sm font-semibold">
                {handoff.lint.pass ? "Provider handoff is structurally safe" : `${handoff.lint.failures.length} failures block generation`}
              </p>
              <p className="mt-1 text-xs text-grey">{handoff.lint.warnings.length} warnings require review.</p>
            </div>
            {handoff.lint.warnings.some((issue) => issue.rule === "L7") && (
              <label className="flex items-center gap-2 text-xs text-grey">
                <input
                  type="checkbox"
                  checked={presentationConfirmed}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setPresentationConfirmed(checked);
                    window.localStorage.setItem(
                      `chaplin:prompt-lint:presentation:${character.id}`,
                      checked ? "confirmed" : "pending",
                    );
                  }}
                />
                Confirm voice presentation mismatch
              </label>
            )}
          </div>
        </div>
        {audioBoard && (
          <div className="mt-5 rounded-md border border-line bg-black/10 p-4" data-scene-audio-handoff>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Per-slot audio ownership</p>
                <p className="mt-1 text-sm font-semibold">Resolved before Seedance receives a prompt</p>
                <p className="mt-1 text-xs text-grey">Music is locked to post-mix. Overrides become active only after a typed reason is present.</p>
              </div>
              <select
                value={audioSlotId}
                onChange={(event) => setAudioSlotId(event.target.value)}
                className="rounded-sm border border-line bg-paper px-3 py-2 text-xs text-ink"
              >
                {audioBoard.slots.map((slot) => <option key={slot.id} value={slot.id}>Slot {slot.slot_no} · {slot.segment}</option>)}
              </select>
            </div>
            {audioBoard.slots.filter((slot) => slot.id === audioSlotId).map((slot) => {
              const rows = [
                ["dialogue", slot.audio_plan.dialogue.owner, slot.vo_line ? "Locked TTS line" : "No dialogue in this slot"],
                ["ambience", slot.audio_plan.ambience.owner, slot.audio_plan.ambience.description],
                ["sfx", slot.audio_plan.sfx.owner, slot.audio_plan.sfx.events.map((event) => event.desc).join("; ") || "No SFX event"],
                ["music", slot.audio_plan.music.owner, "One continuous board-level bed"],
              ] as const;
              return (
                <div key={slot.id} className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="text-[9px] uppercase tracking-wider text-grey">
                      <tr><th className="pb-2">Layer</th><th className="pb-2">Owner</th><th className="pb-2">Resolved source</th><th className="pb-2">Override with reason</th></tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {rows.map(([layer, owner, detail]) => {
                        const key = `${slot.id}:${layer}`;
                        const override = audioOverrides[key];
                        return (
                          <tr key={layer}>
                            <td className="py-3 font-semibold capitalize">{layer}</td>
                            <td className="py-3">
                              <span className="rounded-full border border-line px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-accent">{owner}</span>
                            </td>
                            <td className="max-w-xs py-3 pr-4 text-[11px] text-grey">{detail}</td>
                            <td className="py-3">
                              {layer === "music" ? (
                                <span className="text-[10px] text-grey">Not overridable</span>
                              ) : (
                                <div className="grid grid-cols-[110px_minmax(180px,1fr)] gap-2">
                                  <select
                                    value={override?.owner ?? owner}
                                    onChange={(event) => setAudioOverrides((current) => ({
                                      ...current,
                                      [key]: {
                                        owner: event.target.value as LayerOwner,
                                        reason: current[key]?.reason ?? "",
                                        at: current[key]?.at ?? new Date().toISOString(),
                                      },
                                    }))}
                                    className="rounded-sm border border-line bg-paper px-2 py-1.5 text-[10px] text-ink"
                                  >
                                    {(["native", "generated", "post_mix", "none"] as const)
                                      .filter((value) => !(layer === "dialogue" && (value === "generated" || value === "native")))
                                      .map((value) => <option key={value} value={value}>{value}</option>)}
                                  </select>
                                  <input
                                    value={override?.reason ?? ""}
                                    onChange={(event) => setAudioOverrides((current) => ({
                                      ...current,
                                      [key]: {
                                        owner: current[key]?.owner ?? owner,
                                        reason: event.target.value,
                                        at: current[key]?.at ?? new Date().toISOString(),
                                      },
                                    }))}
                                    placeholder="Required reason"
                                    className="rounded-sm border border-line bg-paper px-2 py-1.5 text-[10px] text-ink"
                                  />
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {promptCards.map((card) => (
            <PromptCardView
              key={card.id}
              card={card}
              config={config}
              issues={[...handoff.lint.failures, ...handoff.lint.warnings].filter((issue) => issue.cardId === card.id)}
            />
          ))}
        </div>
      </section>

      <section className="poster-card rounded-md p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">Final assembly contract</p>
        <h2 className="reel-title mt-1 text-2xl">What connects at the end</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {[
            ["1", "Approved scene still", "Becomes the exact first frame for motion."],
            ["2", "Synchronized performance", "Seedance animates the approved frame against the locked-voice reference and physically visible location sound."],
            ["3", "Independent audio stems", "Locked-voice dialogue, SFX, and theme remain separate until mix."],
            ["4", "Reviewable final shot", "FFmpeg aligns approved stems to the five-second motion plate for QC and approval."],
          ].map(([number, title, copy]) => (
            <div key={number} className="flex gap-3 border-l border-accent/50 pl-3">
              <span className="text-lg font-semibold text-accent">{number}</span>
              <div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-relaxed text-grey">{copy}</p></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

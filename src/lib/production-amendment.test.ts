import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AUDIO_PLAN } from "@/lib/audio-plan";
import { characterSheetSchema, characterSheetVideoReferences } from "@/lib/performance-reference";
import { ProviderScheduler } from "@/lib/provider-scheduler";
import { normalizePipelineConfig } from "@/lib/pipeline-config";
import { buildShotJob } from "@/lib/shot-job";
import { injectStyleContract } from "@/lib/style-contract";
import { verdictStats } from "@/lib/generation-verdict";
import { budgetVideoPrompt, countPromptWords, enforceMotionGrammar, motionGrammarIssues } from "@/lib/video-prompt-budget";

test("writing configuration cannot route back to Anthropic", () => {
  const config = normalizePipelineConfig({
    stages: {
      writing: {
        provider: "anthropic",
        model: "claude-sonnet-5",
      },
    },
  });
  assert.equal(config.stages.writing.provider, "openai");
  assert.equal(config.stages.writing.model, "gpt-5.6-terra");
});

test("style contract is injected verbatim and only once", () => {
  const contract = "Motivated warm window light from frame left, shallow depth, muted ochre palette, fine 35mm grain, lifted blacks, lateral blocking, humid atmosphere, late-1970s fixtures.";
  const first = injectStyleContract("A hand opens the case.", { contract_text: contract });
  const second = injectStyleContract(first, { contract_text: contract });
  assert.equal((second.match(new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length, 1);
});

test("i2v budget preserves the protected style contract and terminal negatives", () => {
  const scene = `Camera: slow dolly in. Subject event: Rhea grips the rope. ${"WORLD: humid battlefield atmosphere with detailed history. ".repeat(10)}`;
  const contract = "Motivated warm side light, shallow depth, ochre palette, fine grain, lifted blacks, lateral blocking, humid air, 1970s hardware.";
  const result = budgetVideoPrompt(`${scene}\nSTYLE CONTRACT — VERBATIM:\n${contract} No frozen figures. No music. No subtitles.`, "image_to_video", true);
  assert.ok(result.trimmed);
  assert.ok(countPromptWords(result.prompt) <= 80);
  assert.ok(result.prompt.includes(contract));
  assert.ok(result.prompt.endsWith("No frozen figures. No music. No subtitles."));
});

test("i2v budget never drops identity anchors or the audio contract", () => {
  const filler = "WORLD: humid battlefield atmosphere with detailed history and texture. ".repeat(14);
  const prompt = [
    "Camera: slow dolly in.",
    "Subject event: Rhea grips the rope.",
    filler,
    "IDENTITY ANCHOR: Keep only Rhea readable and identity-locked. Never blend, duplicate, beautify, age-shift, or substitute her.",
    "AUDIO: Silent visual plate only. No lip-sync, speech, effects, ambience, or music; audio is generated and mixed separately. --duration 4.000 --camerafixed true",
    "No frozen figures. No music. No subtitles.",
  ].join("\n");
  const result = budgetVideoPrompt(prompt, "image_to_video", true);
  assert.ok(result.trimmed);
  // The bug: production trimming kept only the leading words, silently cutting
  // the identity lock and the silent-plate audio contract — which is how a
  // post-mix plate ends up with a model-invented voice.
  assert.match(result.prompt, /IDENTITY ANCHOR: Keep only Rhea readable/);
  assert.match(result.prompt, /AUDIO: Silent visual plate only/);
  assert.match(result.prompt, /--duration 4\.000/);
  assert.ok(result.prompt.endsWith("No frozen figures. No music. No subtitles."));
});

test("motion grammar requires camera, event, and no frozen figures with split sentences", () => {
  const prompt = enforceMotionGrammar({ camera: "slow lateral track", event: "Rhea sips coffee and looks up" });
  assert.deepEqual(motionGrammarIssues(prompt), []);
});

test("composite sheets are blocked while cropped panels become character references", () => {
  const sheet = characterSheetSchema.parse({
    id: "sheet-rhea-v2",
    character_id: "rhea",
    age_state: "adult",
    wardrobe_state: "field",
    version: 2,
    composite_asset_id: "composite-review-only",
    panel_asset_ids: { front: "front", three_quarter: "three-quarter", profile: "profile", full_body: "full-body" },
    status: "current",
  });
  const panels = characterSheetVideoReferences(sheet);
  assert.equal(panels.length, 4);
  assert.ok(panels.every((reference) => reference.character_reference_role === "panel"));
  assert.throws(() => buildShotJob({
    model_version: "future",
    total_duration_ms: 3_000,
    aspect_ratio: "16:9",
    references: [{ id: "bad", kind: "character", asset_id: sheet.composite_asset_id!, label: "@image1", character_reference_role: "composite" }],
    shots: [{
      id: "s1", index: 0, duration_ms: 3_000, framing: "medium profile", camera_move: "locked",
      beats: [{ at_ms: 0, action: "Rhea lifts the cup" }], subject_refs: ["bad"], seam_to_next: "hard_cut", audio: DEFAULT_AUDIO_PLAN,
    }],
  }), /human review only/i);
});

test("verdict stats expose kill rate and the variable that converts most keeps", () => {
  assert.deepEqual(verdictStats([
    { verdict: "killed", changed_variable: null },
    { verdict: "kept", changed_variable: "camera" },
    { verdict: "kept", changed_variable: "camera" },
    { verdict: "kept", changed_variable: "lighting" },
  ]), { decided: 4, killRate: 0.25, bestConversionVariable: "camera" });
});

test("provider scheduler never exceeds its configured cap and retries the identical prompt", async () => {
  const scheduler = new ProviderScheduler("test", 2, 1, 1);
  let active = 0;
  let peak = 0;
  const seen = new Map<string, string[]>();
  await Promise.all(Array.from({ length: 6 }, (_, index) => {
    const prompt = `prompt-${index}`;
    return scheduler.submit(prompt, async (received) => {
      seen.set(prompt, [...(seen.get(prompt) ?? []), received]);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 3));
      active -= 1;
      if (index === 0 && seen.get(prompt)?.length === 1) throw new Error("429 rate limit");
      return index;
    });
  }));
  assert.equal(peak, 2);
  assert.deepEqual(seen.get("prompt-0"), ["prompt-0", "prompt-0"]);
  assert.deepEqual(scheduler.report(), { submitted: 6, active: 0, queued: 0, failed: 0, kept: 0 });
});

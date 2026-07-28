import assert from "node:assert/strict";
import test from "node:test";
import { adBoardSchema, createAdBoard } from "@/lib/ad-board";
import {
  audioPlanSchema,
  buildAudioSceneBlock,
  lintAudioPlan,
  planSlotAudioMix,
  resolveAudioPlan,
} from "@/lib/audio-plan";
import type { SeedanceAudioCapability } from "@/lib/seedance-audio";

const capable: SeedanceAudioCapability = {
  audio_reference_input: true,
  native_audio_output: true,
  max_audio_ref_ms: 15_000,
};
const silentCapability: SeedanceAudioCapability = {
  audio_reference_input: false,
  native_audio_output: false,
  max_audio_ref_ms: 0,
};

function slot(overrides: Record<string, unknown> = {}) {
  const board = createAdBoard({
    arcTemplate: "problem_solution",
    mode: "emotional_counterpoint",
    canonicalReferenceAsset: "canonical-1",
    identityBlock: "same fictional actor with exact face geometry and stable adult age",
    wardrobeState: "charcoal work jacket",
    ageState: "late thirties",
  });
  return adBoardSchema.parse({
    ...board,
    slots: board.slots.map((item, index) => index === 0 ? {
      ...item,
      location: "covered harbour",
      set: "painted timber launch",
      weather: "fine rain",
      camera: "over-shoulder on the listener",
      ...overrides,
    } : item),
  }).slots[0];
}

test("audio-ref capable dialogue uses locked TTS natively and emits only owned prompt blocks", () => {
  const input = slot({
    vo_line: "Hold the line.",
    vo_kind: "dialogue",
    dialogue_asset_id: "tts-1",
    dialogue_url: "https://example.com/tts-1.mp3",
    dialogue_duration_ms: 2_200,
    duration_ms: 3_200,
  });
  const plan = resolveAudioPlan(input, capable, { delivery_under_pressure: "quiet and exact" });
  const prompt = buildAudioSceneBlock({ plan, durationMs: input.duration_ms, delivery: "quiet and exact" });
  assert.equal(plan.dialogue.owner, "native");
  assert.equal(plan.ambience.owner, "native");
  assert.match(prompt, /\[DIALOGUE\].*supplied audio reference/i);
  assert.match(prompt, /\[AMBIENCE\]/);
  assert.match(prompt, /no music, no invented voices, no narration/i);
});

test("the same dialogue slot falls back to post-mix and off-face when capability is false", () => {
  const input = slot({
    vo_line: "Hold the line.",
    vo_kind: "dialogue",
    dialogue_asset_id: "tts-1",
    dialogue_url: "https://example.com/tts-1.mp3",
    dialogue_duration_ms: 2_200,
  });
  const plan = resolveAudioPlan(input, silentCapability);
  const prompt = buildAudioSceneBlock({ plan, durationMs: input.duration_ms });
  assert.equal(plan.dialogue.owner, "post_mix");
  assert.equal(plan.dialogue.framing_constraint, "off_face");
  assert.equal(plan.ambience.owner, "generated");
  assert.doesNotMatch(prompt, /\[DIALOGUE\]/);
  assert.match(prompt, /no speech, no dialogue, no vocal sounds/i);
  assert.deepEqual(planSlotAudioMix({ ...input, audio_plan: plan }, false), {
    nativeAudioUsed: false,
    dialogueFallbackToPostMix: false,
    includeDialogue: true,
    includeAmbience: true,
    includeSfx: false,
    dialogueOffsetMs: 500,
    musicDuckDb: -20,
  });
});

test("a silent ambience slot gives the physical bed to native output", () => {
  const input = slot({ vo_line: null });
  const plan = resolveAudioPlan(input, capable);
  assert.equal(plan.dialogue.owner, "none");
  assert.equal(plan.ambience.owner, "native");
  assert.match(plan.ambience.description, /covered harbour/);
  assert.match(plan.ambience.description, /fine rain/);
});

test("a frame-exact signature event stays generated and contributes no native SFX block", () => {
  const input = slot({
    audio_plan: {
      dialogue: { owner: "none", source: "locked_tts" },
      ambience: { owner: "generated", description: "" },
      sfx: { owner: "generated", events: [{ desc: "brass clasp snap", at_ms: 1_250 }] },
      music: { owner: "post_mix" },
      overrides: {},
    },
  });
  const plan = resolveAudioPlan(input, capable, { signature_sfx: ["brass clasp snap"] });
  const prompt = buildAudioSceneBlock({ plan, durationMs: input.duration_ms });
  assert.equal(plan.sfx.owner, "generated");
  assert.doesNotMatch(prompt, /\[SFX\]/);
});

test("legacy stems remains a complete all-post-mix fallback", () => {
  const input = slot({
    vo_line: "Hold the line.",
    dialogue_asset_id: "tts-1",
    dialogue_url: "https://example.com/tts-1.mp3",
    audio: { music: "", sfx: "rope strain" },
  });
  const plan = resolveAudioPlan(input, capable, {}, "legacy_stems");
  assert.equal(plan.dialogue.owner, "post_mix");
  assert.equal(plan.ambience.owner, "generated");
  assert.equal(plan.sfx.owner, "generated");
  assert.equal(plan.music.owner, "post_mix");
});

test("all six audio lint rules are enforced", () => {
  const input = slot({
    vo_line: "Hold the line.",
    camera: "direct-address frontal close-up",
    dialogue_asset_id: null,
  });
  const malformed = {
    dialogue: { owner: "generated", source: "locked_tts", tts_asset_id: null, framing_constraint: "off_face" },
    ambience: { owner: "native", description: "rain" },
    sfx: { owner: "native", events: [{ desc: "a" }, { desc: "b" }, { desc: "c" }] },
    music: { owner: "native" },
    overrides: {},
  } as unknown as ReturnType<typeof audioPlanSchema.parse>;
  const malformedIssues = lintAudioPlan({ slot: input, plan: malformed, videoPrompt: "A swelling orchestral score" });
  assert.ok(malformedIssues.some((issue) => issue.rule === "L-audio-1"));
  assert.ok(malformedIssues.some((issue) => issue.rule === "L-audio-3"));
  assert.ok(malformedIssues.some((issue) => issue.rule === "L-audio-4"));
  assert.ok(malformedIssues.some((issue) => issue.rule === "L-audio-5"));

  const nativeMissing = audioPlanSchema.parse({
    ...malformed,
    dialogue: { owner: "native", source: "locked_tts", tts_asset_id: null },
    music: { owner: "post_mix" },
    sfx: { owner: "none", events: [] },
  });
  assert.ok(lintAudioPlan({
    slot: input,
    plan: nativeMissing,
    audioReferenceAttached: false,
  }).some((issue) => issue.rule === "L-audio-2"));

  const postMix = audioPlanSchema.parse({
    ...nativeMissing,
    dialogue: { owner: "post_mix", source: "locked_tts", framing_constraint: "off_face" },
  });
  assert.ok(lintAudioPlan({ slot: input, plan: postMix }).some((issue) => issue.rule === "L-audio-6"));
});


import assert from "node:assert/strict";
import test from "node:test";
import { buildNativeMultiShotPrompt, buildPunchSingleTakePrompt, providerDurationSeconds } from "@/lib/punch-generation";
import { budgetVideoPrompt } from "@/lib/video-prompt-budget";

test("scene clips use whole provider-safe durations while preserving a separate edit duration", () => {
  assert.equal(providerDurationSeconds("scene-clips", 3_000), 4);
  assert.equal(providerDurationSeconds("scene-clips", 3_250), 4);
  assert.equal(providerDurationSeconds("scene-clips", 4_100), 5);
  assert.equal(providerDurationSeconds("single-take", 3_000), 15);
});

test("single-take prompt carries four timed shots and finished audio direction", () => {
  const prompt = buildPunchSingleTakePrompt({
    title: "Paris Morning",
    logline: "Nova makes one immaculate choice under pressure",
    actorIdentity: "Nova keeps her canonical face and white suit.",
    themeDirection: "light Parisian percussion under a warm bass pulse",
    scenes: Array.from({ length: 4 }, (_, index) => ({
      setting: `Location ${index + 1}`,
      objective: `Change ${index + 1}`,
      action: `Action ${index + 1}`,
      camera: "a restrained push in",
      lines: index === 1 ? [{ speaker: "Nova", text: "Watch closely." }] : [],
    })),
  });

  assert.match(prompt, /0-4s — SHOT 1/);
  assert.match(prompt, /12-15s — SHOT 4/);
  assert.match(prompt, /Nova says exactly: "Watch closely\."/);
  assert.match(prompt, /Generate synchronized production audio inside this video/);
  assert.match(prompt, /One continuous 15-second 16:9 video/);
  const budgeted = budgetVideoPrompt(prompt, "native_multishot", true);
  assert.equal(budgeted.trimmed, false);
  assert.match(budgeted.prompt, /12-15s — SHOT 4/);
});

test("native multi-shot v2 follows the 2.5 contract: tags, timed beats, repeated constants, no speech", () => {
  const prompt = buildNativeMultiShotPrompt({
    title: "Night Platform",
    logline: "Nova hears something and chooses not to run",
    actorIdentity: "Nova keeps her canonical face and white suit.",
    references: [
      { tag: "@Image1", role: "canonical-identity", description: "Nova canonical portrait" },
      { tag: "@Image2", role: "style-sheet-panel", description: "Nova profile panel" },
    ],
    lookContract: "35mm feel, sodium-lit night palette, lifted blacks.",
    wardrobeLine: "white suit, short dark bob, paper ticket in right hand",
    timeOfDay: "night under platform lights",
    totalDurationSeconds: 30,
    scenes: [
      { setting: "Empty platform", objective: "orientation", action: "Nova walks the platform edge", shotSize: "WS", cameraMove: "slow lateral track" },
      { setting: "Platform bench", objective: "the sound lands", action: "Nova stops mid-step", shotSize: "MCU", cameraMove: "camera locked" },
      { setting: "Exit stairs", objective: "the choice", action: "Nova turns toward the dark exit", shotSize: "CU", cameraMove: "slow push in", transitionOut: "match cut on her turn" },
      { setting: "Stair landing", objective: "landing", action: "Nova holds still, eyes on the dark" },
    ],
  });
  assert.match(prompt, /00–0?7s|00–08s/); // first beat window exists
  assert.match(prompt, /@Image1 — canonical-identity/);
  assert.match(prompt, /matches @Image1 exactly in every beat/);
  // The guide's anti-drift practice: constants restated in EVERY beat.
  assert.equal((prompt.match(/CONSTANT: white suit, short dark bob/g) ?? []).length, 4);
  assert.match(prompt, /CAMERA: WS slow lateral track/);
  assert.match(prompt, /TRANSITION: match cut on her turn/);
  assert.match(prompt, /No spoken words, no narration/);
  const budgeted = budgetVideoPrompt(prompt, "native_multishot", true);
  assert.equal(budgeted.trimmed, false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { buildPunchSingleTakePrompt, providerDurationSeconds } from "@/lib/punch-generation";
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

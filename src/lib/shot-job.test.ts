import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_AUDIO_PLAN } from "@/lib/audio-plan";
import { performanceReferencePrompt } from "@/lib/performance-reference";
import { BANNED_WORDS, VIDEO_PROMPT_ENDING } from "@/lib/prompt-standards";
import { adaptShotJobForSeedance, partitionShotJob } from "@/lib/seedance-shot-adapter";
import { buildShotJob, compileShotJobPrompt, durationFromPerformance } from "@/lib/shot-job";
import { warDropShotJob } from "@/lib/shot-job-fixtures";

test("war-drop is one 15-second, four-shot contract with both heroes referenced", () => {
  const job = warDropShotJob();
  assert.equal(job.shots.length, 4);
  assert.equal(job.shots.reduce((sum, shot) => sum + shot.duration_ms, 0), 15_000);
  for (const shot of job.shots) {
    assert.deepEqual(shot.subject_refs, ["war-rhea-sheet", "war-kade-sheet"]);
    assert.ok(shot.beats.every((beat) => beat.at_ms < shot.duration_ms));
  }
  const prompt = compileShotJobPrompt(job);
  assert.ok(prompt.endsWith(VIDEO_PROMPT_ENDING));
  assert.match(prompt, /@image1/);
  assert.match(prompt, /@image2/);
});

test("stacked actions, stacked camera moves, and out-of-range beats hard fail", () => {
  const job = warDropShotJob();
  assert.throws(() => buildShotJob({
    ...job,
    shots: job.shots.map((shot, index) => index ? shot : {
      ...shot,
      camera_move: "dolly and then orbit",
      beats: [{ at_ms: shot.duration_ms, action: "Rhea runs and then jumps" }],
    }),
  }), /exactly one|strictly inside|one action/i);
});

test("portal and tracked-character caps hard fail", () => {
  const job = warDropShotJob();
  assert.throws(() => buildShotJob({
    ...job,
    shots: job.shots.map((shot, index) => ({ ...shot, seam_to_next: index < 2 ? "portal" as const : shot.seam_to_next })),
  }), /portal/i);
  assert.throws(() => buildShotJob({
    ...job,
    references: [
      ...job.references,
      { id: "third", kind: "character" as const, asset_id: "third-sheet", label: "@image3" as const },
      { id: "fourth", kind: "character" as const, asset_id: "fourth-sheet", label: "@image4" as const },
    ],
    shots: job.shots.map((shot) => ({ ...shot, subject_refs: [...shot.subject_refs, "third", "fourth"] })),
  }), /at most three/i);
});

test("current 2.0 account stays on single-shot transport; probed future capability unlocks one job", () => {
  const job = warDropShotJob();
  const current = adaptShotJobForSeedance(job);
  assert.equal(current.length, 4);
  assert.ok(current.every((submission) => submission.transport === "single-shot-2.0"));
  assert.ok(current.every((submission) => submission.references.some((reference) => reference.kind === "character")));
  const future = adaptShotJobForSeedance(job, {
    maxDurationMs: 30_000,
    maxReferences: 50,
    acceptsReferenceImages: true,
    acceptsReferenceVideo: true,
    acceptsReferenceAudio: true,
    structuredMultiShot: true,
  });
  assert.equal(future.length, 1);
  assert.equal(future[0].transport, "multi-shot");
  assert.equal(partitionShotJob(job, 8_000).length, 2);
});

test("duration is VO-first or beat-driven, never a four-second default", () => {
  assert.equal(durationFromPerformance({ measuredVoMs: 2_200, beatCount: 4, modelMaxDurationMs: 15_000 }), 2_700);
  assert.equal(durationFromPerformance({ beatCount: 3, modelMaxDurationMs: 15_000 }), 9_000);
});

test("audition prompts carry the selected performance recipe and video ending", () => {
  const prompt = performanceReferencePrompt({
    id: "take-1",
    character_id: "rhea",
    age_state: "adult",
    wardrobe_state: "field",
    line: "I said hold.",
    subtext: "She knows the rope will fail.",
    voice_recipe: { texture: "low grain", rhythm: "contained pauses", pressure: "a restrained break" },
    vocal_moment: "the word hold catches once",
    physical_behaviour: "her thumb stops rubbing the rope",
    asset_id: null,
    selected: false,
  });
  assert.ok(prompt.endsWith(VIDEO_PROMPT_ENDING));
  for (const word of BANNED_WORDS) assert.doesNotMatch(prompt, new RegExp(word, "i"));
  assert.deepEqual(DEFAULT_AUDIO_PLAN.music.owner, "post_mix");
});

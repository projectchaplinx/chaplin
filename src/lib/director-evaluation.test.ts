import assert from "node:assert/strict";
import test from "node:test";
import {
  compareDirectorEvaluations,
  defaultTargetDimensions,
  summarizeDirectorEvaluation,
  type DirectorEvaluationScores,
} from "./director-evaluation";

const passingVideo: DirectorEvaluationScores = {
  story_change: 3,
  objective_tactic: 3,
  cinematic_language: 3,
  prompt_adherence: 4,
  period_accuracy: 4,
  audio_source: 4,
  spatial_geography: 4,
  temporal_progression: 4,
  identity_wardrobe: 4,
  prop_state: 4,
  screen_direction: 4,
  audio_continuity: 4,
  image_quality: 3,
  editing_fluency: 3,
  camera_appeal: 3,
  performance_believability: 3,
  sound_quality: 3,
};

test("film-grade evaluation keeps axes and hard gates visible", () => {
  const summary = summarizeDirectorEvaluation("video", passingVideo);
  assert.equal(summary.gateStatus, "pass");
  assert.equal(summary.scoredDimensions, 17);
  assert.ok((summary.axisScores.instruction ?? 0) > 0);
  assert.ok((summary.axisScores.continuity ?? 0) > 0);
  assert.ok((summary.axisScores.aesthetic ?? 0) > 0);
});

test("a flattering composite cannot hide broken geography", () => {
  const summary = summarizeDirectorEvaluation("video", {
    ...passingVideo,
    spatial_geography: 2,
    image_quality: 5,
    camera_appeal: 5,
  });
  assert.equal(summary.gateStatus, "fail");
  assert.ok(summary.gateFailures.includes("spatial_geography"));
});

test("promotion needs measured improvement, no hard-gate regression, and human preference", () => {
  const candidate: DirectorEvaluationScores = Object.fromEntries(
    Object.entries(passingVideo).map(([id, score]) => [id, Math.min(5, Number(score) + 1)]),
  ) as DirectorEvaluationScores;
  const comparison = compareDirectorEvaluations({
    stage: "video",
    baseline: passingVideo,
    candidate,
    targetDimensions: defaultTargetDimensions("video"),
    minimumImprovement: 5,
    humanWinnerIsCandidate: true,
  });
  assert.equal(comparison.promotable, true);
  assert.ok((comparison.delta ?? 0) >= 5);
});

test("promotion is blocked when a hard gate regresses", () => {
  const comparison = compareDirectorEvaluations({
    stage: "video",
    baseline: passingVideo,
    candidate: { ...passingVideo, spatial_geography: 3, image_quality: 5, camera_appeal: 5 },
    targetDimensions: defaultTargetDimensions("video"),
    minimumImprovement: 0,
    humanWinnerIsCandidate: true,
  });
  assert.equal(comparison.promotable, false);
  assert.ok(comparison.blockers.some((blocker) => /hard-gate/i.test(blocker)));
});

test("promotion is blocked when a declared learning target regresses", () => {
  const comparison = compareDirectorEvaluations({
    stage: "video",
    baseline: passingVideo,
    candidate: {
      ...passingVideo,
      story_change: 2,
      image_quality: 5,
      camera_appeal: 5,
      performance_believability: 5,
    },
    targetDimensions: ["story_change", "image_quality"],
    minimumImprovement: 0,
    humanWinnerIsCandidate: true,
  });
  assert.equal(comparison.promotable, false);
  assert.ok(comparison.blockers.some((blocker) => /target dimension regressed/i.test(blocker)));
});

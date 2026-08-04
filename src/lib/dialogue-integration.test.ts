import assert from "node:assert/strict";
import test from "node:test";
import { postMixedDialogueMetadata } from "@/lib/dialogue-integration";

test("post-mix metadata cannot be overwritten back to unvoiced", () => {
  assert.deepEqual(postMixedDialogueMetadata({
    dialogueIntegrated: false,
    voicePath: null,
    taskId: "seedance-task",
  }), {
    dialogueIntegrated: true,
    voicePath: "B-post-mix",
    taskId: "seedance-task",
  });
});

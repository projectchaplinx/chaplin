import assert from "node:assert/strict";
import test from "node:test";
import { supersededChaplinVoices, type ElevenLabsVoiceSummary } from "./elevenlabs-voices";

test("selects only the oldest superseded generated voices for the same Chaplin actor", () => {
  const voices: ElevenLabsVoiceSummary[] = [
    { voice_id: "current", category: "generated", labels: { project: "chaplin", character_id: "actor-1" }, created_at_unix: 40 },
    { voice_id: "old-2", category: "generated", labels: { project: "chaplin", character_id: "actor-1" }, created_at_unix: 20 },
    { voice_id: "old-1", category: "generated", labels: { project: "chaplin", character_id: "actor-1" }, created_at_unix: 10 },
    { voice_id: "other-actor", category: "generated", labels: { project: "chaplin", character_id: "actor-2" }, created_at_unix: 1 },
    { voice_id: "unrelated", category: "generated", labels: { project: "another-product", character_id: "actor-1" }, created_at_unix: 2 },
    { voice_id: "cloned", category: "cloned", labels: { project: "chaplin", character_id: "actor-1" }, created_at_unix: 3 },
  ];

  assert.deepEqual(
    supersededChaplinVoices(voices, "actor-1", "current").map((voice) => voice.voice_id),
    ["old-1", "old-2"],
  );
});

test("never treats the active voice or an unlabelled voice as reclaimable", () => {
  const voices: ElevenLabsVoiceSummary[] = [
    { voice_id: "current", category: "generated", labels: { project: "chaplin", character_id: "actor-1" } },
    { voice_id: "unknown", category: "generated" },
  ];

  assert.deepEqual(supersededChaplinVoices(voices, "actor-1", "current"), []);
});

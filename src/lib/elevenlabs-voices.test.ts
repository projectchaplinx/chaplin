import assert from "node:assert/strict";
import test from "node:test";
import {
  deletableCharacterVoices,
  reclaimableChaplinVoices,
  reclaimableOwnedChaplinVoices,
  supersededChaplinVoices,
  type ElevenLabsVoiceSummary,
} from "./elevenlabs-voices";

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

test("capacity recovery excludes every active voice and scopes regular makers to their actor", () => {
  const voices: ElevenLabsVoiceSummary[] = [
    { voice_id: "active", category: "generated", labels: { project: "chaplin", character_id: "actor-1" }, created_at_unix: 1 },
    { voice_id: "same-actor", category: "generated", labels: { project: "chaplin", character_id: "actor-1" }, created_at_unix: 2 },
    { voice_id: "other-actor", category: "generated", labels: { project: "chaplin", character_id: "actor-2" }, created_at_unix: 3 },
    { voice_id: "foreign", category: "generated", labels: { project: "elsewhere", character_id: "actor-1" }, created_at_unix: 0 },
  ];
  assert.deepEqual(
    reclaimableChaplinVoices(voices, new Set(["active"]), "actor-1", false).map((voice) => voice.voice_id),
    ["same-actor"],
  );
  assert.deepEqual(
    reclaimableChaplinVoices(voices, new Set(["active"]), "actor-1", true).map((voice) => voice.voice_id),
    ["same-actor", "other-actor"],
  );
});

test("creator capacity recovery includes inactive voices across actors in their Studio", () => {
  const voices: ElevenLabsVoiceSummary[] = [
    { voice_id: "actor-1-old", category: "generated", labels: { project: "chaplin", character_id: "actor-1" }, created_at_unix: 3 },
    { voice_id: "actor-2-old", category: "generated", labels: { project: "chaplin", character_id: "actor-2" }, created_at_unix: 2 },
    { voice_id: "actor-2-active", category: "generated", labels: { project: "chaplin", character_id: "actor-2" }, created_at_unix: 1 },
    { voice_id: "other-maker", category: "generated", labels: { project: "chaplin", character_id: "actor-3" }, created_at_unix: 0 },
    { voice_id: "untracked", category: "generated" },
  ];

  assert.deepEqual(
    reclaimableOwnedChaplinVoices(
      voices,
      new Set(["actor-2-active"]),
      new Set(["actor-1", "actor-2"]),
    ).map((voice) => voice.voice_id),
    ["actor-2-old", "actor-1-old"],
  );
});

test("character deletion reclaims registered and labelled generated voices but protects shared voices", () => {
  const voices: ElevenLabsVoiceSummary[] = [
    { voice_id: "registered-old", category: "generated" },
    { voice_id: "labelled", category: "generated", labels: { project: "chaplin", character_id: "actor-1" } },
    { voice_id: "shared", category: "generated", labels: { project: "chaplin", character_id: "actor-1" } },
    { voice_id: "other", category: "generated", labels: { project: "chaplin", character_id: "actor-2" } },
    { voice_id: "premade", category: "premade", labels: { project: "chaplin", character_id: "actor-1" } },
  ];

  assert.deepEqual(
    deletableCharacterVoices(
      voices,
      "actor-1",
      new Set(["registered-old", "shared"]),
      new Set(["shared"]),
    ).map((voice) => voice.voice_id),
    ["registered-old", "labelled"],
  );
});

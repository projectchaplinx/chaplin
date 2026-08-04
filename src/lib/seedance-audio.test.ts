import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareSeedanceAudioPrompt,
  prepareSeedancePostMixDialoguePrompt,
  seedanceSupportsAudioReference,
} from "@/lib/seedance-audio";

const silentPrompt = [
  "Slow push in. The actor turns toward the doorway.",
  "AUDIO: Silent visual plate only. No lip-sync, speech, effects, ambience, or music; audio is generated and mixed separately.",
].join("\n");

test("locked dialogue replaces contradictory silent direction and preserves the exact line", () => {
  const prompt = prepareSeedanceAudioPrompt({
    prompt: silentPrompt,
    generateAudio: true,
    referenceAudioUrl: "https://example.com/locked-voice.mp3",
    dialogueText: 'I said "wait."',
  });
  assert.doesNotMatch(prompt, /Silent visual plate/i);
  assert.match(prompt, /supplied reference audio is the actor's locked voice/i);
  assert.match(prompt, /The line is: "I said 'wait\.'"/);
  assert.match(prompt, /character theme and masters the original locked-voice recording separately/i);
});

test("audio generation without a voice reference requests only physical scene sound", () => {
  const prompt = prepareSeedanceAudioPrompt({
    prompt: silentPrompt,
    generateAudio: true,
  });
  assert.doesNotMatch(prompt, /Silent visual plate/i);
  assert.match(prompt, /Record the location, not a soundtrack/i);
  assert.match(prompt, /No spoken words, no lip-sync/i);
});

test("audio references are sent only to Seedance 2.0 multimodal models", () => {
  assert.equal(seedanceSupportsAudioReference("dreamina-seedance-2-0-260128"), true);
  assert.equal(seedanceSupportsAudioReference("dreamina-seedance-2-0-fast-260128"), true);
  assert.equal(seedanceSupportsAudioReference("seedance-1-5-pro-251215"), false);
});

test("post-mix fallback receives neither dialogue text nor lip-sync authority", () => {
  const prompt = prepareSeedancePostMixDialoguePrompt(silentPrompt);
  assert.match(prompt, /locked voice is added exactly once after this render/i);
  assert.match(prompt, /Do not animate the mouth forming words/i);
  assert.match(prompt, /Silent visual plate only; no generated audio/i);
  assert.doesNotMatch(prompt, /Каждый раз|supplied reference audio/i);
});

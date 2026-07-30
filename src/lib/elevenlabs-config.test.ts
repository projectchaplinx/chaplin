import assert from "node:assert/strict";
import test from "node:test";
import {
  elevenLabsApiKey,
  resolveElevenLabsCredential,
} from "./elevenlabs-config";

test("the documented replacement key overrides the legacy ElevenLabs key", () => {
  const credential = resolveElevenLabsCredential({
    ELEVENLABS_API_KEY: "old-limited-account",
    ELEVEN_LABS_API_KEY: "new-account",
  });
  assert.deepEqual(credential, {
    apiKey: "new-account",
    envName: "ELEVEN_LABS_API_KEY",
  });
});

test("an explicit Chaplin key has highest priority", () => {
  assert.equal(elevenLabsApiKey({
    CHAPLIN_ELEVENLABS_API_KEY: "chaplin-account",
    ELEVEN_LABS_API_KEY: "shared-account",
    ELEVENLABS_API_KEY: "legacy-account",
  }), "chaplin-account");
});

test("NEW aliases support a staged credential rotation", () => {
  assert.equal(elevenLabsApiKey({
    ELEVEN_LABS_API_KEY_NEW: "rotated-account",
    ELEVENLABS_API_KEY_2: "second-account",
    ELEVEN_LABS_API_KEY: "current-account",
  }), "rotated-account");
});

test("blank values are skipped and the legacy key remains a fallback", () => {
  assert.equal(elevenLabsApiKey({
    ELEVEN_LABS_API_KEY: "   ",
    ELEVENLABS_API_KEY: "legacy-account",
  }), "legacy-account");
  assert.equal(elevenLabsApiKey({}), undefined);
});

test("masked Unicode values are skipped before they can enter an HTTP header", () => {
  const credential = resolveElevenLabsCredential({
    CHAPLIN_ELEVENLABS_API_KEY: "••••••••••••",
    ELEVEN_LABS_API_KEY: "valid-byte-safe-key",
  });
  assert.deepEqual(credential, {
    apiKey: "valid-byte-safe-key",
    envName: "ELEVEN_LABS_API_KEY",
  });
});

test("a copied bullet list marker is removed from an otherwise valid key", () => {
  assert.equal(elevenLabsApiKey({
    CHAPLIN_ELEVENLABS_API_KEY: "• valid-byte-safe-key",
  }), "valid-byte-safe-key");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_VOICE_DESIGN_CHARACTERS,
  voiceDesignAuditionText,
} from "./voice-preview";

test("pads a short voice-design audition without repeating its sentence", () => {
  const line = "This door opens for me.";
  const audition = voiceDesignAuditionText(line);

  assert.ok(audition.length >= MIN_VOICE_DESIGN_CHARACTERS);
  assert.equal(audition.match(/This door opens for me/gi)?.length, 1);
});

test("uses actor canon once while creating one provider-length audition line", () => {
  const audition = voiceDesignAuditionText("Stay close.", {
    brollLine: "The signal always returns",
    tagline: "Calm under pressure",
    personality: "Measured, observant, and quietly relentless",
  });

  assert.ok(audition.length >= MIN_VOICE_DESIGN_CHARACTERS);
  assert.equal(audition.match(/The signal always returns/gi)?.length, 1);
  assert.equal(audition.split(/[.!?]+/).filter(Boolean).length, 1);
});

test("voice-design audition preparation is idempotent", () => {
  const first = voiceDesignAuditionText("We only get one clean chance.");
  assert.equal(voiceDesignAuditionText(first), first);
});

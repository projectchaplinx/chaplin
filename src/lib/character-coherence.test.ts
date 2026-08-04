import assert from "node:assert/strict";
import test from "node:test";
import {
  coherentGeneratedCharacterName,
  explicitVoiceGender,
  suggestedCharacterName,
} from "@/lib/character-coherence";

test("explicit feminine pronouns produce a feminine progressive-draft name", () => {
  const brief = "Her death ledger remembers every kindness ever done to her.";
  const name = suggestedCharacterName({
    archetype: "hero",
    characterBrief: brief,
    voiceGender: "androgynous",
  });

  assert.equal(explicitVoiceGender(brief), "feminine");
  assert.match(name, /^(Anaya|Ira) /);
  assert.doesNotMatch(name, /^(Veer|Dev) /);
});

test("the streamed model name remains canonical when the creator supplied only a brief", () => {
  const name = coherentGeneratedCharacterName({
    creatorName: "",
    modelName: "Dmitri Volkov",
    archetype: "hero",
    characterBrief: "He is a Russian engineer who has represented his country aboard the space station for six hundred days.",
    voiceGender: "androgynous",
  });

  assert.equal(name, "Dmitri Volkov");
});

test("the local name list is used only when neither creator nor model supplied a name", () => {
  const name = coherentGeneratedCharacterName({
    creatorName: "",
    modelName: "",
    archetype: "hero",
    characterBrief: "She keeps a death ledger and has never forgiven anyone in her life.",
    voiceGender: "androgynous",
  });

  assert.match(name, /^(Anaya|Ira) /);
});

test("an explicitly supplied creator name is never rewritten", () => {
  const name = coherentGeneratedCharacterName({
    creatorName: "Dev Malhotra",
    modelName: "Anaya Rao",
    archetype: "hero",
    characterBrief: "She keeps a death ledger.",
    voiceGender: "feminine",
  });

  assert.equal(name, "Dev Malhotra");
});

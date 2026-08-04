import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSignatureSfxPrompt,
  assertThemePromptV2,
  composeCharacterMasterPrompt,
  composeCharacterSignatureSfxEvents,
  composeProductImagePrompt,
  composeProductVideoPrompt,
  composeSignatureSfxEventPrompt,
  composeThemePrompt,
  composeVoiceDesignPrompt,
  productDialogueAllowlist,
  resolveModernThemePalette,
  withThemeDurationDirection,
  type CharacterIdentityInput,
  type ShotBlueprint,
} from "@/lib/production-prompting";
import { ProductCardSchema } from "@/lib/product-card";
import { VideoType } from "@/lib/video-brief";
import { AGNI_MAYA_CARD_V2 } from "@/lib/character-card-fixtures";
import { buildSignatureSfxFilterGraph } from "@/lib/signature-sfx";
import { CHARACTERS } from "@/data/seed";
import { DEFAULT_PIPELINE_CONFIG, normalizePipelineConfig } from "@/lib/pipeline-config";

const product = ProductCardSchema.parse({
  brand_name: "Northstar",
  product_name: "Field Flask",
  reference_images: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
  identity_block: "A squat brushed-steel flask with a gently faceted shoulder, a matte black screw cap, and a cobalt enamel band. The NORTHSTAR FIELD FLASK label is printed in white capitals on the front and must remain exactly legible. The proportions, seam, and cap thread are fixed.",
  must_preserve: ["label text exactly 'NORTHSTAR FIELD FLASK'", "matte black cap", "logo never mirrored"],
  negative_prompt: "no warped text, no invented labels, no extra variants, no changed proportions",
  claims_allowed: ["Keeps water cold for approved field use."],
  handling_notes: "Hold the body below the label; twist the cap counter-clockwise and drink only from the open rim.",
});

const actor: CharacterIdentityInput = {
  name: "Mira Sen",
  archetype: "hero",
  tagline: "A careful hand under pressure",
  personality: "observant, practical, and quietly brave",
  voiceGender: "feminine",
};

const shot: ShotBlueprint = {
  sceneName: "Field test",
  dramaticBeat: "Mira reveals the flask after a long walk.",
  hook: "The product catches the first shaft of light.",
  setting: "a bright trailhead",
  subjectStart: "actor lifts the flask from a canvas bag",
  actionTimeline: ["lift", "twist the cap", "offer a sip"],
  facialBeat: "relieved smile",
  framing: "eye-level medium close-up",
  cameraAngle: "handheld eye-level",
  lens: "35mm",
  cameraMovement: "handheld drift",
  keyLight: "natural window light",
  fillAndEdge: "soft sky fill",
  environmentalMotion: "a small breeze moves the strap",
  soundTexture: "cap click",
  musicalArc: "none",
  finalFrame: "label faces camera",
  dialogue: "",
  negative: "no duplicate hands",
};

test("legacy Indian-English defaults are replaced by the actor's Russian language canon", () => {
  const prompt = composeVoiceDesignPrompt({
    ...actor,
    name: "Irina Volkov",
    personality: "A native Russian rescue pilot from Moscow; clipped under pressure and unexpectedly tender with her crew.",
    voiceDesc: "Native Indian English with warm Hindi and Urdu inflection; adult feminine, low and steady with restrained authority.",
  });
  // The global voice template labels this slot "Primary language".
  assert.match(prompt, /Primary language: Russian/i);
  assert.match(prompt, /Use English only when the script or creator explicitly requests it/i);
  assert.doesNotMatch(prompt, /Indian English|Hindi|Urdu/i);
  assert.match(prompt, /low and steady with restrained authority/i);
});

test("an explicitly Indian actor keeps the language named in their own canon", () => {
  const prompt = composeVoiceDesignPrompt({
    ...actor,
    personality: "A Lucknow journalist who speaks Indian English and naturally moves between Hindi and Urdu with family.",
    voiceDesc: "Native Indian English with natural Hindi and Urdu pronunciation; clear mid-register resonance.",
  });
  assert.match(prompt, /follow the specific Indian language/i);
  assert.match(prompt, /Native Indian English with natural Hindi and Urdu pronunciation/i);
});

test("actors without language canon get a neutral fallback instead of an Indian accent", () => {
  const prompt = composeVoiceDesignPrompt({
    ...actor,
    personality: "A watchful station mechanic who answers in short, practical sentences.",
    voiceDesc: "Smoky alto, measured pace, precise consonants.",
  });
  assert.match(prompt, /neutral international English/i);
  assert.doesNotMatch(prompt, /Indian English|Hindi|Urdu/i);
});

test("product image grammar keeps identity block, references, claims, and merged negatives", () => {
  const prompt = composeProductImagePrompt({ videoType: VideoType.UgcAd, product, actor, shot, hookText: "Look what I packed.", ctaText: "Pack yours.", personaStyle: "casual" });
  assert.ok(prompt.includes(product.identity_block));
  assert.ok(prompt.includes(product.reference_images[0]));
  assert.ok(prompt.includes(product.claims_allowed[0]));
  assert.match(prompt, /no duplicate hands/);
  assert.match(prompt, /handheld feel/i);
});

test("product hero rejects actors and explicitly forbids humans", () => {
  const prompt = composeProductImagePrompt({ videoType: VideoType.ProductHero, product, shot });
  assert.match(prompt, /no people, faces, hands, or human silhouettes/i);
  assert.match(prompt, /macro/i);
  assert.throws(() => composeProductImagePrompt({ videoType: VideoType.ProductHero, product, actor, shot }), /must never receive actor/i);
});

test("brand spot grammar requires an actor and product", () => {
  const prompt = composeProductVideoPrompt({ videoType: VideoType.BrandSpot, product, actor, shot, narrativeBeat: "reveal" });
  assert.match(prompt, /product appears only at slot four and slot eight/i);
  assert.match(prompt, /final shot is product pack shot with actor/i);
  assert.throws(() => composeProductVideoPrompt({ videoType: VideoType.BrandSpot, product, shot }), /requires an actor/i);
});

test("UGC dialogue allowlist never adds unapproved claims", () => {
  assert.deepEqual(productDialogueAllowlist(product, "Look what I packed.", "Pack yours."), [product.claims_allowed[0], "Look what I packed.", "Pack yours."]);
});

test("Agni Maya atomic SFX builder emits one concrete event per provider prompt", () => {
  const event = AGNI_MAYA_CARD_V2.signature_sfx_events?.[0];
  assert.ok(event);
  const prompt = composeSignatureSfxEventPrompt(event);
  assert.ok(prompt.includes(event.prompt));
  assert.match(prompt, /single concrete physical event/i);
  assert.doesNotMatch(prompt, /\bthen\b|\bfollowed by\b/i);
  assert.throws(
    () => assertSignatureSfxPrompt("A bangle rings, then cloth snaps."),
    /sequence rather than one atomic event/,
  );
});

test("signature SFX timeline creates independent delays and a five-second mix", () => {
  const events = AGNI_MAYA_CARD_V2.signature_sfx_events;
  assert.ok(events);
  const graph = buildSignatureSfxFilterGraph(events.map((event, index) => ({
    assetId: `asset-${index}`,
    startMs: event.start_ms,
    gainDb: event.gain_db,
  })));
  assert.match(graph, /adelay=0:all=1/);
  assert.match(graph, /adelay=1450:all=1/);
  assert.match(graph, /amix=inputs=4:duration=first/);
  assert.match(graph, /atrim=0:5/);
});

test("Agni Maya theme grammar is a produced natural-language brief", () => {
  const prompt = composeThemePrompt({
    ...actor,
    name: "Agni Maya",
    cardV2: AGNI_MAYA_CARD_V2,
    themeDesc: "92 BPM, key of D minor, 3/4, sparse single-chord piano",
  });
  assert.match(prompt, /Hindi film-score lullaby/i);
  assert.match(prompt, /solo piano/i);
  assert.match(prompt, /low cello pulse enters underneath/i);
  assert.match(prompt, /soft taiko hit marks the turn/i);
  assert.match(prompt, /unresolved sustained piano note/i);
  assert.match(prompt, /About 8 seconds, ends cleanly, no fade-out/i);
  assert.match(prompt, /Instrumental only, no vocals/i);
  assert.doesNotMatch(prompt, /\bBPM\b|\bkey of\b|\b3\s*\/\s*4\b/i);
});

test("theme duration direction replaces prior timing and the guard rejects theory slots", () => {
  const prompt = withThemeDurationDirection(
    "Produced chamber cue. About 8 seconds, ends cleanly, no fade-out. Instrumental only, no vocals.",
    15,
  );
  assert.equal(prompt.match(/About \d+ seconds/g)?.length, 1);
  assert.match(prompt, /About 15 seconds, ends cleanly, no fade-out\./);
  assert.match(prompt, /Instrumental only, no vocals\.$/);
  assert.throws(() => assertThemePromptV2("A cue in 4/4 at 90 BPM."), /forbidden/);
});

test("cyber-mechanical characters receive a current, fully produced genre palette", () => {
  const cyberGuardian: CharacterIdentityInput = {
    name: "Atlas Prime",
    archetype: "superhero",
    tagline: "A transforming machine guardian protects the last human city.",
    personality: "An ancient cybernetic defender with disciplined compassion and immense mechanical weight.",
    voiceGender: "androgynous",
    themeDesc: "heroic mechanical identity music",
    sfxDesc: "one armored chest mechanism locks into place",
  };
  assert.equal(resolveModernThemePalette(cyberGuardian).family, "cyber");
  const prompt = composeThemePrompt(cyberGuardian);
  assert.match(prompt, /future garage/i);
  assert.match(prompt, /cyber-industrial bass/i);
  assert.match(prompt, /fully arranged and mastered/i);
  assert.match(prompt, /bass movement/i);
  assert.match(prompt, /avoid sparse single-chord noodling/i);
  assert.doesNotMatch(prompt, /Transformers|Autobots/i);
  assert.equal(composeThemePrompt({ ...cyberGuardian, themeDesc: prompt }), prompt);
});

test("modern theme routing covers horror and intimate drama without collapsing to one palette", () => {
  const horrorPrompt = composeThemePrompt({
    ...actor,
    name: "The Quiet Tenant",
    archetype: "horror",
    personality: "A patient haunting that answers through damaged machinery.",
  });
  const dramaPrompt = composeThemePrompt({
    ...actor,
    name: "Meera",
    archetype: "mentor",
    personality: "A restrained family drama about grief, memory, and an unfinished promise.",
  });
  assert.match(horrorPrompt, /dark ambient/i);
  assert.match(horrorPrompt, /post-industrial tension design/i);
  assert.match(dramaPrompt, /ambient neoclassical/i);
  assert.match(dramaPrompt, /organic electronica/i);
  assert.notEqual(horrorPrompt, dramaPrompt);
});

test("space identity outranks incidental words such as loves", () => {
  const astronaut: CharacterIdentityInput = {
    ...actor,
    name: "Dmitri Volkov",
    archetype: "hero",
    personality: "A Russian astronaut and station engineer who loves what he does.",
    themeDesc: "A rising dark space score for isolation, duty, and quiet wonder.",
    sfxDesc: "One atomic physical event: station machinery hum and one wrench contact.",
  };
  assert.equal(resolveModernThemePalette(astronaut).family, "space");
  const events = composeCharacterSignatureSfxEvents(astronaut);
  assert.match(events[0].prompt, /station machinery hum/i);
  assert.doesNotMatch(events.map((event) => event.prompt).join(" "), /personal clasp|textured glass/i);
});

test("legacy characters receive a layered five-second SFX plan", () => {
  const events = composeCharacterSignatureSfxEvents({
    ...actor,
    sfxDesc: "A reinforced glove pulls tight, then a heavy shield locks.",
  });
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.start_ms), [0, 1450, 3000]);
  assert.doesNotMatch(events[0].prompt, /\bthen\b/i);
  for (const event of events) {
    const prompt = composeSignatureSfxEventPrompt(event);
    assert.match(prompt, /high-resolution sound/i);
    assert.match(prompt, /full-spectrum/i);
  }
});

test("super-admin master prompt contains the complete Magic Write canon and derived audio", () => {
  const character = CHARACTERS[0];
  const prompt = composeCharacterMasterPrompt(character);
  assert.match(prompt, /## Core character/);
  assert.ok(prompt.includes(character.personality));
  assert.ok(prompt.includes(character.voiceDesc));
  assert.ok(prompt.includes(character.sfxDesc));
  assert.ok(prompt.includes(character.themeDesc));
  assert.match(prompt, /## Exact saved Magic Write production bible/);
  assert.match(prompt, /## Derived production audio/);
  assert.match(prompt, /### Modern theme prompt/);
  assert.match(prompt, /### Layered signature SFX plan/);
});

test("pipeline defaults keep Music v2 while music_v1 stays a valid choice", () => {
  assert.equal(DEFAULT_PIPELINE_CONFIG.stages.theme.model, "music_v2");
  assert.equal(DEFAULT_PIPELINE_CONFIG.stages.sfx.settings.promptInfluence, 0.55);
  const upgraded = normalizePipelineConfig({
    stages: {
      theme: { model: "music_v1" },
      sfx: { settings: { promptInfluence: 0.35 } },
    },
  });
  /*
    music_v1 used to be rewritten to music_v2 here. It is not an obsolete
    setting: composition plans are a music_v1 feature, so coercing it made a
    valid configuration impossible to express and every plan request failed.
  */
  assert.equal(upgraded.stages.theme.model, "music_v1");
  assert.equal(upgraded.stages.sfx.settings.promptInfluence, 0.55);
});

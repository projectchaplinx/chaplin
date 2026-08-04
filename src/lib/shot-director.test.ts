import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShotImagePrompt,
  buildShotVideoPrompt,
  validateShotSequence,
  type ShotSceneInput,
} from "@/lib/shot-director";

const scenes: ShotSceneInput[] = [
  {
    setting: "INT. COLLAPSED RELAY STATION - DAY",
    objective: "Sprocket reaches the trapped saboteur.",
    action: "Sprocket braces one broken beam with both hands as the saboteur crawls free.",
  },
  {
    setting: "INT. RELAY CONTROL ROOM - CONTINUOUS",
    objective: "The saboteur reveals the transmitter is still armed.",
    action: "The saboteur points to a pulsing transmitter while Sprocket turns toward it.",
  },
  {
    setting: "INT. RELAY CORE - CONTINUOUS",
    objective: "Sprocket chooses mercy over the mission.",
    action: "Sprocket removes the power cell with his right hand and places it beside the saboteur.",
  },
  {
    setting: "EXT. RELAY STATION - DUSK",
    objective: "The choice changes who leaves together.",
    action: "Sprocket and the saboteur cross screen left as the dead relay darkens behind them.",
  },
];

const basePromptInput = {
  productionTitle: "Signal Fracture",
  productionLogline: "A mission turns into a choice between victory and mercy.",
  scene: scenes[1],
  sceneIndex: 1,
  sceneCount: 4,
  format: "punch",
  actorName: "Sprocket",
  actorIdentity: "A cyber-mechanical guardian with a stable blue armored silhouette.",
};

test("four-shot sequence validation requires four complete, distinct authored scenes", () => {
  assert.deepEqual(validateShotSequence(scenes, 4), { valid: true });
  assert.match(validateShotSequence(scenes.slice(0, 3), 4).error ?? "", /exactly 4 authored scenes/i);
  assert.match(validateShotSequence([...scenes.slice(0, 3), scenes[0]], 4).error ?? "", /repeats another scene/i);
  assert.match(
    validateShotSequence([...scenes.slice(0, 3), { setting: "EXT. ROAD", objective: "", action: "" }], 4).error ?? "",
    /needs both a visible objective and a four-second action/i,
  );
});

test("narrative first-frame prompt depicts one authored scene without ad or contact-sheet grammar", () => {
  const prompt = buildShotImagePrompt(basePromptInput);
  assert.match(prompt, /INT\. RELAY CONTROL ROOM - CONTINUOUS/);
  assert.match(prompt, /saboteur points to a pulsing transmitter/i);
  assert.match(prompt, /Represent only this scene's authored setting/i);
  assert.match(prompt, /No split screen, tiled variants, storyboard, contact sheet/i);
  assert.doesNotMatch(prompt, /OFFERING LOCK|business|storefront hero|advertised product/i);
});

test("first-frame prompt preserves a creator-selected manga identity", () => {
  const prompt = buildShotImagePrompt({
    ...basePromptInput,
    visualMedium: "cinematic seinen manga illustration",
  });
  assert.match(prompt, /VISUAL MEDIUM LOCK: cinematic seinen manga illustration/i);
  assert.match(prompt, /Never translate a manga.*into a photoreal live-action human/i);
  assert.match(prompt, /do not realism-wash or restyle the actor/i);
  assert.doesNotMatch(prompt, /REALISM: Photoreal live-action captured/i);
});

test("video prompt animates the exact first frame for the scene's authoritative duration", () => {
  const prompt = buildShotVideoPrompt(basePromptInput);
  assert.match(prompt, /supplied image is the exact first frame/i);
  assert.match(prompt, /one continuous 4000ms silent source clip/i);
  assert.match(prompt, /Exactly one named moving subject: Sprocket/i);
  assert.match(prompt, /--duration 4\.000/);
  assert.match(prompt, /CLOSED PROP SET/i);
  assert.doesNotMatch(prompt, /OFFERING ANCHOR/i);
});

test("image and video prompts cannot repeat a numbered-finger identity gesture", () => {
  const unsafeInput = {
    ...basePromptInput,
    scene: {
      ...basePromptInput.scene,
      action: "Dimitri secures the wrench; he pauses, two fingers tapping his temple, then checks the readout.",
      behaviorTell: { characterId: "dimitri", tell: "Taps two fingers against his temple before every checklist." },
    },
    actorName: "Dimitri Volkov",
    actorIdentity: "Scar, beard, blue flight suit; two fingers tapping his temple before every checklist.",
  };

  for (const prompt of [buildShotImagePrompt(unsafeInput), buildShotVideoPrompt(unsafeInput)]) {
    assert.doesNotMatch(prompt, /two fingers tapping|Taps two fingers/i);
    assert.match(prompt, /No isolated numbered-finger pose/i);
    assert.match(prompt, /no .*raised middle finger/i);
  }
});

test("four takes of one standoff are rejected even when the wording differs", () => {
  // The real failure: one location, one beat, reworded just enough to differ
  // byte for byte, so exact-signature matching passed all four.
  const alley = "INT/EXT. NIGHT MARKET ALLEY - DEAD END - NIGHT";
  const result = validateShotSequence([
    { setting: alley, objective: "Corner the accused man", action: "VANTA-9 advances low through sheeting rain and raises the gunmetal arm at the accused man" },
    { setting: alley, objective: "Corner the accused man again", action: "VANTA-9 advances slowly through the rain and lifts the gunmetal arm toward the accused man" },
    { setting: alley, objective: "Hold the accused man at gunpoint", action: "VANTA-9 steps through rain and holds the gunmetal arm on the accused man" },
    { setting: alley, objective: "Keep the accused man cornered", action: "VANTA-9 moves through the rain and keeps the gunmetal arm raised at the accused man" },
  ], 4);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /plays the same beat as scene 1/);
});

test("one location is allowed when the beat actually moves", () => {
  const alley = "INT/EXT. NIGHT MARKET ALLEY - DEAD END - NIGHT";
  const result = validateShotSequence([
    { setting: alley, objective: "Corner the debtor", action: "VANTA-9 advances through sheeting rain and blocks the only exit" },
    { setting: alley, objective: "Read the ledger tattoo", action: "A soaked stray dog knocks a crate; the debtor's sleeve rides up and exposes an inked mark" },
    { setting: alley, objective: "Recognise his own maker's sigil", action: "He lowers the gunmetal arm fully, chest stencil catching the neon as recognition lands" },
    { setting: alley, objective: "Let the debt go unpaid", action: "He unclasps the chain, drops it in a puddle, and walks out of frame leaving the man standing" },
  ], 4);
  assert.equal(result.valid, true);
});

test("a shot is directed to perform, not to stand and wait", () => {
  const prompt = buildShotVideoPrompt({
    productionTitle: "Curfew Tax",
    productionLogline: "One choice changes the debt.",
    scene: {
      setting: "INT/EXT. NIGHT MARKET ALLEY - DEAD END - NIGHT",
      objective: "Corner the debtor",
      action: "VANTA-9 advances through sheeting rain and blocks the only exit",
      lines: [],
    },
    sceneIndex: 0,
    sceneCount: 4,
    format: "punch",
    actorName: "VANTA-9",
    actorIdentity: "VANTA-9: a gunmetal enforcement android.",
  } as Parameters<typeof buildShotVideoPrompt>[0]);

  assert.match(prompt, /CONTROLLED MOTION:/);
  assert.match(prompt, /Every other person and all dressing remain explicitly still/i);
  assert.match(prompt, /PHYSICS:/);
  // Held signage is a common invented artefact.
  assert.match(prompt, /No held poster, sign, placard/i);
  assert.match(prompt, /No robotic or mechanical motion/i);
});

test("reverse motion is prohibited even when the caller supplies its own continuity note", () => {
  // The rule used to live only in the default continuity note, and every real
  // caller passes its own - so shots came back with bikes and people moving
  // backwards.
  const prompt = buildShotVideoPrompt({
    productionTitle: "Burn Slow",
    scene: { setting: "EXT. HIGHWAY - DUSK", objective: "Outrun the convoy", action: "She twists the throttle and pulls away" },
    sceneIndex: 1,
    sceneCount: 4,
    actorName: "Agni Maya",
    continuityNote: "Preserve the approved frame's actor, wardrobe, location, light, and object positions.",
  } as Parameters<typeof buildShotVideoPrompt>[0]);

  assert.match(prompt, /No reversed, rewound, or time-inverted motion/i);
  assert.match(prompt, /wheels roll in the direction of travel/i);
  assert.match(prompt, /forward-time momentum/i);
  // The caller's own note is still honoured.
  assert.match(prompt, /Preserve the approved frame's actor/);
});

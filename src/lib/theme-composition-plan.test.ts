import test from "node:test";
import assert from "node:assert/strict";
import {
  buildElevenMusicRequest,
  buildThemePlan,
  themeCompositionPlanSchemaFor,
} from "@/lib/theme-composition-plan";
import type { CharacterIdentityInput } from "@/lib/production-prompting";

const ruAnsari: CharacterIdentityInput = {
  name: 'Rukhsar "Ru" Ansari',
  archetype: "rebel",
  tagline: "She keeps the city moving while it tries to erase her.",
  personality: "Defiant, watchful, tender under pressure.",
  voiceGender: "feminine",
  themeDesc: "future garage, muted trumpet, bitcrushed sitar pizzicato, sub-bass, 90 BPM, A minor",
  sfxDesc: "a brass measuring scale clicks shut",
};

const vantaNine: CharacterIdentityInput = {
  name: "VANTA-9",
  archetype: "horror",
  tagline: "The station answers in borrowed voices.",
  personality: "Cold, eerie, restrained, and increasingly urgent.",
  voiceGender: "androgynous",
  themeDesc: "dark ambient, bowed metal, prepared piano, distorted sub pulse",
  sfxDesc: "a corroded relay closes in a dead corridor",
};

test("Ru Ansari ident is an exact instrumental 8s two-section music_v1 plan", () => {
  const plan = buildThemePlan(ruAnsari, "ident_8s");
  assert.deepEqual(
    plan.sections.map(({ section_name, duration_ms }) => ({ section_name, duration_ms })),
    [
      { section_name: "hook", duration_ms: 5000 },
      { section_name: "ident hit", duration_ms: 3000 },
    ],
  );
  // The identity palette is declared once, globally - not repeated per section.
  assert.match(plan.positive_global_styles.join(" "), /future garage/i);
  assert.match(plan.positive_global_styles.join(" "), /90 BPM/i);
  assert.match(plan.negative_global_styles.join(" "), /vocals/i);
  assert.ok(plan.sections.every((section) => section.lines.length === 0));
  assert.ok(!("chunks" in plan));
  assert.doesNotMatch(JSON.stringify(plan), /Rukhsar|Ansari/i);
});

test("VANTA-9 scene cue is three exact shot-beat sections without lyrics or narrative prose", () => {
  const plan = buildThemePlan(vantaNine, "scene_15s", "A cold eerie reveal turns urgent at the final frame.");
  assert.deepEqual(plan.sections.map((section) => section.duration_ms), [5000, 5000, 5000]);
  assert.deepEqual(plan.sections.map((section) => section.section_name), ["establish", "turn", "payoff"]);
  assert.ok(plan.sections.flatMap((section) => section.positive_local_styles).some((style) => /eerie/i.test(style)));
  assert.doesNotMatch(JSON.stringify(plan), /station|borrowed voices|VANTA/i);
});

test("plan validation rejects timing drift and directive sentences", () => {
  const plan = buildThemePlan(ruAnsari, "ident_8s");
  assert.throws(
    () => themeCompositionPlanSchemaFor("ident_8s").parse({
      ...plan,
      sections: plan.sections.map((section, index) => ({
        ...section,
        duration_ms: index === 0 ? 6000 : section.duration_ms,
      })),
    }),
    /total exactly 8000ms/,
  );
  assert.throws(
    () => themeCompositionPlanSchemaFor("ident_8s").parse({
      ...plan,
      sections: plan.sections.map((section, index) => index === 0
        ? { ...section, positive_local_styles: ["the music ends with a dramatic final chord"] }
        : section),
    }),
    /directive verb|at most 8 words/,
  );
});

test("ElevenLabs plan and legacy payloads remain mutually exclusive", () => {
  const plan = buildThemePlan(ruAnsari, "ident_8s");
  const structured = buildElevenMusicRequest({
    mode: "composition-plan",
    modelId: "music_v1",
    plan,
    durationMilliseconds: 8000,
    forceInstrumental: true,
    signWithC2pa: false,
  });
  assert.ok("composition_plan" in structured);
  assert.ok(!("prompt" in structured));
  assert.ok(!("music_length_ms" in structured));
  assert.ok(!("force_instrumental" in structured));
  assert.ok(!("respect_sections_durations" in structured));
  assert.ok("sections" in structured.composition_plan);
  assert.ok(!("chunks" in structured.composition_plan));
  assert.throws(
    () => buildElevenMusicRequest({
      mode: "composition-plan",
      modelId: "music_v2",
      plan,
      durationMilliseconds: 8000,
      forceInstrumental: true,
      signWithC2pa: false,
    }),
    /require the music_v1 model/,
  );

  const legacy = buildElevenMusicRequest({
    mode: "legacy-prompt",
    modelId: "music_v2",
    prompt: "Restrained instrumental future garage cue.",
    durationMilliseconds: 8000,
    forceInstrumental: true,
    signWithC2pa: false,
  });
  assert.ok("prompt" in legacy);
  assert.ok("music_length_ms" in legacy);
  assert.ok("force_instrumental" in legacy);
  assert.ok(!("composition_plan" in legacy));
});

test("a prose theme description is not shredded into style tags", () => {
  // Magic Write writes themeDesc as prose. Splitting it on commas produced
  // fragments like "bold brass fanfare over" and imposed an orchestral fanfare
  // on a character whose palette is nothing of the kind.
  const plan = buildThemePlan({
    name: "Sprocket",
    archetype: "hero",
    tagline: "Salvage android with a borrowed conscience.",
    personality: "An alien salvage android, watchful and mechanical.",
    voiceGender: "androgynous",
    themeDesc: "12-second orchestral-synth hybrid theme with bold brass fanfare over a rising four-note motif answered by bright metallic chime, resolving to a steady percussive heartbeat pulse",
    sfxDesc: "a servo lock engages",
  } as CharacterIdentityInput, "ident_8s");

  const styles = plan.positive_global_styles.join(" | ");
  assert.doesNotMatch(styles, /fanfare over|answered bright|resolving steady/i);
  // The palette decides instead.
  assert.match(styles, /future garage|cyber-industrial/i);
});

test("a description already written as a tag list is still used", () => {
  const plan = buildThemePlan({
    name: "Ru",
    archetype: "rebel",
    tagline: "Keeps the city moving.",
    personality: "Defiant and watchful.",
    voiceGender: "feminine",
    themeDesc: "future garage, muted trumpet, sub-bass",
    sfxDesc: "a scale clicks shut",
  } as CharacterIdentityInput, "ident_8s");
  assert.match(plan.positive_global_styles.join(" "), /muted trumpet/i);
});

test("every section names what actually plays in it", () => {
  // Sections used to carry shape words alone - "core motif reduction", "hard
  // clean final hit" - which describe a gesture with no instrument, so the
  // model returned a few bare chimes instead of a theme.
  const plan = buildThemePlan(ruAnsari, "ident_8s");
  for (const section of plan.sections) {
    const styles = section.positive_local_styles.join(" ").toLowerCase();
    assert.match(styles, /full arrangement/);
    assert.ok(
      section.positive_local_styles.length >= 4,
      `${section.section_name} carries too little to play`,
    );
  }
  const negatives = plan.negative_global_styles.join(" ").toLowerCase();
  assert.match(negatives, /sparse arrangement/);
  assert.match(negatives, /isolated single hits/);
});

test("a Russian astronaut keeps the authored space score and integrated sound identity", () => {
  const dmitri: CharacterIdentityInput = {
    name: "Dmitri Volkov",
    archetype: "hero",
    tagline: "Six hundred days in orbit.",
    personality: "A Russian astronaut and station engineer who loves his work.",
    voiceGender: "masculine",
    themeDesc: `Create a cinematic character theme for Dmitri Volkov. Genre: ambient neoclassical blended with organic electronica. Mood: guarded stillness with buried warmth.\nCore palette: felt piano, processed cello, granular tape texture, and low electronic pulse.`,
    sfxDesc: "Premium cinematic Foley one-shot for Dmitri Volkov. One atomic physical event: Low mechanical hum of station systems underlaid with the soft clink of a wrench against metal, and the faint hiss of recycled air through vents.",
  };
  const plan = buildThemePlan(dmitri, "ident_8s");
  const styles = plan.positive_global_styles.join(" | ");
  assert.match(styles, /dark space score/i);
  assert.match(styles, /ambient neoclassical/i);
  assert.match(styles, /processed cello/i);
  assert.match(styles, /low electronic pulse/i);
  assert.match(styles, /integrated cinematic sound design/i);
  assert.match(styles, /mechanical hum/i);
  assert.doesNotMatch(styles, /future-soul|processed sarangi|romance/i);
  assert.doesNotMatch(styles, /trailer/i);

  const scenePlan = buildThemePlan(
    dmitri,
    "scene_5s",
    "Dmitri turns a wrench against the station panel as a restrained warning alarm begins.",
  );
  assert.deepEqual(scenePlan.sections.map((section) => section.duration_ms), [5000]);
  const sceneStyles = scenePlan.sections[0].positive_local_styles.join(" | ");
  assert.match(sceneStyles, /timed metal tool foley/i);
  assert.match(sceneStyles, /restrained warning signal/i);
});

import { z } from "zod";
import { readCharacterCardV2 } from "@/lib/character-card";
import {
  resolveModernThemePalette,
  type CharacterIdentityInput,
} from "@/lib/production-prompting";

export const THEME_PLAN_KINDS = ["ident_8s", "scene_5s", "scene_15s"] as const;
export type ThemePlanKind = (typeof THEME_PLAN_KINDS)[number];

const STYLE_WORD_LIMIT = 8;
const STYLE_DIRECTIVE_VERBS = new Set([
  "begin", "begins", "build", "builds", "cut", "cuts", "drop", "drops",
  "end", "ending", "ends", "enter", "enters", "establish", "establishes",
  "fade", "fades", "finish", "finishes", "introduce", "introduces", "land",
  "lands", "move", "moves", "open", "opens", "resolve", "resolves", "rise",
  "rises", "start", "starts", "stop", "stops", "strip", "strips",
]);
const STYLE_FILLER = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of",
  "on", "one", "only", "the", "then", "to", "with",
]);
const SCENE_MOOD_WORDS = new Set([
  "alert", "anxious", "brooding", "calm", "cold", "confident", "controlled",
  "dark", "delicate", "defiant", "eerie", "energetic", "fragile", "gritty",
  "hopeful", "intimate", "melancholic", "mysterious", "ominous", "playful",
  "propulsive", "restrained", "romantic", "tense", "tender", "urgent", "warm",
  "watchful",
]);

const ThemeStyleSchema = z.string().trim().min(2).max(120).superRefine((style, context) => {
  const words = style.split(/\s+/).filter(Boolean);
  if (words.length > STYLE_WORD_LIMIT) {
    context.addIssue({ code: "custom", message: `Style tags may contain at most ${STYLE_WORD_LIMIT} words.` });
  }
  const verb = words.find((word) => STYLE_DIRECTIVE_VERBS.has(word.toLowerCase().replace(/[^a-z]/g, "")));
  if (verb) {
    context.addIssue({ code: "custom", message: `Style tags cannot contain the directive verb "${verb}".` });
  }
  if (/[.!?]/.test(style)) {
    context.addIssue({ code: "custom", message: "Style tags cannot be sentences." });
  }
});

/*
  ElevenLabs' documented `composition_plan` contract: global styles at the top
  level and a `sections` array, each section carrying its own local styles and
  lyric lines.

  This was modelled as `chunks` with `positive_styles` and `context_adherence`,
  on the assumption recorded below that "Music v2 has no global-style fields".
  The provider rejected every request with `Invalid type of composition_plan
  used for model music_v2`: composition plans are a music_v1 feature, and they
  do carry global styles. Theme generation failed at 8% on every attempt.
*/
export const ThemeCompositionSectionSchema = z.object({
  section_name: z.string().trim().min(1).max(100),
  duration_ms: z.number().int().min(3000).max(120000),
  positive_local_styles: z.array(ThemeStyleSchema).min(1).max(50),
  negative_local_styles: z.array(ThemeStyleSchema).max(50).default([]),
  // Instrumental idents carry no lyrics, but the field is required.
  lines: z.array(z.string().max(200)).max(30).default([]),
});

export const ThemeCompositionPlanSchema = z.object({
  positive_global_styles: z.array(ThemeStyleSchema).min(1).max(50),
  negative_global_styles: z.array(ThemeStyleSchema).max(50).default([]),
  sections: z.array(ThemeCompositionSectionSchema).min(1).max(30),
});

export type ThemeCompositionPlan = z.infer<typeof ThemeCompositionPlanSchema>;

export function themePlanTargetMilliseconds(kind: ThemePlanKind) {
  return kind === "scene_15s" ? 15000 : kind === "scene_5s" ? 5000 : 8000;
}

export function themeCompositionPlanSchemaFor(kind: ThemePlanKind) {
  const target = themePlanTargetMilliseconds(kind);
  return ThemeCompositionPlanSchema.superRefine((plan, context) => {
    const total = plan.sections.reduce((sum, section) => sum + section.duration_ms, 0);
    if (total !== target) {
      context.addIssue({
        code: "custom",
        path: ["sections"],
        message: `Section durations must total exactly ${target}ms; received ${total}ms.`,
      });
    }
  });
}

function normalizedStyle(value: string) {
  const theoryTag = value.trim().match(/^([A-G](?:#|b)?\s+(?:major|minor)|\d{2,3}\s*BPM)$/i);
  if (theoryTag) return theoryTag[1];
  const words = value
    .replace(/[.!?;:()[\]{}]/g, " ")
    .replace(/[/_]+/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !STYLE_FILLER.has(word.toLowerCase()))
    .filter((word) => !STYLE_DIRECTIVE_VERBS.has(word.toLowerCase().replace(/[^a-z]/g, "")))
    .slice(0, STYLE_WORD_LIMIT);
  return words.join(" ");
}

function uniqueStyles(values: Array<string | undefined>, forbiddenName?: string) {
  const forbiddenTokens = new Set(
    forbiddenName?.toLowerCase().split(/\s+/).filter((token) => token.length > 2) ?? [],
  );
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value) continue;
    for (const fragment of value.split(/,|;|\band\b|\bbut\b/gi)) {
      const style = normalizedStyle(fragment);
      if (!style) continue;
      const words = style.toLowerCase().split(/\s+/);
      if (words.some((word) => forbiddenTokens.has(word))) continue;
      const key = style.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(style);
    }
  }
  return result;
}

function theoryTags(value: string) {
  const tags: string[] = [];
  const bpm = value.match(/\b([5-9]\d|1\d{2}|2[0-4]\d)\s*BPM\b/i);
  if (bpm) tags.push(`${bpm[1]} BPM`);
  const key = value.match(/\b(?:key\s+of\s+)?([A-G](?:#|b)?\s+(?:major|minor))\b/i);
  if (key) tags.push(key[1]);
  return tags;
}

function sceneMoodTags(sceneBrief: string | undefined) {
  if (!sceneBrief) return [];
  return [...new Set(
    sceneBrief
      .toLowerCase()
      .replace(/[^a-z\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => SCENE_MOOD_WORDS.has(word)),
  )];
}

function assertPlanDevelopmentRules(plan: ThemeCompositionPlan, characterName: string) {
  const styleLists = [
    plan.positive_global_styles,
    plan.negative_global_styles,
    ...plan.sections.flatMap((section) => [
      section.positive_local_styles,
      section.negative_local_styles,
    ]),
  ];
  for (const styles of styleLists) {
    if (new Set(styles.map((style) => style.toLowerCase())).size !== styles.length) {
      throw new Error("Theme composition plan contains a duplicated style tag.");
    }
  }
  const styles = styleLists.flat();
  const storyTokens = characterName.toLowerCase().split(/\s+/).filter((token) => token.length > 2);
  const leaked = styles.find((style) =>
    storyTokens.some((token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(style))
  );
  if (leaked) throw new Error("Theme composition styles contain a character-name story token.");
}


/*
  A style tag is a descriptor, not a sentence.

  themeDesc is free text, and Magic Write writes it as prose. Splitting prose on
  commas produced fragments that read as broken English and were sent to the
  music model as styles - "bold brass fanfare over", "rising four-note motif
  answered bright metallic chime" - which also imposed an orchestral fanfare on
  a character whose palette is nothing of the kind. A description is only mined
  for tags when it is already written as a list; otherwise the palette and the
  character card decide the styles.
*/
function looksLikeTagList(value: string | undefined) {
  const text = value?.trim() ?? "";
  if (!text) return false;
  if (!text.includes(",")) return false;
  // Prose gives itself away with connective and verb-shaped words.
  if (/\b(?:with|over|under|then|while|answered|resolving|followed|before|after|that|which|as)\b/i.test(text)) return false;
  return text.split(",").every((part) => part.trim().split(/\s+/).length <= 5);
}

function composedBriefField(value: string | undefined, label: string) {
  if (!value) return "";
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.match(new RegExp(
    `${escaped}:\\s*([\\s\\S]*?)(?=\\s+(?:Genre|Mood|Character|Energy Arc|Production Style|Musical Characteristics|Core palette|Character-specific acoustic color|Avoid|Overall Feel):|$)`,
    "i",
  ))?.[1]?.trim() ?? "";
}

function authoredThemeStyles(value: string | undefined) {
  if (!value) return [];
  if (looksLikeTagList(value) && value.length <= 240) return [value];
  return [
    composedBriefField(value, "Genre"),
    composedBriefField(value, "Mood"),
    composedBriefField(value, "Core palette"),
  ].filter(Boolean);
}

function integratedSoundStyles(value: string | undefined) {
  if (!value) return [];
  const event = value.match(/one atomic physical event:\s*([^.]+)/i)?.[1]
    ?? value.split(/[.\n]/)[0]
    ?? "";
  return uniqueStyles([
    "integrated cinematic sound design",
    ...event.split(/,|;|\bunderlaid with\b|\band the\b|\bwith the\b/i),
  ]).slice(0, 5);
}

function sceneSoundStyles(value: string | undefined) {
  const text = value?.toLowerCase() ?? "";
  const tags = [
    /\b(?:machine|machinery|mechanical|servo|motor|engine)\b/.test(text) ? "scene machinery texture" : "",
    /\b(?:vent|airlock|hiss|pressure|steam)\b/.test(text) ? "pressurized air detail" : "",
    /\b(?:tool|wrench|metal|panel|bolt)\b/.test(text) ? "timed metal tool foley" : "",
    /\b(?:alarm|siren|warning|beep)\b/.test(text) ? "restrained warning signal" : "",
    /\b(?:footstep|walk|run|boot|heel)\b/.test(text) ? "synchronized footstep foley" : "",
    /\b(?:wind|rain|storm|snow)\b/.test(text) ? "location weather atmosphere" : "",
    /\b(?:crowd|traffic|street|market)\b/.test(text) ? "location crowd atmosphere" : "",
    /\b(?:door|glass|cloth|fabric|paper)\b/.test(text) ? "tactile action foley" : "",
  ].filter(Boolean);
  return uniqueStyles(tags).slice(0, 4);
}

export function buildThemePlan(
  character: CharacterIdentityInput,
  kind: ThemePlanKind,
  sceneBrief?: string,
): ThemeCompositionPlan {
  const card = readCharacterCardV2(character.cardV2);
  const profile = card?.theme_profile;
  const palette = resolveModernThemePalette(character);
  const creatorStyles = authoredThemeStyles(character.themeDesc);
  const soundStyles = uniqueStyles([
    ...integratedSoundStyles(character.sfxDesc),
    ...sceneSoundStyles(sceneBrief),
  ]).slice(0, 7);
  const source = [
    profile?.style_anchor,
    profile?.mood,
    ...(profile?.instruments ?? []),
    character.themeDesc,
  ].filter(Boolean).join(" ");
  const positiveGlobal = uniqueStyles([
    profile?.style_anchor,
    palette.genres,
    ...creatorStyles,
    ...soundStyles,
    ...(profile?.instruments ?? palette.instruments.slice(0, 3)),
    profile?.mood,
    ...theoryTags(source),
  ], character.name)
    .filter((style) => !/\btrailer\b/i.test(style))
    // Keep the authored score palette and the concrete scene/character sound
    // texture. Ten tags allowed a rich theme brief to crowd out the station
    // hum and action Foley that make this a soundtrack rather than bare music.
    .slice(0, 16);
  const negativeGlobal = uniqueStyles([
    ...(profile?.avoid ?? []),
    "vocals",
    "corporate",
    "trailer orchestral",
    "single-chord vamp",
    "repetitive loop",
    "fade-out",
    /*
      The legacy prompt carried these and the plan did not, so a plan could
      return a few isolated chimes and satisfy every other rule. A theme is an
      arrangement, not a handful of hits.
    */
    "sparse arrangement",
    "isolated single hits",
    "empty intro",
    "thin percussion",
    "solo demo take",
  ], character.name);
  const moods = sceneMoodTags(sceneBrief);
  const chunk = (
    sectionName: string,
    durationMilliseconds: number,
    positiveLocalStyles: string[],
    negativeLocalStyles: string[],
  ) => ({
    section_name: sectionName,
    duration_ms: durationMilliseconds,
    /*
      Every section names what actually plays in it. Local styles used to be
      shape words alone - "core motif reduction", "hard clean final hit" - which
      describe a gesture without an instrument, so the model returned a few bare
      chimes. The identity palette stays global; these are the voices carrying
      this section, plus a standing instruction that it be a full arrangement.
    */
    positive_local_styles: uniqueStyles([
      ...positiveLocalStyles,
      ...palette.instruments.slice(0, 3),
      ...soundStyles,
      "full arrangement",
      "sustained low end",
    ]).slice(0, 50),
    negative_local_styles: uniqueStyles(negativeLocalStyles).slice(0, 50),
    lines: [],
  });
  const chunks = kind === "ident_8s"
    ? [
        chunk("hook", 5000, ["dry close identity motif", "rhythmic development"], ["sparse demo"]),
        chunk("ident hit", 3000, ["core motif reduction", "hard clean final hit"], ["fade-out"]),
      ]
    : kind === "scene_5s"
      ? [
          chunk(
            "complete scene arc",
            5000,
            uniqueStyles([...moods, "immediate identity motif", "rising harmonic pressure", "clean payoff"]).slice(0, 5),
            ["static harmony", "empty intro", "fade-out"],
          ),
        ]
    : [
        chunk(
          "establish",
          5000,
          uniqueStyles([...moods, "restrained motif", "clear pulse"]).slice(0, 4),
          ["wall-to-wall density"],
        ),
        chunk(
          "turn",
          5000,
          uniqueStyles([...moods, "harmonic pressure", "rhythmic lift"]).slice(0, 4),
          ["static harmony"],
        ),
        chunk(
          "payoff",
          5000,
          uniqueStyles([...moods, "core motif payoff", "hard clean final hit"]).slice(0, 4),
          ["fade-out"],
        ),
      ];
  const plan = themeCompositionPlanSchemaFor(kind).parse({
    positive_global_styles: positiveGlobal,
    negative_global_styles: negativeGlobal,
    sections: chunks,
  });
  if (process.env.NODE_ENV !== "production") assertPlanDevelopmentRules(plan, character.name);
  return plan;
}

export function buildElevenMusicRequest(input: {
  mode: "composition-plan" | "legacy-prompt";
  modelId: string;
  plan?: ThemeCompositionPlan;
  prompt?: string;
  durationMilliseconds: number;
  forceInstrumental: boolean;
  signWithC2pa: boolean;
}) {
  if (input.mode === "composition-plan") {
    if (!input.plan) throw new Error("Composition-plan mode requires a validated plan.");
    /*
      ElevenLabs accepts `composition_plan` on music_v1 only; sending it with
      music_v2 returns 422 `Invalid type of composition_plan used for model
      music_v2`. This guard required music_v2, so it guaranteed the failure it
      was meant to prevent.
    */
    if (input.modelId !== "music_v1") {
      throw new Error("Composition plans require the music_v1 model.");
    }
    return {
      composition_plan: input.plan,
      model_id: input.modelId,
      sign_with_c2pa: input.signWithC2pa,
    };
  }
  if (!input.prompt) throw new Error("Legacy prompt mode requires a prompt.");
  return {
    prompt: input.prompt,
    music_length_ms: input.durationMilliseconds,
    model_id: input.modelId,
    force_instrumental: input.forceInstrumental,
    sign_with_c2pa: input.signWithC2pa,
  };
}

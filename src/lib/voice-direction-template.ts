/**
 * One global voice direction template, filled per character.
 *
 * Every actor was previously described to the voice model in whatever shape its
 * own free-text direction happened to take, so two characters built the same
 * week could disagree about whether pace, breath, or recording style were worth
 * mentioning at all. The template is the contract: the same twelve slots are
 * always present and always in the same order, so a change to how Chaplin
 * directs voice is one edit here rather than a sweep across every character.
 *
 * This module owns the template and the delivery defaults. Slot resolution
 * lives with the production canon in `production-prompting`, so the two never
 * import each other in a cycle and the template stays editable on its own.
 */
export const VOICE_DIRECTION_TEMPLATE = `Primary language: {LANGUAGE}. Follow the script if it specifies another language. Do not introduce any regional accent or code-switching unless explicitly written.

Voice: {AGE} {GENDER} voice. {PITCH} with a {TONE} quality. Natural, expressive, and believable.

Persona: {CHARACTER_SUMMARY}. Their speech reflects their personality, values, experiences, and emotional state without becoming exaggerated or theatrical.

Delivery: Speak in a {PACE} cadence with {ARTICULATION} articulation and {BREATH_STYLE} breath control. Use {DICTION} diction appropriate to the character and maintain a natural conversational rhythm.

Emotional style: {EMOTIONAL_STYLE}. Express emotions with authenticity and nuance. Intensity should come from performance rather than excessive volume or dramatic inflection.

Under pressure: {PRESSURE_BEHAVIOUR}. The character should remain emotionally consistent with their personality even during moments of conflict or high tension.

Recording style: Clean studio close-mic recording with natural dynamics. No reverb, echo, distortion, robotic processing, telephone effect, tape saturation, whisper effect, or synthetic vocal FX. Produce a realistic human performance suitable for film, games, and conversational dialogue.`;

export type VoiceDirectionSlot =
  | "LANGUAGE"
  | "AGE"
  | "GENDER"
  | "PITCH"
  | "TONE"
  | "CHARACTER_SUMMARY"
  | "PACE"
  | "ARTICULATION"
  | "BREATH_STYLE"
  | "DICTION"
  | "EMOTIONAL_STYLE"
  | "PRESSURE_BEHAVIOUR";

export type VoiceDirectionSlots = Record<VoiceDirectionSlot, string>;

export type VoiceDeliveryDefaults = Pick<
  VoiceDirectionSlots,
  "PITCH" | "TONE" | "PACE" | "ARTICULATION" | "BREATH_STYLE" | "DICTION" | "EMOTIONAL_STYLE"
>;

/*
  Archetype is the only signal every actor is guaranteed to carry, so it decides
  the delivery defaults. An authored voice direction still wins the slots it
  actually speaks to - these are the floor, not an override.
*/
export const ARCHETYPE_VOICE_DELIVERY: Record<string, VoiceDeliveryDefaults> = {
  villain: {
    PITCH: "Low and level", TONE: "controlled, unhurried",
    PACE: "deliberate", ARTICULATION: "precise", BREATH_STYLE: "deep, economical",
    DICTION: "exact, formal", EMOTIONAL_STYLE: "Restrained menace that never rises to a shout",
  },
  hero: {
    PITCH: "Mid-register and open", TONE: "warm, direct",
    PACE: "measured", ARTICULATION: "clear", BREATH_STYLE: "steady, supported",
    DICTION: "plain, unaffected", EMOTIONAL_STYLE: "Earnest conviction held just under the surface",
  },
  superhero: {
    PITCH: "Mid-register with resonant lows", TONE: "assured, grounded",
    PACE: "measured", ARTICULATION: "clean", BREATH_STYLE: "deep, supported",
    DICTION: "plain, declarative", EMOTIONAL_STYLE: "Steady resolve that opens up on the decisive line",
  },
  mentor: {
    PITCH: "Low-mid and settled", TONE: "weathered, patient",
    PACE: "unhurried", ARTICULATION: "considered", BREATH_STYLE: "slow, audible between thoughts",
    DICTION: "plainspoken, occasionally wry", EMOTIONAL_STYLE: "Quiet authority carrying old disappointment",
  },
  rebel: {
    PITCH: "Mid-register with a rough edge", TONE: "restless, wry",
    PACE: "quick, uneven", ARTICULATION: "loose", BREATH_STYLE: "shallow, caught mid-thought",
    DICTION: "colloquial, clipped", EMOTIONAL_STYLE: "Defiance with a bruise underneath it",
  },
  "love-interest": {
    PITCH: "Soft mid-register", TONE: "intimate, unguarded",
    PACE: "gentle", ARTICULATION: "soft-edged", BREATH_STYLE: "light, close to the mic",
    DICTION: "warm, informal", EMOTIONAL_STYLE: "Tenderness held back by restraint",
  },
  "comic-relief": {
    PITCH: "Bright and mobile", TONE: "quick, buoyant",
    PACE: "brisk with sharp pauses", ARTICULATION: "precise", BREATH_STYLE: "light, quick",
    DICTION: "casual, playful", EMOTIONAL_STYLE: "Fast wit that lands the joke without pushing it",
  },
  horror: {
    PITCH: "Low and breath-forward", TONE: "hushed, uneasy",
    PACE: "slow", ARTICULATION: "soft, deliberate", BREATH_STYLE: "audible, uneven",
    DICTION: "sparse, plain", EMOTIONAL_STYLE: "Dread held in stillness rather than volume",
  },
  sidekick: {
    PITCH: "Mid-to-bright", TONE: "eager, companionable",
    PACE: "quick", ARTICULATION: "clear", BREATH_STYLE: "light, ready",
    DICTION: "casual, direct", EMOTIONAL_STYLE: "Open enthusiasm with a note of worry underneath",
  },
  outsider: {
    PITCH: "Mid-register and guarded", TONE: "watchful, reserved",
    PACE: "careful", ARTICULATION: "measured", BREATH_STYLE: "quiet, controlled",
    DICTION: "spare, precise", EMOTIONAL_STYLE: "Held-back feeling that surfaces only in short bursts",
  },
};

export const DEFAULT_VOICE_DELIVERY: VoiceDeliveryDefaults = ARCHETYPE_VOICE_DELIVERY.outsider;

/**
 * Substitutes every `{SLOT}` token. An unresolved token is a template bug, so it
 * throws rather than shipping a literal `{PITCH}` to a voice provider.
 */
export function fillVoiceDirectionTemplate(template: string, slots: VoiceDirectionSlots) {
  const filled = template.replace(/\{([A-Z_]+)\}/g, (token, key: string) =>
    key in slots ? slots[key as VoiceDirectionSlot] : token);
  const unresolved = filled.match(/\{[A-Z_]+\}/g);
  if (unresolved) throw new Error(`Voice direction template has unfilled slots: ${unresolved.join(", ")}`);
  return filled;
}

/**
 * Voice models take a life stage, not a number, so a bare age is normalised
 * rather than passed through.
 */
export function voiceAgeDescriptor(perceivedAge: string | undefined) {
  const value = perceivedAge?.trim() ?? "";
  const years = Number(value.match(/\b(\d{1,2})\b/)?.[1] ?? NaN);
  if (Number.isFinite(years)) {
    if (years < 20) return "late-teenage";
    if (years < 30) return "young adult";
    if (years < 45) return "adult";
    if (years < 60) return "middle-aged";
    return "older adult";
  }
  if (/\b(?:teen|adolescent|young)\b/i.test(value)) return "young adult";
  if (/\b(?:elder|old|aged|senior)\b/i.test(value)) return "older adult";
  if (/\b(?:middle-aged|midlife)\b/i.test(value)) return "middle-aged";
  return "adult";
}

export const FILM_LOOK_LINE =
  "Natural cinematic exposure, restrained contrast, practical light falloff, coherent motion blur, and physically plausible depth.";

export const SKIN_REALISM_BLOCK =
  "Visible skin keeps natural pores, fine facial texture, subtle tonal variation, and physically plausible highlights without waxy smoothing.";

export const BANNED_WORDS = [
  "ultra sharp",
  "hyper detailed",
  "crisp",
  "razor sharp",
  "8K clarity",
  "HDR",
  "ultra-realistic detail",
] as const;

export const STANDARD_PORTRAIT_NEGATIVES = [
  "waxy skin",
  "plastic skin",
  "beauty-filter smoothing",
  "asymmetrical eyes",
  "duplicate features",
  "extra fingers",
  "fused hands",
  "warped teeth",
  "text",
  "watermark",
] as const;

export const VIDEO_PROMPT_ENDING = "No music. No subtitles.";

const BANNED_PATTERN = new RegExp(
  `\\b(?:${BANNED_WORDS.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i",
);
const GEAR_TOKEN = /\b(?:\d{2,3}\s*mm|f\s*\/?\s*\d(?:\.\d+)?)\b/i;
const VISIBLE_LENS_EFFECT =
  /\b(?:background|foreground|depth|blur|bokeh|compression|distortion|field of view|perspective|focus|melts|separation)\b/i;

export function bannedPromptWord(prompt: string) {
  return prompt.match(BANNED_PATTERN)?.[0] ?? null;
}

export function hasUnpairedGearToken(prompt: string) {
  const authored = prompt.replace(FILM_LOOK_LINE, "").replace(SKIN_REALISM_BLOCK, "");
  return GEAR_TOKEN.test(authored) && !VISIBLE_LENS_EFFECT.test(authored);
}

export function withStandingInjections(prompt: string, skinVisible = false) {
  const base = prompt
    .trim()
    .replace(/\s*No music\.\s*No subtitles\.\s*$/i, "")
    .replace(FILM_LOOK_LINE, "")
    .replace(SKIN_REALISM_BLOCK, "")
    .trim();
  return [
    base,
    FILM_LOOK_LINE,
    skinVisible ? SKIN_REALISM_BLOCK : "",
  ].filter(Boolean).join(" ");
}

export function finalizeVideoPrompt(prompt: string, skinVisible = false) {
  const base = withStandingInjections(prompt, skinVisible).replace(/\s*No frozen figures\.\s*$/i, "");
  return `${base} No frozen figures. ${VIDEO_PROMPT_ENDING}`;
}

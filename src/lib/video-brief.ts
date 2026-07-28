import { z } from "zod";

export enum VideoType {
  CharacterPunch = "character_punch",
  CharacterReel = "character_reel",
  Episode = "episode",
  UgcAd = "ugc_ad",
  ProductHero = "product_hero",
  BrandSpot = "brand_spot",
}

export type VideoBriefInput =
  | "character_id"
  | "character_ids"
  | "product_id"
  | "persona_style"
  | "hook_text"
  | "cta_text"
  | "platform"
  | "narrative_beat";

export type VideoTypeDefinition = {
  type: VideoType;
  label: string;
  duration: number | readonly [number, number];
  shot_count: number | readonly [number, number];
  required_inputs: readonly VideoBriefInput[];
  optional_inputs: readonly VideoBriefInput[];
  prompt_grammar_id: string;
  /** Default delivery ratio. `aspect_ratio_default` is retained for callers from the first intake UI. */
  aspect_ratio: "9:16" | "16:9";
  aspect_ratio_default: "9:16" | "16:9";
};

export const VIDEO_TYPES: Record<VideoType, VideoTypeDefinition> = {
  [VideoType.CharacterPunch]: {
    type: VideoType.CharacterPunch, label: "Character Punch", duration: 5, shot_count: 1,
    required_inputs: ["character_id"], optional_inputs: [], prompt_grammar_id: "character_punch_v1", aspect_ratio: "9:16", aspect_ratio_default: "9:16",
  },
  [VideoType.CharacterReel]: {
    type: VideoType.CharacterReel, label: "Character Reel", duration: 15, shot_count: 3,
    required_inputs: ["character_id"], optional_inputs: [], prompt_grammar_id: "character_reel_v1", aspect_ratio: "9:16", aspect_ratio_default: "9:16",
  },
  [VideoType.Episode]: {
    type: VideoType.Episode, label: "Episode", duration: 60, shot_count: 12,
    // `character_ids` is the canonical form for an ensemble. `character_id`
    // remains accepted by resolveVideoBrief for existing character-only callers.
    required_inputs: ["character_ids"], optional_inputs: ["character_id"], prompt_grammar_id: "episode_v1", aspect_ratio: "16:9", aspect_ratio_default: "16:9",
  },
  [VideoType.UgcAd]: {
    type: VideoType.UgcAd, label: "UGC ad", duration: [15, 30], shot_count: [3, 6],
    required_inputs: ["character_id", "product_id", "persona_style", "hook_text", "cta_text", "platform"], optional_inputs: [], prompt_grammar_id: "ugc_ad_v1", aspect_ratio: "9:16", aspect_ratio_default: "9:16",
  },
  [VideoType.ProductHero]: {
    type: VideoType.ProductHero, label: "Product Hero", duration: 15, shot_count: 3,
    required_inputs: ["product_id"], optional_inputs: [], prompt_grammar_id: "product_hero_v1", aspect_ratio: "9:16", aspect_ratio_default: "9:16",
  },
  [VideoType.BrandSpot]: {
    type: VideoType.BrandSpot, label: "Brand Spot", duration: 30, shot_count: 8,
    required_inputs: ["character_id", "product_id", "narrative_beat"], optional_inputs: [], prompt_grammar_id: "brand_spot_v1", aspect_ratio: "16:9", aspect_ratio_default: "16:9",
  },
};

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || undefined);

export const VideoBriefInputSchema = z.object({
  video_type: z.nativeEnum(VideoType),
  title: z.string().trim().min(1, "Title is required.").max(160),
  character_id: optionalText(120),
  character_ids: z.array(z.string().trim().min(1).max(120)).min(1).max(24).optional(),
  product_id: z.string().uuid().optional(),
  persona_style: z.enum(["casual", "expert", "excited"]).optional(),
  hook_text: optionalText(500),
  cta_text: optionalText(500),
  platform: z.enum(["reels", "shorts", "tiktok"]).optional(),
  narrative_beat: z.enum(["problem", "ritual", "reveal"]).optional(),
  duration_seconds: z.number().int().min(5).max(60).optional(),
  aspect_ratio: z.enum(["9:16", "16:9", "1:1"]).optional(),
});

export type VideoBriefInputData = z.infer<typeof VideoBriefInputSchema>;
export type VideoBrief = VideoBriefInputData;
/** Backwards-compatible concise alias for consumers that name all domain schemas `*Schema`. */
export const VideoBriefSchema = VideoBriefInputSchema;

/** Return all selected actors while accepting the legacy singular field. */
export function selectedCharacterIds(input: Pick<VideoBriefInputData, "character_id" | "character_ids">) {
  const ids = input.character_ids?.filter(Boolean) ?? [];
  if (ids.length) return [...new Set(ids)];
  return input.character_id ? [input.character_id] : [];
}

function bounded(value: number, declared: number | readonly [number, number]) {
  return typeof declared === "number" ? value === declared : value >= declared[0] && value <= declared[1];
}

export function resolveVideoBrief(input: VideoBriefInputData) {
  const definition = VIDEO_TYPES[input.video_type];
  const characterIds = selectedCharacterIds(input);
  const durationSeconds = input.duration_seconds ?? (typeof definition.duration === "number" ? definition.duration : definition.duration[0]);
  if (!bounded(durationSeconds, definition.duration)) {
    throw new Error(`${definition.label} must be ${Array.isArray(definition.duration) ? `${definition.duration[0]}–${definition.duration[1]}` : definition.duration} seconds.`);
  }
  const shotCount = Math.max(
    typeof definition.shot_count === "number" ? definition.shot_count : definition.shot_count[0],
    Math.round(durationSeconds / 5),
  );
  if (!bounded(shotCount, definition.shot_count)) throw new Error(`${definition.label} has an invalid shot count.`);
  if ([VideoType.UgcAd, VideoType.BrandSpot].includes(input.video_type) && !input.product_id) {
    throw new Error(`${definition.label} requires a product.`);
  }
  if (input.video_type === VideoType.ProductHero && characterIds.length) {
    throw new Error("Product Hero is product-only and cannot include an actor.");
  }
  for (const requirement of definition.required_inputs) {
    const value = requirement === "character_ids" ? characterIds : input[requirement];
    if (!value || (Array.isArray(value) && value.length === 0)) {
      // Keep the error phrasing stable for clients/tests while describing the
      // ensemble form when it is the missing field.
      throw new Error(`${requirement.replaceAll("_", " ")} is required for ${definition.label}.`);
    }
  }
  // Product-only types must never carry an actor through an alternate field.
  if (isProductVideoType(input.video_type) && input.video_type === VideoType.ProductHero && characterIds.length) {
    throw new Error("Product Hero is product-only and cannot include an actor.");
  }
  return { ...input, character_ids: characterIds, duration_seconds: durationSeconds, shot_count: shotCount, aspect_ratio: input.aspect_ratio ?? definition.aspect_ratio, definition };
}

export function isProductVideoType(videoType: VideoType) {
  return videoType === VideoType.UgcAd || videoType === VideoType.ProductHero || videoType === VideoType.BrandSpot;
}

export type TypedShot = { shotNumber: number; beat: string; visualAction: string; cameraDirection: string; lightingDirection: string; dialogue?: string; audioDirection?: string };

export function buildTypedShotPlan(input: ReturnType<typeof resolveVideoBrief>): TypedShot[] {
  const count = input.shot_count;
  if (input.video_type === VideoType.ProductHero) {
    return [
      ["Material introduction", "Macro detail reveals material, texture, and exact label geometry.", "90mm macro slow push", "Controlled light sweep across real materials"],
      ["Form reveal", "Circle the product slowly, preserving proportions, cap, and readable brand face.", "Slow 40mm arc", "Sculpted side key with soft edge"],
      ["Pack shot", "Land on a clean product pack shot and logo lockup frame; no humans.", "Locked 50mm product frame", "Premium practical highlight, no flare over label"],
    ].map((shot, index) => ({ shotNumber: index + 1, beat: shot[0], visualAction: shot[1], cameraDirection: shot[2], lightingDirection: shot[3] }));
  }
  if (input.video_type === VideoType.UgcAd) {
    const base = [
      ["Hook", `Product visible within the first second. ${input.hook_text}`, "Eye-level handheld 28mm", "Natural window light"],
      ["Demo / use", "Actor uses the product exactly as approved in handling notes.", "Imperfect close handheld coverage", "Natural available light"],
      ["Reaction", "A short, truthful reaction after use; direct-to-camera speech is capped at two seconds.", "Eye-level medium", "Natural light, no beauty pass"],
      ["CTA", `End on a product-visible CTA card: ${input.cta_text}`, "Stable close product frame", "Clean natural key"],
      ["Proof detail", "Show one approved material or usage detail without inventing a claim.", "Handheld macro insert", "Soft daylight"],
      ["Final CTA", `Return to the product and CTA: ${input.cta_text}`, "Still product-facing frame", "Natural light"],
    ];
    // The shortest legal UGC cut still contains the complete arc: the demo and
    // reaction share a shot, then land on a product-visible CTA card.
    const selected = count === 3
      ? [base[0], ["Demo / reaction", "Actor uses the product exactly as approved, then gives a short truthful reaction; direct-to-camera speech is capped at two seconds.", "Imperfect close handheld coverage", "Natural available light"], base[3]]
      : base.slice(0, count);
    return selected.map((shot, index) => ({ shotNumber: index + 1, beat: shot[0], visualAction: shot[1], cameraDirection: shot[2], lightingDirection: shot[3], dialogue: index === 0 ? input.hook_text : undefined }));
  }
  if (input.video_type === VideoType.BrandSpot) {
    const beats = ["Chaos I", "Chaos II", "Chaos III", "The turn", "Payoff I", "Payoff II", "Payoff III", "The close"];
    return beats.map((beat, index) => ({
      shotNumber: index + 1,
      beat,
      visualAction: index === 3
        ? "Silence and neutral reset; the product appears for the first time as the decisive turn."
        : index === 7
          ? "Glamour material detail resolves into the final product lockup."
          : `${input.narrative_beat} narrative beat advances through visible action without showing the product.`,
      cameraDirection: index === 7 ? "Macro ECUs resolved into a static 50mm pack-shot frame" : "Camera stability follows the authored eight-slot arc.",
      lightingDirection: index < 3
        ? "Harsh high-contrast pressure state"
        : index === 3
          ? "Flat neutral gray reset"
          : "Soft warm white building into controlled saturation",
    }));
  }
  return Array.from({ length: count }, (_, index) => ({ shotNumber: index + 1, beat: `Shot ${index + 1}`, visualAction: "Character-led story action.", cameraDirection: "40mm controlled cinematic frame", lightingDirection: "Motivated scene lighting" }));
}

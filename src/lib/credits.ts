export const WELCOME_CREDITS = 100;
export const CHARACTER_CREATION_CREDITS = 25;
export const PUNCH_15S_CREDITS = 75;
export const VIDEO_SECOND_CREDITS = 5;

export type CreditCatalogItem = {
  code: string;
  label: string;
  credits: number;
  unit: string;
  billing: "grant" | "direct" | "included";
  category: "account" | "actor" | "writing" | "audio" | "visual" | "production";
  description: string;
};

/**
 * Direct items debit the creator wallet. Included items give operations a
 * stable per-step value while remaining covered by the actor or production
 * bundle, so one provider call cannot silently double-charge a creator.
 */
export const CREDIT_CATALOG: readonly CreditCatalogItem[] = [
  { code: "welcome", label: "New creator grant", credits: WELCOME_CREDITS, unit: "once per account", billing: "grant", category: "account", description: "On-the-house balance added when a creator account is opened." },
  { code: "actor.create", label: "Create an AI actor", credits: CHARACTER_CREATION_CREDITS, unit: "per actor", billing: "direct", category: "actor", description: "Reserves the actor workspace and its first identity, voice, sound, theme, and performance pass." },
  { code: "production.spark.5", label: "Spark", credits: 25, unit: "5-second production", billing: "direct", category: "production", description: "One finished five-second performance, including its generation steps." },
  { code: "production.punch.15", label: "Punch", credits: PUNCH_15S_CREDITS, unit: "15-second production", billing: "direct", category: "production", description: "One finished 15-second Punch, rendered as four assembled scene clips or one native audiovisual take." },
  { code: "production.spot.30", label: "Brand Spot", credits: 150, unit: "30-second production", billing: "direct", category: "production", description: "A finished 30-second brand production." },
  { code: "production.episode.60", label: "Episode", credits: 300, unit: "60-second production", billing: "direct", category: "production", description: "A finished 60-second episode." },
  { code: "production.spot.60", label: "Brand Spot XL", credits: 300, unit: "60-second production", billing: "direct", category: "production", description: "A finished 60-second brand production." },
  { code: "writing.magic", label: "Magic writing", credits: 1, unit: "per generated brief or scene plan", billing: "included", category: "writing", description: "Allocated to AI-written actor fields, dialogue direction, and scene blueprints." },
  { code: "voice.audition", label: "Voice auditions", credits: 3, unit: "per three-take audition", billing: "included", category: "audio", description: "Three generated voice candidates. Saving the selected voice has no additional allocation." },
  { code: "dialogue.take", label: "Dialogue take", credits: 1, unit: "per generated take", billing: "included", category: "audio", description: "One generated spoken performance." },
  { code: "sfx.generate", label: "Sound effect", credits: 1, unit: "per generated asset", billing: "included", category: "audio", description: "One signature or scene sound-effect asset." },
  { code: "theme.generate", label: "Theme music", credits: 2, unit: "per generated cue", billing: "included", category: "audio", description: "One generated instrumental identity or scene cue." },
  { code: "image.generate", label: "Still image", credits: 4, unit: "per generated image", billing: "included", category: "visual", description: "One identity, gallery, cover, or scene frame." },
  { code: "video.generate", label: "Motion generation", credits: VIDEO_SECOND_CREDITS, unit: "per generated second", billing: "included", category: "visual", description: "Video allocation inside a paid production; retries remain visible to operations." },
  { code: "master.assemble", label: "Master assembly", credits: 0, unit: "per finished master", billing: "included", category: "production", description: "Captions, FFmpeg assembly, approval, and delivery do not add a separate wallet debit." },
] as const;

export function productionCreditCost(format: string, durationSeconds: number) {
  const valid =
    (format === "spark" && durationSeconds === 5)
    || (format === "punch" && durationSeconds === 15)
    || (format === "episode" && durationSeconds === 60)
    || (format === "spot" && (durationSeconds === 30 || durationSeconds === 60));
  if (!valid) throw new Error("The production format and duration do not match.");
  return durationSeconds * VIDEO_SECOND_CREDITS;
}

export function productionCreditCode(format: string, durationSeconds: number) {
  if (format === "spark" && durationSeconds === 5) return "production.spark.5";
  if (format === "punch" && durationSeconds === 15) return "production.punch.15";
  if (format === "episode" && durationSeconds === 60) return "production.episode.60";
  if (format === "spot" && durationSeconds === 30) return "production.spot.30";
  if (format === "spot" && durationSeconds === 60) return "production.spot.60";
  throw new Error("The production format and duration do not match.");
}

export function generationCreditAllocation(kind: string, metadata?: Record<string, unknown>) {
  if (kind.startsWith("prompt-") || kind === "openai-prompt" || kind === "anthropic-prompt") return { code: "writing.magic", credits: 1 };
  if (kind === "voice-design") return { code: "voice.audition", credits: 3 };
  if (kind === "voice-lock") return { code: "voice.audition", credits: 0 };
  if (kind === "dialogue") return { code: "dialogue.take", credits: 1 };
  if (kind === "sfx") return { code: "sfx.generate", credits: 1 };
  if (kind === "theme") return { code: "theme.generate", credits: 2 };
  if (kind === "gallery" || kind === "avatar" || kind === "banner" || kind === "image") return { code: "image.generate", credits: 4 };
  if (kind === "video") {
    const duration = Number(metadata?.durationSeconds ?? metadata?.duration_seconds ?? 5);
    return { code: "video.generate", credits: Math.max(0, Number.isFinite(duration) ? duration : 5) * VIDEO_SECOND_CREDITS };
  }
  return { code: "master.assemble", credits: 0 };
}

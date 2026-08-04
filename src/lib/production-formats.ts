import type { AppRole } from "@/lib/types";

export type ProductionFormat = "spark" | "punch" | "episode" | "spot";
export type LegacyWritingFormat = "story" | "ad" | "reel";
export type PunchGenerationMode = "scene-clips" | "single-take";

export function normalizePunchGenerationMode(value: unknown): PunchGenerationMode {
  return value === "single-take" ? "single-take" : "scene-clips";
}

/** A single take is one authored continuous scene, not four hidden scenes. */
export function punchAuthoredSceneCount(mode: PunchGenerationMode) {
  return mode === "single-take" ? 1 : 4;
}

export type ProductionFormatDefinition = {
  type: ProductionFormat;
  label: string;
  durationSeconds: 5 | 15 | 30 | 60;
  alternateDurationSeconds?: 60;
  shotCount: number;
  owner: "creator" | "brand";
  publishable: boolean;
  promise: string;
  structure: string;
  finalAction: string;
};

export const PRODUCTION_FORMATS: Record<ProductionFormat, ProductionFormatDefinition> = {
  spark: {
    type: "spark",
    label: "Spark",
    durationSeconds: 5,
    shotCount: 1,
    owner: "creator",
    publishable: false,
    promise: "A private casting audition that proves one unmistakable performance choice.",
    structure: "1 approved five-second shot",
    finalAction: "Build Spark production",
  },
  punch: {
    type: "punch",
    label: "Punch",
    durationSeconds: 15,
    shotCount: 4,
    owner: "creator",
    publishable: true,
    promise: "A public personality proof: hook, pressure, and one memorable choice.",
    structure: "4 authored four-second scenes, cut to a 15-second master",
    finalAction: "Build Punch production",
  },
  episode: {
    type: "episode",
    label: "Episode",
    durationSeconds: 60,
    shotCount: 15,
    owner: "creator",
    publishable: true,
    promise: "A complete microdrama that changes the situation and ends on a cliffhanger.",
    structure: "15 authored four-second scenes",
    finalAction: "Build Episode production",
  },
  spot: {
    type: "spot",
    label: "Brand Spot",
    durationSeconds: 30,
    alternateDurationSeconds: 60,
    shotCount: 8,
    owner: "brand",
    publishable: true,
    promise: "A managed commercial performance with rights, claims, and client approval gates.",
    structure: "8 or 15 authored four-second scenes, trimmed to delivery runtime",
    finalAction: "Send Spot to production",
  },
};

export const CREATOR_FORMATS: ProductionFormat[] = ["spark", "punch", "episode"];
export const BRAND_FORMATS: ProductionFormat[] = ["spot"];
export const ADMIN_FORMATS: ProductionFormat[] = ["spark", "punch", "episode", "spot"];

export function formatsForRole(role: AppRole) {
  if (role === "admin") return ADMIN_FORMATS;
  if (role === "brand") return BRAND_FORMATS;
  return CREATOR_FORMATS;
}

export function defaultFormatForRole(role: AppRole): ProductionFormat {
  if (role === "brand") return "spot";
  return "punch";
}

export function normalizeProductionFormat(
  value: string | null | undefined,
  fallback: ProductionFormat = "punch",
): ProductionFormat {
  if (value === "spark" || value === "punch" || value === "episode" || value === "spot") return value;
  if (value === "story") return "episode";
  if (value === "ad") return "spot";
  if (value === "reel") return "punch";
  return fallback;
}

export function productionDuration(format: ProductionFormat, requested?: number) {
  if (format === "spot" && requested === 60) return 60;
  return PRODUCTION_FORMATS[format].durationSeconds;
}

export function productionShotCount(format: ProductionFormat, durationSeconds: number) {
  if (format === "spot" && durationSeconds === 60) return 15;
  return PRODUCTION_FORMATS[format].shotCount;
}

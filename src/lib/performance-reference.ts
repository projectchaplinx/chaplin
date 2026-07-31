import { z } from "zod";
import { finalizeVideoPrompt, STANDARD_PORTRAIT_NEGATIVES, withStandingInjections } from "@/lib/prompt-standards";

export const characterSheetSchema = z.object({
  id: z.string().trim().min(1),
  character_id: z.string().trim().min(1),
  age_state: z.string().trim().min(1),
  wardrobe_state: z.string().trim().min(1),
  version: z.number().int().positive(),
  composite_asset_id: z.string().trim().min(1).nullable(),
  panel_asset_ids: z.object({
    front: z.string().trim().min(1),
    three_quarter: z.string().trim().min(1),
    profile: z.string().trim().min(1),
    full_body: z.string().trim().min(1),
  }).strict().nullable(),
  status: z.enum(["required", "generating", "current", "superseded"]),
}).strict();

export const voiceRecipeSchema = z.object({
  texture: z.string().trim().min(2),
  rhythm: z.string().trim().min(2),
  pressure: z.string().trim().min(2),
}).strict();

export const performanceReferenceTakeSchema = z.object({
  id: z.string().trim().min(1),
  character_id: z.string().trim().min(1),
  age_state: z.string().trim().min(1),
  wardrobe_state: z.string().trim().min(1),
  line: z.string().trim().min(2),
  subtext: z.string().trim().min(2),
  voice_recipe: voiceRecipeSchema,
  vocal_moment: z.string().trim().min(2),
  physical_behaviour: z.string().trim().min(2),
  asset_id: z.string().trim().min(1).nullable(),
  selected: z.boolean().default(false),
}).strict();

export const performanceReferenceSetSchema = z.object({
  character_id: z.string().trim().min(1),
  takes: z.array(performanceReferenceTakeSchema).min(2).max(3),
}).strict().superRefine((set, context) => {
  if (set.takes.filter((take) => take.selected).length > 1) {
    context.addIssue({ code: "custom", path: ["takes"], message: "Only one audition take may be selected." });
  }
});

export type CharacterSheet = z.infer<typeof characterSheetSchema>;
export type PerformanceReferenceTake = z.infer<typeof performanceReferenceTakeSchema>;
export type PerformanceReferenceSet = z.infer<typeof performanceReferenceSetSchema>;

export function characterAppearanceKey(input: Pick<CharacterSheet, "character_id" | "age_state" | "wardrobe_state">) {
  return `${input.character_id}:${input.age_state}:${input.wardrobe_state}`;
}

export function characterSheetPrompt(input: { identity: string; ageState: string; wardrobeState: string }) {
  return withStandingInjections([
    "STRICT CHARACTER TURNAROUND. One 16:9 human-review character sheet split into exactly four equal vertical panels from left to right.",
    `Identity: ${input.identity}. Age state: ${input.ageState}. Final wardrobe: ${input.wardrobeState}.`,
    "Panel one: neutral straight-on head-and-shoulders. Panel two: neutral three-quarter head-and-shoulders. Panel three: neutral exact side profile head-and-shoulders. Panel four: neutral front-facing head-to-toe full body in final wardrobe, arms relaxed, both hands and both feet visible; never a rear or back view.",
    "Framing lock: in every panel, keep the complete head, hair, hairline, ears, chin, neck, and shoulders inside the frame with clear space above the hair. Never crop a face or head at any edge. In the full-body panel, keep the entire silhouette from the top of the hair through the soles of both feet inside the frame with clear margin on all sides.",
    "Ignore and remove the reference image's pose, action, location, background, props, weapons, vehicles, and story context. This is identity documentation, not a scene, storyboard, montage, contact sheet, or action sequence.",
    "Repeat the exact same fictional actor in every panel. Use one seamless neutral studio background, one soft even reference-lighting setup, one camera height, and matching color across all four views.",
    "No acting, environment, props, additional people, labels, text, logos, decorative borders, or watermark.",
    `Negative: ${STANDARD_PORTRAIT_NEGATIVES.join(", ")}.`,
  ].join(" "), true);
}

export function characterSheetVideoReferences(sheet: CharacterSheet) {
  if (sheet.status !== "current" || !sheet.panel_asset_ids) {
    throw new Error("Generate and crop the current character sheet before video generation.");
  }
  return Object.entries(sheet.panel_asset_ids).map(([view, assetId], index) => ({
    id: `${sheet.id}:${view}`,
    kind: "character" as const,
    asset_id: assetId,
    label: `@image${index + 1}` as `@image${number}`,
    character_reference_role: "panel" as const,
  }));
}

export function performanceReferencePrompt(take: PerformanceReferenceTake) {
  return finalizeVideoPrompt([
    "Self-tape audition. Medium close-up, locked-off eye-level camera, shallow focus.",
    `Spoken line: "${take.line}" Subtext: ${take.subtext}.`,
    `Voice recipe: ${take.voice_recipe.texture}; ${take.voice_recipe.rhythm}; ${take.voice_recipe.pressure}.`,
    `Named vocal moment: ${take.vocal_moment}. One named physical behaviour: ${take.physical_behaviour}.`,
    "Hold silence before and after the line. End unresolved.",
  ].join(" "), true);
}

export function selectPerformanceTake(set: PerformanceReferenceSet, takeId: string): PerformanceReferenceSet {
  if (!set.takes.some((take) => take.id === takeId && take.asset_id)) {
    throw new Error("Only a rendered audition take can be selected.");
  }
  return performanceReferenceSetSchema.parse({
    ...set,
    takes: set.takes.map((take) => ({ ...take, selected: take.id === takeId })),
  });
}

import "server-only";

import { ProductCardSchema, type ProductCard } from "@/lib/product-card";
import { composeImagePrompt, composeProductImagePrompt, composeProductVideoPrompt, composeVideoPrompt, type CharacterIdentityInput, type ShotBlueprint } from "@/lib/production-prompting";
import { createMediaPipelineRun } from "@/lib/server/media-pipeline";
import { getCharacterProductionState, getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { buildTypedShotPlan, isProductVideoType, resolveVideoBrief, selectedCharacterIds, type TypedShot, type VideoBriefInputData, VideoType } from "@/lib/video-brief";
import type { MediaOutputType } from "@/lib/media-pipeline-types";
import { activeAgeState, readCharacterCardV2, selectedWardrobeState } from "@/lib/character-card";
import { createAdBoard, type AdBoard } from "@/lib/ad-board";

function fail(error: { message: string } | null, label: string) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

function productShot(shot: TypedShot): ShotBlueprint {
  return {
    sceneName: shot.beat, dramaticBeat: shot.beat, hook: shot.beat, setting: "the approved scene environment",
    subjectStart: shot.visualAction, actionTimeline: [shot.visualAction, shot.visualAction, shot.visualAction], facialBeat: "product clarity",
    framing: "controlled product-forward composition", cameraAngle: shot.cameraDirection, lens: "50mm", cameraMovement: shot.cameraDirection,
    keyLight: shot.lightingDirection, fillAndEdge: "preserve label readability", environmentalMotion: "only physically motivated motion",
    soundTexture: shot.audioDirection ?? "clean production sound", musicalArc: "", finalFrame: shot.visualAction, dialogue: shot.dialogue ?? "",
  };
}

function outputType(videoType: VideoType): MediaOutputType {
  return videoType;
}

export async function createVideoBrief(input: VideoBriefInputData, ownerId: string) {
  const brief = resolveVideoBrief(input);
  const supabase = getSupabaseAdminClient();
  let product: ProductCard | undefined;
  if (isProductVideoType(brief.video_type)) {
    const productResult = await supabase.from("products").select("*").eq("id", brief.product_id!).maybeSingle();
    fail(productResult.error, "Load product");
    if (!productResult.data) throw new Error("Selected product no longer exists.");
    product = ProductCardSchema.parse(productResult.data);
    if (!product.reference_images.length) throw new Error("Product video briefs require product reference images.");
  }

  const characterIds = selectedCharacterIds(brief);
  let actor: CharacterIdentityInput | undefined;
  let actorCard: ReturnType<typeof readCharacterCardV2>;
  let primaryCharacterId: string | undefined;
  if (characterIds.length) {
    const actorResult = await supabase.from("characters").select("id,name,archetype,tagline,personality,voice_gender,card_v2").in("id", characterIds);
    fail(actorResult.error, "Load selected actor");
    const rows = actorResult.data ?? [];
    if (rows.length !== characterIds.length) throw new Error("One or more selected actors no longer exists.");
    // Product grammars currently accept one canonical actor; retain the full
    // ensemble on each shot for episode assembly and downstream reporting.
    const primary = rows.find((row) => row.id === characterIds[0]) ?? rows[0];
    primaryCharacterId = primary.id;
    actorCard = readCharacterCardV2(primary.card_v2);
    actor = {
      name: primary.name,
      archetype: primary.archetype,
      tagline: primary.tagline,
      personality: primary.personality,
      voiceGender: primary.voice_gender,
      cardV2: primary.card_v2,
    } as CharacterIdentityInput;
  }

  const briefId = crypto.randomUUID();
  const now = new Date().toISOString();
  const insert = await supabase.from("video_briefs").insert({
    id: briefId, owner_id: ownerId, video_type: brief.video_type, title: brief.title, character_id: characterIds[0] ?? null,
    product_id: brief.product_id ?? null, duration_seconds: brief.duration_seconds, shot_count: brief.shot_count, aspect_ratio: brief.aspect_ratio,
    intake: { ...brief, definition: undefined }, status: "planned", created_at: now, updated_at: now,
  });
  fail(insert.error, "Create video brief");

  try {
    const plan = buildTypedShotPlan(brief);
    let adBoard: AdBoard | undefined;
    if (brief.video_type === VideoType.BrandSpot) {
      if (!primaryCharacterId || !actorCard || !product) {
        throw new Error("Brand Spot ad boards require a Character Card v2 actor and an approved product.");
      }
      const production = await getCharacterProductionState(primaryCharacterId);
      if (!production.visualReference?.assetId) {
        throw new Error("Brand Spot ad boards require an approved canonical actor still.");
      }
      const wardrobe = selectedWardrobeState(actorCard);
      const age = activeAgeState(actorCard);
      const baseBoard = createAdBoard({
        arcTemplate: "problem_solution",
        mode: "emotional_counterpoint",
        canonicalReferenceAsset: production.visualReference.assetId,
        identityBlock: actorCard.identity_locks.identity_block,
        wardrobeState: `${wardrobe.name}: ${wardrobe.state.wardrobe}; hair ${wardrobe.state.hair}; silhouette ${wardrobe.state.silhouette}`,
        ageState: `${age.label} (${age.perceived_age}): ${age.appearance_delta}`,
        productId: product.id,
      });
      adBoard = {
        ...baseBoard,
        slots: baseBoard.slots.map((slot, index) => {
          const shot = plan[index];
          const productDirection = slot.product_visible
            ? `PRODUCT IDENTITY BLOCK (VERBATIM): ${product.identity_block}`
            : `PRODUCT EXCLUSION: Do not show ${product.product_name}, its packaging, label, silhouette, or a substitute product in this slot.`;
          return {
            ...slot,
            description: shot.visualAction,
            camera: shot.cameraDirection,
            color_light: shot.lightingDirection,
            image_prompt: `${slot.image_prompt}\n${productDirection}`,
            motion: {
              mode: "forward" as const,
              first_frame_asset: production.visualReference!.assetId,
              prompt: `Animate only this slot's visible action: ${shot.visualAction}`,
              no_target: true as const,
            },
          };
        }),
      };
    }
    const shots = plan.map((shot) => {
      const promptShot = productShot(shot);
      const productInput = product ? {
        videoType: brief.video_type, product, actor, shot: promptShot, hookText: brief.hook_text,
        ctaText: brief.cta_text, personaStyle: brief.persona_style, narrativeBeat: brief.narrative_beat,
      } : undefined;
      const boardSlot = adBoard?.slots[shot.shotNumber - 1];
      return {
        video_brief_id: briefId,
        shot_number: shot.shotNumber,
        duration_seconds: boardSlot ? boardSlot.duration_ms / 1000 : 5,
        beat: shot.beat,
        visual_action: shot.visualAction, camera_direction: shot.cameraDirection, lighting_direction: shot.lightingDirection,
        dialogue: shot.dialogue ?? null, audio_direction: shot.audioDirection ?? null,
        // Keep typed briefs on the same prompt path as character-only shots. Product
        // types add their identity grammar; actor-only types use the canonical bible.
        image_prompt: boardSlot?.image_prompt ?? (productInput ? composeProductImagePrompt(productInput) : actor ? composeImagePrompt(actor, promptShot) : null),
        video_prompt: boardSlot?.motion.prompt ?? (productInput ? composeProductVideoPrompt(productInput) : actor ? composeVideoPrompt(actor, promptShot) : null),
        aspect_ratio: brief.aspect_ratio, cast_character_ids: characterIds,
        continuity_in: shot.shotNumber === 1 ? { source: "video_brief" } : { previousShot: shot.shotNumber - 1 },
        continuity_out: shot.shotNumber === plan.length ? { end: "typed_video_brief" } : { nextShot: shot.shotNumber + 1 }, status: "planned", created_at: now, updated_at: now,
      };
    });
    const shotInsert = await supabase.from("episode_shots").insert(shots).select("id,shot_number");
    fail(shotInsert.error, "Create typed video shots");
    if (!shotInsert.data || shotInsert.data.length !== shots.length) throw new Error("Create typed video shots: no complete shot list was returned.");
    const run = await createMediaPipelineRun({
      scopeType: "brief", scopeId: briefId, outputType: outputType(brief.video_type), createdBy: ownerId,
      idempotencyKey: `video-brief:${briefId}`,
      tags: { video_type: brief.video_type, product_id: brief.product_id ?? null, video_brief_id: briefId },
      spec: {
        video_type: brief.video_type, product_id: brief.product_id ?? null, character_id: characterIds[0] ?? null,
        character_ids: characterIds, shot_count: brief.shot_count, duration_seconds: brief.duration_seconds,
        aspect_ratio: brief.aspect_ratio, shot_ids: shotInsert.data.map((shot) => shot.id), shot_plan: plan,
        ...(adBoard ? { adBoard } : {}),
      },
    });
    return { id: briefId, ...brief, run };
  } catch (error) {
    await supabase.from("video_briefs").delete().eq("id", briefId);
    throw error;
  }
}

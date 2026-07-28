import assert from "node:assert/strict";
import test from "node:test";
import { buildTypedShotPlan, resolveVideoBrief, selectedCharacterIds, VideoBriefInputSchema, VideoType } from "./video-brief";

const productId = "00000000-0000-4000-8000-000000000001";

function input(overrides: Record<string, unknown> = {}) {
  return VideoBriefInputSchema.parse({
    video_type: VideoType.CharacterPunch,
    title: "Test brief",
    character_id: "actor-1",
    ...overrides,
  });
}

function fails(overrides: Record<string, unknown>, message: RegExp) {
  assert.throws(() => resolveVideoBrief(input(overrides)), message);
}

test("intake validation matrix rejects missing actor/product/type-specific inputs", () => {
  fails({ character_id: undefined }, /character id is required/i);
  fails({ video_type: VideoType.CharacterReel, character_id: undefined }, /character id is required/i);
  fails({ video_type: VideoType.Episode, character_id: undefined, character_ids: undefined }, /character ids is required/i);
  fails({ video_type: VideoType.UgcAd, character_id: undefined, product_id: productId, persona_style: "casual", hook_text: "Try this", cta_text: "Shop now", platform: "reels" }, /character id is required/i);
  fails({ video_type: VideoType.UgcAd, product_id: undefined, persona_style: "casual", hook_text: "Try this", cta_text: "Shop now", platform: "reels" }, /requires a product/i);
  fails({ video_type: VideoType.UgcAd, product_id: productId, persona_style: "casual", hook_text: undefined, cta_text: "Shop now", platform: "reels" }, /hook text is required/i);
  fails({ video_type: VideoType.UgcAd, product_id: productId, persona_style: "casual", hook_text: "Try this", cta_text: undefined, platform: "reels" }, /cta text is required/i);
  fails({ video_type: VideoType.UgcAd, product_id: productId, persona_style: "casual", hook_text: "Try this", cta_text: "Shop now", platform: undefined }, /platform is required/i);
  fails({ video_type: VideoType.BrandSpot, product_id: undefined, narrative_beat: "ritual" }, /requires a product/i);
  fails({ video_type: VideoType.BrandSpot, character_id: undefined, product_id: productId, narrative_beat: "ritual" }, /character id is required/i);
  fails({ video_type: VideoType.ProductHero, product_id: productId, character_id: "actor-1" }, /product-only/i);
});

test("type defaults and UGC duration map to typed shot counts", () => {
  const reel = resolveVideoBrief(input({ video_type: VideoType.CharacterReel }));
  assert.equal(reel.duration_seconds, 15);
  assert.equal(reel.shot_count, 3);
  assert.equal(reel.aspect_ratio, "9:16");

  const ugc = resolveVideoBrief(input({
    video_type: VideoType.UgcAd,
    product_id: productId,
    persona_style: "expert",
    hook_text: "Watch this",
    cta_text: "Learn more",
    platform: "shorts",
    duration_seconds: 25,
  }));
  assert.equal(ugc.shot_count, 5);
  assert.equal(ugc.aspect_ratio, "9:16");
});

test("Brand Spot uses the eight-slot house board with product only at the pivot and close", () => {
  const brand = resolveVideoBrief(VideoBriefInputSchema.parse({
    video_type: VideoType.BrandSpot,
    title: "House board",
    character_id: "character-1",
    product_id: productId,
    narrative_beat: "ritual",
  }));
  const plan = buildTypedShotPlan(brand);
  assert.equal(brand.shot_count, 8);
  assert.equal(plan.length, 8);
  assert.match(plan[3].visualAction, /product appears for the first time/i);
  assert.match(plan[7].visualAction, /product lockup/i);
  assert.ok(plan.filter((shot, index) => ![3, 7].includes(index)).every((shot) => /without showing the product/i.test(shot.visualAction)));
});

test("episode preserves a full cast while supporting the legacy singular actor", () => {
  const ensemble = input({ video_type: VideoType.Episode, character_id: undefined, character_ids: ["actor-1", "actor-2"] });
  assert.deepEqual(selectedCharacterIds(ensemble), ["actor-1", "actor-2"]);
  assert.deepEqual(resolveVideoBrief(ensemble).character_ids, ["actor-1", "actor-2"]);

  const legacy = input({ video_type: VideoType.Episode, character_ids: undefined, character_id: "actor-1" });
  assert.deepEqual(resolveVideoBrief(legacy).character_ids, ["actor-1"]);
});

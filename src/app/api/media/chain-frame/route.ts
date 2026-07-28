import { extractStoredVideoLastFrame } from "@/lib/server/ad-board-media";
import { requireOwnedCharacter, requireOwnedPipelineRun, requireRequestIdentity } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import {
  assertRequestBodySize,
  enforceRateLimit,
  securityErrorStatus,
} from "@/lib/server/request-security";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    assertRequestBodySize(request, 32 * 1024);
    const identity = await requireRequestIdentity(request);
    const input = await request.json() as Record<string, unknown>;
    const characterId = typeof input.characterId === "string" ? input.characterId.trim() : "";
    const runId = typeof input.runId === "string" ? input.runId.trim() : "";
    const sourceUrl = typeof input.sourceUrl === "string" ? input.sourceUrl.trim() : "";
    const sourceAssetId = typeof input.sourceAssetId === "string" ? input.sourceAssetId.trim() : "";
    const sourceSlotId = typeof input.sourceSlotId === "string" ? input.sourceSlotId.trim() : "";
    const targetSlotId = typeof input.targetSlotId === "string" ? input.targetSlotId.trim() : "";
    if (!characterId || !runId || !sourceUrl || !sourceAssetId || !sourceSlotId || !targetSlotId) {
      throw new Error("Pipeline, character, source clip, source asset, and chain slot IDs are required.");
    }
    await Promise.all([
      requireOwnedCharacter(identity, characterId),
      requireOwnedPipelineRun(identity, runId),
    ]);
    const sourceAsset = await getSupabaseAdminClient()
      .from("media_assets")
      .select("id,url,kind")
      .eq("id", sourceAssetId)
      .maybeSingle();
    if (sourceAsset.error) throw new Error(`Check chain source: ${sourceAsset.error.message}`);
    if (!sourceAsset.data || sourceAsset.data.url !== sourceUrl || sourceAsset.data.kind !== "video") {
      throw new Error("The chain source does not match a registered Chaplin video asset.");
    }
    if (identity.role !== "admin") {
      await enforceRateLimit({
        request,
        bucket: "chain-frame",
        limit: 40,
        windowSeconds: 24 * 60 * 60,
        identityId: identity.id,
      });
    }
    const asset = await extractStoredVideoLastFrame({
      characterId,
      sourceUrl,
      sourceAssetId,
      targetSlotId,
      metadata: { runId, chainedFromSlotId: sourceSlotId, pipeline: "direction-safety" },
    });
    return Response.json({ url: asset.url, assetId: asset.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not extract the chain frame.";
    return Response.json({ error: message }, { status: securityErrorStatus(error, 400) });
  }
}

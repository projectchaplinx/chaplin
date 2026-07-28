import {
  adBoardSchema,
  applyVoiceTimings,
  assertAdSlotQueueable,
  createAdBoard,
  lintAdBoard,
  promoteSlotToFinal,
  reanchorOverdeepChains,
} from "@/lib/ad-board";
import { extractChainLastFrame, measureStoredAudioMs } from "@/lib/server/ad-board-media";
import { requireOwnedCharacter, requireRequestIdentity } from "@/lib/server/auth";
import {
  assertRequestBodySize,
  enforceRateLimit,
  securityErrorStatus,
} from "@/lib/server/request-security";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    assertRequestBodySize(request, 1024 * 1024);
    const identity = await requireRequestIdentity(request);
    const input = await request.json() as Record<string, unknown>;
    const characterId = typeof input.characterId === "string" ? input.characterId.trim() : "";
    if (!characterId) throw new Error("Character ID is required.");
    await requireOwnedCharacter(identity, characterId);
    if (identity.role !== "admin") {
      await enforceRateLimit({
        request,
        bucket: "ad-board",
        limit: 120,
        windowSeconds: 60 * 60,
        identityId: identity.id,
      });
    }
    const action = input.action;
    if (action === "create") {
      return Response.json({
        board: createAdBoard({
          arcTemplate: input.arcTemplate === "journey_delivery" ? "journey_delivery" : "problem_solution",
          mode: input.mode === "functional_explainer" ? "functional_explainer" : "emotional_counterpoint",
          canonicalReferenceAsset: String(input.canonicalReferenceAsset ?? ""),
          identityBlock: String(input.identityBlock ?? ""),
          wardrobeState: String(input.wardrobeState ?? ""),
          ageState: String(input.ageState ?? ""),
          productId: typeof input.productId === "string" ? input.productId : null,
        }),
      }, { status: 201 });
    }

    const board = adBoardSchema.parse(input.board);
    if (action === "validate") {
      const controlled = reanchorOverdeepChains(board);
      return Response.json({ board: controlled, issues: lintAdBoard(controlled) });
    }
    if (action === "prepare-timing") {
      const measured = Object.fromEntries(await Promise.all(board.slots.map(async (slot) => [
        slot.id,
        slot.vo_line && slot.dialogue_url ? await measureStoredAudioMs(slot.dialogue_url) : null,
      ])));
      const timed = applyVoiceTimings(board, measured);
      return Response.json({ board: timed, measuredAudioMs: measured, issues: lintAdBoard(timed) });
    }
    if (action === "prepare-voice") {
      const generationUrl = new URL("/api/generate", request.url);
      const authHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        Origin: new URL(request.url).origin,
      };
      const cookie = request.headers.get("cookie");
      const authorization = request.headers.get("authorization");
      if (cookie) authHeaders.Cookie = cookie;
      if (authorization) authHeaders.Authorization = authorization;
      const preparedSlots = [];
      const measuredAudioMs: Record<string, number | null> = {};
      for (const slot of board.slots) {
        if (!slot.vo_line) {
          preparedSlots.push({ ...slot, dialogue_asset_id: null, dialogue_url: null });
          measuredAudioMs[slot.id] = null;
          continue;
        }
        const response = await fetch(generationUrl, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            action: "speech",
            characterId,
            speechText: slot.vo_line,
          }),
          cache: "no-store",
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(failure?.error ?? `Voice generation failed for ${slot.id}.`);
        }
        await response.arrayBuffer();
        const dialogueUrl = response.headers.get("x-asset-url");
        const dialogueAssetId = response.headers.get("x-asset-id");
        if (!dialogueUrl || !dialogueAssetId) {
          throw new Error(`Voice generation for ${slot.id} returned no persisted asset.`);
        }
        measuredAudioMs[slot.id] = await measureStoredAudioMs(dialogueUrl);
        preparedSlots.push({
          ...slot,
          dialogue_asset_id: dialogueAssetId,
          dialogue_url: dialogueUrl,
        });
      }
      const voiced = adBoardSchema.parse({ ...board, slots: preparedSlots });
      const timed = applyVoiceTimings(voiced, measuredAudioMs);
      return Response.json({ board: timed, measuredAudioMs, issues: lintAdBoard(timed) });
    }
    if (action === "promote") {
      const slotId = String(input.slotId ?? "");
      return Response.json({ board: promoteSlotToFinal(board, slotId) });
    }
    if (action === "extract-chain-frame") {
      const slotId = String(input.slotId ?? "");
      assertAdSlotQueueable(board, slotId);
      const target = board.slots.find((slot) => slot.id === slotId);
      if (!target || target.motion.mode !== "chain") throw new Error("Choose a chain-mode slot.");
      const fromSlotId = target.motion.from_slot_id;
      const source = board.slots.find((slot) => slot.id === fromSlotId);
      if (!source) throw new Error("Chain source slot was not found.");
      const asset = await extractChainLastFrame({ characterId, sourceSlot: source, targetSlot: target });
      return Response.json({ assetId: asset.id, url: asset.url });
    }
    throw new Error("Unknown ad-board action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ad-board operation failed.";
    return Response.json(
      { error: message },
      { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 400) },
    );
  }
}

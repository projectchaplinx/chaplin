import { measureIdentity } from "@/lib/server/identity-instrument";
import { getCharacterProductionState } from "@/lib/server/supabase-admin";
import { requireOwnedCharacter, requireRequestIdentity } from "@/lib/server/auth";
import {
  assertRequestBodySize,
  enforceRateLimit,
  securityErrorStatus,
} from "@/lib/server/request-security";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Scores one rendered clip against the actor's canonical reference.
 *
 * Called fire-and-forget after each shot and after assembly. A failure here
 * never fails a render — the clip simply goes unmeasured and the response
 * says so.
 */
export async function POST(request: Request) {
  try {
    assertRequestBodySize(request, 64 * 1024);
    const identity = await requireRequestIdentity(request);
    const input = await request.json() as Record<string, unknown>;
    const characterId = typeof input.characterId === "string" ? input.characterId : "";
    const videoUrl = typeof input.videoUrl === "string" ? input.videoUrl : "";
    if (!characterId || !videoUrl) throw new Error("A character and a rendered clip URL are required.");
    await requireOwnedCharacter(identity, characterId);
    if (identity.role !== "admin") {
      await enforceRateLimit({
        request,
        bucket: "identity-score",
        limit: 60,
        windowSeconds: 24 * 60 * 60,
        identityId: identity.id,
      });
    }
    const production = await getCharacterProductionState(characterId);
    const canonical = production.visualReference?.url;
    if (!canonical) throw new Error("The actor has no canonical reference to measure against.");
    const measurement = await measureIdentity({
      videoUrl,
      canonicalReferenceUrl: canonical,
      characterId,
      durationSeconds: Number(input.durationSeconds) || 5,
      generationJobId: typeof input.generationJobId === "string" ? input.generationJobId : null,
      pipelineRunId: typeof input.pipelineRunId === "string" ? input.pipelineRunId : null,
      outputAssetId: typeof input.assetId === "string" ? input.assetId : null,
      label: typeof input.label === "string" ? input.label.slice(0, 120) : undefined,
    });
    return Response.json({ measured: true, ...measurement });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Identity measurement failed.";
    return Response.json(
      { measured: false, error: message },
      { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 500) },
    );
  }
}

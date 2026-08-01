import type { NextRequest } from "next/server";
import { requireAdminIdentity } from "@/lib/server/auth";
import {
  authorizeDirectorSprintTwoOutput,
  initializeDirectorSprintTwo,
  listDirectorSprintTwo,
  mixDirectorSprintTwoOutputs,
  recordDirectorSprintTwoOutput,
  renderDirectorSprintTwoVoice,
} from "@/lib/server/director-sprint-two";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdminIdentity(request);
    return Response.json(await listDirectorSprintTwo());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Sprint 2.";
    return Response.json({ error: message }, { status: /sign in/i.test(message) ? 401 : /Super Admin/i.test(message) ? 403 : 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requireAdminIdentity(request);
    const input = await request.json() as {
      action?: unknown;
      runId?: unknown;
      characterId?: unknown;
      variantId?: unknown;
      durationSeconds?: unknown;
      shotIndex?: unknown;
    };
    if (input.action === "render-voice") {
      const runId = typeof input.runId === "string" ? input.runId.trim() : "";
      if (!runId) throw new Error("Sprint 2 run is required.");
      return Response.json(await renderDirectorSprintTwoVoice(runId));
    }
    if (input.action === "mix-final-outputs") {
      const runId = typeof input.runId === "string" ? input.runId.trim() : "";
      if (!runId) throw new Error("Sprint 2 run is required.");
      return Response.json(await mixDirectorSprintTwoOutputs(runId));
    }
    if (input.action === "generate-keyframe" || input.action === "generate-video-shot") {
      const startedAt = Date.now();
      const runId = typeof input.runId === "string" ? input.runId.trim() : "";
      const variantId = typeof input.variantId === "string" ? input.variantId.trim() : "";
      const kind = input.action === "generate-keyframe" ? "keyframe" : "video-shot";
      const durationSeconds = Number(input.durationSeconds) === 15 ? 15 : 5;
      const shotIndex = kind === "keyframe" ? 0 : Number(input.shotIndex);
      if (!runId || !variantId || (kind === "video-shot" && ![1, 2, 3].includes(shotIndex))) {
        throw new Error("A valid immutable output slot is required.");
      }
      const grant = await authorizeDirectorSprintTwoOutput({
        runId, variantId, kind, durationSeconds, shotIndex,
      });
      const usesLockedVoice = kind === "video-shot"
        && (durationSeconds === 5 || shotIndex === 2);
      const generationBody = kind === "keyframe"
        ? {
            action: "image",
            characterId: grant.characterId,
            prompt: grant.prompt,
            imagePurpose: "sprint-test",
            referenceImage: grant.referenceImage,
          }
        : {
            action: "video",
            characterId: grant.characterId,
            prompt: grant.prompt,
            durationSeconds: 5,
            referenceImage: grant.referenceImage,
            referenceAudio: usesLockedVoice ? grant.voiceUrl : "",
            dialogueText: usesLockedVoice ? grant.lockedLine : "",
            audioPlan: {
              ambience: grant.audioPlan.ambience,
              sfxMoments: [
                { description: `Train brake. ${grant.audioPlan.sfx}`, atSeconds: 1.2 },
                { description: `Ticket and footstep. ${grant.audioPlan.sfx}`, atSeconds: 3.4 },
              ],
            },
          };
      const headers = new Headers({ "content-type": "application/json" });
      const authorization = request.headers.get("authorization");
      const cookie = request.headers.get("cookie");
      if (authorization) headers.set("authorization", authorization);
      if (cookie) headers.set("cookie", cookie);
      const generated = await fetch(new URL("/api/generate", request.url), {
        method: "POST", headers, body: JSON.stringify(generationBody),
      });
      const data = await generated.json() as Record<string, unknown>;
      const provider = typeof data.provider === "string" ? data.provider : kind === "keyframe" ? "configured-image-provider" : "configured-video-provider";
      const model = typeof data.model === "string" ? data.model : "pipeline-model";
      if (!generated.ok) {
        await recordDirectorSprintTwoOutput({
          runId, variantId, kind, durationSeconds, shotIndex, status: "failed",
          provider, model, voicePath: kind === "video-shot" ? "failed" : null,
          prompt: grant.prompt, whatChanged: grant.variant.whatChanged,
          handoff: grant.handoff, latencyMs: Date.now() - startedAt,
          error: typeof data.error === "string" ? data.error : "Provider generation failed.",
        });
        throw new Error(typeof data.error === "string" ? data.error : "Provider generation failed.");
      }
      await recordDirectorSprintTwoOutput({
        runId, variantId, kind, durationSeconds, shotIndex, status: "succeeded",
        assetId: typeof data.assetId === "string" ? data.assetId : null,
        provider, model,
        voicePath: kind === "video-shot"
          ? data.voicePath === "A-native-reference" ? "A-native-reference" : "B-post-mix"
          : null,
        voiceRenderId: kind === "video-shot" ? grant.voiceRenderId : null,
        prompt: grant.prompt, whatChanged: grant.variant.whatChanged,
        handoff: grant.handoff, metadata: { taskId: data.taskId ?? null, nativeAudioRequested: data.nativeAudioRequested ?? false },
        providerRequestId: typeof data.taskId === "string" ? data.taskId : null,
        latencyMs: Date.now() - startedAt,
      });
      return Response.json(await listDirectorSprintTwo());
    }
    const characterId = typeof input.characterId === "string" ? input.characterId.trim() : "";
    if (!characterId) throw new Error("Choose one actor for the controlled comparison.");
    return Response.json(await initializeDirectorSprintTwo({ characterId, createdBy: identity.id }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not initialize Sprint 2.";
    return Response.json({ error: message }, { status: /sign in/i.test(message) ? 401 : /Super Admin/i.test(message) ? 403 : 400 });
  }
}

import { requireRequestIdentity } from "@/lib/server/auth";
import { calculateGenerationBilling } from "@/lib/server/billing";
import { beginGeneration, completeGeneration, failGeneration } from "@/lib/server/supabase-admin";
import {
  assertRequestBodySize,
  enforceRateLimit,
  securityErrorStatus,
} from "@/lib/server/request-security";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_CONCIERGE_VOICE_ID = "xMagNCpMgZ83QOEsHNre";
const CONCIERGE_MODEL = "eleven_flash_v2_5";

export async function POST(request: Request) {
  let jobId: string | null = null;
  try {
    assertRequestBodySize(request, 16 * 1024);
    const identity = await requireRequestIdentity(request);
    await enforceRateLimit({
      request,
      bucket: "concierge-speech",
      limit: 60,
      windowSeconds: 60 * 60,
      identityId: identity.id,
    });
    const apiKey = process.env.ELEVENLABS_API_KEY ?? process.env.ELEVEN_LABS_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "ElevenLabs speech is not configured." }, { status: 503 });
    }

  const input = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const text = typeof input.text === "string" ? input.text.trim().slice(0, 320) : "";
  if (!text) {
    return Response.json({ error: "Speech text is required." }, { status: 400 });
  }

  const voiceId = process.env.CHAPLIN_ELEVENLABS_VOICE_ID ?? DEFAULT_CONCIERGE_VOICE_ID;
  jobId = await beginGeneration({
    kind: "dialogue",
    provider: "elevenlabs",
    model: CONCIERGE_MODEL,
    prompt: text,
    metadata: {
      userId: identity.id,
      creditActionCode: "dialogue.take",
      creditAllocation: 1,
      creditBilling: "included",
      surface: "concierge",
    },
  });
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: CONCIERGE_MODEL,
        language_code: "en",
        voice_settings: {
          stability: 0.42,
          similarity_boost: 0.82,
          style: 0.34,
          use_speaker_boost: true,
          speed: 0.98,
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok || !response.body) {
    const detail = await response.text();
    console.warn(`[concierge] ElevenLabs speech failed (${response.status}): ${detail.slice(0, 240)}`);
    if (jobId) await failGeneration(jobId, `ElevenLabs speech failed (${response.status}): ${detail.slice(0, 500)}`);
    return Response.json({ error: "Natural voice is temporarily unavailable." }, { status: 502 });
  }
  await completeGeneration(
    jobId,
    undefined,
    { surface: "concierge" },
    await calculateGenerationBilling({
      kind: "dialogue",
      usage: {
        inputCharacters: text.length,
        providerCredits: Number(response.headers.get("character-cost") ?? text.length),
      },
    }),
    response.headers.get("request-id"),
  );

    return new Response(response.body, {
      status: 200,
      headers: {
        "content-type": response.headers.get("content-type") ?? "audio/mpeg",
        "cache-control": "no-store",
        "x-chaplin-voice-model": CONCIERGE_MODEL,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech request failed.";
    if (jobId) await failGeneration(jobId, message);
    return Response.json(
      { error: message },
      { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 400) },
    );
  }
}

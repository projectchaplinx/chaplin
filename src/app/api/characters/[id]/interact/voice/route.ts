import { listCharacters } from "@/lib/server/supabase-admin";
import { elevenLabsApiKey } from "@/lib/elevenlabs-config";
import {
  assertMutationOrigin,
  assertRequestBodySize,
  enforceRateLimit,
  securityErrorStatus,
} from "@/lib/server/request-security";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertMutationOrigin(request);
    assertRequestBodySize(request, 16 * 1024);
    const { id } = await context.params;
    await enforceRateLimit({
      request,
      bucket: `public-character-voice:${id}`,
      limit: 10,
      windowSeconds: 60 * 60,
    });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 700) : "";
    if (!text) return Response.json({ error: "A reply is required." }, { status: 400 });

  const apiKey = elevenLabsApiKey();
  if (!apiKey) return Response.json({ error: "Voice playback is not configured." }, { status: 503 });

  let character;
  try {
    character = (await listCharacters()).find((item) => item.id === id);
  } catch {
    return Response.json({ error: "The actor could not be reached right now." }, { status: 503 });
  }
  if (!character?.voiceId) return Response.json({ error: "Lock this actor’s voice before playing a live reply." }, { status: 412 });

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(character.voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        voice_settings: { stability: 0.48, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
      }),
      cache: "no-store",
    },
  );
  if (!response.ok || !response.body) {
    /*
      The provider's reason was swallowed behind one generic message, so a voice
      that simply does not exist on this account looked identical to a network
      blip and took a database query to identify.

      ElevenLabs voices belong to the account that created them. Swapping the
      API key therefore orphans every locked voice designed under the old one,
      which is the failure this most often is.
    */
    const detail = await response.text().catch(() => "");
    const orphaned = response.status === 404
      || /voice_not_found|does not exist|not found/i.test(detail);
    return Response.json({
      error: orphaned
        ? `${character.name}'s locked voice does not exist on the current ElevenLabs account. Voices belong to the account that created them, so re-lock this actor's voice to restore playback.`
        : `Live voice playback failed (${response.status}). ${detail.slice(0, 200)}`.trim(),
    }, { status: orphaned ? 409 : 502 });
  }

    return new Response(response.body, {
      headers: { "content-type": response.headers.get("content-type") ?? "audio/mpeg", "cache-control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Voice interaction failed." },
      { status: securityErrorStatus(error, 400) },
    );
  }
}

import { requireAdminIdentity } from "@/lib/server/auth";
import { deleteElevenLabsVoice, listElevenLabsGeneratedVoices } from "@/lib/server/elevenlabs";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import {
  assertRequestBodySize,
  securityErrorStatus,
} from "@/lib/server/request-security";

export const runtime = "nodejs";

async function voiceInventory() {
  const supabase = getSupabaseAdminClient();
  const [providerVoices, registrations, characters] = await Promise.all([
    listElevenLabsGeneratedVoices(),
    supabase
      .from("character_voices")
      .select("character_id,provider_voice_id,status")
      .eq("provider", "elevenlabs"),
    supabase.from("characters").select("id,name"),
  ]);
  if (registrations.error) throw new Error(`Load voice registrations: ${registrations.error.message}`);
  if (characters.error) throw new Error(`Load voice actors: ${characters.error.message}`);

  const characterNames = new Map((characters.data ?? []).map((character) => [character.id, character.name]));
  const byVoiceId = new Map<string, typeof registrations.data>();
  for (const registration of registrations.data ?? []) {
    byVoiceId.set(
      registration.provider_voice_id,
      [...(byVoiceId.get(registration.provider_voice_id) ?? []), registration],
    );
  }
  return providerVoices.map((voice) => {
    const voiceRegistrations = byVoiceId.get(voice.voice_id) ?? [];
    const registration =
      voiceRegistrations.find((candidate) => candidate.status === "active")
      ?? voiceRegistrations[0];
    const characterId = registration?.character_id ?? voice.labels?.character_id ?? null;
    return {
      voiceId: voice.voice_id,
      name: voice.name || "Unnamed generated voice",
      characterId,
      characterName: characterId ? characterNames.get(characterId) ?? null : null,
      active: voiceRegistrations.some((candidate) => candidate.status === "active"),
      tracked: voiceRegistrations.length > 0,
      project: voice.labels?.project ?? null,
      createdAtUnix: voice.created_at_unix ?? null,
    };
  });
}

export async function GET(request: Request) {
  try {
    await requireAdminIdentity(request);
    const voices = await voiceInventory();
    return Response.json({
      voices,
      total: voices.length,
      active: voices.filter((voice) => voice.active).length,
      reclaimable: voices.filter((voice) => !voice.active).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load ElevenLabs voices.";
    return Response.json(
      { error: message },
      { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 400) },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    assertRequestBodySize(request, 8 * 1024);
    await requireAdminIdentity(request);
    const body = await request.json() as { voiceId?: unknown; confirmation?: unknown };
    const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim() : "";
    const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim() : "";
    if (!voiceId || confirmation !== voiceId) {
      throw new Error("Confirm the exact Voice ID before permanent deletion.");
    }

    const inventory = await voiceInventory();
    const voice = inventory.find((candidate) => candidate.voiceId === voiceId);
    if (!voice) throw new Error("That generated voice no longer exists on this ElevenLabs account.");
    if (voice.active) {
      throw new Error("This voice is actively locked to an actor. Delete that actor or lock a replacement first.");
    }

    await deleteElevenLabsVoice(voiceId);
    const supabase = getSupabaseAdminClient();
    const registrations = await supabase
      .from("character_voices")
      .delete()
      .eq("provider", "elevenlabs")
      .eq("provider_voice_id", voiceId)
      .neq("status", "active");
    if (registrations.error) throw new Error(`Remove stale voice registration: ${registrations.error.message}`);

    return Response.json({
      deleted: true,
      voiceId,
      message: `${voice.name} was deleted from ElevenLabs and one custom-voice slot is now free.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete this voice.";
    return Response.json(
      { error: message },
      {
        status: securityErrorStatus(
          error,
          message === "Sign in to continue." ? 401 : /no longer exists/i.test(message) ? 404 : 400,
        ),
      },
    );
  }
}

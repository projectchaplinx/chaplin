import "server-only";

import { deletableCharacterVoices } from "@/lib/elevenlabs-voices";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { deleteElevenLabsVoice, listElevenLabsGeneratedVoices } from "@/lib/server/elevenlabs";

export type CharacterDeletionReport = {
  characterId: string;
  characterName: string;
  deletedVoiceIds: string[];
  protectedSharedVoiceIds: string[];
  unavailableVoiceIds: string[];
  deletedStorageObjects: number;
  deletedVideoBriefs: number;
  deletedSeriesMemberships: number;
  deletedPipelineRuns: number;
  auditRecorded: boolean;
};

function assert(error: { message: string } | null, label: string) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function deleteCharacterCompletely(input: {
  characterId: string;
  confirmation: string;
  deletedBy: string;
}): Promise<CharacterDeletionReport> {
  const supabase = getSupabaseAdminClient();
  const character = await supabase
    .from("characters")
    .select("id,name")
    .eq("id", input.characterId)
    .maybeSingle();
  assert(character.error, "Load AI actor for deletion");
  if (!character.data) throw new Error("This AI actor no longer exists.");
  if (input.confirmation !== character.data.name) {
    throw new Error(`Type ${character.data.name} exactly to confirm permanent deletion.`);
  }

  const [voiceRows, assetRows, actorPipelineRuns, castEpisodeShots] = await Promise.all([
    supabase
      .from("character_voices")
      .select("provider_voice_id,provider")
      .eq("character_id", input.characterId),
    supabase
      .from("media_assets")
      .select("storage_path")
      .eq("character_id", input.characterId)
      .not("storage_path", "is", null),
    supabase
      .from("media_pipeline_runs")
      .select("id")
      .eq("scope_type", "actor")
      .eq("scope_id", input.characterId),
    supabase
      .from("episode_shots")
      .select("id,cast_character_ids")
      .contains("cast_character_ids", [input.characterId]),
  ]);
  assert(voiceRows.error, "Load AI actor voices");
  assert(assetRows.error, "Load AI actor media");
  assert(actorPipelineRuns.error, "Load AI actor pipeline runs");
  assert(castEpisodeShots.error, "Load cast shot references");

  const registeredVoiceIds = new Set(
    (voiceRows.data ?? [])
      .filter((voice) => voice.provider === "elevenlabs")
      .map((voice) => voice.provider_voice_id)
      .filter((voiceId): voiceId is string => Boolean(voiceId)),
  );
  const shared = await supabase
    .from("character_voices")
    .select("provider_voice_id")
    .eq("provider", "elevenlabs")
    .eq("status", "active")
    .neq("character_id", input.characterId);
  assert(shared.error, "Check shared character voices");
  const sharedVoiceIds = new Set((shared.data ?? []).map((row) => row.provider_voice_id));

  const providerVoices = await listElevenLabsGeneratedVoices();
  const deletableVoices = deletableCharacterVoices(
    providerVoices,
    input.characterId,
    registeredVoiceIds,
    sharedVoiceIds,
  );
  for (const voice of deletableVoices) {
    await deleteElevenLabsVoice(voice.voice_id);
  }
  const providerVoiceIds = new Set(providerVoices.map((voice) => voice.voice_id));
  const unavailableVoiceIds = [...registeredVoiceIds].filter(
    (voiceId) => !providerVoiceIds.has(voiceId) && !sharedVoiceIds.has(voiceId),
  );

  const storagePaths = [
    ...new Set(
      (assetRows.data ?? [])
        .map((asset) => asset.storage_path)
        .filter((path): path is string => Boolean(path)),
    ),
  ];
  if (storagePaths.length) {
    const storage = await supabase.storage.from("character-media").remove(storagePaths);
    assert(storage.error, "Remove AI actor media");
  }

  for (const shot of castEpisodeShots.data ?? []) {
    const cast = Array.isArray(shot.cast_character_ids)
      ? shot.cast_character_ids.filter((id): id is string => typeof id === "string" && id !== input.characterId)
      : [];
    const update = await supabase
      .from("episode_shots")
      .update({ cast_character_ids: cast, updated_at: new Date().toISOString() })
      .eq("id", shot.id);
    assert(update.error, "Remove AI actor from shot cast");
  }

  const [briefs, memberships, runs] = await Promise.all([
    supabase.from("video_briefs").delete({ count: "exact" }).eq("character_id", input.characterId),
    supabase.from("series_cast").delete({ count: "exact" }).eq("character_id", input.characterId),
    supabase
      .from("media_pipeline_runs")
      .delete({ count: "exact" })
      .eq("scope_type", "actor")
      .eq("scope_id", input.characterId),
  ]);
  assert(briefs.error, "Remove AI actor video briefs");
  assert(memberships.error, "Remove AI actor series memberships");
  assert(runs.error, "Remove AI actor pipeline runs");

  const deleted = await supabase
    .from("characters")
    .delete()
    .eq("id", input.characterId)
    .select("id")
    .maybeSingle();
  assert(deleted.error, "Remove AI actor");
  if (!deleted.data) throw new Error("The AI actor could not be deleted.");

  const report: CharacterDeletionReport = {
    characterId: input.characterId,
    characterName: character.data.name,
    deletedVoiceIds: deletableVoices.map((voice) => voice.voice_id),
    protectedSharedVoiceIds: [...sharedVoiceIds],
    unavailableVoiceIds,
    deletedStorageObjects: storagePaths.length,
    deletedVideoBriefs: briefs.count ?? 0,
    deletedSeriesMemberships: memberships.count ?? 0,
    deletedPipelineRuns: runs.count ?? 0,
    auditRecorded: false,
  };

  const now = new Date().toISOString();
  const audit = await supabase.from("generation_jobs").insert({
    character_id: null,
    kind: "character-delete",
    provider: "chaplin",
    model: "admin-cleanup-v1",
    status: "succeeded",
    prompt: `Permanently delete AI actor ${character.data.name}.`,
    metadata: { ...report, deletedBy: input.deletedBy },
    started_at: now,
    completed_at: now,
  });
  report.auditRecorded = !audit.error;
  return report;
}

import "server-only";

import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

export type AdminAssetDeletionReport = {
  assetId: string;
  characterId: string;
  characterName: string;
  kind: string;
  url: string;
  deletedStorageObject: boolean;
  deletedFeedPosts: number;
};

function assert(error: { message: string } | null, label: string) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function deleteCharacterAsset(input: {
  characterId: string;
  assetId: string;
  confirmation: string;
  deletedBy: string;
}): Promise<AdminAssetDeletionReport> {
  if (input.confirmation !== input.assetId) {
    throw new Error("Confirm the exact file before permanent deletion.");
  }

  const supabase = getSupabaseAdminClient();
  const [character, asset] = await Promise.all([
    supabase
      .from("characters")
      .select("id,name,image_url,banner_url")
      .eq("id", input.characterId)
      .maybeSingle(),
    supabase
      .from("media_assets")
      .select("id,character_id,kind,url,storage_path")
      .eq("id", input.assetId)
      .eq("character_id", input.characterId)
      .maybeSingle(),
  ]);
  assert(character.error, "Load AI actor");
  assert(asset.error, "Load character file");
  if (!character.data) throw new Error("This AI actor no longer exists.");
  if (!asset.data) throw new Error("This character file no longer exists.");

  /*
    Remove the storage object before its database row. Foreign keys clear their
    own asset references on row deletion, while these URL fields are not foreign
    keys and must be cleared explicitly to avoid a broken cover or voice preview.
  */
  let deletedStorageObject = false;
  if (asset.data.storage_path) {
    const storage = await supabase.storage
      .from("character-media")
      .remove([asset.data.storage_path]);
    assert(storage.error, "Remove character file from storage");
    deletedStorageObject = true;
  }

  const characterPatch: Record<string, string | null> = {
    updated_at: new Date().toISOString(),
  };
  if (character.data.image_url === asset.data.url) characterPatch.image_url = null;
  if (character.data.banner_url === asset.data.url) characterPatch.banner_url = null;
  if (Object.keys(characterPatch).length > 1) {
    const clearedCharacter = await supabase
      .from("characters")
      .update(characterPatch)
      .eq("id", input.characterId);
    assert(clearedCharacter.error, "Clear character file references");
  }

  const [feedPosts, voicePreviews] = await Promise.all([
    supabase
      .from("feed_posts")
      .delete({ count: "exact" })
      .eq("source_asset_id", input.assetId),
    supabase
      .from("character_voices")
      .update({ preview_url: null, updated_at: new Date().toISOString() })
      .eq("character_id", input.characterId)
      .eq("preview_url", asset.data.url),
  ]);
  assert(feedPosts.error, "Remove feed posts for character file");
  assert(voicePreviews.error, "Clear character voice preview");

  const deleted = await supabase
    .from("media_assets")
    .delete()
    .eq("id", input.assetId)
    .eq("character_id", input.characterId)
    .select("id")
    .maybeSingle();
  assert(deleted.error, "Remove character file record");
  if (!deleted.data) throw new Error("The character file could not be deleted.");

  const report: AdminAssetDeletionReport = {
    assetId: input.assetId,
    characterId: input.characterId,
    characterName: character.data.name,
    kind: asset.data.kind,
    url: asset.data.url,
    deletedStorageObject,
    deletedFeedPosts: feedPosts.count ?? 0,
  };

  const now = new Date().toISOString();
  const audit = await supabase.from("generation_jobs").insert({
    character_id: input.characterId,
    kind: "asset-delete",
    provider: "chaplin",
    model: "admin-cleanup-v1",
    status: "succeeded",
    prompt: `Permanently delete ${asset.data.kind} file from ${character.data.name}.`,
    metadata: { ...report, deletedBy: input.deletedBy },
    started_at: now,
    completed_at: now,
  });
  if (audit.error) {
    console.warn("Record character file deletion:", audit.error.message);
  }

  return report;
}

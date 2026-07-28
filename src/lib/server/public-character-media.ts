import "server-only";

import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";

function assert(error: { message: string } | null, label: string) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function getPublicCharacterMedia(characterId: string) {
  const supabase = getSupabaseAdminClient();
  const [character, voice, assets] = await Promise.all([
    supabase
      .from("characters")
      .select("id,featured_voice_asset_id,featured_theme_asset_id,featured_video_asset_id")
      .eq("id", characterId)
      .maybeSingle(),
    supabase
      .from("character_voices")
      .select("provider_voice_id,preview_url")
      .eq("character_id", characterId)
      .eq("provider", "elevenlabs")
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("media_assets")
      .select("id,kind,url,duration_seconds,metadata,created_at")
      .eq("character_id", characterId)
      .in("kind", ["video", "dialogue", "sfx", "theme"])
      .order("created_at", { ascending: false }),
  ]);
  assert(character.error, "Load public AI actor");
  assert(voice.error, "Load public AI actor voice");
  assert(assets.error, "Load public AI actor media");
  if (!character.data) return null;

  const rows = assets.data ?? [];
  const byId = new Map(rows.map((asset) => [asset.id, asset]));
  const activeVoiceId = voice.data?.provider_voice_id ?? null;
  const featuredVideo = byId.get(character.data.featured_video_asset_id);
  const featuredDialogue = byId.get(character.data.featured_voice_asset_id);
  const featuredTheme = byId.get(character.data.featured_theme_asset_id);
  const latestDialogue = featuredDialogue ?? rows.find((asset) => {
    if (asset.kind !== "dialogue" || !activeVoiceId) return false;
    const metadata = asset.metadata as Record<string, unknown> | null;
    return metadata?.voiceId === activeVoiceId;
  });
  const latestSfx = rows.find((asset) => {
    if (asset.kind !== "sfx") return false;
    const metadata = asset.metadata as Record<string, unknown> | null;
    return metadata?.featuredSfx === true;
  }) ?? rows.find((asset) => asset.kind === "sfx");
  const latestTheme = featuredTheme ?? rows.find((asset) => asset.kind === "theme");
  const latestVideo = featuredVideo ?? rows.find((asset) => asset.kind === "video");
  const videos = rows
    .filter((asset) => asset.kind === "video")
    .map((asset) => {
      const metadata = asset.metadata as Record<string, unknown> | null;
      const outputType = typeof metadata?.outputType === "string" ? metadata.outputType : "";
      return {
        id: asset.id,
        url: asset.url,
        durationSeconds: asset.duration_seconds == null ? null : Number(asset.duration_seconds),
        label:
          outputType === "punch"
            ? "Punch master"
            : outputType === "spark"
              ? "Spark"
              : Number(asset.duration_seconds ?? 0) > 0 && Number(asset.duration_seconds) <= 5
                ? "Five-second scene"
                : "Performance video",
        createdAt: asset.created_at,
      };
    });

  return {
    latestVideoUrl: latestVideo?.url ?? null,
    voicePreviewUrl: voice.data?.preview_url ?? null,
    latestDialogueUrl: latestDialogue?.url ?? null,
    latestSfxUrl: latestSfx?.url ?? null,
    latestThemeUrl: latestTheme?.url ?? null,
    videos,
  };
}

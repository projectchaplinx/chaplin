import { requireAdminIdentity } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { normalizeHomepageCharacterIds } from "@/lib/admin-homepage";
import {
  assertRequestBodySize,
  securityErrorStatus,
} from "@/lib/server/request-security";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  try {
    assertRequestBodySize(request, 16 * 1024);
    await requireAdminIdentity(request);
    const body = await request.json() as { characterIds?: unknown };
    const characterIds = normalizeHomepageCharacterIds(body.characterIds);
    const supabase = getSupabaseAdminClient();

    const existingCharacters = await supabase
      .from("characters")
      .select("id")
      .in("id", characterIds);
    if (existingCharacters.error) {
      throw new Error(`Validate homepage characters: ${existingCharacters.error.message}`);
    }
    const existingIds = new Set((existingCharacters.data ?? []).map((character) => character.id));
    const missing = characterIds.filter((id) => !existingIds.has(id));
    if (missing.length) throw new Error("One or more selected characters no longer exist.");

    const now = new Date().toISOString();
    const slots = characterIds.map((characterId, index) => ({
      character_id: characterId,
      position: index + 1,
      status: "published",
      published_at: now,
      updated_at: now,
    }));
    const saved = await supabase
      .from("home_slots")
      .upsert(slots, { onConflict: "character_id" });
    if (saved.error) throw new Error(`Save homepage cast: ${saved.error.message}`);

    const previous = await supabase.from("home_slots").select("character_id");
    if (previous.error) throw new Error(`Load previous homepage cast: ${previous.error.message}`);
    const removedIds = (previous.data ?? [])
      .map((slot) => slot.character_id as string)
      .filter((id) => !existingIds.has(id));
    if (removedIds.length) {
      const removed = await supabase.from("home_slots").delete().in("character_id", removedIds);
      if (removed.error) throw new Error(`Remove homepage characters: ${removed.error.message}`);
    }

    return Response.json({
      saved: true,
      slots: slots.map((slot) => ({
        characterId: slot.character_id,
        position: slot.position,
      })),
      message: `${slots.length} character${slots.length === 1 ? "" : "s"} will now appear on the homepage.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the homepage cast.";
    return Response.json(
      { error: message },
      { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 400) },
    );
  }
}

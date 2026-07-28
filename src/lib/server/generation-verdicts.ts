import "server-only";
import { generationVerdictInputSchema, verdictStats, type GenerationVerdictInput } from "@/lib/generation-verdict";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import type { AuthIdentity } from "@/lib/server/auth";

export async function recordGenerationVerdict(raw: GenerationVerdictInput, identity: AuthIdentity) {
  const input = generationVerdictInputSchema.parse(raw);
  const supabase = getSupabaseAdminClient();
  const jobResult = input.job_id
    ? await supabase.from("generation_jobs").select("id,character_id,prompt,model,metadata,output_asset_id").eq("id", input.job_id).single()
    : await supabase.from("generation_jobs").select("id,character_id,prompt,model,metadata,output_asset_id").eq("output_asset_id", input.result_asset_id!).order("created_at", { ascending: false }).limit(1).single();
  if (jobResult.error || !jobResult.data) throw new Error(`Load verdict job: ${jobResult.error?.message ?? "not found"}`);
  const job = jobResult.data;
  if (identity.role !== "admin") {
    const character = await supabase.from("characters").select("maker_id").eq("id", job.character_id).maybeSingle();
    if (character.error || character.data?.maker_id !== identity.id) throw new Error("This generation does not belong to your Studio.");
  }
  const result = await supabase.from("generation_verdicts").upsert({
    job_id: job.id,
    shot_id: input.shot_id ?? "",
    character_id: job.character_id,
    board_id: input.board_id ?? null,
    prompt: job.prompt ?? "",
    model: job.model,
    params: job.metadata ?? {},
    result_asset_id: input.result_asset_id ?? job.output_asset_id,
    verdict: input.verdict,
    changed_variable: input.changed_variable ?? null,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "job_id,shot_id" }).select("*").single();
  if (result.error) throw new Error(`Save generation verdict: ${result.error.message}`);
  return result.data;
}

export async function generationVerdictStats(filters: { boardId?: string; characterId?: string }, identity: AuthIdentity) {
  let query = getSupabaseAdminClient().from("generation_verdicts").select("verdict,changed_variable");
  if (filters.boardId) query = query.eq("board_id", filters.boardId);
  if (filters.characterId) query = query.eq("character_id", filters.characterId);
  if (identity.role !== "admin") {
    const owned = await getSupabaseAdminClient().from("characters").select("id").eq("maker_id", identity.id);
    if (owned.error) throw new Error(`Load Studio actors: ${owned.error.message}`);
    query = query.in("character_id", (owned.data ?? []).map((row) => row.id));
  }
  const result = await query;
  if (result.error) throw new Error(`Load generation verdict stats: ${result.error.message}`);
  return verdictStats(result.data ?? []);
}

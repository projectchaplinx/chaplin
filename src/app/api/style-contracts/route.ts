import { z } from "zod";
import { requireRequestIdentity } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { styleExtractionPrompt } from "@/lib/style-contract";

const requestSchema = z.object({
  boardId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  sourceRefs: z.array(z.string().uuid()).min(5).max(10),
  contractText: z.string().trim().min(40).optional(),
}).strict();

async function extractContract(sourceRefs: string[]) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is required for style extraction.");
  const assets = await getSupabaseAdminClient().from("media_assets").select("id,url").in("id", sourceRefs);
  if (assets.error || assets.data?.length !== sourceRefs.length) throw new Error("Every style reference must resolve to a stored media asset.");
  const model = process.env.OPENROUTER_STYLE_MODEL ?? "openai/gpt-5.4-mini";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: styleExtractionPrompt() },
          ...assets.data.map((asset) => ({ type: "image_url", image_url: { url: asset.url } })),
        ],
      }],
    }),
  });
  if (!response.ok) throw new Error(`Style extraction failed with ${response.status}.`);
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text || text.length < 40) throw new Error("Style extraction returned no usable contract.");
  return { text, model };
}

export async function POST(request: Request) {
  const identity = await requireRequestIdentity(request);
  const input = requestSchema.parse(await request.json());
  const extracted = input.contractText
    ? { text: input.contractText, model: "creator-edited" }
    : await extractContract(input.sourceRefs);
  const result = await getSupabaseAdminClient().from("style_contracts").upsert({
    board_id: input.boardId,
    owner_id: identity.id,
    name: input.name,
    contract_text: extracted.text,
    source_refs: input.sourceRefs,
    extracted_at: new Date().toISOString(),
    model_used: extracted.model,
    updated_at: new Date().toISOString(),
  }, { onConflict: "board_id" }).select("*").single();
  if (result.error) throw new Error(`Save style contract: ${result.error.message}`);
  return Response.json({ styleContract: result.data });
}

export async function GET(request: Request) {
  const identity = await requireRequestIdentity(request);
  const boardId = z.string().uuid().parse(new URL(request.url).searchParams.get("boardId"));
  let query = getSupabaseAdminClient().from("style_contracts").select("*").eq("board_id", boardId);
  if (identity.role !== "admin") query = query.eq("owner_id", identity.id);
  const result = await query.maybeSingle();
  if (result.error) throw new Error(`Load style contract: ${result.error.message}`);
  return Response.json({ styleContract: result.data });
}

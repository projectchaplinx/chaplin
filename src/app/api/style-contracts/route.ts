import { z } from "zod";
import { requireRequestIdentity } from "@/lib/server/auth";
import { getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { styleExtractionPrompt } from "@/lib/style-contract";
import {
  createOpenAIResponse,
  openAIInputImage,
  openAIWritingModel,
} from "@/lib/server/openai-responses";

const requestSchema = z.object({
  boardId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  sourceRefs: z.array(z.string().uuid()).min(5).max(10),
  contractText: z.string().trim().min(40).optional(),
}).strict();

async function extractContract(sourceRefs: string[]) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for style extraction.");
  const assets = await getSupabaseAdminClient().from("media_assets").select("id,url").in("id", sourceRefs);
  if (assets.error || assets.data?.length !== sourceRefs.length) throw new Error("Every style reference must resolve to a stored media asset.");
  const model = openAIWritingModel();
  const result = await createOpenAIResponse({
    model,
    instructions: "Extract one concise, editable visual style contract from the supplied references.",
    messages: [{
      role: "user",
      content: [
        { type: "input_text", text: styleExtractionPrompt() },
        ...await Promise.all(assets.data.map((asset) => openAIInputImage(asset.url))),
      ],
    }],
    maxOutputTokens: 1500,
  });
  const text = result.text.trim();
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

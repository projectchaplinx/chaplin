import type { NextRequest } from "next/server";
import { requireRequestIdentity } from "@/lib/server/auth";
import { calculateGenerationBilling } from "@/lib/server/billing";
import { getPipelineExperiment } from "@/lib/server/pipeline-experiments";
import { beginGeneration, completeGeneration, failGeneration } from "@/lib/server/supabase-admin";
import {
  openAIWritingModel,
  requestOpenAIFromLegacyMessages,
} from "@/lib/server/openai-responses";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  let jobId: string | undefined;
  try {
    const identity = await requireRequestIdentity(request);
    if (identity.role !== "admin") throw new Error("Super Admin access is required.");
    const body = await request.json() as { experimentId?: unknown; variantId?: unknown };
    if (typeof body.experimentId !== "string" || typeof body.variantId !== "string") {
      throw new Error("Experiment and variant are required.");
    }
    const experiment = await getPipelineExperiment(body.experimentId);
    if (experiment.stage !== "writing") throw new Error("This runner is only for writing experiments.");
    const variant = experiment.variants.find((item) => item.id === body.variantId);
    if (!variant) throw new Error("Experiment variant was not found.");
    if (!experiment.inputPrompt.trim()) throw new Error("Add one shared test input before running variants.");
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
    const model = openAIWritingModel(variant.config.model);
    jobId = await beginGeneration({
      characterId: experiment.characterId ?? "c-selene",
      kind: "pipeline-writing-test",
      provider: "openai",
      model,
      prompt: experiment.inputPrompt,
      experimentId: experiment.id,
      experimentVariantId: variant.id,
    });
    const response = await requestOpenAIFromLegacyMessages({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: variant.config.maxTokens ?? 2000,
        system: variant.config.promptPrelude,
        messages: [{ role: "user", content: experiment.inputPrompt }],
      }),
    });
    const data = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(data.error?.message ?? `OpenAI returned ${response.status}.`);
    const outputText = data.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n").trim();
    if (!outputText) throw new Error("OpenAI returned no writing output.");
    await completeGeneration(
      jobId,
      undefined,
      { outputText, pipelineExperiment: experiment.id, variant: variant.id },
      await calculateGenerationBilling({
        kind: "pipeline-writing-test",
        provider: "openai",
        model,
        usage: {
          inputTokens: data.usage?.input_tokens,
          outputTokens: data.usage?.output_tokens,
          providerTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
        },
      }),
      response.headers.get("request-id"),
    );
    return Response.json({ outputText });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Writing experiment failed.";
    if (jobId) await failGeneration(jobId, message);
    return Response.json({ error: message }, {
      status: /sign in/i.test(message) ? 401 : /Super Admin/i.test(message) ? 403 : 400,
    });
  }
}

import { MEDIA_OUTPUT_CATALOG } from "@/lib/media-output-definitions";
import type { MediaOutputType, PipelineScope } from "@/lib/media-pipeline-types";
import { createMediaPipelineRun, listMediaPipelineRuns } from "@/lib/server/media-pipeline";
import { requireOwnedScope, requireRequestIdentity } from "@/lib/server/auth";
import {
  assertRequestBodySize,
  enforceRateLimit,
  securityErrorStatus,
} from "@/lib/server/request-security";
import { adBoardSchema } from "@/lib/ad-board";

export const runtime = "nodejs";

const scopes: PipelineScope[] = ["actor", "shot", "episode", "spot", "brief"];
const outputTypes = new Set(MEDIA_OUTPUT_CATALOG.map((item) => item.type));

function cleanString(value: unknown, field: string, max = 300) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function parseScope(value: unknown): PipelineScope {
  const scope = cleanString(value, "Pipeline scope", 20) as PipelineScope;
  if (!scopes.includes(scope)) throw new Error("Unknown pipeline scope.");
  return scope;
}

export async function GET(request: Request) {
  try {
    const identity = await requireRequestIdentity(request);
    const url = new URL(request.url);
    const scopeType = parseScope(url.searchParams.get("scopeType"));
    const scopeId = cleanString(url.searchParams.get("scopeId"), "Scope ID");
    await requireOwnedScope(identity, scopeType, scopeId);
    return Response.json({
      runs: await listMediaPipelineRuns(scopeType, scopeId),
      catalog: MEDIA_OUTPUT_CATALOG,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load media pipelines.";
    return Response.json(
      { error: message },
      { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 400) },
    );
  }
}

export async function POST(request: Request) {
  try {
    assertRequestBodySize(request, 512 * 1024);
    const identity = await requireRequestIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    const outputType = cleanString(body.outputType, "Output type", 40) as MediaOutputType;
    if (!outputTypes.has(outputType)) throw new Error("Unknown output type.");
    const scopeType = parseScope(body.scopeType);
    const scopeId = cleanString(body.scopeId, "Scope ID");
    await requireOwnedScope(identity, scopeType, scopeId);
    if (identity.role !== "admin") {
      await enforceRateLimit({
        request,
        bucket: "pipeline-create",
        limit: 20,
        windowSeconds: 24 * 60 * 60,
        identityId: identity.id,
      });
    }
    const spec = body.spec && typeof body.spec === "object" && !Array.isArray(body.spec)
      ? body.spec as Record<string, unknown>
      : {};
    if (spec.adBoard !== undefined) {
      spec.adBoard = adBoardSchema.parse(spec.adBoard);
    }
    const run = await createMediaPipelineRun({
      scopeType,
      scopeId,
      outputType,
      spec,
      createdBy: identity.id,
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    });
    return Response.json({ run }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create media pipeline.";
    return Response.json(
      { error: message },
      {
        status: securityErrorStatus(
          error,
          message === "Sign in to continue." ? 401 : /required|unknown|requires/i.test(message) ? 400 : 500,
        ),
      },
    );
  }
}

import type { NextRequest } from "next/server";
import { requireRequestIdentity } from "@/lib/server/auth";
import {
  createPipelineExperiment,
  deletePipelineExperiment,
  listPipelineExperiments,
  promotePipelineExperiment,
  scorePipelineExperimentResult,
  updatePipelineExperiment,
} from "@/lib/server/pipeline-experiments";
import { reviewExperimentResult } from "@/lib/server/director-evaluations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(request: NextRequest) {
  const identity = await requireRequestIdentity(request);
  if (identity.role !== "admin") throw new Error("Super Admin access is required.");
  return identity;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Pipeline experiment request failed.";
  return Response.json({ error: message }, {
    status: /sign in/i.test(message) ? 401 : /Super Admin/i.test(message) ? 403 : 400,
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    return Response.json({ experiments: await listPipelineExperiments() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requireAdmin(request);
    const body = await request.json() as Record<string, unknown>;
    const id = await createPipelineExperiment(body, identity.id);
    return Response.json({ id, experiments: await listPipelineExperiments() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const identity = await requireAdmin(request);
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "score") {
      await scorePipelineExperimentResult(body);
    } else if (body.action === "director-evaluate") {
      await reviewExperimentResult(body, identity.id);
    } else if (body.action === "promote") {
      if (typeof body.id !== "string") throw new Error("Experiment ID is required.");
      const config = await promotePipelineExperiment(body.id, identity.id);
      return Response.json({ config, experiments: await listPipelineExperiments() });
    } else {
      await updatePipelineExperiment(body);
    }
    return Response.json({ experiments: await listPipelineExperiments() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new Error("Experiment ID is required.");
    await deletePipelineExperiment(id);
    return Response.json({ experiments: await listPipelineExperiments() });
  } catch (error) {
    return errorResponse(error);
  }
}

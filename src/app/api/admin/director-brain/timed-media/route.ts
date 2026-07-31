import type { NextRequest } from "next/server";
import { requireAdminIdentity } from "@/lib/server/auth";
import { listDirectorTimedMediaAnalyses, reviewDirectorTimedMediaAnalysis } from "@/lib/server/director-timed-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Timed-film review failed.";
  return Response.json({ error: message }, { status: /sign in/i.test(message) ? 401 : /Super Admin/i.test(message) ? 403 : 400 });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminIdentity(request);
    return Response.json({ analyses: await listDirectorTimedMediaAnalyses() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requireAdminIdentity(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    return Response.json({ analyses: await reviewDirectorTimedMediaAnalysis(body, identity.id) });
  } catch (error) {
    return failure(error);
  }
}

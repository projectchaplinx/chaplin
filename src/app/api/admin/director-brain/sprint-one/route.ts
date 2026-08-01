import type { NextRequest } from "next/server";
import { requireAdminIdentity } from "@/lib/server/auth";
import { listDirectorSprintOne, reviewDirectorSprintOnePlayback } from "@/lib/server/director-sprint-one";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Director Sprint 1 request failed.";
  return Response.json({ error: message }, {
    status: /sign in/i.test(message) ? 401 : /Super Admin/i.test(message) ? 403 : 400,
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminIdentity(request);
    return Response.json(await listDirectorSprintOne());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const identity = await requireAdminIdentity(request);
    await reviewDirectorSprintOnePlayback(await request.json() as Record<string, unknown>, identity.id);
    return Response.json(await listDirectorSprintOne());
  } catch (error) {
    return errorResponse(error);
  }
}

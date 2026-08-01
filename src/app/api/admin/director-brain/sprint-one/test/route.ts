import type { NextRequest } from "next/server";
import { requireAdminIdentity } from "@/lib/server/auth";
import {
  decideDirectorSprintTest,
  initializeDirectorSprintTest,
  listDirectorSprintTest,
  scoreDirectorSprintTest,
  shipDirectorSprintTest,
} from "@/lib/server/director-sprint-test";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Director Sprint 1 test request failed.";
  return Response.json({ error: message }, {
    status: /sign in/i.test(message) ? 401 : /Super Admin/i.test(message) ? 403 : 400,
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminIdentity(request);
    return Response.json(await listDirectorSprintTest());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requireAdminIdentity(request);
    return Response.json(await initializeDirectorSprintTest(
      await request.json() as Record<string, unknown>,
      identity.id,
    ));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const identity = await requireAdminIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "score") return Response.json(await scoreDirectorSprintTest(body, identity.id));
    if (body.action === "decide") return Response.json(await decideDirectorSprintTest(body, identity.id));
    if (body.action === "ship") return Response.json(await shipDirectorSprintTest(body, identity.id));
    throw new Error("Choose a valid Sprint 1 test action.");
  } catch (error) {
    return errorResponse(error);
  }
}

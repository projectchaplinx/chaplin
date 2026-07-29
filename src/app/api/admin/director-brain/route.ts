import type { NextRequest } from "next/server";
import { requireAdminIdentity } from "@/lib/server/auth";
import {
  createDirectorStudy,
  listDirectorResearch,
  reviewDirectorStudy,
} from "@/lib/server/director-research";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Director Brain research request failed.";
  return Response.json({ error: message }, {
    status: /sign in/i.test(message) ? 401 : /Super Admin/i.test(message) ? 403 : 400,
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminIdentity(request);
    return Response.json(await listDirectorResearch());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requireAdminIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    const id = await createDirectorStudy(body, identity.id);
    return Response.json({ id, ...(await listDirectorResearch()) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const identity = await requireAdminIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    await reviewDirectorStudy(body, identity.id);
    return Response.json(await listDirectorResearch());
  } catch (error) {
    return errorResponse(error);
  }
}


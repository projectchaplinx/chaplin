import type { NextRequest } from "next/server";
import { DIRECTOR_EVIDENCE_STATUSES, type DirectorEvidenceStatus } from "@/lib/director-evidence-manifest";
import { requireAdminIdentity } from "@/lib/server/auth";
import { listDirectorEvidenceManifests, reviewDirectorEvidenceManifest } from "@/lib/server/director-evidence-manifests";
import { synthesizeDirectorEvidenceStudy } from "@/lib/server/director-evidence-synthesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Evidence request failed.";
  return Response.json({ error: message }, { status: /sign in/i.test(message) ? 401 : /Super Admin/i.test(message) ? 403 : 400 });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminIdentity(request);
    const statusValue = request.nextUrl.searchParams.get("status");
    const status = DIRECTOR_EVIDENCE_STATUSES.includes(statusValue as DirectorEvidenceStatus) ? statusValue as DirectorEvidenceStatus : undefined;
    return Response.json(await listDirectorEvidenceManifests({
      sourceId: request.nextUrl.searchParams.get("sourceId") || undefined,
      status,
      limit: Number(request.nextUrl.searchParams.get("limit")) || 100,
    }));
  } catch (error) { return failure(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const identity = await requireAdminIdentity(request);
    const body = await request.json() as { id?: string; status?: "eligible" | "rejected" | "archived"; notes?: string };
    if (!body.id || !body.status || !["eligible", "rejected", "archived"].includes(body.status)) throw new Error("Choose an evidence record and review decision.");
    return Response.json({ manifest: await reviewDirectorEvidenceManifest(body.id, body.status, body.notes ?? "", identity.id) });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requireAdminIdentity(request);
    const body = await request.json() as { manifestIds?: string[] };
    return Response.json(await synthesizeDirectorEvidenceStudy(body.manifestIds ?? [], identity.id));
  } catch (error) { return failure(error); }
}

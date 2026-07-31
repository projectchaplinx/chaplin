import type { NextRequest } from "next/server";
import { DIRECTOR_RESEARCH_CAMPAIGN_VERSION } from "@/lib/director-research-campaign";
import { requireAdminIdentity } from "@/lib/server/auth";
import {
  enqueueDirectorResearch,
  enqueueDirectorGapResearch,
  enqueueDirectorTimedMediaCorpus,
  listDirectorResearchJobs,
  runDirectorResearchBatch,
  retryDirectorResearchJobs,
} from "@/lib/server/director-research-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Director research job failed.";
  return Response.json({ error: message }, { status: /sign in/i.test(message) ? 401 : /Super Admin/i.test(message) ? 403 : 400 });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminIdentity(request);
    return Response.json({ jobs: await listDirectorResearchJobs(DIRECTOR_RESEARCH_CAMPAIGN_VERSION) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requireAdminIdentity(request);
    const body = await request.json().catch(() => ({})) as { action?: string; sourceIds?: string[]; jobIds?: string[]; limit?: number };
    if (body.action === "enqueue") {
      const jobs = await enqueueDirectorResearch(DIRECTOR_RESEARCH_CAMPAIGN_VERSION, identity.id, body.sourceIds);
      return Response.json({ jobs });
    }
    if (body.action === "enqueue-gaps") {
      return Response.json({ jobs: await enqueueDirectorGapResearch(DIRECTOR_RESEARCH_CAMPAIGN_VERSION, identity.id) });
    }
    if (body.action === "enqueue-timed-media") {
      return Response.json(await enqueueDirectorTimedMediaCorpus(DIRECTOR_RESEARCH_CAMPAIGN_VERSION, identity.id));
    }
    if (body.action === "enqueue-all") {
      await enqueueDirectorResearch(DIRECTOR_RESEARCH_CAMPAIGN_VERSION, identity.id, body.sourceIds);
      await enqueueDirectorTimedMediaCorpus(DIRECTOR_RESEARCH_CAMPAIGN_VERSION, identity.id);
      return Response.json({ jobs: await enqueueDirectorGapResearch(DIRECTOR_RESEARCH_CAMPAIGN_VERSION, identity.id) });
    }
    if (body.action === "run") {
      return Response.json(await runDirectorResearchBatch(body.limit));
    }
    if (body.action === "retry") {
      return Response.json(await retryDirectorResearchJobs(body.jobIds ?? [], identity.id));
    }
    throw new Error("Choose enqueue, enqueue-gaps, enqueue-timed-media, enqueue-all, retry, or run.");
  } catch (error) {
    return failure(error);
  }
}

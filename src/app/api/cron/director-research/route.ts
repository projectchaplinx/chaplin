import type { NextRequest } from "next/server";
import { DIRECTOR_RESEARCH_CAMPAIGN_VERSION } from "@/lib/director-research-campaign";
import {
  enqueueDirectorResearch,
  listDirectorResearchJobs,
  runDirectorResearchBatch,
} from "@/lib/server/director-research-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorize(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (process.env.NODE_ENV !== "production" && request.headers.get("x-chaplin-local-worker") === "1") return;
  if (!secret || bearer !== secret) throw new Error("Research worker authorization failed.");
}

export async function POST(request: NextRequest) {
  try {
    authorize(request);
    const body = await request.json().catch(() => ({})) as { action?: string; sourceIds?: string[]; actor?: string };
    if (body.action === "enqueue") {
      const jobs = await enqueueDirectorResearch(
        DIRECTOR_RESEARCH_CAMPAIGN_VERSION,
        body.actor?.trim().slice(0, 120) || "director-research-worker",
        body.sourceIds,
      );
      return Response.json({ jobs });
    }
    if (body.action === "run") return Response.json(await runDirectorResearchBatch());
    if (body.action === "status") return Response.json({ jobs: await listDirectorResearchJobs(DIRECTOR_RESEARCH_CAMPAIGN_VERSION) });
    throw new Error("Choose enqueue, run, or status.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Director research worker failed.";
    return Response.json({ error: message }, { status: /authorization/i.test(message) ? 401 : 400 });
  }
}

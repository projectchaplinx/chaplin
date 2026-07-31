import type { NextRequest } from "next/server";
import { DIRECTOR_RESEARCH_CAMPAIGN_VERSION } from "@/lib/director-research-campaign";
import {
  enqueueDirectorResearch,
  enqueueDirectorGapResearch,
  enqueueDirectorTimedMediaCorpus,
  listDirectorResearchJobs,
  runDirectorResearchBatch,
} from "@/lib/server/director-research-jobs";
import { reviewDirectorStudy } from "@/lib/server/director-research";

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
    const body = await request.json().catch(() => ({})) as { action?: string; sourceIds?: string[]; actor?: string; studyId?: string; reviewNotes?: string; limit?: number };
    if (body.action === "enqueue") {
      const jobs = await enqueueDirectorResearch(
        DIRECTOR_RESEARCH_CAMPAIGN_VERSION,
        body.actor?.trim().slice(0, 120) || "director-research-worker",
        body.sourceIds,
      );
      return Response.json({ jobs });
    }
    if (body.action === "run") return Response.json(await runDirectorResearchBatch(body.limit));
    if (body.action === "enqueue-timed-media") {
      return Response.json(await enqueueDirectorTimedMediaCorpus(
        DIRECTOR_RESEARCH_CAMPAIGN_VERSION,
        body.actor?.trim().slice(0, 120) || "director-research-worker",
      ));
    }
    if (body.action === "status") return Response.json({ jobs: await listDirectorResearchJobs(DIRECTOR_RESEARCH_CAMPAIGN_VERSION) });
    if (body.action === "approve-study") {
      await reviewDirectorStudy({ id: body.studyId, status: "approved", reviewNotes: body.reviewNotes }, body.actor?.trim().slice(0, 120) || "director-research-worker");
      return Response.json({ ok: true, studyId: body.studyId, status: "approved" });
    }
    throw new Error("Choose enqueue, enqueue-timed-media, run, status, or approve-study.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Director research worker failed.";
    return Response.json({ error: message }, { status: /authorization/i.test(message) ? 401 : 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    authorize(request);
    await enqueueDirectorGapResearch(DIRECTOR_RESEARCH_CAMPAIGN_VERSION, "vercel-director-research-cron");
    let claimed = 0;
    const waves = [];
    for (let wave = 0; wave < 7; wave += 1) {
      const result = await runDirectorResearchBatch();
      claimed += result.claimed;
      waves.push(result.claimed);
      if (!result.claimed) break;
    }
    return Response.json({ ok: true, claimed, waves });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Director research cron failed.";
    return Response.json({ error: message }, { status: /authorization/i.test(message) ? 401 : 400 });
  }
}

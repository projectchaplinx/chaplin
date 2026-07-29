import type { NextRequest } from "next/server";
import { requireRequestIdentity } from "@/lib/server/auth";
import { getSupabaseAdminClient, persistStory } from "@/lib/server/supabase-admin";
import { productionCreditCode, productionCreditCost } from "@/lib/credits";
import { refundCreatorCredits, spendCreatorCredits } from "@/lib/server/credits";
import {
  assertRequestBodySize,
  enforceRateLimit,
  securityErrorStatus,
} from "@/lib/server/request-security";

export const runtime = "nodejs";

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Lists the signed-in account's productions.
 *
 * POST persisted the story row, but nothing ever read it back: the Studio
 * Productions tab filtered the client store, which lives in this browser's
 * localStorage. A production started on another device - or after the store was
 * cleared - existed in the database and showed nowhere. Scoped to the session
 * identity rather than a query parameter so one account cannot list another's.
 */
export async function GET(request: NextRequest) {
  try {
    const identity = await requireRequestIdentity(request);
    const result = await getSupabaseAdminClient()
      .from("stories")
      .select("id,title,logline,cover_hue,poster_url,backdrop_url,views,created_at,updated_at")
      .eq("author_id", identity.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) throw new Error(`Load productions: ${result.error.message}`);
    return Response.json({ stories: result.data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load productions.";
    return Response.json({ error: message }, { status: message === "Sign in to continue." ? 401 : 400 });
  }
}

/**
 * Persists a production's story row.
 *
 * Stories were only ever created in the client store, so a pipeline run was
 * started against a story id the database had never seen. The run row existed
 * with its full script in `spec`, the story did not, and Productions - which
 * reads from the database - showed nothing. Called when a production starts so
 * the run always points at a row that exists.
 */
export async function POST(request: NextRequest) {
  try {
    assertRequestBodySize(request, 256 * 1024);
    const input = await request.json() as Record<string, unknown>;
    const id = text(input.id, 120);
    const title = text(input.title, 200);
    if (!id || !title) {
      return Response.json({ error: "A story id and title are required." }, { status: 400 });
    }
    const identity = await requireRequestIdentity(request);
    if (identity.role !== "admin") {
      await enforceRateLimit({
        request,
        bucket: "production-create",
        limit: 12,
        windowSeconds: 24 * 60 * 60,
        identityId: identity.id,
      });
    }
    const format = text(input.format, 30);
    const durationSeconds = Number(input.durationSeconds);
    if (!["spark", "punch", "episode", "spot"].includes(format) || !Number.isFinite(durationSeconds)) {
      return Response.json({ error: "A valid production format and duration are required." }, { status: 400 });
    }
    const punchGenerationMode = format === "punch" && input.punchGenerationMode === "single-take"
      ? "single-take"
      : "scene-clips";
    const creditCost = identity.role === "admin" ? 0 : productionCreditCost(format, durationSeconds);
    const existing = await getSupabaseAdminClient()
      .from("stories")
      .select("author_id")
      .eq("id", id)
      .maybeSingle();
    if (existing.error) throw new Error(`Check production ownership: ${existing.error.message}`);
    if (existing.data && identity.role !== "admin" && existing.data.author_id !== identity.id) {
      return Response.json({ error: "This production does not belong to your studio." }, { status: 404 });
    }
    const idempotencyKey = `production:start:${id}`;
    const reservation = creditCost > 0
      ? await spendCreatorCredits({
          userId: identity.id,
          amount: creditCost,
          idempotencyKey,
          description: `Start ${durationSeconds}-second ${format}: ${title}`,
          metadata: {
            actionCode: productionCreditCode(format, durationSeconds),
            storyId: id,
            storyTitle: title,
            format,
            durationSeconds,
            punchGenerationMode,
          },
        })
      : null;
    try {
      const story = await persistStory({
        id,
        authorId: identity.id,
        title,
        logline: text(input.logline, 2000),
        coverHue: Number.isFinite(Number(input.coverHue)) ? Number(input.coverHue) : 205,
        backdropUrl: text(input.backdropUrl, 1000) || null,
        posterUrl: text(input.posterUrl, 1000) || null,
      });
      return Response.json({ story, creditBalance: reservation?.balance ?? null }, { status: 201 });
    } catch (error) {
      if (reservation?.applied) {
        await refundCreatorCredits({
          userId: identity.id,
          idempotencyKey,
          description: `Production save failed: ${title}`,
        });
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the story.";
    const status = securityErrorStatus(
      error,
      message === "Sign in to continue."
        ? 401
        : message.includes("Not enough Chaplin credits")
          ? 402
          : /required|invalid|do not match/i.test(message)
            ? 400
            : 500,
    );
    return Response.json({ error: message }, { status });
  }
}

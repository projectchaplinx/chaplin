import { getPublicCharacterMedia } from "@/lib/server/public-character-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const media = await getPublicCharacterMedia(id);
    if (!media) return Response.json({ error: "AI actor not found." }, { status: 404 });
    return Response.json(
      { media },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load public AI actor media." },
      { status: 500 },
    );
  }
}

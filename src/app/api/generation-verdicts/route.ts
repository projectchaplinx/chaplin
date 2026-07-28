import { generationVerdictInputSchema } from "@/lib/generation-verdict";
import { requireRequestIdentity } from "@/lib/server/auth";
import { generationVerdictStats, recordGenerationVerdict } from "@/lib/server/generation-verdicts";

export async function GET(request: Request) {
  const identity = await requireRequestIdentity(request);
  const url = new URL(request.url);
  return Response.json({
    stats: await generationVerdictStats({
      boardId: url.searchParams.get("boardId") ?? undefined,
      characterId: url.searchParams.get("characterId") ?? undefined,
    }, identity),
  });
}

export async function POST(request: Request) {
  const identity = await requireRequestIdentity(request);
  const body = generationVerdictInputSchema.parse(await request.json());
  return Response.json({ verdict: await recordGenerationVerdict(body, identity) });
}

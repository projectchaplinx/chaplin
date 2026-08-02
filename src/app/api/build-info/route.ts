import { chaplinBuildInfo } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function keyFingerprint(value: string | undefined) {
  if (!value) return "MISSING";
  const trimmed = value.trim();
  return `len:${trimmed.length} tail:${trimmed.slice(-4)}`;
}

export async function GET() {
  return Response.json({
    ...chaplinBuildInfo(),
    seedanceKey: keyFingerprint(process.env.SEEDANCE_API_KEY),
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

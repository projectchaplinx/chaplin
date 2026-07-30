import { requireRequestIdentity } from "@/lib/server/auth";
import { enforceRateLimit, securityErrorStatus } from "@/lib/server/request-security";
import { elevenLabsApiKey } from "@/lib/elevenlabs-config";

export const runtime = "nodejs";

// Hands the browser a short-lived signed URL for the ElevenLabs Concierge
// agent, so the key never leaves the server.
export async function GET(request: Request) {
  try {
    const identity = await requireRequestIdentity(request);
    await enforceRateLimit({
      request,
      bucket: "concierge-voice-session",
      limit: 10,
      windowSeconds: 60 * 60,
      identityId: identity.id,
    });
    const apiKey = elevenLabsApiKey();
    const agentId = process.env.CHAPLIN_ELEVENLABS_AGENT_ID;
    if (!apiKey || !agentId) {
      return Response.json({ error: "Voice concierge is not configured." }, { status: 503 });
    }
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } }
    );
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`ElevenLabs returned ${response.status}: ${detail.slice(0, 200)}`);
    }
    const data = (await response.json()) as { signed_url?: string };
    if (!data.signed_url) throw new Error("No signed_url in ElevenLabs response.");
    return Response.json({ signedUrl: data.signed_url, agentId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice session failed.";
    console.warn("[concierge] voice-session:", message);
    return Response.json(
      { error: message },
      { status: securityErrorStatus(error, message === "Sign in to continue." ? 401 : 502) },
    );
  }
}

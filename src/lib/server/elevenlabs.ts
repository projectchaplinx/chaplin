import "server-only";

import type { ElevenLabsVoiceSummary } from "@/lib/elevenlabs-voices";
import { elevenLabsApiKey } from "@/lib/elevenlabs-config";

const ELEVEN_ROOT = "https://api.elevenlabs.io";
const ELEVEN_API = `${ELEVEN_ROOT}/v1`;

function key() {
  const value = elevenLabsApiKey();
  if (!value) throw new Error("ELEVEN_LABS_API_KEY is not configured.");
  return value;
}

export async function listElevenLabsGeneratedVoices() {
  const response = await fetch(
    `${ELEVEN_ROOT}/v2/voices?page_size=100&voice_type=personal&category=generated&sort=created_at_unix&sort_direction=asc`,
    { headers: { "xi-api-key": key() }, cache: "no-store" },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs could not list generated voices (${response.status}): ${detail.slice(0, 300)}`);
  }
  const payload = await response.json() as { voices?: ElevenLabsVoiceSummary[] };
  return Array.isArray(payload.voices) ? payload.voices : [];
}

export async function deleteElevenLabsVoice(voiceId: string) {
  const response = await fetch(
    `${ELEVEN_API}/voices/${encodeURIComponent(voiceId)}`,
    { method: "DELETE", headers: { "xi-api-key": key() } },
  );
  if (response.ok || response.status === 404) return;
  const detail = await response.text();
  throw new Error(`ElevenLabs could not delete voice ${voiceId} (${response.status}): ${detail.slice(0, 300)}`);
}

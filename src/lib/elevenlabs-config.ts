export type ElevenLabsEnvironment = Record<string, string | undefined>;

export type ElevenLabsCredential = {
  apiKey: string;
  envName: string;
};

/**
 * Chaplin-specific and documented keys must win over the legacy spelling.
 * This prevents an older, voice-limited account from shadowing a replacement
 * key that was added under ELEVEN_LABS_API_KEY.
 */
export const ELEVENLABS_API_KEY_PRIORITY = [
  "CHAPLIN_ELEVENLABS_API_KEY",
  "ELEVEN_LABS_API_KEY_NEW",
  "ELEVENLABS_API_KEY_NEW",
  "ELEVEN_LABS_API_KEY_2",
  "ELEVENLABS_API_KEY_2",
  "ELEVEN_LABS_API_KEY_V2",
  "ELEVENLABS_API_KEY_V2",
  "ELEVEN_LABS_API_KEY",
  "ELEVENLABS_API_KEY",
] as const;

function byteSafeApiKey(value: string | undefined) {
  if (!value) return null;
  // Vercel and password managers render secrets with bullets. A copied list
  // marker may prefix a real key, while a copied masked value may be bullets
  // only. Remove one decorative marker, then accept printable ASCII only:
  // Fetch converts header values to ByteString before sending the request.
  const candidate = value.trim().replace(/^[•●·]\s*/, "").trim();
  return candidate && /^[\x21-\x7e]+$/.test(candidate) ? candidate : null;
}

export function resolveElevenLabsCredential(
  environment: ElevenLabsEnvironment = process.env,
): ElevenLabsCredential | null {
  for (const envName of ELEVENLABS_API_KEY_PRIORITY) {
    const apiKey = byteSafeApiKey(environment[envName]);
    if (apiKey) return { apiKey, envName };
  }
  return null;
}

export function elevenLabsApiKey(environment: ElevenLabsEnvironment = process.env) {
  return resolveElevenLabsCredential(environment)?.apiKey;
}
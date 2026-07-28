const MIN_AUDITION_WORDS = 3;
const MAX_AUDITION_WORDS = 8;
export const MIN_VOICE_DESIGN_CHARACTERS = 100;

type VoicePreviewCharacter = {
  brollLine?: string | null;
  tagline?: string | null;
  personality?: string | null;
};

export function compactVoicePreview(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const clauses = normalized
    .split(/[.!?;:\u2014\u2013,]+/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const completeClause = clauses.find((clause) => {
    const count = clause.split(/\s+/).length;
    return count >= MIN_AUDITION_WORDS && count <= MAX_AUDITION_WORDS;
  });
  const words = (completeClause ?? normalized).split(/\s+/).slice(0, MAX_AUDITION_WORDS);
  return `${words.join(" ").replace(/[^\p{L}\p{N}'"]+$/u, "")}.`;
}

function auditionClause(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?;:\u2014\u2013]+/g, ",")
    .replace(/,+/g, ",")
    .replace(/^[,\s]+|[,\s]+$/g, "");
}

/**
 * Builds one provider-length audition line without repeating the actor's text.
 *
 * ElevenLabs Voice Design requires at least 100 characters. Keep this helper
 * idempotent because the request can pass through both the action handler and
 * the provider wrapper.
 */
export function voiceDesignAuditionText(
  previewText: string,
  character?: VoicePreviewCharacter,
) {
  const normalized = previewText.replace(/\s+/g, " ").trim();
  if (normalized.length >= MIN_VOICE_DESIGN_CHARACTERS) return normalized;

  const primary = auditionClause(compactVoicePreview(normalized));
  const candidates = [
    primary,
    character?.brollLine,
    character?.tagline,
    character?.personality,
    "I am here with a clear purpose",
    "and I will see this moment through with steady resolve",
    "letting every word land exactly where it should",
  ];
  const clauses: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const clause = auditionClause(candidate ?? "");
    const key = clause.toLocaleLowerCase();
    if (!clause || seen.has(key)) continue;
    seen.add(key);
    clauses.push(clause);
    const audition = `${clauses.join(", ")}.`;
    if (audition.length >= MIN_VOICE_DESIGN_CHARACTERS) return audition;
  }

  return `${clauses.join(", ")}.`;
}

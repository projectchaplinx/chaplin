export type ElevenLabsVoiceSummary = {
  voice_id: string;
  name?: string | null;
  category?: string | null;
  labels?: Record<string, string> | null;
  created_at_unix?: number | null;
};

/**
 * Finds old Chaplin-generated voices that are safe to replace for one actor.
 *
 * A candidate must belong to Chaplin, carry this exact actor's label, and not
 * be the actor's currently locked voice. The oldest candidates are reclaimed
 * first and the caller chooses a deliberately small limit.
 */
export function supersededChaplinVoices(
  voices: ElevenLabsVoiceSummary[],
  characterId: string,
  activeVoiceId: string | null | undefined,
  limit = 2,
) {
  return voices
    .filter((voice) => (
      voice.category === "generated"
      && voice.labels?.project === "chaplin"
      && voice.labels?.character_id === characterId
      && voice.voice_id !== activeVoiceId
    ))
    .sort((left, right) => (
      (left.created_at_unix ?? Number.MAX_SAFE_INTEGER)
      - (right.created_at_unix ?? Number.MAX_SAFE_INTEGER)
    ))
    .slice(0, Math.max(0, limit));
}

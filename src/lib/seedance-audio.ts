const SILENT_PLATE_LINE = /^AUDIO:.*$/gm;
const SILENT_PLATE_CLAUSE = /\s*Silent visual plate[^.]*\./gi;

export type SeedanceAudioCapability = {
  audio_reference_input: boolean;
  native_audio_output: boolean;
  max_audio_ref_ms: number;
};

/**
 * Provider capability config verified against the ModelArk task-creation
 * contract. It is deliberately code-owned and read-only in Pipeline Lab:
 * operators may route models, but cannot claim a transport feature the
 * provider does not expose.
 */
export const SEEDANCE_AUDIO_CAPABILITIES = {
  /*
    Seedance 2.5 — profile dated 2026-08-02, from the official Dreamina prompt
    guide (dreamina.capcut.com/seedance/seedance-2-5-prompt): up to 30 seconds
    continuous, up to 50 @-tagged multimodal references, native audio with
    "voice or sound references" and audio sync. The reference-audio claim has
    NOT been reproduced in a controlled Chaplin test, so it stays false here:
    flipping it would route locked-voice dialogue through an unvalidated
    transport. Flip after the GPSC Phase 1.5 validation passes.
  */
  "seedance-2.5": {
    audio_reference_input: false,
    native_audio_output: true,
    max_audio_ref_ms: 0,
  },
  "seedance-2.0": {
    audio_reference_input: true,
    native_audio_output: true,
    max_audio_ref_ms: 15_000,
  },
  "seedance-1.5": {
    audio_reference_input: false,
    native_audio_output: true,
    max_audio_ref_ms: 0,
  },
  fallback: {
    audio_reference_input: false,
    native_audio_output: false,
    max_audio_ref_ms: 0,
  },
} as const satisfies Record<string, SeedanceAudioCapability>;

function withoutSilentPlateDirection(prompt: string) {
  return prompt.replace(SILENT_PLATE_LINE, "").replace(SILENT_PLATE_CLAUSE, "").trim();
}

export function seedanceSupportsAudioReference(model: string) {
  return /dreamina-seedance-2-0/i.test(model);
}

export function seedanceAudioCapability(model: string): SeedanceAudioCapability {
  if (/seedance-2-5|seedance-2\.5/i.test(model)) return SEEDANCE_AUDIO_CAPABILITIES["seedance-2.5"];
  if (/dreamina-seedance-2-0/i.test(model)) return SEEDANCE_AUDIO_CAPABILITIES["seedance-2.0"];
  if (/seedance-1-5/i.test(model)) return SEEDANCE_AUDIO_CAPABILITIES["seedance-1.5"];
  return SEEDANCE_AUDIO_CAPABILITIES.fallback;
}

export function prepareSeedanceAudioPrompt(input: {
  prompt: string;
  generateAudio: boolean;
  referenceAudioUrl?: string;
  dialogueText?: string;
}) {
  const referenceAudioUrl = input.referenceAudioUrl?.trim() ?? "";
  const dialogueText = input.dialogueText?.trim() ?? "";
  if (referenceAudioUrl && dialogueText) {
    const spokenLine = dialogueText.replaceAll('"', "'").trim();
    return `${withoutSilentPlateDirection(input.prompt)}\nPERFORMANCE AUDIO: The supplied reference audio is the actor's locked voice and exact performance timing. Synchronize the visible speaker's mouth, breath, expression, and pauses to this recording without changing its words or inventing another voice. The line is: "${spokenLine}". Generate only restrained location sound around it—room tone, cloth, footsteps, handled objects, machinery, or weather that is physically visible. No additional speech, narration, singing, or musical score. Chaplin adds the character theme and masters the original locked-voice recording separately.`;
  }
  if (!input.generateAudio) return input.prompt;
  return `${withoutSilentPlateDirection(input.prompt)}\nAUDIO: Record the location, not a soundtrack. Generate only diegetic sound that the visible frame would actually make—room tone, footsteps, cloth movement, handled objects, machinery, and weather. No spoken words, no lip-sync, no singing, and no musical score: the actor's locked voice and the character theme are recorded separately and mixed over this plate.`;
}

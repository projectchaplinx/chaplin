export function postMixedDialogueMetadata(metadata?: Record<string, unknown>) {
  return {
    ...metadata,
    dialogueIntegrated: true,
    voicePath: "B-post-mix",
  };
}

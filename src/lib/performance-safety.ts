const RISKY_FINGER_GESTURE = /\b(?:(?:one|two|three|four|five|raised)\s+(?:gloved\s+)?fingers?|middle\s+finger|finger[- ]?gun|(?:v|peace)[- ]?sign|finger[- ]?count(?:ing)?(?:\s+gesture)?)\b/i;

const DYNAMIC_IDENTITY_LANGUAGE = /\b(?:gesture|pose|movement|motion|taps?|points?|raises?|holds?|fingers?|hand[- ]?sign|smiles?|grins?|expression)\b/i;

export const HAND_GESTURE_SAFETY =
  "HAND-SIGN SAFETY: Use relaxed, anatomically natural open hands or task-specific grips only. No isolated numbered-finger pose, V-sign, finger-gun, raised middle finger, or hand sign toward camera.";

export function hasRiskyFingerGesture(value: string | null | undefined) {
  return RISKY_FINGER_GESTURE.test(value ?? "");
}

/**
 * Removes a risky finger-sign clause while preserving the rest of an authored
 * action. Image and video models can turn a requested finger count into an
 * obscene or anatomically broken sign, so those beats are never production
 * constraints.
 */
export function generationSafePerformanceText(
  value: string | null | undefined,
  fallback = "The actor completes one clear, task-specific action with relaxed natural hands.",
) {
  const source = value?.trim();
  if (!source || !hasRiskyFingerGesture(source)) return source || fallback;

  const kept = source
    .split(/(?<=[,;.!?])/)
    .map((clause) => clause.trim())
    .filter((clause) => clause && !hasRiskyFingerGesture(clause))
    .join(" ")
    .replace(/\s+([,;.!?])/g, "$1")
    .replace(/[,;]\s*$/g, "")
    .trim();

  return kept || fallback;
}

/** Identity locks must describe visible invariants, never a transient pose. */
export function staticRecognitionLocks(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim() ?? "")
    .filter((value) => value && !DYNAMIC_IDENTITY_LANGUAGE.test(value));
}

export function safeSignatureGesture(
  gesture: string | null | undefined,
  alternative: string | null | undefined,
) {
  if (!gesture?.trim() || hasRiskyFingerGesture(gesture)) {
    return alternative?.trim() || "Briefly stills, checks the nearest practical detail, and resumes with deliberate precision.";
  }
  return gesture.trim();
}

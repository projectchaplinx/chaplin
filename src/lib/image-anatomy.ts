export type SceneImageAnatomyReview = {
  pass: boolean;
  visibleHandCount: number;
  extraHands: boolean;
  malformedHands: boolean;
  disconnectedLimbs: boolean;
  ambiguousPropContact: boolean;
  issues: string[];
  correction: string;
  confidence: "low" | "medium" | "high";
};

export const SCENE_IMAGE_ANATOMY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pass: { type: "boolean" },
    visibleHandCount: { type: "integer", minimum: 0, maximum: 20 },
    extraHands: { type: "boolean" },
    malformedHands: { type: "boolean" },
    disconnectedLimbs: { type: "boolean" },
    ambiguousPropContact: { type: "boolean" },
    issues: { type: "array", maxItems: 8, items: { type: "string" } },
    correction: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: [
    "pass",
    "visibleHandCount",
    "extraHands",
    "malformedHands",
    "disconnectedLimbs",
    "ambiguousPropContact",
    "issues",
    "correction",
    "confidence",
  ],
} as const;

export const SCENE_IMAGE_ANATOMY_REVIEW_INSTRUCTIONS = [
  "You are Chaplin's strict pre-production anatomy inspector.",
  "Inspect only visible physical coherence; do not judge attractiveness, identity, acting, art direction, or story quality.",
  "Reject an image when any actor has an extra or duplicated hand, too many or fused fingers, a hand without a plausible wrist and forearm, an arm that branches or merges, or an important prop touched by ambiguous overlapping hands.",
  "A cropped, occluded, or out-of-frame hand is not a defect. Do not invent hidden anatomy.",
  "Set pass false for any clear defect, even if the rest of the image is strong.",
  "The correction must be a concise provider instruction describing the exact visible defect without quoting text shown inside the image.",
].join(" ");

export function buildSceneHandAnatomyDirection(input: {
  actorNames: string[];
  action?: string;
}) {
  const actors = input.actorNames.length ? input.actorNames.join(", ") : "every visible actor";
  const action = input.action?.trim();
  const propContact = action && /\b(phone|tablet|glass|bottle|cup|weapon|tool|product|card|paper|book|bag)\b/i.test(action)
    ? "The important prop is held by one clearly identifiable hand with one unbroken grip; the other hand has one separate, non-overlapping pose or remains outside the frame."
    : "Any visible prop contact belongs to one clearly identifiable hand with one unbroken grip.";
  return [
    `HAND ANATOMY LOCK: ${actors} each has no more than two hands total: one left hand and one right hand.`,
    "Every visible hand connects through exactly one plausible wrist to exactly one forearm and arm.",
    "Five naturally separated fingers per fully visible hand; no duplicated fingertips, fused fingers, branching wrists, stacked hands, phantom hands, or hand-like shapes emerging from clothing or the body.",
    propContact,
    "If a hand cannot be rendered cleanly, crop or occlude it instead of inventing additional anatomy.",
  ].join(" ");
}

export function parseSceneImageAnatomyReview(value: unknown): SceneImageAnatomyReview {
  if (!value || typeof value !== "object") throw new Error("Image anatomy review was not an object.");
  const row = value as Record<string, unknown>;
  const confidence = row.confidence === "low" || row.confidence === "medium" ? row.confidence : "high";
  const extraHands = row.extraHands === true;
  const malformedHands = row.malformedHands === true;
  const disconnectedLimbs = row.disconnectedLimbs === true;
  const ambiguousPropContact = row.ambiguousPropContact === true;
  return {
    pass: row.pass === true
      && !extraHands
      && !malformedHands
      && !disconnectedLimbs
      && !ambiguousPropContact,
    visibleHandCount: Math.max(0, Math.min(20, Math.round(Number(row.visibleHandCount) || 0))),
    extraHands,
    malformedHands,
    disconnectedLimbs,
    ambiguousPropContact,
    issues: Array.isArray(row.issues)
      ? row.issues.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 8)
      : [],
    correction: typeof row.correction === "string" ? row.correction.trim().slice(0, 800) : "",
    confidence,
  };
}

export function buildAnatomyRetryDirection(review: SceneImageAnatomyReview) {
  const issues = review.issues.length ? review.issues.join("; ") : review.correction || "visible hand anatomy failed review";
  return [
    "MANDATORY ANATOMY RETRY: Discard the previous composition and render the frame again from the written scene and locked identity references.",
    `Correct these visible defects: ${issues}.`,
    "Simplify the gesture and separate the hands spatially. Preserve exactly one left hand and one right hand per visible actor, each attached to one wrist and forearm.",
    "Do not patch, multiply, mirror, or blend the rejected hands.",
  ].join(" ");
}

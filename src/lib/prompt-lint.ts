import { z } from "zod";
import { defaultMarkerFailures } from "@/lib/prompt-composer";
import { adBoardSchema, lintAdBoard } from "@/lib/ad-board";

export const promptConsumerSchema = z.enum(["runtime", "sheet", "voice", "dialogue", "sfx", "theme", "image", "video"]);
export const recognitionLockSchema = z.object({
  text: z.string().min(2),
  visibility: z.enum(["always", "expression", "framing"]).default("always"),
  when: z.string().optional(),
});
export const promptArtifactSchema = z.object({
  id: z.string().min(1),
  consumer: promptConsumerSchema,
  prompt: z.string(),
  medium: z.string().optional(),
  expression: z.string().optional(),
  framing: z.string().optional(),
});
export const promptLintInputSchema = z.object({
  artifacts: z.array(promptArtifactSchema),
  canonicalMedium: z.string().optional(),
  recognitionLocks: z.array(recognitionLockSchema).default([]),
  wardrobe: z.string().optional(),
  canonPresentation: z.string().optional(),
  voicePresentation: z.string().optional(),
  presentationConfirmed: z.boolean().default(false),
  adBoard: adBoardSchema.optional(),
});
export type PromptLintInput = z.infer<typeof promptLintInputSchema>;
export type PromptLintIssue = { rule: `L${number}`; cardId: string; message: string };
export type PromptLintResult = {
  pass: boolean;
  warnings: PromptLintIssue[];
  failures: PromptLintIssue[];
  durationMs: number;
};

const STYLIZED = /\b(manga|anime|illustration|illustrated|cartoon|comic|cel shading|screentone|2D)\b/i;
const PHOTOREAL = /\b(photoreal|live.action|cinematic photograph|natural skin|real human)\b/i;
const NARRATIVE = /\b(story|plot|cliffhanger|payoff|discovers?|mission|signed up|betray|save someone|scene beat)\b/i;
const SEQUENCE = /\b(five seconds?|then|followed by|after that|next|first.+(?:then|followed)|\d(?:\.\d+)?s\s*[-:])\b/i;
const GARMENTS = /\b(coat|jacket|kurta|salwar|saree|sari|dress|shirt|blouse|trousers|skirt|robe|uniform|boots|shoes|flip-flops?|belt|hat|scarf|gloves)\b/gi;
/** Basics almost never spelled out in a canonical wardrobe sentence. */
const GENERIC_GARMENTS = new Set(["shoes", "boots", "belt", "shirt", "trousers"]);

function normalizedWords(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

function duplicatedSegment(prompt: string, width = 21) {
  const words = normalizedWords(prompt);
  const seen = new Set<string>();
  for (let index = 0; index <= words.length - width; index += 1) {
    const segment = words.slice(index, index + width).join(" ");
    if (seen.has(segment)) return segment;
    seen.add(segment);
  }
  return null;
}

function garmentSet(value: string | undefined) {
  return new Set((value?.match(GARMENTS) ?? []).map((item) => item.toLowerCase()));
}

function mediumFamily(value: string | undefined) {
  if (!value) return "unknown";
  if (STYLIZED.test(value)) return "stylized";
  if (PHOTOREAL.test(value)) return "photoreal";
  return "unknown";
}

export function lintPromptHandoff(rawInput: PromptLintInput): PromptLintResult {
  const started = performance.now();
  const input = promptLintInputSchema.parse(rawInput);
  const failures: PromptLintIssue[] = [];
  const warnings: PromptLintIssue[] = [];
  const canonicalFamily = mediumFamily(input.canonicalMedium);
  const allowedGarments = garmentSet(input.wardrobe);

  for (const artifact of input.artifacts) {
    // Advisory, not a gate. Composed prompts legitimately repeat persona and
    // performance boilerplate across slots, so a repeated 21-word window is a
    // quality smell rather than proof the prompt is broken.
    const duplicate = duplicatedSegment(artifact.prompt);
    if (duplicate) warnings.push({ rule: "L1", cardId: artifact.id, message: `Repeated rendered segment: “${duplicate.slice(0, 120)}…”` });
    for (const marker of defaultMarkerFailures(artifact.prompt)) {
      failures.push({ rule: "L1", cardId: artifact.id, message: marker });
    }
    if (["sheet", "image"].includes(artifact.consumer)) {
      const family = mediumFamily(artifact.medium || artifact.prompt);
      if (canonicalFamily !== "unknown" && family !== "unknown" && family !== canonicalFamily) {
        failures.push({ rule: "L2", cardId: artifact.id, message: `Canonical medium is ${canonicalFamily}, but this prompt requests ${family}.` });
      }
      if (canonicalFamily === "photoreal" && /\bnegative\b[^]*\bphotoreal\b/i.test(artifact.prompt)) {
        failures.push({ rule: "L2", cardId: artifact.id, message: "Negative prompt excludes the canonical photoreal medium." });
      }
      if (canonicalFamily === "stylized" && /\bnegative\b[^]*\b(?:manga|anime|illustration|cartoon)\b/i.test(artifact.prompt)) {
        failures.push({ rule: "L2", cardId: artifact.id, message: "Negative prompt excludes the canonical stylized medium." });
      }
      // A canonical wardrobe string describes the hero garments; it rarely
      // enumerates basics. Flagging "shoes" because the wardrobe sentence never
      // said "shoes" is noise, so generic items are exempt and the rest is
      // advisory rather than blocking.
      const emittedGarments = garmentSet(artifact.prompt);
      for (const garment of emittedGarments) {
        if (allowedGarments.size && !allowedGarments.has(garment) && !GENERIC_GARMENTS.has(garment)) {
          warnings.push({ rule: "L4", cardId: artifact.id, message: `Prompt invents wardrobe item “${garment}” outside the canonical wardrobe.` });
        }
      }
    }
    if (artifact.consumer === "video") {
      const emittedGarments = garmentSet(artifact.prompt);
      for (const garment of emittedGarments) {
        if (allowedGarments.size && !allowedGarments.has(garment)) {
          failures.push({ rule: "L4", cardId: artifact.id, message: `Motion prompt animates non-canonical garment “${garment}”.` });
        }
      }
    }
    if (["voice", "sfx", "theme"].includes(artifact.consumer) && NARRATIVE.test(artifact.prompt)) {
      failures.push({ rule: "L5", cardId: artifact.id, message: "Narrative/story direction leaked into a sound-design prompt." });
    }
    const positiveSfx = artifact.prompt.split(/\bNo repeated|\bExclude|\bAvoid/i)[0];
    if (artifact.consumer === "sfx" && (SEQUENCE.test(positiveSfx) || (positiveSfx.match(/,/g)?.length ?? 0) > 8)) {
      failures.push({ rule: "L6", cardId: artifact.id, message: "Signature SFX must describe one atomic physical event, not a timed sequence." });
    }
    for (const lock of input.recognitionLocks) {
      const shouldApply = lock.visibility === "always"
        || (lock.visibility === "expression" && Boolean(lock.when && artifact.expression?.toLowerCase().includes(lock.when.toLowerCase())))
        || (lock.visibility === "framing" && Boolean(lock.when && artifact.framing?.toLowerCase().includes(lock.when.toLowerCase())));
      if (shouldApply && ["sheet", "image"].includes(artifact.consumer) && !artifact.prompt.toLowerCase().includes(lock.text.toLowerCase())) {
        warnings.push({ rule: "L3", cardId: artifact.id, message: `Visible recognition lock is missing: ${lock.text}` });
      }
    }
  }

  if (
    input.canonPresentation
    && input.voicePresentation
    && input.canonPresentation.toLowerCase() !== input.voicePresentation.toLowerCase()
    && !input.presentationConfirmed
  ) {
    warnings.push({ rule: "L7", cardId: "voice", message: `Canon presentation “${input.canonPresentation}” differs from voice presentation “${input.voicePresentation}”. Confirm before locking the voice.` });
  }

  if (input.adBoard) {
    for (const issue of lintAdBoard(input.adBoard)) {
      const mapped = {
        rule: "L9" as const,
        cardId: issue.slotId,
        message: `${issue.rule}: ${issue.message}`,
      };
      if (issue.level === "failure") failures.push(mapped);
      else warnings.push(mapped);
    }
  }

  const dedupe = (issues: PromptLintIssue[]) => [...new Map(issues.map((issue) => [`${issue.rule}:${issue.cardId}:${issue.message}`, issue])).values()];
  const uniqueFailures = dedupe(failures);
  return {
    pass: uniqueFailures.length === 0,
    warnings: dedupe(warnings),
    failures: uniqueFailures,
    durationMs: Number((performance.now() - started).toFixed(3)),
  };
}

export class PromptLintError extends Error {
  constructor(public readonly result: PromptLintResult) {
    super(`Prompt handoff blocked: ${result.failures.map((issue) => `${issue.rule} ${issue.message}`).join("; ")}`);
    this.name = "PromptLintError";
  }
}

import { z } from "zod";

export const styleContractSchema = z.object({
  id: z.string().uuid(),
  board_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  contract_text: z.string().trim().min(40),
  source_refs: z.array(z.string().uuid()).min(5).max(10),
  extracted_at: z.string().datetime(),
  model_used: z.string().trim().min(1),
}).strict();

export type StyleContract = z.infer<typeof styleContractSchema>;

export const STYLE_EXTRACTION_FIELDS = [
  "lens feel",
  "lighting direction and motivated source",
  "palette",
  "grain",
  "contrast",
  "blocking",
  "atmosphere",
  "era markers",
] as const;

export function styleExtractionPrompt() {
  return [
    "Study all supplied reference stills as one project-level visual system.",
    `Return one locked paragraph naming: ${STYLE_EXTRACTION_FIELDS.join(", ")}.`,
    "Use concrete observable language. Do not narrate the story or describe individual frames.",
  ].join(" ");
}
export function injectStyleContract(prompt: string, contract?: Pick<StyleContract, "contract_text"> | null) {
  if (!contract?.contract_text.trim()) return prompt;
  const text = contract.contract_text.trim();
  if (prompt.includes(text)) return prompt;
  return `${prompt.trim()}\nSTYLE CONTRACT — VERBATIM:\n${text}`;
}

import { z } from "zod";

export const generationVerdictSchema = z.enum(["kept", "killed", "pending"]);
export const changedVariableSchema = z.enum(["camera", "lighting", "speed", "action", "reference", "identity", "voice"]);
export const generationVerdictInputSchema = z.object({
  job_id: z.string().uuid().optional(),
  result_asset_id: z.string().uuid().optional(),
  shot_id: z.string().trim().min(1).nullable().optional(),
  board_id: z.string().uuid().nullable().optional(),
  verdict: generationVerdictSchema,
  changed_variable: changedVariableSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
}).strict().superRefine((input, context) => {
  if (!input.job_id && !input.result_asset_id) {
    context.addIssue({ code: "custom", message: "A job or result asset is required." });
  }
});

export type GenerationVerdictInput = z.infer<typeof generationVerdictInputSchema>;

export function verdictIterationWarning(input: Pick<GenerationVerdictInput, "verdict" | "changed_variable">) {
  return input.verdict === "pending" && !input.changed_variable
    ? "Name the one changed variable before re-running this take."
    : null;
}

export function verdictStats(rows: Array<{ verdict: "kept" | "killed" | "pending"; changed_variable?: string | null }>) {
  const decided = rows.filter((row) => row.verdict !== "pending");
  const killed = decided.filter((row) => row.verdict === "killed").length;
  const keptByVariable = new Map<string, number>();
  for (const row of decided) {
    if (row.verdict === "kept" && row.changed_variable) {
      keptByVariable.set(row.changed_variable, (keptByVariable.get(row.changed_variable) ?? 0) + 1);
    }
  }
  const bestConversionVariable = [...keptByVariable.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    decided: decided.length,
    killRate: decided.length ? killed / decided.length : 0,
    bestConversionVariable,
  };
}

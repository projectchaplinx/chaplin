"use client";

import { useMemo, useState } from "react";
import {
  dimensionsForStage,
  summarizeDirectorEvaluation,
  type DirectorEvaluationAxis,
  type DirectorEvaluationRecord,
  type DirectorEvaluationScores,
  type DirectorEvaluationScore,
} from "@/lib/director-evaluation";
import type { PipelineStageId } from "@/lib/pipeline-config";

const AXES: Array<{ id: DirectorEvaluationAxis; label: string }> = [
  { id: "instruction", label: "Intent following" },
  { id: "continuity", label: "Temporal continuity" },
  { id: "aesthetic", label: "Aesthetic quality" },
];

export default function DirectorEvaluationScorecard({
  stage,
  resultId,
  initialEvaluation,
  onSaved,
}: {
  stage: PipelineStageId;
  resultId: string;
  initialEvaluation: DirectorEvaluationRecord | null;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [scores, setScores] = useState<DirectorEvaluationScores>(initialEvaluation?.scores ?? {});
  const [notes, setNotes] = useState(initialEvaluation?.reviewerNotes ?? "");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const dimensions = dimensionsForStage(stage);
  const summary = useMemo(() => summarizeDirectorEvaluation(stage, scores), [scores, stage]);

  async function save(status: "draft" | "reviewed") {
    setBusy(status);
    setMessage("");
    try {
      const response = await fetch("/api/admin/pipeline/experiments", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "director-evaluate",
          resultId,
          scores,
          reviewerNotes: notes,
          status,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Director review could not be saved.");
      await onSaved();
      setMessage(status === "reviewed" ? "Film-grade review complete." : "Draft scorecard saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Director review could not be saved.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-accent-secondary/25 bg-accent-secondary/[0.035]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <span>
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-accent-secondary">Director scorecard</span>
          <span className="mt-1 block text-[10px] text-grey">
            {summary.score == null ? "Not evaluated" : `${summary.score}/100`}
            {" · "}
            {summary.gateStatus === "pass" ? "hard gates pass" : summary.gateStatus === "fail" ? "hard gates failed" : `${summary.missingRequired.length} gates unscored`}
          </span>
        </span>
        <span className="text-sm text-grey">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <div className="border-t border-line p-3">
          <p className="text-[9px] leading-4 text-grey">
            1 = unusable or contradicted · 3 = production-usable · 5 = exceptional and fully evidenced.
            Hard gates cannot be hidden by a high average.
          </p>
          <div className="mt-3 space-y-4">
            {AXES.map((axis) => {
              const axisDimensions = dimensions.filter((dimension) => dimension.axis === axis.id);
              if (!axisDimensions.length) return null;
              return (
                <section key={axis.id}>
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink">{axis.label}</p>
                    <p className="text-[9px] text-grey">{summary.axisScores[axis.id] ?? "—"}/100</p>
                  </div>
                  <div className="mt-2 space-y-2">
                    {axisDimensions.map((dimension) => (
                      <div key={dimension.id} className="rounded-lg border border-white/10 p-2.5">
                        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold text-ink">
                              {dimension.label}
                              {dimension.hardGate ? <span className="ml-1 text-[8px] uppercase text-amber-200">gate</span> : null}
                            </p>
                            <p className="mt-0.5 text-[8px] leading-4 text-grey">{dimension.question}</p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {([1, 2, 3, 4, 5] as DirectorEvaluationScore[]).map((score) => (
                              <button
                                key={score}
                                type="button"
                                onClick={() => setScores((current) => ({ ...current, [dimension.id]: score }))}
                                className={`h-7 w-7 rounded-full border text-[9px] font-semibold ${
                                  scores[dimension.id] === score
                                    ? score < 3 ? "border-red-400 bg-red-400/15 text-red-200" : "border-accent-secondary bg-accent-secondary/15 text-accent-secondary"
                                    : "border-line text-grey"
                                }`}
                              >
                                {score}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          <textarea
            className="field mt-3 min-h-20 w-full resize-y text-[10px]"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Evidence and reviewer notes. Name the failure or improvement precisely."
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className={`text-[9px] ${summary.gateStatus === "fail" ? "text-red-300" : "text-grey"}`}>
              {summary.scoredDimensions}/{summary.applicableDimensions} scored
              {summary.gateFailures.length ? ` · failed: ${summary.gateFailures.join(", ")}` : ""}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => save("draft")} disabled={Boolean(busy)} className="rounded-full border border-line px-3 py-2 text-[9px] font-semibold disabled:opacity-40">
                {busy === "draft" ? "Saving..." : "Save draft"}
              </button>
              <button type="button" onClick={() => save("reviewed")} disabled={Boolean(busy) || summary.scoredDimensions !== summary.applicableDimensions} className="rounded-full border border-accent-secondary/50 px-3 py-2 text-[9px] font-semibold text-accent-secondary disabled:opacity-35">
                {busy === "reviewed" ? "Completing..." : "Complete review"}
              </button>
            </div>
          </div>
          {message ? <p className={`mt-2 text-[9px] ${/could not|score all|error/i.test(message) ? "text-red-300" : "text-emerald-300"}`}>{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

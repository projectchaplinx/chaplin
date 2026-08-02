import {
  buildDirectorEvaluationDiagnostics,
  DIRECTOR_EVALUATION_DIMENSIONS,
  type DirectorEvaluationRecord,
} from "@/lib/director-evaluation";
import type { RenderLearningPanels } from "@/lib/server/director-intelligence";

function scoreTone(score: number) {
  if (score >= 80) return "text-emerald-300";
  if (score >= 60) return "text-amber-200";
  return "text-red-300";
}

export default function AdminDirectorLearning({
  evaluations,
  storageReady,
  renderPanels,
}: {
  evaluations: DirectorEvaluationRecord[];
  storageReady: boolean;
  renderPanels?: RenderLearningPanels;
}) {
  const diagnostics = buildDirectorEvaluationDiagnostics(evaluations);
  return (
    <section className="poster-card mb-8 rounded-xl p-5" data-director-learning-scorecard>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-secondary">Learning scorecard</p>
          <h2 className="reel-title mt-1 text-2xl">What is actually improving?</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-grey">
            Film-grade reviews keep intent following, temporal continuity, and aesthetic quality separate. A high average cannot override broken identity, geography, period, screen direction, or audio gates.
          </p>
        </div>
        <a href="/admin/pipeline/experiments" className="rounded-full border border-accent-secondary/45 px-4 py-2 text-[10px] font-semibold text-accent-secondary">
          Open controlled tests →
        </a>
      </div>

      {!storageReady ? (
        <p className="mt-4 rounded-lg border border-amber-300/30 p-3 text-xs text-amber-100">
          Apply the Director evaluation migration to activate measured learning.
        </p>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Reviews", diagnostics.total],
          ["Completed", diagnostics.reviewed],
          ["Gates pass", diagnostics.passing],
          ["Gates fail", diagnostics.failing],
          ["Mean", diagnostics.averageScore == null ? "—" : `${diagnostics.averageScore}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/10 p-3">
            <p className="text-xl font-semibold text-ink">{value}</p>
            <p className="mt-1 text-[8px] uppercase tracking-[0.12em] text-grey">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-grey">Weakest measured dimensions</p>
          <div className="mt-2 space-y-2">
            {diagnostics.dimensionAverages.slice(0, 8).map((dimension) => (
              <div key={dimension.id} className="grid grid-cols-[130px_minmax(0,1fr)_52px] items-center gap-2 text-[9px]">
                <span className="truncate text-grey">{dimension.label}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-secondary" style={{ width: `${dimension.score / 5 * 100}%` }} />
                </span>
                <span className={scoreTone(dimension.score / 5 * 100)}>{dimension.score.toFixed(2)} · n{dimension.samples}</span>
              </div>
            ))}
            {!diagnostics.dimensionAverages.length ? (
              <p className="rounded-lg border border-dashed border-line p-4 text-[10px] leading-5 text-grey">
                No completed reviews yet. Run the same brief through Control and Challenger, review both outputs, then choose the human-preferred result.
              </p>
            ) : null}
          </div>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-grey">Recent reviewed outputs</p>
          <div className="mt-2 space-y-2">
            {evaluations.filter((evaluation) => evaluation.status === "reviewed").slice(0, 5).map((evaluation) => (
              <article key={evaluation.id} className="rounded-lg border border-white/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-semibold uppercase text-accent-secondary">{evaluation.stage}</span>
                  <span className={`text-sm font-semibold ${scoreTone(evaluation.compositeScore ?? 0)}`}>{evaluation.compositeScore ?? "—"}</span>
                </div>
                <p className="mt-1 text-[9px] text-grey">
                  {evaluation.gateStatus === "pass" ? "Hard gates passed" : `Failed: ${evaluation.gateFailures.map((id) => DIRECTOR_EVALUATION_DIMENSIONS.find((dimension) => dimension.id === id)?.label ?? id).join(", ")}`}
                </p>
                {evaluation.reviewerNotes ? <p className="mt-2 line-clamp-2 text-[9px] leading-4 text-white/55">{evaluation.reviewerNotes}</p> : null}
              </article>
            ))}
          </div>
        </div>
      </div>

      {renderPanels && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]" data-render-learning-panels>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-grey">Identity hold — measured per rendered clip</p>
            {renderPanels.identityReadings.length ? (
              <div className="mt-2 space-y-1.5">
                {renderPanels.identityReadings.slice(0, 10).map((reading) => (
                  <div key={`${reading.at}:${reading.label}`} className="rounded-lg border border-white/10 p-2.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-[9px]">
                      <span className="truncate text-grey">{reading.label}</span>
                      <span className={reading.identityContinuity == null ? "text-grey" : scoreTone(reading.identityContinuity)}>
                        ID {reading.identityContinuity ?? "—"}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[8px] uppercase tracking-[0.1em] ${reading.gateStatus === "pass" ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}`}>
                        {reading.gateStatus}
                      </span>
                    </div>
                    {reading.driftNotes.length > 0 && reading.gateStatus !== "pass" && (
                      <p className="mt-1 line-clamp-2 text-[8px] leading-4 text-white/50">{reading.driftNotes.join(" · ")}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-lg border border-dashed border-line p-4 text-[10px] leading-5 text-grey">
                No measured clips yet. The identity instrument scores every new Spark and Punch shot automatically — render one and its identity hold appears here.
              </p>
            )}
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-grey">Kill causes — human verdicts by changed variable</p>
            {renderPanels.killByVariable.length ? (
              <div className="mt-2 space-y-2">
                {renderPanels.killByVariable.map((entry) => {
                  const total = entry.kept + entry.killed;
                  const killShare = total ? Math.round((entry.killed / total) * 100) : 0;
                  return (
                    <div key={entry.variable} className="grid grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-2 text-[9px]">
                      <span className="truncate text-grey">{entry.variable}</span>
                      <span className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
                        <span className="block h-full bg-red-400/80" style={{ width: `${killShare}%` }} />
                        <span className="block h-full bg-emerald-400/70" style={{ width: `${100 - killShare}%` }} />
                      </span>
                      <span className="font-mono text-grey">{entry.killed}✕ / {entry.kept}✓</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 rounded-lg border border-dashed border-line p-4 text-[10px] leading-5 text-grey">
                No verdicts recorded yet. Keep/kill controls sit on every watched shot in the production canvas.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

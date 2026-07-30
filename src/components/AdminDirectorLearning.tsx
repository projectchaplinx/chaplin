import {
  buildDirectorEvaluationDiagnostics,
  DIRECTOR_EVALUATION_DIMENSIONS,
  type DirectorEvaluationRecord,
} from "@/lib/director-evaluation";

function scoreTone(score: number) {
  if (score >= 80) return "text-emerald-300";
  if (score >= 60) return "text-amber-200";
  return "text-red-300";
}

export default function AdminDirectorLearning({
  evaluations,
  storageReady,
}: {
  evaluations: DirectorEvaluationRecord[];
  storageReady: boolean;
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
    </section>
  );
}

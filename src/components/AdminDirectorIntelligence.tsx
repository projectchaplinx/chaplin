import type { DirectorIntelligence } from "@/lib/server/director-intelligence";

/**
 * The intelligence node: what the brain KNOWS, not what it has been doing.
 *
 * Server-rendered and interaction-free by design — expansion uses <details>,
 * so the knowledge inventory is readable even before hydration and costs no
 * client JavaScript.
 */
export default function AdminDirectorIntelligence({ intelligence }: { intelligence: DirectorIntelligence }) {
  const { retrievable, verified, undecided, productionEvidence, coverageByDomain, namedGaps } = intelligence;
  const decidedTotal = retrievable.total + undecided.discardedPrinciples;
  const crunchedTotal = decidedTotal + undecided.draftPrinciples + undecided.parkedPrinciples;
  const byDomain = new Map<string, typeof retrievable.principles>();
  for (const principle of retrievable.principles) {
    byDomain.set(principle.domain, [...(byDomain.get(principle.domain) ?? []), principle]);
  }

  return (
    <section id="director-intelligence" className="poster-card mb-8 rounded-md p-5" data-director-intelligence>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Intelligence node</p>
      <h2 className="reel-title mt-1 text-3xl">What the brain knows</h2>
      <p className="mt-2 max-w-3xl text-xs leading-5 text-grey">
        Knowledge, not activity. Only the retrievable set below ever reaches Magic Write; everything else is
        collected material still waiting on a decision.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Retrievable now", retrievable.total, "rules Magic can inject", "text-accent"],
          ["Human-verified", verified.playbackVerifiedPassages + verified.denseVerifierHeld, `${verified.playbackVerifiedPassages} playback · ${verified.denseVerifierHeld} dense-held`, "text-emerald-400"],
          ["Awaiting decision", undecided.draftPrinciples + undecided.parkedPrinciples, `${undecided.draftPrinciples} draft · ${undecided.parkedPrinciples} parked`, "text-amber-300"],
          ["From our own renders", productionEvidence.decisionTraces + productionEvidence.evaluations + productionEvidence.humanVerdicts, `${productionEvidence.decisionTraces} traces · ${productionEvidence.evaluations} scores · ${productionEvidence.humanVerdicts} verdicts`, "text-sky-300"],
        ].map(([label, value, hint, tone]) => (
          <article key={String(label)} className="rounded-md border border-line bg-black/10 p-4">
            <p className={`text-2xl font-semibold ${tone}`}>{value}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-ink">{label}</p>
            <p className="mt-1 text-[10px] leading-4 text-grey">{hint}</p>
          </article>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-5 text-grey">
        Of {crunchedTotal} principle candidates crunched so far, <span className="text-ink">{retrievable.total} are live knowledge</span>,
        {" "}{undecided.discardedPrinciples} were rejected with reasons, and {undecided.draftPrinciples + undecided.parkedPrinciples} still
        need a decision — plus {undecided.manifestsAwaitingReview} collection records awaiting rights review. Crunching only becomes
        knowledge when it crosses this line.
      </p>

      {namedGaps.length > 0 && (
        <div className="mt-4 rounded-md border border-red-400/30 bg-red-500/[0.06] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-400">Named gaps — what the brain cannot answer yet</p>
          <ul className="mt-2 space-y-2">
            {namedGaps.map((gap) => (
              <li key={gap.axis} className="text-xs leading-5 text-grey">
                <span className="font-semibold text-ink">{gap.axis}</span> — {gap.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-secondary">Coverage by domain — retrievable vs waiting</p>
        <div className="mt-2 grid gap-1.5">
          {coverageByDomain.map((entry) => {
            const width = Math.max(4, Math.round((entry.retrievable / Math.max(1, retrievable.total)) * 100));
            return (
              <div key={entry.domain} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-[11px]">
                <span className="truncate text-grey">{entry.domain}</span>
                <span className="h-2 overflow-hidden rounded-full bg-white/5">
                  <span className="block h-full rounded-full bg-accent/70" style={{ width: `${width}%` }} />
                </span>
                <span className="font-mono text-grey">{entry.retrievable}{entry.pendingDecision ? ` (+${entry.pendingDecision} waiting)` : ""}</span>
              </div>
            );
          })}
        </div>
      </div>

      <details className="group mt-5 rounded-md border border-line bg-black/10">
        <summary className="cursor-pointer select-none p-4 text-xs font-semibold text-ink">
          Read the knowledge itself — every retrievable principle ({retrievable.total})
          <span className="ml-2 text-[10px] font-normal text-grey">{retrievable.builtInPatterns} built-in craft patterns · {retrievable.approvedStudyPrinciples} from approved studies · {retrievable.periodProfiles} period profiles</span>
        </summary>
        <div className="grid gap-4 border-t border-line p-4">
          {[...byDomain.entries()].map(([domain, principles]) => (
            <div key={domain}>
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">{domain} · {principles.length}</p>
              <ul className="mt-1.5 space-y-1.5">
                {principles.map((principle) => (
                  <li key={`${principle.workTitle}:${principle.text.slice(0, 40)}`} className="text-xs leading-5 text-grey">
                    → {principle.text}
                    <span className="ml-2 text-[9px] uppercase tracking-[0.12em] text-white/35">{principle.origin === "built-in" ? principle.workTitle : `study · ${principle.workTitle}`}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

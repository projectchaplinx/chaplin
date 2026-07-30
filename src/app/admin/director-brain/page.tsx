import { redirect } from "next/navigation";
import AdminDirectorCampaign from "@/components/AdminDirectorCampaign";
import AdminDirectorResearch from "@/components/AdminDirectorResearch";
import AdminDirectorGraph from "@/components/AdminDirectorGraph";
import AdminSectionNav from "@/components/AdminSectionNav";
import {
  DIRECTOR_BRAIN_POLICY,
  DIRECTOR_BRAIN_VERSION,
  DIRECTOR_PATTERNS,
  DIRECTOR_PERIOD_PROFILES,
  DIRECTOR_SOURCES,
} from "@/lib/director-brain";
import { getServerAuthIdentity } from "@/lib/server/auth";
import { listDirectorResearch } from "@/lib/server/director-research";
import { listDirectorDecisionTraces } from "@/lib/server/director-decisions";

export const dynamic = "force-dynamic";

export default async function AdminDirectorBrainPage() {
  const identity = await getServerAuthIdentity();
  if (identity?.role !== "admin") redirect("/super-admin?next=/admin/director-brain");

  const domains = [...new Set(DIRECTOR_PATTERNS.map((pattern) => pattern.domain))];
  const [{ research, researchError }, decisionBundle] = await Promise.all([(async () => {
    try {
      return { research: await listDirectorResearch(), researchError: "" };
    } catch (error) {
      return {
        research: { storageReady: false, sources: [], studies: [] },
        researchError: error instanceof Error ? error.message : "Could not load Director Brain research.",
      };
    }
  })(), listDirectorDecisionTraces(100)]);

  return (
    <main className="app-width min-w-0 px-4 py-8 sm:px-6 sm:py-10" data-director-brain>
      <header className="mb-7">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">Super Admin · Explainable direction</p>
        <h1 className="marquee-title mt-2 text-3xl leading-tight sm:text-5xl">DIRECTOR BRAIN</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-grey">
          See what Chaplin knows, where it came from, and which rules can enter a production. This corpus stores reusable craft relationships and historical evidence—not copied scripts, transcripts, or protected scenes.
        </p>
      </header>

      <AdminSectionNav />

      <AdminDirectorGraph decisions={decisionBundle.decisions} storageReady={decisionBundle.storageReady} />

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Brain version", DIRECTOR_BRAIN_VERSION],
          ["Craft patterns", DIRECTOR_PATTERNS.length],
          ["Period profiles", DIRECTOR_PERIOD_PROFILES.length],
          ["Primary sources", DIRECTOR_SOURCES.length],
        ].map(([label, value]) => (
          <article key={label} className="poster-card rounded-md p-4">
            <p className="break-words text-xl font-semibold text-ink">{value}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-grey">{label}</p>
          </article>
        ))}
      </section>

      <section className="poster-card mb-8 rounded-md p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-secondary">Learning contract</p>
        <h2 className="reel-title mt-2 text-2xl">What the brain is allowed to learn</h2>
        <ol className="mt-4 grid gap-2 md:grid-cols-2">
          {DIRECTOR_BRAIN_POLICY.map((rule, index) => (
            <li key={rule} className="rounded-md border border-line bg-black/10 p-3 text-xs leading-5 text-grey">
              <span className="mr-2 font-mono text-accent">{String(index + 1).padStart(2, "0")}</span>
              {rule}
            </li>
          ))}
        </ol>
      </section>

      <AdminDirectorCampaign initialBundle={research} />

      <AdminDirectorResearch initialBundle={research} initialError={researchError} />

      <section className="mb-9">
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Craft retrieval</p>
          <h2 className="reel-title mt-1 text-3xl">Rules available to Magic Write</h2>
          <p className="mt-2 text-xs text-grey">Domains: {domains.join(" · ")}</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {DIRECTOR_PATTERNS.map((pattern) => (
            <article key={pattern.id} className="poster-card rounded-md p-5" data-director-pattern={pattern.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent-secondary">{pattern.domain}</p>
                  <h3 className="mt-1 text-lg font-semibold text-ink">{pattern.name}</h3>
                </div>
                <code className="rounded-full border border-line px-2 py-1 text-[9px] text-grey">{pattern.id}</code>
              </div>
              <p className="mt-3 text-sm leading-6 text-ink">{pattern.principle}</p>
              <ul className="mt-3 space-y-1.5 text-xs leading-5 text-grey">
                {pattern.application.map((item) => <li key={item}>→ {item}</li>)}
              </ul>
              <p className="mt-4 text-[9px] uppercase tracking-[0.14em] text-grey">Evidence: {pattern.sourceIds.join(" · ")}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mb-9">
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Historical world engine</p>
          <h2 className="reel-title mt-1 text-3xl">Time is never enough without place</h2>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {DIRECTOR_PERIOD_PROFILES.map((profile) => (
            <article key={profile.id} className="overflow-hidden rounded-md border border-line bg-black/10" data-period-profile={profile.id}>
              <div className="border-b border-line p-5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent-secondary">{profile.dateRange}</p>
                <h3 className="mt-1 text-xl font-semibold text-ink">{profile.label}</h3>
                <p className="mt-1 text-xs text-grey">{profile.region}</p>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">Evidence and world rules</p>
                  <ul className="mt-2 space-y-2 text-xs leading-5 text-grey">
                    {[...profile.evidence, ...profile.visualRules, ...profile.materialRules].map((item) => <li key={item}>→ {item}</li>)}
                  </ul>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-red-400">Anachronism gate</p>
                  <ul className="mt-2 space-y-2 text-xs leading-5 text-grey">
                    {profile.anachronisms.map((item) => <li key={item}>× {item}</li>)}
                  </ul>
                  <p className="mt-4 text-[9px] uppercase tracking-[0.14em] text-grey">Evidence: {profile.sourceIds.join(" · ")}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Provenance register</p>
          <h2 className="reel-title mt-1 text-3xl">Research sources</h2>
        </div>
        <div className="grid gap-2">
          {DIRECTOR_SOURCES.map((source) => (
            <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="poster-card grid gap-2 rounded-md p-4 transition-colors hover:border-accent/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <span>
                <span className="block text-sm font-semibold text-ink">{source.title}</span>
                <span className="mt-1 block text-xs leading-5 text-grey">{source.institution} · {source.note}</span>
              </span>
              <span className="text-[9px] uppercase tracking-[0.14em] text-accent-secondary">{source.domains.join(" · ")} ↗</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

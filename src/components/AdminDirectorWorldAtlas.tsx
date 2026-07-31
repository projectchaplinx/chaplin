import type { DirectorSceneStudy } from "@/lib/director-research";
import type { DirectorPeriodProfile } from "@/lib/director-brain";
import {
  buildDirectorWorldAtlas,
  DIRECTOR_WORLD_ATLAS_ERAS,
  DIRECTOR_WORLD_ATLAS_REGIONS,
  DIRECTOR_WORLD_ATLAS_VERSION,
} from "@/lib/director-world-atlas";

function cellClass(status: "gap" | "baseline" | "verified") {
  if (status === "verified") return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
  if (status === "baseline") return "border-amber-300/35 bg-amber-300/[0.07] text-amber-100";
  return "border-white/8 bg-white/[0.018] text-white/25";
}

export default function AdminDirectorWorldAtlas({
  profiles,
  studies,
}: {
  profiles: DirectorPeriodProfile[];
  studies: DirectorSceneStudy[];
}) {
  const atlas = buildDirectorWorldAtlas({ profiles, studies });
  const totalCells = atlas.cells.length;

  return (
    <section className="mb-10" data-director-world-atlas>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
            World Atlas · {DIRECTOR_WORLD_ATLAS_VERSION}
          </p>
          <h2 className="reel-title mt-1 text-3xl">What time and place the brain actually knows</h2>
          <p className="mt-2 max-w-4xl text-xs leading-5 text-grey">
            A year is not a visual style. Every cell must be grounded by region, community, role, material culture,
            infrastructure, sound, and source provenance. Empty cells are deliberately visible: Chaplin must ask or
            research rather than hallucinate a generic period world.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[9px] uppercase tracking-[0.12em]">
          <span className="rounded-full border border-emerald-300/35 px-2.5 py-1 text-emerald-100">{atlas.verifiedCells} research-verified</span>
          <span className="rounded-full border border-amber-300/35 px-2.5 py-1 text-amber-100">{atlas.baselineCells} baseline</span>
          <span className="rounded-full border border-white/12 px-2.5 py-1 text-grey">{atlas.gapCells} gaps</span>
        </div>
      </div>

      <div className="poster-card mb-4 grid gap-3 rounded-xl p-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Atlas cells", totalCells, "9 era bands × 8 world regions"],
          ["Covered", atlas.coveredCells, "Baseline or approved research"],
          ["Approved studies", atlas.approvedStudyCount, "Human-approved world evidence only"],
          ["Coverage", `${Math.round((atlas.coveredCells / totalCells) * 100)}%`, "No inference from missing cells"],
        ].map(([label, value, note]) => (
          <article key={label} className="rounded-lg border border-white/10 p-3">
            <p className="text-xl font-semibold text-ink">{value}</p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-grey">{label}</p>
            <p className="mt-2 text-[9px] leading-4 text-white/40">{note}</p>
          </article>
        ))}
      </div>

      <div className="poster-card overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink">Era × region evidence matrix</p>
          <p className="text-[9px] text-grey">
            <span className="text-emerald-200">● approved study</span>
            {" · "}
            <span className="text-amber-100">● built-in baseline</span>
            {" · "}
            <span className="text-white/35">○ research gap</span>
          </p>
        </div>
        <div className="overflow-x-auto" data-lenis-prevent>
          <div className="min-w-[76rem] p-3">
            <div className="grid grid-cols-[10rem_repeat(8,minmax(7.5rem,1fr))] gap-1.5">
              <div />
              {DIRECTOR_WORLD_ATLAS_REGIONS.map((region) => (
                <div key={region.id} className="px-2 py-2 text-[8px] font-semibold uppercase tracking-[0.11em] text-grey">
                  {region.label}
                </div>
              ))}
              {DIRECTOR_WORLD_ATLAS_ERAS.flatMap((era) => [
                <div key={`${era.id}-label`} className="flex items-center px-2 py-3 text-[9px] font-semibold text-ink">
                  {era.label}
                </div>,
                ...DIRECTOR_WORLD_ATLAS_REGIONS.map((region) => {
                  const cell = atlas.cells.find((candidate) => candidate.id === `${era.id}:${region.id}`)!;
                  return (
                    <div
                      key={cell.id}
                      className={`min-h-16 rounded-lg border p-2 ${cellClass(cell.status)}`}
                      title={`${era.label}, ${region.label}: ${cell.approvedStudyIds.length} approved studies; ${cell.baselineProfileIds.length} baselines`}
                    >
                      <p className="text-[8px] font-semibold uppercase tracking-[0.1em]">
                        {cell.status === "verified" ? "Verified" : cell.status === "baseline" ? "Baseline" : "Gap"}
                      </p>
                      <p className="mt-1 font-mono text-[8px] opacity-70">
                        {cell.approvedStudyIds.length} studies · {cell.evidenceLayerIds.length}/8 layers
                      </p>
                    </div>
                  );
                }),
              ])}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="poster-card rounded-xl p-4">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent-secondary">Evidence layers</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {atlas.layerCoverage.map((layer) => (
              <article key={layer.id} className="rounded-lg border border-white/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-ink">{layer.label}</span>
                  <span className="font-mono text-[9px] text-accent-secondary">{layer.cellCount}/{totalCells}</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-accent-secondary"
                    style={{ width: `${Math.round((layer.cellCount / totalCells) * 100)}%` }}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="poster-card rounded-xl p-4">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-accent">Priority evidence gaps</p>
          <p className="mt-2 text-[10px] leading-5 text-grey">
            These are research assignments, not prompt defaults. Each needs dated object, image, moving-image, and
            sound evidence with an item-level rights statement.
          </p>
          <ol className="mt-3 grid gap-2">
            {atlas.priorityGaps.slice(0, 8).map((gap, index) => (
              <li key={gap.id} className="rounded-lg border border-white/10 p-3 text-[10px] leading-5 text-grey">
                <span className="mr-2 font-mono text-accent">{String(index + 1).padStart(2, "0")}</span>
                <span className="font-semibold text-ink">{gap.eraLabel} · {gap.regionLabel}</span>
                <span className="mt-1 block text-white/45">{gap.researchQuestion}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

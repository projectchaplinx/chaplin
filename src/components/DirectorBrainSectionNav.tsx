import Link from "next/link";

export const DIRECTOR_BRAIN_SECTIONS = [
  { id: "proof", label: "Controlled proof", description: "Score, choose, and ship the six-shot comparison." },
  { id: "sprint-one", label: "Sprint 1 principles", description: "Triage, ranking, digest, and playback verification." },
  { id: "sprint-two", label: "Sprint 2", description: "Adversarial direction tests and evaluation evidence." },
  { id: "decisions", label: "Decisions", description: "Execution traces, examples, and learning outcomes." },
  { id: "research", label: "Research library", description: "Archive, review queue, and saved studies." },
  { id: "operations", label: "Research operations", description: "Campaigns, jobs, timed media, and manifests." },
  { id: "knowledge", label: "Knowledge base", description: "Retrieval rules, worlds, policy, and sources." },
] as const;

export type DirectorBrainSection = (typeof DIRECTOR_BRAIN_SECTIONS)[number]["id"];

export function directorBrainSection(value: string | undefined): DirectorBrainSection {
  return DIRECTOR_BRAIN_SECTIONS.some((section) => section.id === value)
    ? value as DirectorBrainSection
    : "proof";
}

export default function DirectorBrainSectionNav({ active }: { active: DirectorBrainSection }) {
  const current = DIRECTOR_BRAIN_SECTIONS.find((section) => section.id === active) ?? DIRECTOR_BRAIN_SECTIONS[0];

  return (
    <div className="sticky top-12 z-20 mb-6 border-y border-line bg-[#08100b]/95 py-3 backdrop-blur-md">
      <nav aria-label="Director Brain workspaces" role="tablist" className="no-scrollbar flex max-w-full gap-2 overflow-x-auto pb-1">
        {DIRECTOR_BRAIN_SECTIONS.map((section) => {
          const selected = section.id === active;
          return (
            <Link
              key={section.id}
              href={`/admin/director-brain?section=${section.id}`}
              prefetch={false}
              role="tab"
              aria-selected={selected}
              aria-current={selected ? "page" : undefined}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
                selected
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-black/15 text-grey hover:border-accent/60 hover:text-ink"
              }`}
            >
              {section.label}
            </Link>
          );
        })}
      </nav>
      <p className="mt-2 px-1 text-xs leading-5 text-grey">{current.description}</p>
    </div>
  );
}

export const DIRECTOR_GPLC_VERSION = "2026-07-31";

export const DIRECTOR_GPLC_LIMITS = Object.freeze({
  globalResearchLeases: 4,
  serialProviders: ["loc", "europeana", "smithsonian", "dpla"] as const,
  metConcurrentRequests: 2,
  concurrentGenerations: 2,
  candidatesPerCycle: 5,
  cyclesPerDay: 1,
  imagesPerCycle: 6,
  videosPerCycle: 6,
  shotDurationSeconds: { min: 4, max: 5 },
});

type DirectorEnvironment = Readonly<Record<string, string | undefined>>;

export function directorResearchExpansionState(env: DirectorEnvironment = process.env) {
  const phase = (env.DIRECTOR_RESEARCH_PHASE ?? "P0").trim().toUpperCase();
  const explicitlyEnabled = env.DIRECTOR_RESEARCH_EXPANSION_ENABLED === "true";
  return {
    phase,
    explicitlyEnabled,
    allowed: phase === "P4" && explicitlyEnabled,
  };
}

export function assertDirectorResearchExpansionAllowed(env: DirectorEnvironment = process.env) {
  const state = directorResearchExpansionState(env);
  if (!state.allowed) {
    throw new Error(
      `Director Brain expansion is dormant under GPLC ${DIRECTOR_GPLC_VERSION}. `
      + `P0-P3 must pass before P4; current phase is ${state.phase}.`,
    );
  }
}

import type { DirectorWorldAtlasEra, DirectorWorldAtlasRegion } from "@/lib/director-world-atlas";

export type DirectorResearchQueryPlan = {
  id: string;
  label: string;
  eraId: DirectorWorldAtlasEra["id"];
  regionId: DirectorWorldAtlasRegion["id"];
  startYear: number;
  endYear: number;
  region: string;
  query: string;
  layers: string[];
  preferredProviders: Array<"loc" | "met" | "smithsonian" | "europeana" | "dpla">;
  providerQueries?: Partial<Record<"loc" | "met" | "smithsonian" | "europeana" | "dpla", { query: string; region?: string }>>;
};

export const DIRECTOR_RESEARCH_QUERY_PLAN_VERSION = "2026-07-31.gap-5";

export function evidenceYearRange(label: string) {
  const years = [...label.matchAll(/(?:^|\D)(\d{4})(?:\D|$)/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  return years.length ? { start: Math.min(...years), end: Math.max(...years) } : null;
}

export function evidenceFallsWithinPlan(dateLabel: string, plan: Pick<DirectorResearchQueryPlan, "startYear" | "endYear">) {
  const range = evidenceYearRange(dateLabel);
  if (!range || plan.startYear < 0) return true;
  return range.end >= plan.startYear && range.start <= plan.endYear;
}

export function northAmericanLocation(label: string) {
  return /united states|u\.s\.|canada|mexico|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|atlanta/i.test(label);
}

export const DIRECTOR_RESEARCH_QUERY_PLANS: DirectorResearchQueryPlan[] = [
  { id: "postwar-north-america-work", label: "Postwar North America · work and streets", eraId: "postwar", regionId: "north-america", startYear: 1946, endYear: 1969, region: "United States", query: "working people street service station clothing tools", layers: ["built-environment", "costume-body", "work-domestic", "objects-materials"], preferredProviders: ["loc", "dpla", "smithsonian"] },
  { id: "late20-north-america-infrastructure", label: "1970–1999 North America · transport and infrastructure", eraId: "late-twentieth", regionId: "north-america", startYear: 1970, endYear: 1999, region: "United States", query: "street transport workplace technology everyday life", layers: ["transport-infrastructure", "work-domestic", "objects-materials"], preferredProviders: ["loc", "dpla", "smithsonian"], providerQueries: { loc: { query: "street transportation" } } },
  { id: "industrial-europe-street", label: "Industrial Europe · street, labor, and dress", eraId: "industrial", regionId: "europe", startYear: 1800, endYear: 1913, region: "Europe", query: "street labor clothing transport everyday life", layers: ["built-environment", "transport-infrastructure", "costume-body", "work-domestic"], preferredProviders: ["europeana", "met"], providerQueries: { europeana: { query: "street labor clothing" }, met: { query: "dress", region: "Europe" } } },
  { id: "worldwars-europe-civilian", label: "1914–1945 Europe · civilian material life", eraId: "world-wars", regionId: "europe", startYear: 1914, endYear: 1945, region: "Europe", query: "civilian work domestic clothing street transport", layers: ["costume-body", "work-domestic", "transport-infrastructure", "objects-materials"], preferredProviders: ["europeana", "met"], providerQueries: { europeana: { query: "civilian clothing" }, met: { query: "dress", region: "Europe" } } },
  { id: "earlymodern-eastasia-dress", label: "Early-modern East Asia · dress and material systems", eraId: "early-modern", regionId: "east-asia", startYear: 1501, endYear: 1799, region: "Japan China Korea", query: "garment textile tools domestic life", layers: ["costume-body", "objects-materials", "work-domestic"], preferredProviders: ["met", "smithsonian"], providerQueries: { met: { query: "kimono", region: "Japan" } } },
  { id: "postclassical-southasia-material", label: "501–1500 South Asia · material and domestic worlds", eraId: "postclassical", regionId: "south-asia", startYear: 501, endYear: 1500, region: "India South Asia", query: "domestic object textile tool architecture trade", layers: ["built-environment", "costume-body", "objects-materials", "work-domestic"], preferredProviders: ["met", "smithsonian"], providerQueries: { met: { query: "textile", region: "India" } } },
  { id: "earlymodern-southasia-work", label: "Early-modern South Asia · work beyond court", eraId: "early-modern", regionId: "south-asia", startYear: 1501, endYear: 1799, region: "India South Asia", query: "artisan merchant labor domestic textile tool", layers: ["costume-body", "objects-materials", "work-domestic", "social-ritual"], preferredProviders: ["met", "smithsonian"], providerQueries: { met: { query: "textile", region: "India" } } },
  { id: "classical-northafrica-daily", label: "Classical North Africa · daily material evidence", eraId: "iron-classical", regionId: "north-africa-west-asia", startYear: -1199, endYear: 500, region: "Egypt North Africa", query: "domestic tool clothing vessel work transport", layers: ["costume-body", "objects-materials", "work-domestic"], preferredProviders: ["met", "smithsonian"], providerQueries: { met: { query: "vessel", region: "Egypt" } } },
  { id: "earlyurban-westasia-city", label: "Early urban West Asia · city and craft", eraId: "early-urban-bronze", regionId: "north-africa-west-asia", startYear: -3500, endYear: -1200, region: "Mesopotamia West Asia", query: "city craft tool vessel transport domestic", layers: ["built-environment", "transport-infrastructure", "objects-materials", "work-domestic"], preferredProviders: ["met", "smithsonian"], providerQueries: { met: { query: "vessel", region: "Iraq" } } },
  { id: "industrial-latinamerica-city", label: "Industrial Latin America · city and work", eraId: "industrial", regionId: "latin-america-caribbean", startYear: 1800, endYear: 1913, region: "Latin America Caribbean", query: "street labor clothing transport market", layers: ["built-environment", "transport-infrastructure", "costume-body", "work-domestic"], preferredProviders: ["smithsonian"] },
  { id: "industrial-subsaharan-community", label: "Industrial-era Sub-Saharan Africa · community evidence", eraId: "industrial", regionId: "sub-saharan-africa", startYear: 1800, endYear: 1913, region: "Sub-Saharan Africa", query: "community work clothing tool architecture market", layers: ["built-environment", "costume-body", "objects-materials", "work-domestic", "social-ritual"], preferredProviders: ["smithsonian", "met"], providerQueries: { met: { query: "textile", region: "Africa" } } },
  { id: "industrial-southeastasia-port", label: "Industrial Southeast Asia · port and everyday life", eraId: "industrial", regionId: "southeast-asia-oceania", startYear: 1800, endYear: 1913, region: "Southeast Asia", query: "port street labor clothing transport market", layers: ["built-environment", "transport-infrastructure", "costume-body", "work-domestic"], preferredProviders: ["smithsonian", "met"], providerQueries: { met: { query: "textile", region: "Indonesia" } } },
];

export function providerForResearchSource(title: string) {
  if (/Library of Congress/i.test(title)) return "loc" as const;
  if (/Met Collection/i.test(title)) return "met" as const;
  if (/Smithsonian/i.test(title)) return "smithsonian" as const;
  if (/Europeana/i.test(title)) return "europeana" as const;
  if (/Digital Public Library/i.test(title)) return "dpla" as const;
  return null;
}

export function plansForResearchSource(title: string) {
  const provider = providerForResearchSource(title);
  return provider ? DIRECTOR_RESEARCH_QUERY_PLANS.filter((plan) => plan.preferredProviders.includes(provider)) : [];
}

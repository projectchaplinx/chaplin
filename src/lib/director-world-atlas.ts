export type DirectorWorldAtlasEra = {
  id: string;
  label: string;
  startYear: number;
  endYear: number;
  researchQuestion: string;
};

export type DirectorWorldAtlasRegion = {
  id: string;
  label: string;
  aliases: RegExp;
};

export type DirectorWorldEvidenceLayer = {
  id: string;
  label: string;
  tags: string[];
};

export type DirectorWorldAtlasProfileInput = {
  id: string;
  label: string;
  dateRange: string;
  region: string;
  tags: string[];
  evidence?: string[];
  visualRules?: string[];
  materialRules?: string[];
  soundRules?: string[];
};

export type DirectorWorldAtlasStudyInput = {
  id: string;
  status: string;
  periodLabel: string;
  region: string;
  tags: string[];
  observations?: Array<{
    evidence: string;
    craft?: string;
    audioEvidence?: string;
    soundFunction?: string;
  }>;
};

export type DirectorWorldAtlasCell = {
  id: string;
  eraId: string;
  regionId: string;
  baselineProfileIds: string[];
  approvedStudyIds: string[];
  evidenceLayerIds: string[];
  status: "gap" | "baseline" | "verified";
};

export type DirectorWorldAtlas = {
  cells: DirectorWorldAtlasCell[];
  coveredCells: number;
  verifiedCells: number;
  baselineCells: number;
  gapCells: number;
  approvedStudyCount: number;
  layerCoverage: Array<DirectorWorldEvidenceLayer & { cellCount: number }>;
  priorityGaps: Array<{
    id: string;
    eraLabel: string;
    regionLabel: string;
    researchQuestion: string;
  }>;
};

export const DIRECTOR_WORLD_ATLAS_VERSION = "2026.07.31-a";

export const DIRECTOR_WORLD_ATLAS_ERAS: DirectorWorldAtlasEra[] = [
  {
    id: "early-urban-bronze",
    label: "3500–1200 BCE",
    startYear: -3500,
    endYear: -1200,
    researchQuestion: "Which settlement, role, material, ritual, transport, and acoustic evidence belongs to this exact culture and century?",
  },
  {
    id: "iron-classical",
    label: "1200 BCE–500 CE",
    startYear: -1199,
    endYear: 500,
    researchQuestion: "Which local political, domestic, military, trade, and religious systems are evidenced without collapsing them into generic antiquity?",
  },
  {
    id: "postclassical",
    label: "501–1500",
    startYear: 501,
    endYear: 1500,
    researchQuestion: "How do regional power, faith, climate, craft, trade, settlement, and class alter the lived world?",
  },
  {
    id: "early-modern",
    label: "1501–1799",
    startYear: 1501,
    endYear: 1799,
    researchQuestion: "Which court, colonial, maritime, mercantile, agricultural, and urban systems shape this exact place and community?",
  },
  {
    id: "industrial",
    label: "1800–1913",
    startYear: 1800,
    endYear: 1913,
    researchQuestion: "Which technologies, labor systems, transport, print, lighting, clothing, and urban forms had actually arrived here?",
  },
  {
    id: "world-wars",
    label: "1914–1945",
    startYear: 1914,
    endYear: 1945,
    researchQuestion: "How do war, depression, migration, industry, media, rationing, and local civilian life change the visible and audible world?",
  },
  {
    id: "postwar",
    label: "1946–1969",
    startYear: 1946,
    endYear: 1969,
    researchQuestion: "Which city, community, occupation, income, infrastructure, media, and year distinguish lived postwar modernity from decade shorthand?",
  },
  {
    id: "late-twentieth",
    label: "1970–1999",
    startYear: 1970,
    endYear: 1999,
    researchQuestion: "Which exact year and place determine analog technology, vehicles, streets, work, domestic life, fashion, sound, and capture medium?",
  },
  {
    id: "contemporary",
    label: "2000–present",
    startYear: 2000,
    endYear: 9999,
    researchQuestion: "Which devices, platforms, infrastructure, climate, subculture, and socioeconomic conditions are true for this exact date and place?",
  },
];

export const DIRECTOR_WORLD_ATLAS_REGIONS: DirectorWorldAtlasRegion[] = [
  { id: "north-america", label: "North America", aliases: /\b(united states|u\.s\.|america|canada|mexico|los angeles|new york|chicago|detroit|pittsburgh|california)\b/i },
  { id: "latin-america-caribbean", label: "Latin America & Caribbean", aliases: /\b(latin america|caribbean|brazil|argentina|chile|peru|colombia|cuba|haiti|jamaica)\b/i },
  { id: "europe", label: "Europe", aliases: /\b(europe|britain|england|scotland|ireland|france|germany|italy|spain|portugal|greece|rome|roman|netherlands|russia|ukraine)\b/i },
  { id: "north-africa-west-asia", label: "North Africa & West Asia", aliases: /\b(north africa|egypt|mesopotamia|uruk|sumer|iraq|iran|persia|levant|arabia|anatolia|turkey)\b/i },
  { id: "sub-saharan-africa", label: "Sub-Saharan Africa", aliases: /\b(sub-saharan|west africa|east africa|southern africa|ethiopia|ghana|nigeria|kenya|congo|zimbabwe|south africa)\b/i },
  { id: "south-asia", label: "South Asia", aliases: /\b(south asia|india|pakistan|bangladesh|sri lanka|nepal|bhutan|mughal|delhi|agra|lahore)\b/i },
  { id: "east-asia", label: "East Asia", aliases: /\b(east asia|china|chinese|japan|japanese|korea|korean|mongolia|taiwan)\b/i },
  { id: "southeast-asia-oceania", label: "Southeast Asia & Oceania", aliases: /\b(southeast asia|indonesia|malaysia|singapore|thailand|vietnam|cambodia|philippines|australia|new zealand|oceania|pacific)\b/i },
];

export const DIRECTOR_WORLD_EVIDENCE_LAYERS: DirectorWorldEvidenceLayer[] = [
  { id: "built-environment", label: "Built environment", tags: ["architecture", "location", "street", "interior", "settlement", "production-design"] },
  { id: "transport-infrastructure", label: "Transport & infrastructure", tags: ["transport", "vehicle", "road", "rail", "canal", "infrastructure"] },
  { id: "costume-body", label: "Costume, hair & body", tags: ["costume", "clothing", "hair", "makeup", "body"] },
  { id: "objects-materials", label: "Objects & materials", tags: ["materials", "objects", "tools", "furniture", "packaging", "technology"] },
  { id: "work-domestic", label: "Work & domestic life", tags: ["work", "labor", "occupation", "domestic", "home", "food"] },
  { id: "sound-acoustics", label: "Sound & acoustics", tags: ["sound", "audio", "acoustics", "ambience", "music"] },
  { id: "social-ritual", label: "Social life & ritual", tags: ["community", "ritual", "class", "religion", "public-life", "social"] },
  { id: "capture-medium", label: "Capture & image language", tags: ["camera", "photography", "film-stock", "television", "capture", "image-language"] },
];

const PRIORITY_ERA_ORDER = ["postwar", "late-twentieth", "early-urban-bronze", "industrial", "early-modern", "world-wars", "postclassical", "iron-classical", "contemporary"];
const PRIORITY_REGION_ORDER = ["north-america", "south-asia", "north-africa-west-asia", "europe", "east-asia", "sub-saharan-africa", "latin-america-caribbean", "southeast-asia-oceania"];

function normalized(value: string) {
  return value.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
}

export function yearFromPeriodLabel(value: string): number | null {
  const text = normalized(value);
  const match = text.match(/\b(\d{3,4})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  if (!Number.isFinite(year)) return null;
  return /\b(bc|bce)\b/.test(text) ? -year : year;
}

export function directorWorldEraFor(value: string) {
  const year = yearFromPeriodLabel(value);
  if (year == null) return null;
  return DIRECTOR_WORLD_ATLAS_ERAS.find((era) => year >= era.startYear && year <= era.endYear) ?? null;
}

export function directorWorldRegionFor(value: string) {
  return DIRECTOR_WORLD_ATLAS_REGIONS.find((region) => region.aliases.test(value)) ?? null;
}

function evidenceLayerIds(tags: string[], text: string) {
  const haystack = normalized(`${tags.join(" ")} ${text}`);
  return DIRECTOR_WORLD_EVIDENCE_LAYERS
    .filter((layer) => layer.tags.some((tag) => haystack.includes(tag)))
    .map((layer) => layer.id);
}

function isWorldEvidenceStudy(study: DirectorWorldAtlasStudyInput) {
  const tags = new Set(study.tags.map((tag) => normalized(tag)));
  return tags.has("period")
    || tags.has("period-world")
    || DIRECTOR_WORLD_EVIDENCE_LAYERS.some((layer) => layer.tags.some((tag) => tags.has(tag)));
}

export function buildDirectorWorldAtlas(input: {
  profiles: DirectorWorldAtlasProfileInput[];
  studies: DirectorWorldAtlasStudyInput[];
}): DirectorWorldAtlas {
  const cells = new Map<string, DirectorWorldAtlasCell>();
  for (const era of DIRECTOR_WORLD_ATLAS_ERAS) {
    for (const region of DIRECTOR_WORLD_ATLAS_REGIONS) {
      const id = `${era.id}:${region.id}`;
      cells.set(id, {
        id,
        eraId: era.id,
        regionId: region.id,
        baselineProfileIds: [],
        approvedStudyIds: [],
        evidenceLayerIds: [],
        status: "gap",
      });
    }
  }

  for (const profile of input.profiles) {
    const era = directorWorldEraFor(`${profile.dateRange} ${profile.label} ${profile.tags.join(" ")}`);
    const region = directorWorldRegionFor(`${profile.region} ${profile.label} ${profile.tags.join(" ")}`);
    if (!era || !region) continue;
    const cell = cells.get(`${era.id}:${region.id}`)!;
    cell.baselineProfileIds.push(profile.id);
    cell.evidenceLayerIds.push(...evidenceLayerIds(
      profile.tags,
      [
        ...(profile.evidence ?? []),
        ...(profile.visualRules ?? []),
        ...(profile.materialRules ?? []),
        ...(profile.soundRules ?? []),
      ].join(" "),
    ));
  }

  for (const study of input.studies) {
    if (study.status !== "approved" || !isWorldEvidenceStudy(study)) continue;
    const era = directorWorldEraFor(`${study.periodLabel} ${study.tags.join(" ")}`);
    const region = directorWorldRegionFor(`${study.region} ${study.tags.join(" ")}`);
    if (!era || !region) continue;
    const cell = cells.get(`${era.id}:${region.id}`)!;
    cell.approvedStudyIds.push(study.id);
    cell.evidenceLayerIds.push(...evidenceLayerIds(
      study.tags,
      (study.observations ?? []).flatMap((observation) => [
        observation.evidence,
        observation.craft ?? "",
        observation.audioEvidence ?? "",
        observation.soundFunction ?? "",
      ]).join(" "),
    ));
  }

  const resolvedCells = [...cells.values()].map((cell) => {
    const baselineProfileIds = [...new Set(cell.baselineProfileIds)];
    const approvedStudyIds = [...new Set(cell.approvedStudyIds)];
    const layers = [...new Set(cell.evidenceLayerIds)];
    return {
      ...cell,
      baselineProfileIds,
      approvedStudyIds,
      evidenceLayerIds: layers,
      status: approvedStudyIds.length ? "verified" as const : baselineProfileIds.length ? "baseline" as const : "gap" as const,
    };
  });

  const layerCoverage = DIRECTOR_WORLD_EVIDENCE_LAYERS.map((layer) => ({
    ...layer,
    cellCount: resolvedCells.filter((cell) => cell.evidenceLayerIds.includes(layer.id)).length,
  }));
  const priorityGaps = resolvedCells
    .filter((cell) => cell.status === "gap")
    .sort((left, right) => {
      const eraDelta = PRIORITY_ERA_ORDER.indexOf(left.eraId) - PRIORITY_ERA_ORDER.indexOf(right.eraId);
      if (eraDelta) return eraDelta;
      return PRIORITY_REGION_ORDER.indexOf(left.regionId) - PRIORITY_REGION_ORDER.indexOf(right.regionId);
    })
    .slice(0, 12)
    .map((cell) => {
      const era = DIRECTOR_WORLD_ATLAS_ERAS.find((item) => item.id === cell.eraId)!;
      const region = DIRECTOR_WORLD_ATLAS_REGIONS.find((item) => item.id === cell.regionId)!;
      return {
        id: cell.id,
        eraLabel: era.label,
        regionLabel: region.label,
        researchQuestion: era.researchQuestion,
      };
    });

  const baselineCells = resolvedCells.filter((cell) => cell.status === "baseline").length;
  const verifiedCells = resolvedCells.filter((cell) => cell.status === "verified").length;
  return {
    cells: resolvedCells,
    coveredCells: baselineCells + verifiedCells,
    verifiedCells,
    baselineCells,
    gapCells: resolvedCells.length - baselineCells - verifiedCells,
    approvedStudyCount: new Set(resolvedCells.flatMap((cell) => cell.approvedStudyIds)).size,
    layerCoverage,
    priorityGaps,
  };
}
